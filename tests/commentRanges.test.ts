/**
 * 照註解符號找註解範圍（`src/commentRanges.ts`）。
 *
 * 換錯地方的顏色是靜默的：把程式碼染成註解色、或該換的註解沒換，都不會有任何錯誤。
 * 斷言一律拿範圍去切那一行的文字，比對切出來的字。
 */
import { describe, expect, it } from 'vitest';

import { FindChangedCommentRanges, FindCommentRanges } from '../src/commentRanges';
import type { ICommentSyntax } from '../src/commentSyntax';
import type { ITextRange } from '../src/diffRanges';

/** TypeScript 這類語言 */
const C_LIKE: ICommentSyntax = { lineComment: '//', blockComment: ['/*', '*/'] };

/** Markdown：只有區塊註解 */
const MARKDOWN: ICommentSyntax = { blockComment: ['<!--', '-->'] };

/**
 * 把範圍切成文字。
 * @param lines 每一行
 * @param ranges 範圍
 * @returns 每一段的文字
 */
const Slice = (lines: readonly string[], ranges: readonly ITextRange[]): string[] =>
    ranges.map((range) => (lines[range.line] ?? '').slice(range.startCharacter, range.endCharacter));

/**
 * 所有行都當成要找的行。
 * @param lines 每一行
 * @returns 行號集合
 */
const AllLines = (lines: readonly string[]): Set<number> => new Set(lines.map((_, index) => index));

describe('行註解', () => {
    it('從註解符號到行尾', () => {
        const lines = ['const a = 1; // 說明', '// 整行註解'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(['// 說明', '// 整行註解']);
    });

    it('[DS-17] 字串裡的註解符號不算', () => {
        const lines = ['const url = "https://example.com"; // 真的註解', "const b = 'a // b';"];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(['// 真的註解']);
    });

    it('跳脫的引號不會讓字串提早結束', () => {
        const lines = ['const s = "say \\"// hi\\""; // 註解'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(['// 註解']);
    });

    it('行註解的內容裡有引號，不影響', () => {
        const lines = ["// don't `x`", 'const a = 1;'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(["// don't `x`"]);
    });
});

describe('區塊註解', () => {
    it('同一行開頭結尾，後面的程式碼不算', () => {
        const lines = ['const a = /* 數量 */ 1;'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(['/* 數量 */']);
    });

    it('[DS-18] 跨行：中間的行整行、最後一行到結尾符號為止', () => {
        const lines = ['/**', ' * 說明', ' */ const a = 1;'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, AllLines(lines)))).toEqual(['/**', ' * 說明', ' */']);
    });

    it('只找指定的行：區塊註解從前面的行開始也認得出來', () => {
        const lines = ['/**', ' * 沒改的', ' * 改過的', ' */', 'const a = 1;'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, new Set([2, 4])))).toEqual([' * 改過的']);
    });
});

describe('沒有行註解的語言（Markdown）', () => {
    it('[DS-19] 內文的撇號不當成字串：後面的註解照樣認得出來', () => {
        const lines = ["don't <!-- 註解 --> text"];
        expect(Slice(lines, FindCommentRanges(lines, MARKDOWN, AllLines(lines)))).toEqual(['<!-- 註解 -->']);
    });
});

describe('指定的行', () => {
    it('沒指定的行不找；空集合 ⇒ 沒有', () => {
        const lines = ['// a', '// b'];
        expect(Slice(lines, FindCommentRanges(lines, C_LIKE, new Set([1])))).toEqual(['// b']);
        expect(FindCommentRanges(lines, C_LIKE, new Set())).toEqual([]);
    });
});

describe('FindChangedCommentRanges（註解裡改動的字）', () => {
    /**
     * 一行裡某一段的範圍。
     * @param line 行號
     * @param text 那一行
     * @param part 要的那一段
     * @returns 範圍
     */
    const Part = (line: number, text: string, part: string): ITextRange => {
        const startCharacter = text.indexOf(part);
        if (startCharacter < 0) {
            // 找不到時給出 -1 的範圍，斷言會對著不存在的範圍照樣通過
            throw new Error(`測試資料裡找不到「${part}」`);
        }
        return { line, startCharacter, endCharacter: startCharacter + part.length };
    };

    it('[DS-16] 註解裡只改了幾個字 ⇒ 只換那幾個字', () => {
        const lines = ['// 開發 tools/ 底下的 VS Code 擴充用：F5 開一個視窗'];
        const changed = [Part(0, lines[0] ?? '', '底下的 VS Code 擴充用')];
        expect(Slice(lines, FindChangedCommentRanges(lines, C_LIKE, changed))).toEqual(['底下的 VS Code 擴充用']);
    });

    it('[DS-16] 改動在程式碼、不在註解 ⇒ 不換', () => {
        const lines = ['import { AppOverflowBtn } from "./a"; // 匯入'];
        expect(FindChangedCommentRanges(lines, C_LIKE, [Part(0, lines[0] ?? '', 'App')])).toEqual([]);
    });

    it('改動橫跨程式碼與註解 ⇒ 只換註解那一半', () => {
        const lines = ['const a = 2; // 改成 2'];
        const changed = [Part(0, lines[0] ?? '', '2; // 改成 2')];
        expect(Slice(lines, FindChangedCommentRanges(lines, C_LIKE, changed))).toEqual(['// 改成 2']);
    });

    it('[DS-16] 整行都是改動（整段新增）⇒ 整個註解', () => {
        const lines = ['    // 整段新增的註解', 'const b = 1;'];
        const changed = [
            { line: 0, startCharacter: 0, endCharacter: lines[0]?.length ?? 0 },
            { line: 1, startCharacter: 0, endCharacter: lines[1]?.length ?? 0 },
        ];
        expect(Slice(lines, FindChangedCommentRanges(lines, C_LIKE, changed))).toEqual(['// 整段新增的註解']);
    });
});
