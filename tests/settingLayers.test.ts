/**
 * 參數組與顏色寫在哪一層（`src/settingLayers.ts`）。
 *
 * 守的是「參數組在哪一層，就寫回哪一層」：寫錯層時，專案的參數組會寫進使用者設定（換電腦帶不走），
 * 或別的專案的參數組會寫進這個 repo 的 `.vscode/settings.json`。
 */
import { describe, expect, it } from 'vitest';

import { GetLayerValue, GetOverridingValues, ResolvePresetLayer, SettingLayers } from '../src/settingLayers';

describe('ResolvePresetLayer', () => {
    it('[DS-39] 專案設定有參數組 ⇒ 專案（使用者設定也有時一樣）', () => {
        expect(ResolvePresetLayer({ workspaceValue: [{ name: 'A' }] })).toBe(SettingLayers.Workspace);
        expect(ResolvePresetLayer({ globalValue: [{ name: 'B' }], workspaceValue: [{ name: 'A' }] })).toBe(
            SettingLayers.Workspace,
        );
    });

    it('專案設定寫了空陣列也算有設 ⇒ 專案', () => {
        expect(ResolvePresetLayer({ workspaceValue: [] })).toBe(SettingLayers.Workspace);
    });

    it('只有使用者設定、或兩層都沒有 ⇒ 使用者', () => {
        expect(ResolvePresetLayer({ globalValue: [{ name: 'B' }] })).toBe(SettingLayers.User);
        expect(ResolvePresetLayer({})).toBe(SettingLayers.User);
        expect(ResolvePresetLayer(undefined)).toBe(SettingLayers.User);
    });
});

describe('GetLayerValue', () => {
    const inspected = { globalValue: 'user', workspaceValue: 'workspace', workspaceFolderValue: 'folder' };

    it('只取那一層自己的值', () => {
        expect(GetLayerValue(inspected, SettingLayers.User)).toBe('user');
        expect(GetLayerValue(inspected, SettingLayers.Workspace)).toBe('workspace');
    });
});

describe('GetOverridingValues', () => {
    const inspected = { globalValue: 'user', workspaceValue: 'workspace', workspaceFolderValue: 'folder' };

    it('寫使用者設定 ⇒ 專案與專案資料夾那兩層會蓋掉它', () => {
        expect(GetOverridingValues(inspected, SettingLayers.User)).toEqual(['workspace', 'folder']);
    });

    it('[DS-41] 寫專案設定 ⇒ 只有專案資料夾那一層會蓋掉它', () => {
        expect(GetOverridingValues(inspected, SettingLayers.Workspace)).toEqual(['folder']);
    });
});
