/**
 * 比對 diff 的兩側：要畫框線的範圍、有改動的行（`src/diffRanges.ts`）。
 *
 * 框線畫錯位置是**靜默**的：不會擲錯，只是框到旁邊的字、或該框的沒框。
 * 斷言一律拿範圍去切那一行的文字，比對切出來的字——數字對了不代表框對了地方。
 */
import { describe, expect, it } from 'vitest';

import { ComputeDiffRanges, DiffAlgorithms, type IBorderRangeOptions, type ITextRange } from '../src/diffRanges';

/** VS Code 的預設比對設定，加上「不框整段」「不框只改了空白的」 */
const OPTIONS: IBorderRangeOptions = {
    isWholeLineIncluded: false,
    isWhitespaceIncluded: false,
    ignoreTrimWhitespace: false,
    maxComputationTimeMs: 5000,
    algorithm: DiffAlgorithms.Advanced,
};

/**
 * 把範圍切成文字。
 * @param lines 那一側的每一行
 * @param ranges 範圍
 * @returns 每一段框到的字
 */
const Slice = (lines: readonly string[], ranges: readonly ITextRange[]): string[] =>
    ranges.map((range) => (lines[range.line] ?? '').slice(range.startCharacter, range.endCharacter));

describe('改了一部分的行', () => {
    it('[DS-01] 只框改動的字：新增那一側框到 App，刪除那一側沒有字可框', () => {
        const original = ['> 改用 `OverflowBtn` 的裁決、以及「換掉不等於沒事」的兩面'];
        const modified = ['> 改用 `AppOverflowBtn` 的裁決、以及「換掉不等於沒事」的兩面'];
        const ranges = ComputeDiffRanges(original, modified, OPTIONS).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['App']);
        expect(ranges.removed).toEqual([]);
    });

    it('[DS-01] 兩側都有字改了：各自框到自己那一側的字', () => {
        const original = ['const button = new OverflowBtn({ label, isDense: false });'];
        const modified = ['const button = new OverflowBtn({ label, isDense: true });'];
        const ranges = ComputeDiffRanges(original, modified, OPTIONS).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['true']);
        expect(Slice(original, ranges.removed)).toEqual(['false']);
    });

    it('[DS-09] legacy 演算法也框得到', () => {
        const original = ['import { OverflowBtn } from "./a";'];
        const modified = ['import { AppOverflowBtn } from "./a";'];
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, algorithm: DiffAlgorithms.Legacy }).borders;
        expect(Slice(modified, ranges.inserted).join('')).toContain('App');
    });
});

describe('一行改了幾個字、後面接著新增一整段（VS Code 算同一段變動）', () => {
    const original = ['{', '    "mode": "default"', '}'];
    const modified = ['{', '    "mode": "default",', '    // 說明', '    "presets": [', '        1', '    ]', '}'];
    const NEW_LINES = ['    // 說明', '    "presets": [', '        1', '    ]'];

    it('[DS-03] 預設只框改動的那幾個字，新增的整行不框', () => {
        const ranges = ComputeDiffRanges(original, modified, OPTIONS).borders;
        expect(Slice(modified, ranges.inserted)).toEqual([',']);
        expect(ranges.removed).toEqual([]);
    });

    it('[DS-03] 整段也框 ⇒ 新增的整行也框', () => {
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, isWholeLineIncluded: true }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual([',', ...NEW_LINES]);
    });

    it('改動的字照樣含新增的整行（換註解色看這裡）', () => {
        const changed = ComputeDiffRanges(original, modified, OPTIONS).changedText;
        expect(Slice(modified, changed.inserted)).toEqual([',', ...NEW_LINES]);
    });
});

describe('縮排沒變、字全換了（這一段以外只剩空白）', () => {
    const original = ['{', '    foo', '}'];
    const modified = ['{', '    bar', '}'];

    it('[DS-04] 預設當成整行、不框', () => {
        expect(ComputeDiffRanges(original, modified, OPTIONS).borders).toEqual({ inserted: [], removed: [] });
    });

    it('整段也框 ⇒ 框到換掉的字', () => {
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, isWholeLineIncluded: true }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['bar']);
        expect(Slice(original, ranges.removed)).toEqual(['foo']);
    });
});

