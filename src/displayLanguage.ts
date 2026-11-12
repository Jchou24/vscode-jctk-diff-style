/**
 * 介面用哪一個語言：照 `jctkDiffStyle.language` 決定，換掉 `l10n.t` 用的翻譯表。
 *
 * 不用 `vscode.l10n`：它只會跟著 VS Code 的顯示語言，擴充沒辦法自己換。
 * 改用 `@vscode/l10n`（VS Code 官方給 webview 與子行程用的同一套）：翻譯表可以隨時換掉。
 * 翻譯表打包進擴充裡：換語言時不必讀檔，測試也拿得到同一份。
 *
 * `package.json` 給人看的欄位（命令選擇區裡的命令名、設定說明）由 VS Code 照它自己的顯示語言讀 `package.nls*.json`，
 * 不受這裡影響。
 */
import * as l10n from '@vscode/l10n';

import zhTwBundle from '../l10n/bundle.l10n.zh-tw.json';
import { LanguageSettings } from './languageSettings';

/** 原文的語言：不需要翻譯表 */
const SOURCE_LANGUAGE = LanguageSettings.English;

/** 有翻譯的語言 → 翻譯表（鍵是英文原文） */
const BUNDLES: Readonly<Partial<Record<string, Readonly<Record<string, string>>>>> = {
    [LanguageSettings.TraditionalChinese]: zhTwBundle,
};

/** 介面實際用的語言 */
interface IDisplayLanguage {
    /** 語言代碼（`en`、`zh-tw`） */
    language: string;
    /** 翻譯表；英文時沒有 */
    bundle?: Readonly<Record<string, string>>;
}

/**
 * 決定介面用哪一個語言。
 * @param setting `jctkDiffStyle.language`
 * @param vscodeLanguage VS Code 的顯示語言（`vscode.env.language`）
 * @returns 實際用的語言；那個語言沒有翻譯時用英文
 */
const ResolveDisplayLanguage = (setting: LanguageSettings, vscodeLanguage: string): IDisplayLanguage => {
    const wanted = setting === LanguageSettings.Auto ? vscodeLanguage.toLowerCase() : setting;
    const bundle = BUNDLES[wanted];
    return bundle === undefined ? { language: SOURCE_LANGUAGE } : { language: wanted, bundle };
};

/**
 * 換掉 `l10n.t` 用的翻譯表：之後取的字都是這個語言。
 * @param display 實際用的語言
 */
const ApplyDisplayLanguage = (display: IDisplayLanguage): void => {
    l10n.config({ contents: { ...display.bundle } });
};

/**
 * 有翻譯的語言（測試對照 `l10n/` 裡的翻譯檔用）。
 * @returns 語言代碼
 */
const GetTranslatedLanguages = (): string[] => Object.keys(BUNDLES);

export { ApplyDisplayLanguage, GetTranslatedLanguages, ResolveDisplayLanguage };
export type { IDisplayLanguage };
