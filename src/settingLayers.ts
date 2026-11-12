/**
 * 參數組與它套用出來的顏色寫在哪一層設定。
 *
 * 讀照 VS Code 的分層：專案設定 → 使用者設定 → 內建預設（`getConfiguration().get` 已經合併好）。
 * 寫回參數組所在的那一層：
 * - 專案設定（`.vscode/settings.json`）有參數組 ⇒ 參數組與顏色都寫回那裡：跟著版控、只套用到這個專案的視窗
 * - 否則寫使用者設定：沒設參數組的專案共用這一份
 *
 * 顏色跟著參數組寫同一層：使用者設定是所有視窗共用的，
 * 兩個視窗各用不同層的參數組時，顏色若都寫進使用者設定，後寫的會蓋掉另一個視窗的。
 */

/** 寫入的那一層 */
enum SettingLayers {
    /** 使用者設定 */
    User = 'user',
    /** 專案設定（`.vscode/settings.json`） */
    Workspace = 'workspace',
}

/** `WorkspaceConfiguration.inspect` 回傳值裡用得到的那幾層 */
interface ILayeredValue {
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
}

/**
 * 參數組寫在哪一層：專案設定有參數組就是專案，否則是使用者。
 * @param inspected `jctkDiffStyle.presets` 的 inspect 結果
 * @returns 寫入的那一層
 */
const ResolvePresetLayer = (inspected: ILayeredValue | undefined): SettingLayers =>
    inspected?.workspaceValue === undefined ? SettingLayers.User : SettingLayers.Workspace;

/**
 * 某一層自己的值（不含別層合併進來的）。
 * @param inspected 那個設定的 inspect 結果
 * @param layer 哪一層
 * @returns 那一層的值
 */
const GetLayerValue = (inspected: ILayeredValue | undefined, layer: SettingLayers): unknown =>
    layer === SettingLayers.User ? inspected?.globalValue : inspected?.workspaceValue;

/**
 * 比某一層優先、會蓋掉它的那幾層的值。
 * @param inspected 那個設定的 inspect 結果
 * @param layer 寫入的那一層
 * @returns 優先的那幾層的值（沒設的是 undefined）
 */
const GetOverridingValues = (inspected: ILayeredValue | undefined, layer: SettingLayers): unknown[] =>
    layer === SettingLayers.User
        ? [inspected?.workspaceValue, inspected?.workspaceFolderValue]
        : [inspected?.workspaceFolderValue];

export { GetLayerValue, GetOverridingValues, ResolvePresetLayer, SettingLayers };
export type { ILayeredValue };
