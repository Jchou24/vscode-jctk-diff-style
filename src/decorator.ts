/**
 * 在 diff 分頁的兩側畫框線、換有改動的行裡的註解色。
 *
 * diff 的兩側在擴充眼中就是兩個一般的 `TextEditor`，認不出「它屬於某個 diff」
 * ⇒ 從分頁群組反查：群組目前的分頁是 diff 時，文件對得上的編輯器就是它的兩側（怎麼挑見 `diffSides.ts`）。
 * 註解色用 decoration 的文字色蓋過主題的語法顏色：只在 diff 裡、只換註解裡改動的字，平常的編輯器不受影響。
 */
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { FindChangedCommentRanges } from './commentRanges';
import { ComputeDiffRanges, DiffAlgorithms, type IBorderRangeOptions, type ITextRange } from './diffRanges';
import { FindDiffSides, type IEditorInfo } from './diffSides';
import type { ICommentSyntaxProvider } from './languageComments';
import type { IBorderOptions, IDiffStylePreset } from './presetModel';

/** VS Code diff 的比對設定區段 */
const DIFF_EDITOR_SECTION = 'diffEditor';

/** VS Code 的預設值：`diffEditor.maxComputationTime` */
const DEFAULT_MAX_COMPUTATION_TIME_MS = 5000;

/** 畫框線的對外介面 */
interface IDiffDecorator {
    /** 換一組樣式（框線、註解色）；畫面要等 {@link RefreshAsync} 才更新 */
    SetPreset: (preset: IDiffStylePreset) => void;
    /** 重新找出 diff 分頁、重算、重畫 */
    RefreshAsync: () => Promise<void>;
    /** 目前有沒有看得到的 diff 分頁（狀態列要不要顯示） */
    IsDiffVisible: () => boolean;
    /** 拿掉所有框線、釋放 decoration */
    Destroy: () => void;
}

/** 一個看得到的 diff 分頁 */
interface IVisibleDiff {
    original: vscode.Uri;
    modified: vscode.Uri;
    originalEditor: vscode.TextEditor | undefined;
    modifiedEditor: vscode.TextEditor | undefined;
}

/**
 * 讀出 VS Code 自己比對時用的設定，讓框線與它上色的範圍一致。
 * @param border 框線設定
 * @returns 比對與取範圍的選項
 */
const ReadRangeOptions = (border: IBorderOptions): IBorderRangeOptions => {
    const config = vscode.workspace.getConfiguration(DIFF_EDITOR_SECTION);
    return {
        isWholeLineIncluded: border.isWholeLineIncluded,
        isWhitespaceIncluded: border.isWhitespaceIncluded,
        ignoreTrimWhitespace: config.get<boolean>('ignoreTrimWhitespace') ?? true,
        maxComputationTimeMs: config.get<number>('maxComputationTime') ?? DEFAULT_MAX_COMPUTATION_TIME_MS,
        algorithm:
            config.get<string>('diffAlgorithm') === DiffAlgorithms.Legacy
                ? DiffAlgorithms.Legacy
                : DiffAlgorithms.Advanced,
    };
};

/**
 * 框線的 decoration 樣式。
 * @param border 框線設定
 * @param color 這一側的框線色
 * @returns decoration 的樣式
 */
