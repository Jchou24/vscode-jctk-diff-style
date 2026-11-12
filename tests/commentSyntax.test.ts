/**
 * 從 `language-configuration.json` 讀註解符號（`src/commentSyntax.ts`）。
 *
 * 那個檔是 JSONC：VS Code 內建語言的設定檔就帶註解與結尾逗號，用 JSON.parse 會整個讀不出來。
 * 讀不出來的症狀是「註解色沒換」，不會有任何錯誤——守的就是這件事。
 */
import { describe, expect, it } from 'vitest';

import { ParseCommentSyntax } from '../src/commentSyntax';

describe('ParseCommentSyntax', () => {
    it('[DS-20] 帶註解與結尾逗號的 JSONC', () => {
        const text = `{
            // 這是語言設定
            "comments": {
                "lineComment": "//",
                "blockComment": ["/*", "*/"],
            },
        }`;
        expect(ParseCommentSyntax(text)).toEqual({ lineComment: '//', blockComment: ['/*', '*/'] });
    });

    it('行註解是 { comment } 的寫法', () => {
        expect(ParseCommentSyntax('{ "comments": { "lineComment": { "comment": "#", "noIndent": false } } }')).toEqual({
            lineComment: '#',
        });
    });

    it('只有區塊註解（Markdown）', () => {
        expect(ParseCommentSyntax('{ "comments": { "blockComment": ["<!--", "-->"] } }')).toEqual({
            blockComment: ['<!--', '-->'],
        });
    });

    it('沒有註解符號、格式不對、解析失敗 ⇒ undefined', () => {
        expect(ParseCommentSyntax('{ "brackets": [] }')).toBeUndefined();
        expect(ParseCommentSyntax('{ "comments": { "lineComment": "", "blockComment": ["/*"] } }')).toBeUndefined();
        expect(ParseCommentSyntax('{ "comments": ')).toBeUndefined();
    });
});
