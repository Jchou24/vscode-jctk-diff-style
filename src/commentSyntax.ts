/**
 * 一種語言的註解符號：從那個語言的 `language-configuration.json` 讀出來。
 *
 * VS Code 不把「哪一段是註解」交給擴充（沒有讀語法 token 的 API）⇒ 只能照註解符號自己找。
 * 註解符號每個語言的擴充都寫在 `language-configuration.json` 的 `comments`（Better Comments 也是這樣讀）。
 * 那個檔是 JSONC（可帶註解與結尾逗號）⇒ 用 VS Code 自己用的 `jsonc-parser` 解析。
 */
import { type ParseError, parse } from 'jsonc-parser';

import { IsRecord } from './presetModel';

/** 一種語言的註解符號 */
interface ICommentSyntax {
    /** 行註解（ex `//`） */
    lineComment?: string;
    /** 區塊註解的開頭與結尾（ex `/*`、`*\/`） */
    blockComment?: readonly [string, string];
}

/**
 * 取出行註解：可以是字串，也可以是 `{ comment: "//" }`（較新的語言設定寫法）。
 * @param value `comments.lineComment` 的值
 * @returns 行註解符號
 */
const PickLineComment = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value !== '') {
        return value;
    }
    return IsRecord(value) && typeof value.comment === 'string' && value.comment !== '' ? value.comment : undefined;
};

/**
 * 取出區塊註解：兩個非空字串的陣列。
 * @param value `comments.blockComment` 的值
 * @returns 開頭與結尾
 */
const PickBlockComment = (value: unknown): readonly [string, string] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const [start, end]: unknown[] = value;
    return typeof start === 'string' && typeof end === 'string' && start !== '' && end !== ''
        ? [start, end]
        : undefined;
};

/**
 * 從 `language-configuration.json` 的內容讀出註解符號。
 * @param text 檔案內容（JSONC）
 * @returns 註解符號；解析失敗或沒有任何註解符號時為 undefined
 */
const ParseCommentSyntax = (text: string): ICommentSyntax | undefined => {
    const errors: ParseError[] = [];
    const config: unknown = parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !IsRecord(config) || !IsRecord(config.comments)) {
        return undefined;
    }
    const lineComment = PickLineComment(config.comments.lineComment);
    const blockComment = PickBlockComment(config.comments.blockComment);
    if (lineComment === undefined && blockComment === undefined) {
        return undefined;
    }
    return {
        ...(lineComment === undefined ? {} : { lineComment }),
        ...(blockComment === undefined ? {} : { blockComment }),
    };
};

export { ParseCommentSyntax };
export type { ICommentSyntax };
