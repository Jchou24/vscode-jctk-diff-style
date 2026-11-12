/**
 * 參數組的底色與行號色 → `workbench.colorCustomizations` 的新值。
 *
 * 這個設定是整個物件一起寫的，裡面還有別人的鍵（ex 使用者自己設的分頁顏色）
 * ⇒ 只動本擴充管的那幾個鍵，其餘原樣留著。
 * 寫在 `[主題名]` 那一格：參數組是照某個主題的底色調的，換主題時跟著搬到新主題那一格。
 */
import type { IDiffColors, IDiffStylePreset, ILineNumberColors } from './presetModel';
import { DIFF_COLOR_FIELDS, IsRecord } from './presetModel';

/** 參數組的底色欄位 → VS Code 的色碼名稱 */
const DIFF_COLOR_KEYS: Readonly<Record<keyof IDiffColors, string>> = {
    insertedLine: 'diffEditor.insertedLineBackground',
    insertedText: 'diffEditor.insertedTextBackground',
    insertedGutter: 'diffEditorGutter.insertedLineBackground',
    removedLine: 'diffEditor.removedLineBackground',
    removedText: 'diffEditor.removedTextBackground',
    removedGutter: 'diffEditorGutter.removedLineBackground',
};

/** 參數組的行號色欄位 → VS Code 的色碼名稱 */
const LINE_NUMBER_KEYS: Readonly<Record<keyof ILineNumberColors, string>> = {
    color: 'editorLineNumber.foreground',
    activeColor: 'editorLineNumber.activeForeground',
};

/** 本擴充在 `workbench.colorCustomizations` 管的鍵 */
const MANAGED_COLOR_KEYS: readonly string[] = [...Object.values(DIFF_COLOR_KEYS), ...Object.values(LINE_NUMBER_KEYS)];

/**
 * 主題那一格的鍵名。
 * @param themeName `workbench.colorTheme` 的值
 * @returns `[主題名]`
 */
const GetThemeScopeKey = (themeName: string): string => `[${themeName}]`;

/**
 * 是不是 `[主題名]` 這種限定主題的格子。
 * @param key 設定物件的鍵
 * @returns 是主題格子時為 true
 */
const IsThemeScopeKey = (key: string): boolean => key.startsWith('[') && key.endsWith(']');

/**
 * 拿掉受管的鍵。
 * @param scope 一格主題的設定
 * @param managedKeys 受管的鍵
 * @returns 新物件
 */
const WithoutManagedKeys = (scope: Record<string, unknown>, managedKeys: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(scope).filter(([key]) => !managedKeys.includes(key)));

/**
 * 寫入受管的鍵：只寫在目前主題那一格；其他主題格子裡的受管鍵清掉（換主題時就不會留在舊主題）。
 *
 * - 不在任何主題格子裡的鍵（全主題通用的那些）一律不動
 * - 清完變成空的格子整格拿掉
 * @param current 使用者設定裡目前的值（可能是 undefined 或被手改壞）
 * @param themeName 目前的主題
 * @param values 要寫的值；值為 undefined 的鍵代表「拿掉」
 * @param managedKeys 受管的鍵
 * @returns 新的設定值
 */
const ApplyManagedKeys = (
    current: unknown,
    themeName: string,
    values: Readonly<Record<string, string | undefined>>,
    managedKeys: readonly string[],
): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(IsRecord(current) ? current : {})) {
        if (!IsThemeScopeKey(key) || !IsRecord(value)) {
            result[key] = value;
            continue;
        }
        const kept = WithoutManagedKeys(value, managedKeys);
        if (Object.keys(kept).length > 0) {
            result[key] = kept;
        }
    }
    const scopeKey = GetThemeScopeKey(themeName);
    const definedValues = Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const scope = { ...(IsRecord(result[scopeKey]) ? result[scopeKey] : {}), ...definedValues };
    if (Object.keys(scope).length > 0) {
        result[scopeKey] = scope;
    } else {
        delete result[scopeKey];
    }
    return result;
};

/**
 * 參數組的底色與行號色 → `workbench.colorCustomizations` 的新值。
 *
 * 參數組的行號色是「不換」時，受管的行號鍵拿掉 ⇒ 回到主題原本的行號色。
 * @param current 使用者設定裡目前的值
 * @param themeName 目前的主題
 * @param preset 要套用的參數組；undefined 時拿掉所有受管的鍵
 * @returns 新的設定值
 */
const BuildColorCustomizations = (
    current: unknown,
    themeName: string,
    preset: IDiffStylePreset | undefined,
): Record<string, unknown> => {
    const values: Record<string, string> = {};
    if (preset !== undefined) {
        for (const field of DIFF_COLOR_FIELDS) {
            values[DIFF_COLOR_KEYS[field]] = preset.colors[field];
        }
        if (preset.lineNumbers !== undefined) {
            values[LINE_NUMBER_KEYS.color] = preset.lineNumbers.color;
            values[LINE_NUMBER_KEYS.activeColor] = preset.lineNumbers.activeColor;
        }
    }
    return ApplyManagedKeys(current, themeName, values, MANAGED_COLOR_KEYS);
};

/**
 * 工作區設定裡，蓋得掉使用者設定的受管鍵。
 *
 * 設定值是物件時，VS Code 把使用者與工作區的值合併、同一個鍵由工作區勝出
 * ⇒ 工作區 `[主題名]` 那一格只要有受管的鍵，使用者設定那邊怎麼調都看不到效果。
 * 不在主題格子裡的鍵不算：限定主題的值本來就蓋過通用的值。
 * @param workspaceValue 工作區（或工作區資料夾）設定的值
 * @param themeName 目前的主題
 * @param managedKeys 受管的鍵
 * @returns 被蓋掉的鍵
 */
const FindOverriddenKeys = (workspaceValue: unknown, themeName: string, managedKeys: readonly string[]): string[] => {
    if (!IsRecord(workspaceValue)) {
        return [];
    }
    const scope = workspaceValue[GetThemeScopeKey(themeName)];
    return IsRecord(scope) ? managedKeys.filter((key) => key in scope) : [];
};

/**
 * 兩個設定值是不是一樣（決定要不要寫回設定檔）。
 * @param left 一邊
 * @param right 另一邊
 * @returns JSON 相同時為 true
 */
const IsSameSetting = (left: unknown, right: unknown): boolean =>
    JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});

export {
    BuildColorCustomizations,
    DIFF_COLOR_KEYS,
    FindOverriddenKeys,
    GetThemeScopeKey,
    IsSameSetting,
    LINE_NUMBER_KEYS,
    MANAGED_COLOR_KEYS,
};
