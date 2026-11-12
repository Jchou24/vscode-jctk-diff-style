/**
 * 照註解符號找出註解範圍；換 diff 裡的註解色時，只取註解裡改動的字（{@link FindChangedCommentRanges}）。
 *
 * 這不是語法分析，是近似：
 * - 引號裡的註解符號不算（ex 字串裡的網址 `"https://…"`）——只在有行註解的語言這樣做：
 *   沒有行註解的多是標記語言（Markdown、HTML），內文的撇號（`don't`）會被當成字串的開頭
 * - 字串只看同一行：跨行的字串（樣板字串）裡出現註解符號時會誤判
 * - 區塊註解可以跨行：從檔頭掃起，才知道某一行是不是在區塊註解裡面
 */
import type { ICommentSyntax } from './commentSyntax';
import type { ITextRange } from './diffRanges';

/** 當成字串開頭的引號 */
const QUOTES: readonly string[] = ['"', "'", '`'];

/** 字串裡的跳脫字元 */
const ESCAPE = '\\';

/**
 * 從某個位置起，找出字串結束的位置（同一行內）。
 * @param line 那一行
 * @param start 開頭引號之後的位置
 * @param quote 開頭的引號
 * @returns 結尾引號之後的位置；同一行沒有結尾時為行尾
 */
const SkipString = (line: string, start: number, quote: string): number => {
    let index = start;
    while (index < line.length) {
        const char = line[index];
        if (char === ESCAPE) {
            index += 2;
            continue;
        }
        if (char === quote) {
            return index + 1;
        }
        index += 1;
    }
    return line.length;
};

/**
 * 找出指定的那幾行裡的註解範圍。
 * @param lines 文件的每一行
 * @param syntax 這個語言的註解符號
 * @param targetLines 要找的行（從 0 起算）；其餘的行只用來追蹤跨行的區塊註解
 * @returns 註解範圍，每行一段
 */
const FindCommentRanges = (
    lines: readonly string[],
    syntax: ICommentSyntax,
    targetLines: ReadonlySet<number>,
): ITextRange[] => {
    const { lineComment, blockComment } = syntax;
    const isStringAware = lineComment !== undefined;
    const lastTarget = Math.max(-1, ...targetLines);
    const ranges: ITextRange[] = [];
    let isInBlock = false;
    for (let lineIndex = 0; lineIndex <= lastTarget && lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? '';
        const segments: [number, number][] = [];
        let index = 0;
        if (isInBlock && blockComment !== undefined) {
            const end = line.indexOf(blockComment[1]);
            if (end === -1) {
                segments.push([0, line.length]);
                index = line.length;
            } else {
                segments.push([0, end + blockComment[1].length]);
                index = end + blockComment[1].length;
                isInBlock = false;
            }
        }
        while (index < line.length) {
            if (lineComment !== undefined && line.startsWith(lineComment, index)) {
                segments.push([index, line.length]);
                break;
            }
            if (blockComment !== undefined && line.startsWith(blockComment[0], index)) {
                const end = line.indexOf(blockComment[1], index + blockComment[0].length);
                if (end === -1) {
                    segments.push([index, line.length]);
                    isInBlock = true;
                    break;
                }
                segments.push([index, end + blockComment[1].length]);
                index = end + blockComment[1].length;
                continue;
            }
            const char = line[index] ?? '';
            index = isStringAware && QUOTES.includes(char) ? SkipString(line, index + 1, char) : index + 1;
        }
        if (targetLines.has(lineIndex)) {
            for (const [startCharacter, endCharacter] of segments) {
                if (endCharacter > startCharacter) {
                    ranges.push({ line: lineIndex, startCharacter, endCharacter });
                }
            }
        }
    }
    return ranges;
};

/**
 * 兩組範圍的交集（同一行裡重疊的那一段）。
 * @param left 一組
 * @param right 另一組
 * @returns 交集，每行一段
 */
const IntersectRanges = (left: readonly ITextRange[], right: readonly ITextRange[]): ITextRange[] =>
    left.flatMap((a) =>
        right.flatMap((b) => {
            const startCharacter = Math.max(a.startCharacter, b.startCharacter);
            const endCharacter = Math.min(a.endCharacter, b.endCharacter);
            return a.line === b.line && endCharacter > startCharacter
                ? [{ line: a.line, startCharacter, endCharacter }]
                : [];
        }),
    );

/**
 * 註解裡改動的字：註解範圍與改動的字取交集。
 * @param lines 文件的每一行
 * @param syntax 這個語言的註解符號
 * @param changedText 改動的字（改了一部分的行裡改動的字、整段新增 / 刪除的整行）
 * @returns 要換註解色的範圍
 */
const FindChangedCommentRanges = (
    lines: readonly string[],
    syntax: ICommentSyntax,
    changedText: readonly ITextRange[],
): ITextRange[] => {
    const comments = FindCommentRanges(lines, syntax, new Set(changedText.map((range) => range.line)));
    return IntersectRanges(comments, changedText);
};

export { FindChangedCommentRanges, FindCommentRanges };
