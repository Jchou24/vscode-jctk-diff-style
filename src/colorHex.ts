/**
 * `#rrggbbaa` 與「顏色 ＋ 透明度百分比」之間的轉換。
 *
 * 面板上是一個取色器（只給得出 `#rrggbb`）配一條透明度滑桿；設定裡存的是 VS Code 認得的 `#rrggbbaa`。
 * 擴充與面板兩邊都用這一份，換算才不會各寫一套而對不上。
 */

/** 設定裡接受的顏色寫法：`#rrggbb` 或 `#rrggbbaa` */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

/** 一個色版的最大值（`ff`） */
const CHANNEL_MAX = 255;

/** 透明度百分比的上限 */
const PERCENT_MAX = 100;

/** `#rrggbb` 的長度——超過就是帶了透明度 */
const RGB_HEX_LENGTH = 7;

/** 拆開後的顏色 */
interface IColorParts {
    /** `#rrggbb`（小寫） */
    rgb: string;
    /** 0〜100 的整數 */
    alphaPercent: number;
}

/**
 * 是不是設定裡接受的顏色寫法。
 * @param value 任意值
 * @returns `#rrggbb` 或 `#rrggbbaa` 時為 true
 */
const IsHexColor = (value: unknown): value is string => typeof value === 'string' && HEX_COLOR_PATTERN.test(value);

/**
 * `#rrggbbaa` → 顏色 ＋ 透明度百分比。
 * @param hex `#rrggbb` 或 `#rrggbbaa`；沒帶透明度時當成不透明
 * @returns 拆開後的顏色
 */
const SplitHexColor = (hex: string): IColorParts => {
    const lower = hex.toLowerCase();
    const rgb = lower.slice(0, RGB_HEX_LENGTH);
    if (lower.length <= RGB_HEX_LENGTH) {
        return { rgb, alphaPercent: PERCENT_MAX };
    }
    const alpha = parseInt(lower.slice(RGB_HEX_LENGTH), 16);
    return { rgb, alphaPercent: Math.round((alpha / CHANNEL_MAX) * PERCENT_MAX) };
};

/**
 * 顏色 ＋ 透明度百分比 → `#rrggbbaa`。
 * @param rgb `#rrggbb`
 * @param alphaPercent 0〜100；超出範圍會夾回來
 * @returns `#rrggbbaa`（小寫）
 */
const JoinHexColor = (rgb: string, alphaPercent: number): string => {
    const clamped = Math.min(PERCENT_MAX, Math.max(0, alphaPercent));
    const alpha = Math.round((clamped / PERCENT_MAX) * CHANNEL_MAX);
    return `${rgb.slice(0, RGB_HEX_LENGTH).toLowerCase()}${alpha.toString(16).padStart(2, '0')}`;
};

export { IsHexColor, JoinHexColor, SplitHexColor };
export type { IColorParts };
