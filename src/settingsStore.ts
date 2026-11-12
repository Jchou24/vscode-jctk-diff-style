/**
 * 讀寫 VS Code 設定：參數組清單、目前那一組、套用出來的底色與行號色、介面語言。
 * （註解色不寫設定：它只換 diff 裡的註解，由 decoration 上色，見 `decorator.ts`）
 *
 * 寫在哪一層由 `settingLayers.ts` 決定：參數組在哪一層，參數組與顏色就都寫回那一層。
 */
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { BuildColorCustomizations, FindOverriddenKeys, IsSameSetting, MANAGED_COLOR_KEYS } from './colorSettings';
import { CreateEchoGuard } from './echoGuard';
import { LanguageSettings, ParseLanguageSetting } from './languageSettings';
import { type IDefaultPresetNames, type IDiffStylePreset, NormalizePresets } from './presetModel';
import { GetLayerValue, GetOverridingValues, ResolvePresetLayer, SettingLayers } from './settingLayers';

/** 本擴充的設定區段——與 `package.json` 的 `contributes.configuration` 同值 */
const SETTINGS_SECTION = 'jctkDiffStyle';

/** 參數組清單的鍵（區段內） */
const PRESETS_KEY = 'presets';

/** 目前那一組的鍵（區段內） */
const ACTIVE_PRESET_KEY = 'activePreset';

/** 介面語言的鍵（區段內）：只在使用者設定（`package.json` 設成 `application`），不跟著專案走 */
const LANGUAGE_KEY = 'language';

/** VS Code 底色設定 */
const COLOR_CUSTOMIZATIONS_SETTING = 'workbench.colorCustomizations';

/** 目前的主題 */
const COLOR_THEME_SETTING = 'workbench.colorTheme';

/** 參數組的狀態 */
interface IPresetState {
    presets: IDiffStylePreset[];
    activeName: string;
}

/** 每一層對應的 VS Code 寫入目標 */
const LAYER_TARGETS: Readonly<Record<SettingLayers, vscode.ConfigurationTarget>> = {
    [SettingLayers.User]: vscode.ConfigurationTarget.Global,
    [SettingLayers.Workspace]: vscode.ConfigurationTarget.Workspace,
};

/** 認出參數組的變更事件是不是自己寫的回音 */
const presetEchoGuard = CreateEchoGuard();

/**
 * 序列化參數組狀態（比對回音用）。
 * @param state 參數組的狀態
 * @returns JSON
 */
const SerializeState = (state: IPresetState): string => JSON.stringify([state.presets, state.activeName]);

/**
 * 內建兩組照目前介面語言的名字。
 * @returns 名字
 */
const GetLocalizedPresetNames = (): IDefaultPresetNames => ({ bright: l10n.t('Bright'), dark: l10n.t('Dark') });

/**
 * 有沒有任何一層設定存了參數組（都沒有時用的是內建兩組）。
 * @returns 有時為 true
 */
const HasStoredPresets = (): boolean => {
    const inspected = vscode.workspace.getConfiguration(SETTINGS_SECTION).inspect<unknown>(PRESETS_KEY);
    return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue].some(
        (value) => value !== undefined,
    );
};

/**
 * 讀出參數組的狀態；設定裡的值不可信，一律正規化。
 * @returns 參數組的狀態（清單至少一組）
 */
const ReadPresetState = (): IPresetState => {
    const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
    return {
        presets: NormalizePresets(config.get<unknown>(PRESETS_KEY), GetLocalizedPresetNames()),
        activeName: config.get<string>(ACTIVE_PRESET_KEY) ?? '',
    };
};

/**
 * 參數組寫在哪一層：專案設定有參數組就是專案，否則是使用者。
 * @returns 寫入的那一層
 */
const GetPresetLayer = (): SettingLayers =>
    ResolvePresetLayer(vscode.workspace.getConfiguration(SETTINGS_SECTION).inspect<unknown>(PRESETS_KEY));

/**
 * 參數組的變更事件是不是本擴充自己寫的回音（是 ⇒ 不必重讀）。
 * @returns 是回音時為 true
 */
const IsOwnPresetWrite = (): boolean => presetEchoGuard.IsEcho(SerializeState(ReadPresetState()));

/**
 * 寫回參數組清單與目前那一組（參數組所在的那一層）。
 * @param state 參數組的狀態
 */
const WritePresetStateAsync = async (state: IPresetState): Promise<void> => {
    const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
    const target = LAYER_TARGETS[GetPresetLayer()];
    presetEchoGuard.BeginWrite(SerializeState(state));
    try {
        await config.update(PRESETS_KEY, state.presets, target);
        await config.update(ACTIVE_PRESET_KEY, state.activeName, target);
    } finally {
        presetEchoGuard.EndWrite();
    }
};

/**
 * 介面語言的設定。
 * @returns 設定值；沒設或認不得時跟著 VS Code
 */
