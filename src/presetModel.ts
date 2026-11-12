/**
 * 參數組：型別、內建的預設組、從設定讀回來時的正規化。
 *
 * 參數組存在 VS Code 設定（`jctkDiffStyle.presets`），人可以手改 ⇒ 讀回來的值一律當成不可信，
 * 經 {@link NormalizePresets} 收斂成完整的形狀：缺的、型別不對的欄位補預設，不擲例外。
 */
import { IsHexColor } from './colorHex';

/** 框線樣式——值直接當 CSS 的 `border-style` */
enum BorderStyles {
    Solid = 'solid',
    Dashed = 'dashed',
    Dotted = 'dotted',
}

/** VS Code 內建 diff 的底色（寫進 `workbench.colorCustomizations`） */
interface IDiffColors {
    /** 新增的整行 */
    insertedLine: string;
    /** 新增的字（整段新增時會與整行那一層疊在一起） */
    insertedText: string;
    /** 新增那幾行的行號欄 */
    insertedGutter: string;
    /** 刪除的整行 */
    removedLine: string;
    /** 刪除的字 */
    removedText: string;
    /** 刪除那幾行的行號欄 */
    removedGutter: string;
}

/**
 * 底色欄位的清單：要逐一走過六個底色時用它（面板的列、寫回設定的鍵）。
 * 與 {@link IDiffColors} 一致由 `tests/presetModel.test.ts` 比對。
 */
const DIFF_COLOR_FIELDS = [
    'insertedLine',
    'insertedText',
    'insertedGutter',
    'removedLine',
    'removedText',
    'removedGutter',
] as const satisfies readonly (keyof IDiffColors)[];

/** 擴充自己畫的框線 */
interface IBorderOptions {
    isEnabled: boolean;
    /** 新增那一側的框線色 */
    insertedColor: string;
    /** 刪除那一側的框線色 */
    removedColor: string;
    /** 粗細（px） */
    width: number;
    style: BorderStyles;
    /** 圓角（px） */
    radius: number;
    /** 整段新增 / 刪除的行也框；關掉時只框「改了一部分的行」裡改動的字 */
    isWholeLineIncluded: boolean;
    /** 只改了空白的也框（加減縮排、行尾空白）；關掉時改動的字全是空白的那一段不框 */
    isWhitespaceIncluded: boolean;
}

/**
 * 行號色（寫進 `workbench.colorCustomizations`）。
 * VS Code 沒有 diff 專用的行號色、decoration 也改不了行號 ⇒ 所有編輯器的行號一起變。
 */
interface ILineNumberColors {
    /** 一般的行號 */
    color: string;
    /** 游標所在那一行的行號 */
    activeColor: string;
}

/** 一組參數 */
interface IDiffStylePreset {
    /** 參數組的名字，同一份清單裡唯一 */
    name: string;
    colors: IDiffColors;
    border: IBorderOptions;
    /**
     * diff 裡、註解中改動的字的顏色（`#rrggbb`）；undefined 時不換（用主題原本的）。
     * 只換 diff 畫面，平常寫 code 時的註解不受影響。
     */
    commentColor?: string;
    /** 行號色；undefined 時不換（用主題原本的） */
    lineNumbers?: ILineNumberColors;
}

/** 框線粗細的範圍（px） */
const BORDER_WIDTH_RANGE = { min: 1, max: 4 } as const;

/** 圓角的範圍（px） */
const BORDER_RADIUS_RANGE = { min: 0, max: 8 } as const;

/**
 * 亮色那一組的框線：淡色、半透明、小圓角——框住改動的字，又不搶過字本身。
 * 也是讀回來的參數組缺框線欄位時補的值。
 * @returns 每次一份新的物件
 */
const GetBrightBorder = (): IBorderOptions => ({
    isEnabled: true,
    insertedColor: '#d7f9dca3',
    removedColor: '#fecfcda3',
    width: 1,
    style: BorderStyles.Solid,
    radius: 2,
    isWholeLineIncluded: false,
    isWhitespaceIncluded: false,
});

/**
 * 暗色那一組的框線：改動的字底色暗，框線要用飽和的紅綠才看得出來。
 * @returns 每次一份新的物件
 */
