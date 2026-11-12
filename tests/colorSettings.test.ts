/**
 * 寫回 `workbench.colorCustomizations`（`src/colorSettings.ts`）。
 *
 * 這個設定是整個物件一起寫的，裡面還有使用者自己的鍵（ex 分頁顏色）
 * ⇒ 守的是「只動受管的鍵，其餘一個都不能少」。
 */
import { describe, expect, it } from 'vitest';

import {
    BuildColorCustomizations,
    DIFF_COLOR_KEYS,
    FindOverriddenKeys,
    IsSameSetting,
    LINE_NUMBER_KEYS,
    MANAGED_COLOR_KEYS,
} from '../src/colorSettings';
import { NormalizePresets } from '../src/presetModel';

const THEME = 'One Monokai';
const SCOPE = `[${THEME}]`;
const [preset] = NormalizePresets([{ name: 'A', commentColor: '#959cab' }]);

describe('BuildColorCustomizations', () => {
    it('寫在目前主題那一格，六個底色都在', () => {
        const result = BuildColorCustomizations(undefined, THEME, preset);
        expect(result).toEqual({
            [SCOPE]: {
                [DIFF_COLOR_KEYS.insertedLine]: preset?.colors.insertedLine,
                [DIFF_COLOR_KEYS.insertedText]: preset?.colors.insertedText,
                [DIFF_COLOR_KEYS.insertedGutter]: preset?.colors.insertedGutter,
                [DIFF_COLOR_KEYS.removedLine]: preset?.colors.removedLine,
                [DIFF_COLOR_KEYS.removedText]: preset?.colors.removedText,
                [DIFF_COLOR_KEYS.removedGutter]: preset?.colors.removedGutter,
            },
        });
    });

    it('[DS-35] 使用者自己的鍵原樣留著（通用的與同一格裡的）', () => {
        const result = BuildColorCustomizations(
            {
                'tab.activeBorder': '#7d9dbe',
                [SCOPE]: { 'editor.background': '#000000', [DIFF_COLOR_KEYS.insertedLine]: '#11111111' },
            },
            THEME,
            preset,
        );
        expect(result['tab.activeBorder']).toBe('#7d9dbe');
        expect(result[SCOPE]).toMatchObject({
            'editor.background': '#000000',
            [DIFF_COLOR_KEYS.insertedLine]: preset?.colors.insertedLine,
        });
    });

    it('[DS-37] 行號色寫在同一格；換到行號色「不換」的那一組 ⇒ 行號鍵拿掉、底色照寫', () => {
        const [withLineNumbers, without] = NormalizePresets([
            { name: 'L', lineNumbers: { color: '#c6c6c6', activeColor: '#ffffff' } },
            { name: 'N' },
        ]);
        const applied = BuildColorCustomizations(
            { [SCOPE]: { 'editor.background': '#000000' } },
            THEME,
            withLineNumbers,
        );
        expect(applied[SCOPE]).toMatchObject({
            'editor.background': '#000000',
            [LINE_NUMBER_KEYS.color]: '#c6c6c6',
            [LINE_NUMBER_KEYS.activeColor]: '#ffffff',
        });
        const switched = BuildColorCustomizations(applied, THEME, without);
        expect(switched[SCOPE]).not.toHaveProperty(LINE_NUMBER_KEYS.color);
        expect(switched[SCOPE]).not.toHaveProperty(LINE_NUMBER_KEYS.activeColor);
        expect(switched[SCOPE]).toMatchObject({
            'editor.background': '#000000',
            [DIFF_COLOR_KEYS.insertedText]: without?.colors.insertedText,
        });
    });

    it('[DS-36] 換主題：舊主題那一格的受管鍵清掉，其他鍵留著', () => {
        const result = BuildColorCustomizations(
            {
                '[Old]': { [DIFF_COLOR_KEYS.insertedText]: '#11111111', 'editor.foreground': '#222222' },
                '[Older]': { [DIFF_COLOR_KEYS.removedText]: '#33333333' },
            },
            THEME,
            preset,
        );
        expect(result['[Old]']).toEqual({ 'editor.foreground': '#222222' });
        expect(result).not.toHaveProperty('[Older]');
        expect(result[SCOPE]).toBeDefined();
    });

    it('不在主題格子裡的受管鍵不動（那是使用者自己設的通用值）', () => {
        const result = BuildColorCustomizations({ [DIFF_COLOR_KEYS.insertedText]: '#44444444' }, THEME, preset);
        expect(result[DIFF_COLOR_KEYS.insertedText]).toBe('#44444444');
    });

    it('preset 為 undefined ⇒ 所有主題格子裡的受管鍵都拿掉、空格子整格拿掉', () => {
        const current = BuildColorCustomizations({ 'tab.activeBorder': '#7d9dbe' }, THEME, preset);
        const result = BuildColorCustomizations(current, THEME, undefined);
        expect(result).toEqual({ 'tab.activeBorder': '#7d9dbe' });
    });

    it('目前的值壞掉（不是物件）⇒ 當成空的', () => {
        expect(Object.keys(BuildColorCustomizations('oops', THEME, preset))).toEqual([SCOPE]);
        expect(Object.keys(BuildColorCustomizations(['x'], THEME, preset))).toEqual([SCOPE]);
    });
});

describe('FindOverriddenKeys', () => {
    it('[DS-40] 工作區那一格有受管的鍵 ⇒ 列出來', () => {
        const workspace = { [SCOPE]: { [DIFF_COLOR_KEYS.insertedLine]: '#000', 'editor.background': '#111' } };
        expect(FindOverriddenKeys(workspace, THEME, MANAGED_COLOR_KEYS)).toEqual([DIFF_COLOR_KEYS.insertedLine]);
    });

    it('工作區那一格有行號色 ⇒ 也列出來（會蓋掉參數組的行號色）', () => {
        const workspace = { [SCOPE]: { [LINE_NUMBER_KEYS.color]: '#c6c6c6' } };
        expect(FindOverriddenKeys(workspace, THEME, MANAGED_COLOR_KEYS)).toEqual([LINE_NUMBER_KEYS.color]);
    });

    it('只在通用層或別的主題 ⇒ 不算（蓋不掉限定主題的值）', () => {
        const workspace = {
            [DIFF_COLOR_KEYS.insertedLine]: '#000',
            '[Other]': { [DIFF_COLOR_KEYS.insertedText]: '#000' },
        };
        expect(FindOverriddenKeys(workspace, THEME, MANAGED_COLOR_KEYS)).toEqual([]);
    });

    it('沒有工作區設定', () => {
        expect(FindOverriddenKeys(undefined, THEME, MANAGED_COLOR_KEYS)).toEqual([]);
    });
});

describe('IsSameSetting', () => {
    it('undefined 與空物件相同；內容不同就不同', () => {
        expect(IsSameSetting(undefined, {})).toBe(true);
        expect(IsSameSetting({ a: 1 }, { a: 2 })).toBe(false);
    });
});
