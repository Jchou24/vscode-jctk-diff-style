/**
 * 比對 diff 的兩側：要畫框線的範圍、有改動的行。
 *
 * VS Code 不把它算好的「哪幾個字改了」交給擴充（`TextEditor.diffInformation` 只到行，而且是 proposed API）
 * ⇒ 自己算。用 `vscode-diff`：從 VS Code 原始碼抽出的同一套比對，框線才會落在 VS Code 上色的那幾個字上。
 * 取哪些範圍也照 VS Code 自己的規則（`diffEditorDecorations.ts`）：
 *
 * - 兩側都有行的變動（改了一部分的行）：每一段改動的字（`innerChanges`）各畫一個
 *     - 改動的字蓋住一整行（這一段以外只剩空白）時當成整行：一行改了幾個字、後面接著新增一整段時，那一整段在 VS Code 算同一段變動，
 *       新增的那幾行整行都是改動的字——照整段新增處理，否則整段都會被框
 * - 只有一側有行的變動（整段新增 / 刪除）：VS Code 整行上色；這裡預設不框，選項打開才整行框
 * - 只有空白的改動（外面包了一層、裡面整段多一層縮排；行尾空白）：預設不框，選項打開才框
 * - 改動的字：VS Code 上「字」那一層底色的地方，兩種變動都算（換註解色只換這裡面的註解）
 */
import { type DetailedLineRangeMapping, type RangeMapping, linesDiffComputers } from 'vscode-diff';

/** 行範圍（從 1 起算、結尾不含）——套件沒有從入口匯出這個類別，從用到它的型別取 */
type LineRange = DetailedLineRangeMapping['original'];

/** 字元範圍（從 1 起算）——同上 */
type Range = RangeMapping['modifiedRange'];

/** `diffEditor.diffAlgorithm` 的值 */
enum DiffAlgorithms {
    Advanced = 'advanced',
    Legacy = 'legacy',
}

/** 一段要畫框線的範圍：一律在同一行內，行與字元都從 0 起算（同 `vscode.Range`） */
interface ITextRange {
    line: number;
    startCharacter: number;
    endCharacter: number;
}

/** 兩側各自的範圍 */
interface ISideRanges {
    /** 新增那一側（modified） */
    inserted: ITextRange[];
    /** 刪除那一側（original） */
    removed: ITextRange[];
}

/** 比對的結果 */
interface IDiffRanges {
    /** 要畫框線的範圍 */
    borders: ISideRanges;
    /** 改動的字：VS Code 上「字」那一層底色的地方——改了一部分的行裡改動的字、整段新增 / 刪除的整行 */
    changedText: ISideRanges;
}

/** 比對與取範圍的選項 */
interface IBorderRangeOptions {
    /** 整段新增 / 刪除的行也框 */
    isWholeLineIncluded: boolean;
    /** 只改了空白的也框 */
    isWhitespaceIncluded: boolean;
    /** 同 `diffEditor.ignoreTrimWhitespace` */
    ignoreTrimWhitespace: boolean;
    /** 同 `diffEditor.maxComputationTime`（毫秒，0 ＝ 不限） */
    maxComputationTimeMs: number;
    /** 同 `diffEditor.diffAlgorithm` */
    algorithm: DiffAlgorithms;
}

/**
 * 這一行在不在行範圍裡（`LineRange` 的結尾不含）。
 * @param lineRange 行範圍
 * @param lineNumber 從 1 起算的行號
 * @returns 在裡面時為 true
 */
const ContainsLine = (lineRange: LineRange, lineNumber: number): boolean =>
    lineNumber >= lineRange.startLineNumber && lineNumber < lineRange.endLineNumberExclusive;

/**
 * 把一段可能跨行的範圍切成每行一段；長度 0 的段落丟掉。
 *
 * 跨行的範圍常收在下一行的第 1 欄（代表包含換行）——切開後那一段長度是 0，自然不畫。
 * @param range `vscode-diff` 的範圍（從 1 起算）
 * @param lines 那一側的每一行
 * @returns 每行一段（從 0 起算）
 */
const SplitByLine = (range: Range, lines: readonly string[]): ITextRange[] => {
    const result: ITextRange[] = [];
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
        const lineLength = lines[lineNumber - 1]?.length ?? 0;
        const startCharacter = lineNumber === range.startLineNumber ? range.startColumn - 1 : 0;
        const endCharacter = Math.min(
            lineLength,
            lineNumber === range.endLineNumber ? range.endColumn - 1 : lineLength,
        );
        if (endCharacter > startCharacter) {
            result.push({ line: lineNumber - 1, startCharacter, endCharacter });
        }
    }
    return result;
};

