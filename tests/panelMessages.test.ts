/**
 * 面板與擴充之間的訊息守門（`src/panelMessages.ts`）。
 *
 * 兩邊只能互傳 JSON：認不得的訊息要被擋下（回 undefined），
 * 而面板送來的參數組缺欄位時要補齊——不能讓一筆壞的值寫進使用者設定。
 */
import { describe, expect, it } from 'vitest';

import { LanguageSettings } from '../src/languageSettings';
import { PanelMessageTypes, ParsePanelMessage, ParseStateMessage } from '../src/panelMessages';
import { NormalizePresets } from '../src/presetModel';
import { SettingLayers } from '../src/settingLayers';

const [fallback] = NormalizePresets([{ name: 'A' }]);
if (fallback === undefined) {
    throw new Error('NormalizePresets 應至少回一組');
}

describe('ParsePanelMessage', () => {
    it('不帶資料的那幾種', () => {
        for (const type of [
            PanelMessageTypes.Ready,
            PanelMessageTypes.Add,
            PanelMessageTypes.Rename,
            PanelMessageTypes.Remove,
            PanelMessageTypes.OpenSample,
        ]) {
            expect(ParsePanelMessage({ type }, fallback)).toEqual({ type });
        }
    });

    it('[DS-46] Update：參數組缺欄位時用目前那一組補', () => {
        const message = ParsePanelMessage(
            { type: PanelMessageTypes.Update, preset: { name: 'A', border: { width: 3 } } },
            fallback,
        );
        expect(message).toEqual({
            type: PanelMessageTypes.Update,
            preset: { ...fallback, border: { ...fallback.border, width: 3 } },
        });
    });

    it('Update：參數組沒有名字 ⇒ 擋下', () => {
        expect(ParsePanelMessage({ type: PanelMessageTypes.Update, preset: { border: {} } }, fallback)).toBeUndefined();
    });

    it('Select：名字要是字串', () => {
        expect(ParsePanelMessage({ type: PanelMessageTypes.Select, name: 'B' }, fallback)).toEqual({
            type: PanelMessageTypes.Select,
            name: 'B',
        });
        expect(ParsePanelMessage({ type: PanelMessageTypes.Select, name: 3 }, fallback)).toBeUndefined();
    });

    it('[DS-56] SetLanguage：只收認得的語言', () => {
        for (const language of Object.values(LanguageSettings)) {
            expect(ParsePanelMessage({ type: PanelMessageTypes.SetLanguage, language }, fallback)).toEqual({
                type: PanelMessageTypes.SetLanguage,
                language,
            });
        }
        expect(ParsePanelMessage({ type: PanelMessageTypes.SetLanguage, language: 'xx' }, fallback)).toBeUndefined();
        expect(ParsePanelMessage({ type: PanelMessageTypes.SetLanguage }, fallback)).toBeUndefined();
    });

    it('[DS-46] 認不得的 ⇒ 擋下', () => {
        expect(ParsePanelMessage({ type: 'unknown' }, fallback)).toBeUndefined();
        expect(ParsePanelMessage({ type: PanelMessageTypes.State }, fallback)).toBeUndefined();
        expect(ParsePanelMessage('ready', fallback)).toBeUndefined();
    });
});

describe('ParseStateMessage', () => {
    const state = {
        presets: [fallback],
        activeName: 'A',
        themeName: 'One Monokai',
        layer: SettingLayers.Workspace,
        overriddenKeys: ['diffEditor.insertedLineBackground'],
        language: LanguageSettings.Auto,
        displayLanguage: 'en',
    };

    it('完整的狀態', () => {
        expect(ParseStateMessage({ type: PanelMessageTypes.State, state })).toEqual({
            type: PanelMessageTypes.State,
            state,
        });
    });

    it('被蓋掉的鍵只收字串', () => {
        const message = ParseStateMessage({
            type: PanelMessageTypes.State,
            state: { ...state, overriddenKeys: ['a', 3] },
        });
        expect(message?.state.overriddenKeys).toEqual(['a']);
    });

    it('[DS-47] 缺欄位或不是狀態 ⇒ 擋下', () => {
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, themeName: undefined } }),
        ).toBeUndefined();
        expect(ParseStateMessage({ type: PanelMessageTypes.Ready, state })).toBeUndefined();
    });

    it('[DS-56] 翻譯表：值都是字串就帶著；有一個不是字串就整份不要（面板用英文）', () => {
        const bundle = { Delete: '刪除', Rename: '改名' };
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, l10nBundle: bundle } })?.state
                .l10nBundle,
        ).toEqual(bundle);
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, l10nBundle: { Delete: 3 } } })?.state,
        ).not.toHaveProperty('l10nBundle');
    });

    it('介面語言：沒有實際用的語言 ⇒ 擋下；設定值認不得 ⇒ 當成跟著 VS Code', () => {
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, displayLanguage: undefined } }),
        ).toBeUndefined();
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, language: 'xx' } })?.state.language,
        ).toBe(LanguageSettings.Auto);
    });

    it('寫入的那一層要認得 ⇒ 認不得就擋下', () => {
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, layer: 'folder' } }),
        ).toBeUndefined();
        expect(
            ParseStateMessage({ type: PanelMessageTypes.State, state: { ...state, layer: undefined } }),
        ).toBeUndefined();
    });
});