const CreateDecorationType = (border: IBorderOptions, color: string): vscode.TextEditorDecorationType =>
    vscode.window.createTextEditorDecorationType({
        border: `${border.width}px ${border.style} ${color}`,
        borderRadius: `${border.radius}px`,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

/**
 * 兩個 Uri 是不是同一份文件。
 * @param left 一邊
 * @param right 另一邊
 * @returns 相同時為 true
 */
const IsSameUri = (left: vscode.Uri, right: vscode.Uri): boolean => left.toString() === right.toString();

/**
 * 挑 diff 兩側時要看的編輯器資訊。
 * @param editor 編輯器
 * @returns 文件位置與所在的欄
 */
const DescribeEditor = (editor: vscode.TextEditor): IEditorInfo => ({
    uri: editor.document.uri.toString(),
    viewColumn: editor.viewColumn,
});

/**
 * 找出每個分頁群組裡目前看得到的 diff 分頁與它的兩側編輯器。
 * @returns 看得到的 diff 分頁
 */
const FindVisibleDiffs = (): IVisibleDiff[] => {
    const diffs: IVisibleDiff[] = [];
    for (const group of vscode.window.tabGroups.all) {
        const input = group.activeTab?.input;
        if (!(input instanceof vscode.TabInputTextDiff)) {
            continue;
        }
        const sides = FindDiffSides(
            vscode.window.visibleTextEditors,
            DescribeEditor,
            group.viewColumn,
            input.original.toString(),
            input.modified.toString(),
        );
        diffs.push({
            original: input.original,
            modified: input.modified,
            originalEditor: sides.original,
            modifiedEditor: sides.modified,
        });
    }
    return diffs;
};

/**
 * 看得到的編輯器寫成一行（找不到 diff 兩側時留在診斷紀錄裡）。
 * @returns 每個編輯器的文件位置與欄
 */
const DescribeVisibleEditors = (): string =>
    vscode.window.visibleTextEditors
        .map((editor) => l10n.t('{0} (column {1})', editor.document.uri.toString(), String(editor.viewColumn)))
        .join(', ');

/**
 * 取得文件：編輯器開著就用它的，否則向 VS Code 要（inline 模式下原本那一側不是編輯器）。
 * @param uri 文件位置
 * @param editor 那一側的編輯器
 * @returns 文件
 */
const OpenDocumentAsync = async (
    uri: vscode.Uri,
    editor: vscode.TextEditor | undefined,
): Promise<vscode.TextDocument> =>
    editor?.document ??
    vscode.workspace.textDocuments.find((document) => IsSameUri(document.uri, uri)) ??
    (await vscode.workspace.openTextDocument(uri));

/**
 * 文件的每一行。
 * @param document 文件
 * @returns 每一行的文字（不含換行）
 */
const GetLines = (document: vscode.TextDocument): string[] =>
    Array.from({ length: document.lineCount }, (_, index) => document.lineAt(index).text);

/**
 * 從 0 起算的範圍 → `vscode.Range`。
 * @param ranges 範圍
 * @returns `vscode.Range`
 */
const ToVscodeRanges = (ranges: readonly ITextRange[]): vscode.Range[] =>
    ranges.map((range) => new vscode.Range(range.line, range.startCharacter, range.line, range.endCharacter));

/** diff 一側要畫的東西 */
interface ISideDecorations {
    editor: vscode.TextEditor;
    document: vscode.TextDocument;
    /** 這一側的框線 decoration */
    borderType: vscode.TextEditorDecorationType | undefined;
    borderRanges: readonly ITextRange[];
    /** 這一側改動的字 */
    changedText: readonly ITextRange[];
}

/**
 * 建立畫框線與註解色的物件。
 * @param log 診斷紀錄
 * @param commentSyntax 依語言取註解符號
 * @returns 畫框線的對外介面
 */
const CreateDiffDecorator = (log: (message: string) => void, commentSyntax: ICommentSyntaxProvider): IDiffDecorator => {
    let preset: IDiffStylePreset | undefined = undefined;
    let insertedType: vscode.TextEditorDecorationType | undefined = undefined;
    let removedType: vscode.TextEditorDecorationType | undefined = undefined;
    let commentType: vscode.TextEditorDecorationType | undefined = undefined;
    let isDiffVisible = false;

    const GetActiveTypes = (): vscode.TextEditorDecorationType[] =>
        [insertedType, removedType, commentType].filter((type) => type !== undefined);

    const DestroyTypes = (): void => {
        for (const type of GetActiveTypes()) {
            type.dispose();
        }
        insertedType = undefined;
        removedType = undefined;
        commentType = undefined;
    };

    /**
     * 畫一側：沒列到的 decoration 一律清空（上一輪畫過的不留下來）。
     * @param side 這一側要畫的東西
     */
    const DecorateSideAsync = async (side: ISideDecorations): Promise<void> => {
        const rangesByType = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
        if (side.borderType !== undefined) {
            rangesByType.set(side.borderType, ToVscodeRanges(side.borderRanges));
        }
        if (commentType !== undefined && side.changedText.length > 0) {
            const syntax = await commentSyntax.GetAsync(side.document.languageId);
            if (syntax !== undefined) {
                const ranges = FindChangedCommentRanges(GetLines(side.document), syntax, side.changedText);
                rangesByType.set(commentType, ToVscodeRanges(ranges));
            }
        }
        for (const type of GetActiveTypes()) {
            side.editor.setDecorations(type, rangesByType.get(type) ?? []);
        }
    };

    const RefreshAsync = async (): Promise<void> => {
        const diffs = FindVisibleDiffs();
        isDiffVisible = diffs.length > 0;
        if (preset === undefined || GetActiveTypes().length === 0) {
            return;
        }
        const decorated = new Set<vscode.TextEditor>();
        const options = ReadRangeOptions(preset.border);
        for (const diff of diffs) {
            if (diff.originalEditor === undefined && diff.modifiedEditor === undefined) {
                log(
                    l10n.t(
                        'Cannot find the editors of the diff tab: {0}; visible editors: {1}',
                        diff.modified.toString(),
                        DescribeVisibleEditors(),
                    ),
                );
                continue;
            }
            const originalDocument = await OpenDocumentAsync(diff.original, diff.originalEditor);
            const modifiedDocument = await OpenDocumentAsync(diff.modified, diff.modifiedEditor);
            const ranges = ComputeDiffRanges(GetLines(originalDocument), GetLines(modifiedDocument), options);
            if (diff.modifiedEditor !== undefined) {
                await DecorateSideAsync({
                    editor: diff.modifiedEditor,
                    document: modifiedDocument,
                    borderType: insertedType,
                    borderRanges: ranges.borders.inserted,
                    changedText: ranges.changedText.inserted,
                });
                decorated.add(diff.modifiedEditor);
            }
            if (diff.originalEditor !== undefined && diff.originalEditor !== diff.modifiedEditor) {
                await DecorateSideAsync({
                    editor: diff.originalEditor,
                    document: originalDocument,
                    borderType: removedType,
                    borderRanges: ranges.borders.removed,
                    changedText: ranges.changedText.removed,
                });
                decorated.add(diff.originalEditor);
            }
        }
        for (const editor of vscode.window.visibleTextEditors) {
            if (!decorated.has(editor)) {
                for (const type of GetActiveTypes()) {
                    editor.setDecorations(type, []);
                }
            }
        }
    };

    const SetPreset = (next: IDiffStylePreset): void => {
        DestroyTypes();
        preset = next;
        if (next.border.isEnabled) {
            insertedType = CreateDecorationType(next.border, next.border.insertedColor);
            removedType = CreateDecorationType(next.border, next.border.removedColor);
        }
        if (next.commentColor !== undefined) {
            commentType = vscode.window.createTextEditorDecorationType({
                color: next.commentColor,
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            });
        }
    };

    const Destroy = (): void => {
        DestroyTypes();
        preset = undefined;
    };

    return { SetPreset, RefreshAsync, IsDiffVisible: () => isDiffVisible, Destroy };
};

export { CreateDiffDecorator };
export type { IDiffDecorator };