const ReadLanguageSetting = (): LanguageSettings =>
    ParseLanguageSetting(vscode.workspace.getConfiguration(SETTINGS_SECTION).get<unknown>(LANGUAGE_KEY));

/**
 * 寫回介面語言（使用者設定）；跟著 VS Code 時拿掉這個鍵，設定檔不留預設值。
 * @param language 設定值
 */
const WriteLanguageSettingAsync = async (language: LanguageSettings): Promise<void> => {
    await vscode.workspace
        .getConfiguration(SETTINGS_SECTION)
        .update(
            LANGUAGE_KEY,
            language === LanguageSettings.Auto ? undefined : language,
            vscode.ConfigurationTarget.Global,
        );
};

/**
 * 目前的主題名稱。
 * @returns `workbench.colorTheme` 的值
 */
const GetThemeName = (): string => vscode.workspace.getConfiguration().get<string>(COLOR_THEME_SETTING) ?? '';

/**
 * 只在值真的變了時寫回某一層。
 * @param setting 設定鍵
 * @param layer 寫入的那一層
 * @param Build 由那一層目前的值算出新值
 */
const UpdateLayerSettingAsync = async (
    setting: string,
    layer: SettingLayers,
    Build: (current: unknown) => Record<string, unknown>,
): Promise<void> => {
    const config = vscode.workspace.getConfiguration();
    const current = GetLayerValue(config.inspect<unknown>(setting), layer);
    const next = Build(current);
    if (!IsSameSetting(current, next)) {
        await config.update(setting, Object.keys(next).length > 0 ? next : undefined, LAYER_TARGETS[layer]);
    }
};

/**
 * 把參數組的底色與行號色寫進參數組所在那一層（目前主題那一格）。
 * @param preset 要套用的參數組
 */
const ApplyColorsAsync = async (preset: IDiffStylePreset): Promise<void> => {
    const themeName = GetThemeName();
    await UpdateLayerSettingAsync(COLOR_CUSTOMIZATIONS_SETTING, GetPresetLayer(), (current) =>
        BuildColorCustomizations(current, themeName, preset),
    );
};

/**
 * 拿掉本擴充寫過的顏色：使用者設定與專案設定都清（專案設定只在它有這個設定時才動）。
 */
const RemoveAppliedColorsAsync = async (): Promise<void> => {
    const themeName = GetThemeName();
    const inspected = vscode.workspace.getConfiguration().inspect<unknown>(COLOR_CUSTOMIZATIONS_SETTING);
    const layers = [SettingLayers.User];
    if (inspected?.workspaceValue !== undefined) {
        layers.push(SettingLayers.Workspace);
    }
    for (const layer of layers) {
        await UpdateLayerSettingAsync(COLOR_CUSTOMIZATIONS_SETTING, layer, (current) =>
            BuildColorCustomizations(current, themeName, undefined),
        );
    }
};

/**
 * 比參數組那一層優先、蓋掉受管鍵的設定（寫使用者設定時是專案與專案資料夾那兩層）。
 * @returns 被蓋掉的鍵
 */
const FindWorkspaceOverrides = (): string[] => {
    const inspected = vscode.workspace.getConfiguration().inspect<unknown>(COLOR_CUSTOMIZATIONS_SETTING);
    const themeName = GetThemeName();
    const keys = new Set<string>();
    for (const value of GetOverridingValues(inspected, GetPresetLayer())) {
        for (const key of FindOverriddenKeys(value, themeName, MANAGED_COLOR_KEYS)) {
            keys.add(key);
        }
    }
    return [...keys];
};

/**
 * 設定變更事件是否牽動某一類設定。
 * @param event 設定變更事件
 * @returns 各類是否受影響
 */
const DescribeConfigurationChange = (
    event: vscode.ConfigurationChangeEvent,
): { isPresetsChanged: boolean; isLanguageChanged: boolean; isThemeChanged: boolean; isColorsChanged: boolean } => ({
    isPresetsChanged:
        event.affectsConfiguration(`${SETTINGS_SECTION}.${PRESETS_KEY}`) ||
        event.affectsConfiguration(`${SETTINGS_SECTION}.${ACTIVE_PRESET_KEY}`),
    isLanguageChanged: event.affectsConfiguration(`${SETTINGS_SECTION}.${LANGUAGE_KEY}`),
    isThemeChanged: event.affectsConfiguration(COLOR_THEME_SETTING),
    isColorsChanged: event.affectsConfiguration(COLOR_CUSTOMIZATIONS_SETTING),
});

export {
    ApplyColorsAsync,
    RemoveAppliedColorsAsync,
    DescribeConfigurationChange,
    FindWorkspaceOverrides,
    GetLocalizedPresetNames,
    GetPresetLayer,
    GetThemeName,
    HasStoredPresets,
    IsOwnPresetWrite,
    ReadLanguageSetting,
    ReadPresetState,
    WriteLanguageSettingAsync,
    WritePresetStateAsync,
};
export type { IPresetState };