const GetDarkBorder = (): IBorderOptions => ({
    isEnabled: true,
    insertedColor: '#3fb950',
    removedColor: '#f85149',
    width: 1,
    style: BorderStyles.Solid,
    radius: 0,
    isWholeLineIncluded: false,
    isWhitespaceIncluded: false,
});

/**
 * 亮色那一組的底色：整行不上底色，只有改動的字與行號欄上色——改了幾個字的那一行最清楚，
 * 整段新增 / 刪除也只有一層底色。
 * 也是讀回來的參數組缺底色欄位時補的值。
 * @returns 每次一份新的物件
 */
const GetBrightColors = (): IDiffColors => ({
    insertedLine: '#123b1900',
    insertedText: '#4cc05f42',
    insertedGutter: '#2a983e5c',
    removedLine: '#f8514900',
    removedText: '#f8514966',
    removedGutter: '#a13b36d9',
});

/**
 * 暗色那一組的底色：改動的字暗——整段新增 / 刪除裡的註解最好讀；改動的字要靠框線才看得出來。
 * @returns 每次一份新的物件
 */
const GetDarkColors = (): IDiffColors => ({
    insertedLine: '#2ea04326',
    insertedText: '#0e4429a6',
    insertedGutter: '#2ea04326',
    removedLine: '#f8514926',
    removedText: '#67060ca6',
    removedGutter: '#f8514926',
});

/** 內建兩組的名字：照 VS Code 的顯示語言由擴充端給；沒給時用英文 */
interface IDefaultPresetNames {
    bright: string;
    dark: string;
}

/**
 * 內建兩組的英文名字。
 * @returns 每次一份新的物件
 */
const GetDefaultPresetNames = (): IDefaultPresetNames => ({ bright: 'Bright', dark: 'Dark' });

/**
 * 內建的第一組（亮色）：也是讀回來的參數組缺欄位時補的值、清單意外是空的時的最後一道。
 * @param names 內建兩組的名字
 * @returns 每次一份新的物件
 */
const GetFallbackPreset = (names: IDefaultPresetNames = GetDefaultPresetNames()): IDiffStylePreset => ({
    name: names.bright,
    colors: GetBrightColors(),
    border: GetBrightBorder(),
});

/**
 * 在 diff 底色上讀得到的註解色：One Monokai 的註解色 `#676f7d` 在亮色那一組整段新增的字的底色上對比只剩 1.71，這個色有 3.15。
 * （對比以 One Monokai 的編輯器底色 `#282c34` 疊上 diff 底色後計算，WCAG 公式）
 * 亮色那一組的預設、面板上從「不換」切成「換」時的起始色都用它。
 */
const READABLE_COMMENT_COLOR = '#959cab';

/**
 * 在 diff 的紅 / 綠行號欄上讀得到的行號色：One Monokai 的行號色 `#495162` 在亮色那一組的行號欄上對比只剩 1.06〜1.11。
 * 一般行號用 VS Code「目前那一行」的預設色 `#c6c6c6`（紅色行號欄上 4.39、綠色 5.15），目前那一行改白色才分得出來。
 * （對比的算法同 {@link READABLE_COMMENT_COLOR}）
 * 亮色那一組的預設、面板上從「不換」切成「換」時的起始色都用它。
 * @returns 每次一份新的物件
 */
const GetReadableLineNumbers = (): ILineNumberColors => ({ color: '#c6c6c6', activeColor: '#ffffff' });

/**
 * 內建的兩組：參數組清單是空的（第一次裝）時用它們。
 * @param names 內建兩組的名字
 * @returns 每次一份新的陣列與物件
 */
const GetDefaultPresets = (names: IDefaultPresetNames = GetDefaultPresetNames()): IDiffStylePreset[] => [
    { ...GetFallbackPreset(names), commentColor: READABLE_COMMENT_COLOR, lineNumbers: GetReadableLineNumbers() },
    { name: names.dark, colors: GetDarkColors(), border: GetDarkBorder() },
];

/**
 * 是不是一般物件（不是 null、不是陣列）。
 * @param value 任意值
 * @returns 一般物件時為 true
 */
const IsRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 取出顏色欄位；不是合法的顏色就用預設。
 * @param value 讀回來的值
 * @param fallback 預設
 * @returns 合法的顏色
 */
const PickColor = (value: unknown, fallback: string): string => (IsHexColor(value) ? value.toLowerCase() : fallback);

/**
 * 取出數字欄位並夾在範圍內；不是數字就用預設。
 * @param value 讀回來的值
 * @param range 允許的範圍
 * @param fallback 預設
 * @returns 範圍內的整數
 */
const PickNumber = (value: unknown, range: { readonly min: number; readonly max: number }, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(range.max, Math.max(range.min, Math.round(value)))
        : fallback;

/**
 * 取出框線樣式；不認得的值用預設。
 * @param value 讀回來的值
 * @param fallback 預設
 * @returns 框線樣式
 */
const PickBorderStyle = (value: unknown, fallback: BorderStyles): BorderStyles =>
    Object.values(BorderStyles).find((style) => style === value) ?? fallback;

/**
 * 取出行號色；不是物件就是「不換」，個別欄位不合法時用 {@link GetReadableLineNumbers} 補。
 * @param value 讀回來的值
 * @returns 行號色；不換時為 undefined
 */
const PickLineNumbers = (value: unknown): ILineNumberColors | undefined => {
    if (!IsRecord(value)) {
        return undefined;
    }
    const fallback = GetReadableLineNumbers();
    return {
        color: PickColor(value.color, fallback.color),
        activeColor: PickColor(value.activeColor, fallback.activeColor),
    };
};

/**
 * 把一筆讀回來的參數組收斂成完整的形狀。
 * @param raw 讀回來的一筆
 * @param fallback 缺欄位時補的值
 * @returns 收斂後的參數組；沒有名字時為 undefined
 */
const NormalizePreset = (raw: unknown, fallback: IDiffStylePreset): IDiffStylePreset | undefined => {
    if (!IsRecord(raw) || typeof raw.name !== 'string' || raw.name.trim() === '') {
        return undefined;
    }
    const colors = IsRecord(raw.colors) ? raw.colors : {};
    const border = IsRecord(raw.border) ? raw.border : {};
    const fallbackColors = fallback.colors;
    const fallbackBorder = fallback.border;
    const lineNumbers = PickLineNumbers(raw.lineNumbers);
    return {
        name: raw.name.trim(),
        colors: {
            insertedLine: PickColor(colors.insertedLine, fallbackColors.insertedLine),
            insertedText: PickColor(colors.insertedText, fallbackColors.insertedText),
            insertedGutter: PickColor(colors.insertedGutter, fallbackColors.insertedGutter),
            removedLine: PickColor(colors.removedLine, fallbackColors.removedLine),
            removedText: PickColor(colors.removedText, fallbackColors.removedText),
            removedGutter: PickColor(colors.removedGutter, fallbackColors.removedGutter),
        },
        border: {
            isEnabled: typeof border.isEnabled === 'boolean' ? border.isEnabled : fallbackBorder.isEnabled,
            insertedColor: PickColor(border.insertedColor, fallbackBorder.insertedColor),
            removedColor: PickColor(border.removedColor, fallbackBorder.removedColor),
            width: PickNumber(border.width, BORDER_WIDTH_RANGE, fallbackBorder.width),
            style: PickBorderStyle(border.style, fallbackBorder.style),
            radius: PickNumber(border.radius, BORDER_RADIUS_RANGE, fallbackBorder.radius),
            isWholeLineIncluded:
                typeof border.isWholeLineIncluded === 'boolean'
                    ? border.isWholeLineIncluded
                    : fallbackBorder.isWholeLineIncluded,
            isWhitespaceIncluded:
                typeof border.isWhitespaceIncluded === 'boolean'
                    ? border.isWhitespaceIncluded
                    : fallbackBorder.isWhitespaceIncluded,
        },
        ...(IsHexColor(raw.commentColor) ? { commentColor: raw.commentColor.toLowerCase() } : {}),
        ...(lineNumbers === undefined ? {} : { lineNumbers }),
    };
};

/**
 * 把設定裡的參數組清單收斂成完整的形狀。
 *
 * - 不是陣列、或一筆合法的都沒有 ⇒ 內建的預設組
 * - 名字重複的只留第一筆：切換與改名都靠名字找
 * @param raw `jctkDiffStyle.presets` 的值
 * @param names 用到內建兩組時它們的名字
 * @returns 至少一筆的參數組清單
 */
const NormalizePresets = (raw: unknown, names: IDefaultPresetNames = GetDefaultPresetNames()): IDiffStylePreset[] => {
    if (!Array.isArray(raw)) {
        return GetDefaultPresets(names);
    }
    const fallback = GetFallbackPreset();
    const presets: IDiffStylePreset[] = [];
    for (const item of raw) {
        const preset = NormalizePreset(item, fallback);
        if (preset !== undefined && !presets.some((existing) => existing.name === preset.name)) {
            presets.push(preset);
        }
    }
    return presets.length > 0 ? presets : GetDefaultPresets(names);
};

/**
 * 依名字找出目前套用的那一組。
 * @param presets 參數組清單
 * @param activeName 設定裡記的名字
 * @returns 找得到就是那一組，找不到用第一組；清單是空的時用內建的第一組
 */
const ResolveActivePreset = (presets: readonly IDiffStylePreset[], activeName: string): IDiffStylePreset =>
    presets.find((preset) => preset.name === activeName) ?? presets[0] ?? GetFallbackPreset();

/**
 * 產生一個清單裡還沒有的名字：`亮色 複本`、`亮色 複本 2`…
 * @param baseName 想用的名字
 * @param presets 現有的清單
 * @returns 不重複的名字
 */
const CreateUniqueName = (baseName: string, presets: readonly IDiffStylePreset[]): string => {
    const names = new Set(presets.map((preset) => preset.name));
    if (!names.has(baseName)) {
        return baseName;
    }
    let suffix = 2;
    while (names.has(`${baseName} ${suffix}`)) {
        suffix += 1;
    }
    return `${baseName} ${suffix}`;
};

/**
 * 深拷貝一組參數（面板傳回來的物件、清單裡的物件都不共用參照）。
 * @param preset 參數組
 * @param name 新名字；省略時沿用
 * @returns 新的一組
 */
const ClonePreset = (preset: IDiffStylePreset, name: string = preset.name): IDiffStylePreset => ({
    name,
    colors: { ...preset.colors },
    border: { ...preset.border },
    ...(preset.commentColor === undefined ? {} : { commentColor: preset.commentColor }),
    ...(preset.lineNumbers === undefined ? {} : { lineNumbers: { ...preset.lineNumbers } }),
});

/**
 * 內建兩組換名字（介面語言換了、而參數組還沒寫進設定時）：值不動，只換名字。
 * @param state 參數組清單與目前那一組的名字
 * @param from 原本的名字
 * @param to 新的名字
 * @returns 換過名字的清單與目前那一組的名字
 */
const RenameBuiltInPresets = (
    state: { presets: IDiffStylePreset[]; activeName: string },
    from: IDefaultPresetNames,
    to: IDefaultPresetNames,
): { presets: IDiffStylePreset[]; activeName: string } => {
    const Rename = (name: string): string => {
        switch (name) {
            case from.bright:
                return to.bright;
            case from.dark:
                return to.dark;
            default:
                return name;
        }
    };
    return {
        presets: state.presets.map((preset) => ClonePreset(preset, Rename(preset.name))),
        activeName: Rename(state.activeName),
    };
};

export {
    BORDER_RADIUS_RANGE,
    BORDER_WIDTH_RANGE,
    BorderStyles,
    ClonePreset,
    CreateUniqueName,
    DIFF_COLOR_FIELDS,
    GetBrightBorder,
    GetDarkBorder,
    GetDefaultPresetNames,
    GetDefaultPresets,
    GetReadableLineNumbers,
    IsRecord,
    NormalizePreset,
    NormalizePresets,
    RenameBuiltInPresets,
    READABLE_COMMENT_COLOR,
    ResolveActivePreset,
};
export type { IBorderOptions, IDefaultPresetNames, IDiffColors, IDiffStylePreset, ILineNumberColors };
