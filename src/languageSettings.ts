/**
 * 介面語言的設定值（`jctkDiffStyle.language`）：擴充與面板兩邊都用這一份。
 *
 * 與 `package.json` 那一項設定的 `enum` 同值，由 `tests/l10nCoverage.test.ts` 對照。
 */

/** 介面語言的設定值 */
enum LanguageSettings {
    /** 跟著 VS Code 的顯示語言 */
    Auto = 'auto',
    English = 'en',
    TraditionalChinese = 'zh-tw',
}

/**
 * 把設定裡的值收斂成認得的設定值：設定是人可以手改的。
 * @param value 設定裡的值
 * @returns 認得的設定值；認不得時跟著 VS Code
 */
const ParseLanguageSetting = (value: unknown): LanguageSettings =>
    Object.values(LanguageSettings).find((setting) => setting === value) ?? LanguageSettings.Auto;

export { LanguageSettings, ParseLanguageSetting };
