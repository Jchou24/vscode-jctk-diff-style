/**
 * 範例 diff 的內容（`src/sampleLines.ts`）。
 *
 * 範例是使用者調參數時拿來對照的畫面：每一個案例都要真的出現、框線要落在那個案例要示範的字上。
 * 改了範例的內容（或比對規則、翻譯）而某個案例不見了，這裡會紅——否則只有開範例時才看得出來。
 * 每一種介面語言各走一遍：註解的字跟著語言換，程式碼的字兩邊一樣。
 * 比對設定照使用者的 VS Code：`diffEditor.ignoreTrimWhitespace` 關掉（縮排的改動也算改動）。
 */
import { describe, expect, it } from 'vitest';

import { FindChangedCommentRanges } from '../src/commentRanges';
import type { ICommentSyntax } from '../src/commentSyntax';
import { ComputeDiffRanges, DiffAlgorithms, type IBorderRangeOptions, type ITextRange } from '../src/diffRanges';
import { ApplyDisplayLanguage, ResolveDisplayLanguage } from '../src/displayLanguage';
import { LanguageSettings } from '../src/languageSettings';
import { GetSampleLines, type ISampleLines } from '../src/sampleLines';

/** 預設的框線選項，加上使用者的比對設定 */
const OPTIONS: IBorderRangeOptions = {
    isWholeLineIncluded: false,
    isWhitespaceIncluded: false,
    ignoreTrimWhitespace: false,
    maxComputationTimeMs: 5000,
    algorithm: DiffAlgorithms.Advanced,
};

/** 範例是 TypeScript：註解符號同 VS Code 內建的 TypeScript 語言設定 */
const TYPESCRIPT_COMMENTS: ICommentSyntax = { lineComment: '//', blockComment: ['/*', '*/'] };

/** 一種介面語言下，註解那幾個案例的行與框到的字 */
interface ICommentExpectation {
    /** 註解裡改了幾個字的那兩行（修改後），與各自框到的字 */
    changedLines: { line: string; boxes: string[] }[];
    /** 同一段改動在原本那一側框到的字 */
    removedLine: { line: string; boxes: string[] };
    /** 註解色換到的字（修改後那一側） */
    commentColored: string[];
    /** 每一行註解都有中文（繁中）／ 都沒有中文（英文）：漏了 `l10n.t` 的那一句會是另一個語言 */
    isCommentChinese: boolean;
}

/** 中文字 */
const CJK_PATTERN = /[一-鿿]/;

/** 註解行（行註解或 JSDoc） */
const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*\*)/;

/** 每一種介面語言：設定值與那個語言的註解案例 */
const LANGUAGES: { setting: LanguageSettings; expected: ICommentExpectation }[] = [
    {
        setting: LanguageSettings.English,
        expected: {
            isCommentChinese: false,
            changedLines: [
                {
                    line: '// For every VS Code extension under it: F5 opens a VS Code window that loads it',
                    boxes: ['every VS Code', ' under it'],
                },
                {
                    line: '// ⚠️ Run `pnpm --filter <extension-name> build` first (VS Code loads the bundled JS)',
                    boxes: ['<extension-name>'],
                },
            ],
            removedLine: {
                line: '// ⚠️ Run `pnpm --filter docs-helper build` first (VS Code loads the bundled JS)',
                boxes: ['docs-helper'],
            },
            commentColored: [
                'every VS Code',
                ' under it',
                '<extension-name>',
                '// Added block: two background layers overlap, and gray comments must stay readable',
                '// Merged with colorCustomizations in user settings, not replacing it',
            ],
        },
    },
    {
        setting: LanguageSettings.TraditionalChinese,
        expected: {
            isCommentChinese: true,
            changedLines: [
                {
                    line: '// 開發底下每一支 VS Code 擴充用：F5 開一個載入該擴充的 VS Code 視窗',
                    boxes: ['底下每一支 VS Code'],
                },
                {
                    line: '// ⚠️ 先 `pnpm --filter <擴充名> build`（VS Code 載入的是打包後的 JS）',
                    boxes: ['<擴充名>'],
                },
            ],
            removedLine: {
                line: '// ⚠️ 先 `pnpm --filter docs-helper build`（VS Code 載入的是打包後的 JS）',
                boxes: ['docs-helper'],
            },
            commentColored: [
                '底下每一支 VS Code',
                '<擴充名>',
                '// 整段新增：兩層底色疊在一起，灰色的註解要讀得到',
                '// 與 user 設定的 colorCustomizations 是合併、不是取代',
            ],
        },
    },
];

/**
 * 某一行上被框到的字。
 * @param lines 那一側的每一行
 * @param ranges 那一側的範圍
 * @param lineText 那一行的內容（用內容找行，範例前面多一行時不必跟著改行號）
 * @returns 那一行上每一段的字
 */