describe('只改了空白', () => {
    const original = [
        '<template>',
        '    <div class="tab">',
        '        <span>{{ text }}</span>',
        '    </div>',
        '</template>',
    ];
    const modified = [
        '<template>',
        '    <AppRoot>',
        '        <div class="tab">',
        '            <span>{{ text }}</span>',
        '        </div>',
        '    </AppRoot>',
        '</template>',
    ];

    it('[DS-05] 外面包了一層、裡面多一層縮排 ⇒ 預設只多了縮排的行不框', () => {
        const ranges = ComputeDiffRanges(original, modified, OPTIONS).borders;
        expect(ranges).toEqual({ inserted: [], removed: [] });
    });

    it('[DS-05] 只改了空白的也框 ⇒ 每一行的縮排都框', () => {
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, isWhitespaceIncluded: true }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['    ', '    ', '    ']);
    });

    it('[DS-06] 行尾空白 ⇒ 預設不框，選項打開才框', () => {
        expect(ComputeDiffRanges(['a();'], ['a();  '], OPTIONS).borders.inserted).toEqual([]);
        const ranges = ComputeDiffRanges(['a();'], ['a();  '], { ...OPTIONS, isWhitespaceIncluded: true }).borders;
        expect(Slice(['a();  '], ranges.inserted)).toEqual(['  ']);
    });

    it('[DS-07] 空白與字在同一段 ⇒ 照樣框', () => {
        const modifiedLine = ['    const value = x();'];
        const ranges = ComputeDiffRanges(['x();'], modifiedLine, OPTIONS).borders;
        expect(Slice(modifiedLine, ranges.inserted)).toEqual(['    const value = ']);
    });

    it('改動的字照樣含只有空白的那幾段（不影響底色與註解色）', () => {
        const changed = ComputeDiffRanges(original, modified, OPTIONS).changedText;
        expect(Slice(modified, changed.inserted)).toEqual(['    <AppRoot>', '    ', '    ', '    ', '    </AppRoot>']);
    });
});

describe('整段新增 / 刪除', () => {
    const original = ['a', '// 這兩行整段刪掉', 'const LEGACY = 1;', 'b'];
    const modified = ['a', 'b', '', '// 整段新增', 'const NEXT = 2;'];

    it('[DS-02] 預設不框（VS Code 已經整行上色）', () => {
        const ranges = ComputeDiffRanges(original, modified, OPTIONS).borders;
        expect(ranges).toEqual({ inserted: [], removed: [] });
    });

    it('[DS-02] 選項打開 ⇒ 每行從頭框到尾，空行不框', () => {
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, isWholeLineIncluded: true }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['// 整段新增', 'const NEXT = 2;']);
        expect(Slice(original, ranges.removed)).toEqual(['// 這兩行整段刪掉', 'const LEGACY = 1;']);
    });
});

describe('範圍的形狀', () => {
    it('[DS-10] 跨行的改動切成每行一段，沒有長度 0 的段落', () => {
        const original = ['function a() {', '    return 1;', '}'];
        const modified = ['function a() {', '    const value = 1;', '    return value + 1;', '}'];
        const ranges = ComputeDiffRanges(original, modified, { ...OPTIONS, isWholeLineIncluded: true }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['    const value = 1;', ' value +']);
        for (const [lines, sideRanges] of [
            [modified, ranges.inserted],
            [original, ranges.removed],
        ] as const) {
            for (const range of sideRanges) {
                expect(range.endCharacter).toBeGreaterThan(range.startCharacter);
                expect(range.endCharacter).toBeLessThanOrEqual(lines[range.line]?.length ?? 0);
            }
        }
        expect(ranges.inserted.length).toBeGreaterThan(0);
    });
});

describe('ignoreTrimWhitespace', () => {
    const original = ['if (x) {', 'call();', '}'];
    const modified = ['if (x) {', '    call();', '}'];

    it('[DS-08] 關掉 ⇒ 縮排的改動也框', () => {
        const ranges = ComputeDiffRanges(original, modified, {
            ...OPTIONS,
            isWhitespaceIncluded: true,
            ignoreTrimWhitespace: false,
        }).borders;
        expect(Slice(modified, ranges.inserted)).toEqual(['    ']);
    });

    it('[DS-08] 打開 ⇒ 只差頭尾空白的行不算改動', () => {
        const ranges = ComputeDiffRanges(original, modified, {
            ...OPTIONS,
            isWhitespaceIncluded: true,
            ignoreTrimWhitespace: true,
        }).borders;
        expect(ranges).toEqual({ inserted: [], removed: [] });
    });
});

describe('改動的字', () => {
    it('改了一部分的行取改動的字；整段新增 / 刪除不論框不框都取整行；沒改的行不取', () => {
        const original = ['keep', '// 舊的註解', 'drop me', 'tail'];
        const modified = ['keep', '// 新的註解', 'tail', 'added line'];
        const { borders, changedText } = ComputeDiffRanges(original, modified, OPTIONS);
        expect(Slice(modified, changedText.inserted)).toEqual(['新', 'added line']);
        expect(Slice(original, changedText.removed)).toEqual(['舊', 'drop me']);
        expect(Slice(modified, borders.inserted)).toEqual(['新']);
    });

    it('兩邊一樣 ⇒ 沒有', () => {
        const lines = ['a', 'b'];
        expect(ComputeDiffRanges(lines, lines, OPTIONS).changedText).toEqual({ inserted: [], removed: [] });
    });
});
