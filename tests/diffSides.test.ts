/**
 * 挑出 diff 分頁的兩側（`src/diffSides.ts`）。
 *
 * VS Code 給 diff 兩側的編輯器沒有欄號：只認「同一欄」的話一個都挑不到，框線就一條都不畫，
 * 而且完全沒有錯誤——守的就是這件事，外加「別欄開著的同一個檔案不能被誤框」。
 */
import { describe, expect, it } from 'vitest';

import { FindDiffSides, type IEditorInfo } from '../src/diffSides';

const ORIGINAL = 'sample:original';
const MODIFIED = 'sample:modified';

/** 測試裡的編輯器本身就是它的資訊 */
const Describe = (editor: IEditorInfo): IEditorInfo => editor;

describe('FindDiffSides', () => {
    it('[DS-11] diff 的兩側沒有欄號 ⇒ 照樣挑得到', () => {
        const original = { uri: ORIGINAL, viewColumn: undefined };
        const modified = { uri: MODIFIED, viewColumn: undefined };
        expect(FindDiffSides([original, modified], Describe, 1, ORIGINAL, MODIFIED)).toEqual({ original, modified });
    });

    it('[DS-12] 同一個檔案在別欄以一般分頁開著 ⇒ 不挑它', () => {
        const normal = { uri: MODIFIED, viewColumn: 2 };
        const modified = { uri: MODIFIED, viewColumn: undefined };
        expect(FindDiffSides([normal, modified], Describe, 1, ORIGINAL, MODIFIED).modified).toBe(modified);
        expect(FindDiffSides([normal], Describe, 1, ORIGINAL, MODIFIED).modified).toBeUndefined();
    });

    it('欄號等於 diff 所在的那一欄 ⇒ 也挑（VS Code 哪天補上欄號時照樣找得到）', () => {
        const modified = { uri: MODIFIED, viewColumn: 1 };
        expect(FindDiffSides([modified], Describe, 1, ORIGINAL, MODIFIED).modified).toBe(modified);
    });

    it('inline 模式只有一側看得到 ⇒ 另一側為 undefined', () => {
        const modified = { uri: MODIFIED, viewColumn: undefined };
        expect(FindDiffSides([modified], Describe, 1, ORIGINAL, MODIFIED)).toEqual({ original: undefined, modified });
    });
});
