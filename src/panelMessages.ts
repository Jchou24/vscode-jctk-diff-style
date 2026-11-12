/**
 * 設定面板（webview）與擴充之間的訊息。
 *
 * 兩邊跑在不同的環境、只能互傳 JSON ⇒ 收到的一律當 unknown，經這裡的型別守門收斂。
 * 面板那一側（`webview/panel.ts`）與擴充那一側共用這一份，訊息種類只在這裡定義。
 */
import { LanguageSettings, ParseLanguageSetting } from './languageSettings';
import type { IDiffStylePreset } from './presetModel';
import { IsRecord, NormalizePreset, NormalizePresets } from './presetModel';
import { SettingLayers } from './settingLayers';

/** 訊息種類 */
enum PanelMessageTypes {
    /** 擴充 → 面板：整份狀態（清單、目前那一組、主題、被工作區蓋掉的鍵） */
    State = 'state',
    /** 面板 → 擴充：面板載入完成，要一份狀態 */
    Ready = 'ready',
    /** 面板 → 擴充：目前那一組的值改了（拖動時連續送） */
    Update = 'update',
    /** 面板 → 擴充：切換到另一組 */
    Select = 'select',
    /** 面板 → 擴充：複製目前這一組成新的一組 */
    Add = 'add',
    /** 面板 → 擴充：改目前這一組的名字 */
    Rename = 'rename',
    /** 面板 → 擴充：刪除目前這一組 */
    Remove = 'remove',
    /** 面板 → 擴充：開啟範例 diff */
    OpenSample = 'openSample',
    /** 面板 → 擴充：換這支擴充的介面語言（VS Code 的不動） */
    SetLanguage = 'setLanguage',
}

/** 面板要畫出來的狀態 */
interface IPanelState {
    presets: IDiffStylePreset[];
    activeName: string;
    /** 參數組的底色與行號色寫在這個主題那一格 */
    themeName: string;
    /** 參數組與顏色寫在哪一層設定 */
    layer: SettingLayers;
    /** 工作區設定蓋掉的鍵——這幾項在目前的工作區調了看不到效果 */
    overriddenKeys: string[];
    /** 介面語言的設定（`jctkDiffStyle.language`） */
    language: LanguageSettings;
    /** 介面實際用的語言（`en`、`zh-tw`）：設定是「跟著 VS Code」時由 VS Code 的顯示語言決定 */
    displayLanguage: string;
    /** 那個語言的翻譯表；英文時沒有 */
    l10nBundle?: Record<string, string>;
}

/** 擴充 → 面板 */
interface IStateMessage {
    type: PanelMessageTypes.State;
    state: IPanelState;
}

/** 面板 → 擴充：不帶資料的那幾種 */
interface ISimpleMessage {
    type:
        | PanelMessageTypes.Ready
        | PanelMessageTypes.Add
        | PanelMessageTypes.Rename
        | PanelMessageTypes.Remove
        | PanelMessageTypes.OpenSample;
}

/** 面板 → 擴充：目前那一組的新值 */
interface IUpdateMessage {
    type: PanelMessageTypes.Update;
    preset: IDiffStylePreset;
}

/** 面板 → 擴充：切換到哪一組 */
interface ISelectMessage {
    type: PanelMessageTypes.Select;
    name: string;
}

/** 面板 → 擴充：介面語言換成哪一個 */
interface ISetLanguageMessage {
    type: PanelMessageTypes.SetLanguage;
    language: LanguageSettings;
}

/** 面板 → 擴充的所有訊息 */
type PanelToHostMessage = ISimpleMessage | IUpdateMessage | ISelectMessage | ISetLanguageMessage;

/** 不帶資料的那幾種 */
const SIMPLE_MESSAGE_TYPES: readonly ISimpleMessage['type'][] = [
    PanelMessageTypes.Ready,
    PanelMessageTypes.Add,
    PanelMessageTypes.Rename,
    PanelMessageTypes.Remove,
    PanelMessageTypes.OpenSample,
];

/**
 * 把面板送來的值收斂成訊息；認不得的回 undefined。
 *
 * `Update` 帶的參數組也經過正規化：面板的值來自使用者輸入，不保證完整。
 * @param value 面板送來的值
 * @param fallback `Update` 的參數組缺欄位時補的值（目前那一組）
 * @returns 收斂後的訊息
 */
const ParsePanelMessage = (value: unknown, fallback: IDiffStylePreset): PanelToHostMessage | undefined => {
    if (!IsRecord(value)) {
        return undefined;
    }
    const type = SIMPLE_MESSAGE_TYPES.find((simpleType) => simpleType === value.type);
    if (type !== undefined) {
        return { type };
    }
    switch (value.type) {
        case PanelMessageTypes.Update: {
            const preset = NormalizePreset(value.preset, fallback);
            return preset === undefined ? undefined : { type: PanelMessageTypes.Update, preset };
        }
        case PanelMessageTypes.Select:
            return typeof value.name === 'string' ? { type: PanelMessageTypes.Select, name: value.name } : undefined;
        case PanelMessageTypes.SetLanguage: {
            const language = Object.values(LanguageSettings).find((setting) => setting === value.language);
            return language === undefined ? undefined : { type: PanelMessageTypes.SetLanguage, language };
        }
        default:
            return undefined;
    }
};

/**
 * 取出翻譯表：每一個值都要是字串，否則當成沒有（面板用英文）。
 * @param value 擴充送來的翻譯表
 * @returns 翻譯表；沒有或格式不對時為 undefined
 */
const PickL10nBundle = (value: unknown): Record<string, string> | undefined => {
    if (!IsRecord(value)) {
        return undefined;
    }
    const entries = Object.entries(value);
    return entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')
        ? Object.fromEntries(entries)
        : undefined;
};

/**
 * 把擴充送來的值收斂成狀態訊息；認不得的回 undefined。
 * @param value 擴充送來的值
 * @returns 狀態訊息
 */
const ParseStateMessage = (value: unknown): IStateMessage | undefined => {
    if (!IsRecord(value) || value.type !== PanelMessageTypes.State || !IsRecord(value.state)) {
        return undefined;
    }
    const { presets, activeName, themeName, layer, overriddenKeys, language, displayLanguage, l10nBundle } =
        value.state;
    const bundle = PickL10nBundle(l10nBundle);
    const knownLayer = Object.values(SettingLayers).find((item) => item === layer);
    if (
        !Array.isArray(presets) ||
        typeof activeName !== 'string' ||
        typeof themeName !== 'string' ||
        knownLayer === undefined ||
        !Array.isArray(overriddenKeys) ||
        typeof displayLanguage !== 'string'
    ) {
        return undefined;
    }
    return {
        type: PanelMessageTypes.State,
        state: {
            presets: NormalizePresets(presets),
            activeName,
            themeName,
            layer: knownLayer,
            overriddenKeys: overriddenKeys.filter((key): key is string => typeof key === 'string'),
            language: ParseLanguageSetting(language),
            displayLanguage,
            ...(bundle === undefined ? {} : { l10nBundle: bundle }),
        },
    };
};

export { PanelMessageTypes, ParsePanelMessage, ParseStateMessage };
export type { IPanelState, IStateMessage, PanelToHostMessage };