const SliceOnLine = (lines: readonly string[], ranges: readonly ITextRange[], lineText: string): string[] => {
    const line = lines.indexOf(lineText);
    expect(line, `範例裡找不到這一行：${lineText}`).toBeGreaterThanOrEqual(0);
    return ranges
        .filter((range) => range.line === line)
        .map((range) => lineText.slice(range.startCharacter, range.endCharacter));
};

/**
 * 某一種介面語言下的範例內容。
 * @param setting 介面語言
 * @returns 範例兩側的每一行
 */
const LoadSample = (setting: LanguageSettings): ISampleLines => {
    ApplyDisplayLanguage(ResolveDisplayLanguage(setting, 'en'));
    return GetSampleLines();
};

for (const { setting, expected } of LANGUAGES) {
    describe(`範例 diff 的每一個案例（介面語言 ${setting}）`, () => {
        // 收集階段就取好內容：各語言的 describe 依序收集，翻譯表換到這一個語言時取的就是這一份
        const { original, modified } = LoadSample(setting);

        /**
         * 算範例 diff。
         * @param overrides 要改的選項
         * @returns 框線範圍與改動的字
         */
        const Compute = (overrides: Partial<IBorderRangeOptions> = {}): ReturnType<typeof ComputeDiffRanges> =>
            ComputeDiffRanges(original, modified, { ...OPTIONS, ...overrides });

        it('[DS-51] 改了一部分的行：只框改動的字', () => {
            const { borders } = Compute();
            expect(
                SliceOnLine(modified, borders.inserted, "import { AppOverflowButton } from './components';"),
            ).toEqual(['App']);
            expect(
                SliceOnLine(modified, borders.inserted, '    return new AppOverflowButton({ label, isDense: true });'),
            ).toEqual(['App', 'true']);
            expect(
                SliceOnLine(original, borders.removed, '    return new OverflowButton({ label, isDense: false });'),
            ).toEqual(['false']);
        });

        it('[DS-51] 註解行裡只改了幾個字：只框改動的那幾個字', () => {
            const { borders } = Compute();
            for (const { line, boxes } of expected.changedLines) {
                expect(SliceOnLine(modified, borders.inserted, line)).toEqual(boxes);
            }
            expect(SliceOnLine(original, borders.removed, expected.removedLine.line)).toEqual(
                expected.removedLine.boxes,
            );
        });

        it('[DS-51] 整段新增 / 刪除：預設不框，整段也框才框整行', () => {
            const added = 'const CreateMenu = (items: string[]) => items.map((item) => CreateButton(item));';
            const removed = 'const LEGACY_TIMEOUT = 3000;';
            expect(SliceOnLine(modified, Compute().borders.inserted, added)).toEqual([]);
            expect(SliceOnLine(original, Compute().borders.removed, removed)).toEqual([]);
            const whole = Compute({ isWholeLineIncluded: true }).borders;
            expect(SliceOnLine(modified, whole.inserted, added)).toEqual([added]);
            expect(SliceOnLine(original, whole.removed, removed)).toEqual([removed]);
        });

        it('[DS-51] 外面包一層 try、裡面整段多一層縮排：只多了縮排的行預設不框，空白也框才框', () => {
            const reindented = ['        const data = await FetchAsync();', '        Render(data);'];
            for (const line of reindented) {
                expect(SliceOnLine(modified, Compute().borders.inserted, line)).toEqual([]);
                expect(SliceOnLine(modified, Compute({ isWhitespaceIncluded: true }).borders.inserted, line)).toEqual([
                    '    ',
                ]);
            }
        });

        it('[DS-51] try 那一段新加的行字全是新的：預設不框（開頭的縮排沒變）', () => {
            expect(SliceOnLine(modified, Compute().borders.inserted, '    } finally {')).toEqual([]);
        });

        it('[DS-51] 每一行註解都是這個語言', () => {
            const comments = [...original, ...modified].filter((line) => COMMENT_LINE_PATTERN.test(line));
            expect(comments.length).toBeGreaterThan(0);
            expect(comments.filter((line) => CJK_PATTERN.test(line) !== expected.isCommentChinese)).toEqual([]);
        });

        it('[DS-51] 註解色只換註解裡改動的字：程式碼裡改動的字不換', () => {
            const changed = Compute().changedText.inserted;
            const comments = FindChangedCommentRanges(modified, TYPESCRIPT_COMMENTS, changed);
            const texts = comments.map((range) =>
                (modified[range.line] ?? '').slice(range.startCharacter, range.endCharacter),
            );
            expect(texts).toEqual(expected.commentColored);
        });
    });
}