/**
 * 整段新增 / 刪除的那幾行，每行從頭框到尾；空行不框。
 * @param lineRange 行範圍
 * @param lines 那一側的每一行
 * @returns 每行一段（從 0 起算）
 */
const WholeLines = (lineRange: LineRange, lines: readonly string[]): ITextRange[] => {
    const result: ITextRange[] = [];
    for (let lineNumber = lineRange.startLineNumber; lineNumber < lineRange.endLineNumberExclusive; lineNumber++) {
        const lineLength = lines[lineNumber - 1]?.length ?? 0;
        if (lineLength > 0) {
            result.push({ line: lineNumber - 1, startCharacter: 0, endCharacter: lineLength });
        }
    }
    return result;
};

/**
 * 收進一側的改動的字；蓋住一整行的（這一段以外只剩空白）、全是空白的那幾段，只在對應的選項打開時才畫框線。
 * @param segments 每行一段的改動的字
 * @param lines 那一側的每一行
 * @param borders 那一側要畫框線的範圍（收進這裡）
 * @param changedText 那一側改動的字（收進這裡）
 * @param options 比對與取範圍的選項
 */
const CollectSegments = (
    segments: readonly ITextRange[],
    lines: readonly string[],
    borders: ITextRange[],
    changedText: ITextRange[],
    options: IBorderRangeOptions,
): void => {
    for (const segment of segments) {
        changedText.push(segment);
        const line = lines[segment.line] ?? '';
        const isWholeLine =
            line.slice(0, segment.startCharacter).trim() === '' && line.slice(segment.endCharacter).trim() === '';
        const isWhitespaceOnly = line.slice(segment.startCharacter, segment.endCharacter).trim() === '';
        if ((!isWholeLine || options.isWholeLineIncluded) && (!isWhitespaceOnly || options.isWhitespaceIncluded)) {
            borders.push(segment);
        }
    }
};

/**
 * 比對兩側：要畫框線的範圍、改動的字。
 * @param originalLines 原本那一側（左邊 / 刪除那一側）的每一行
 * @param modifiedLines 修改後那一側（右邊 / 新增那一側）的每一行
 * @param options 比對與取範圍的選項
 * @returns 兩側各自的框線範圍與改動的字
 */
const ComputeDiffRanges = (
    originalLines: readonly string[],
    modifiedLines: readonly string[],
    options: IBorderRangeOptions,
): IDiffRanges => {
    const computer =
        options.algorithm === DiffAlgorithms.Legacy ? linesDiffComputers.getLegacy() : linesDiffComputers.getDefault();
    const diff = computer.computeDiff([...originalLines], [...modifiedLines], {
        ignoreTrimWhitespace: options.ignoreTrimWhitespace,
        maxComputationTimeMs: options.maxComputationTimeMs,
        computeMoves: false,
    });
    const borders: ISideRanges = { inserted: [], removed: [] };
    const changedText: ISideRanges = { inserted: [], removed: [] };
    for (const change of diff.changes) {
        if (change.original.isEmpty || change.modified.isEmpty) {
            CollectSegments(
                WholeLines(change.original, originalLines),
                originalLines,
                borders.removed,
                changedText.removed,
                options,
            );
            CollectSegments(
                WholeLines(change.modified, modifiedLines),
                modifiedLines,
                borders.inserted,
                changedText.inserted,
                options,
            );
            continue;
        }
        for (const inner of change.innerChanges ?? []) {
            if (ContainsLine(change.modified, inner.modifiedRange.startLineNumber)) {
                CollectSegments(
                    SplitByLine(inner.modifiedRange, modifiedLines),
                    modifiedLines,
                    borders.inserted,
                    changedText.inserted,
                    options,
                );
            }
            if (ContainsLine(change.original, inner.originalRange.startLineNumber)) {
                CollectSegments(
                    SplitByLine(inner.originalRange, originalLines),
                    originalLines,
                    borders.removed,
                    changedText.removed,
                    options,
                );
            }
        }
    }
    return { borders, changedText };
};

export { ComputeDiffRanges, DiffAlgorithms };
export type { IBorderRangeOptions, IDiffRanges, ISideRanges, ITextRange };
