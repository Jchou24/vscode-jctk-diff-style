/**
 * 設定面板的畫面（跑在 webview 裡，打包成 `dist/panel.js`）。
 *
 * - 收到擴充送來的狀態就整個重畫（只在換組、改名、增刪、主題變了時才會收到）
 * - 每個控制項一動就把目前那一組整份送回擴充：擴充當場重畫框線、稍後寫回設定
 * - 拖動中不重畫：擴充收到 `Update` 不回送狀態，面板手上的那一份就是最新的
 * - 給人看的字照介面語言：擴充把那個語言的翻譯表跟著狀態送來，每次畫之前交給 `@vscode/l10n`
 */
import * as l10n from '@vscode/l10n';

import { JoinHexColor, SplitHexColor } from '../colorHex';
import { LanguageSettings } from '../languageSettings';
import { type IPanelState, PanelMessageTypes, ParseStateMessage } from '../panelMessages';
import {
    BORDER_RADIUS_RANGE,
    BORDER_WIDTH_RANGE,
    BorderStyles,
    ClonePreset,
    DIFF_COLOR_FIELDS,
    GetReadableLineNumbers,
    type IDiffColors,
    type IDiffStylePreset,
    READABLE_COMMENT_COLOR,
} from '../presetModel';
import { SettingLayers } from '../settingLayers';

/** webview 提供的 API（VS Code 注入的全域函式） */
interface IWebviewApi {
    postMessage: (message: unknown) => void;
}

declare const acquireVsCodeApi: () => IWebviewApi;

/**
 * 底色欄位在面板上的名字。
 * @param field 底色欄位
 * @returns 名字（照介面語言）
 */
const DiffColorLabel = (field: keyof IDiffColors): string => {
    switch (field) {
        case 'insertedLine':
            return l10n.t('Added: whole line');
        case 'insertedText':
            return l10n.t('Added: characters');
        case 'insertedGutter':
            return l10n.t('Added: line number gutter');
        case 'removedLine':
            return l10n.t('Removed: whole line');
        case 'removedText':
            return l10n.t('Removed: characters');
        case 'removedGutter':
            return l10n.t('Removed: line number gutter');
    }
};

/**
 * 面板最下面那一行：參數組與顏色寫在哪裡。
 * @param state 擴充送來的狀態
 * @returns 那一行的字
 */
const DescribeLayer = (state: IPanelState): string =>
    state.layer === SettingLayers.Workspace
        ? l10n.t(
              'Presets, background colors and line number colors are written to workspace settings (.vscode/settings.json) under [{0}]: they follow version control and apply to this project only',
              state.themeName,
          )
        : l10n.t(
              'Presets, background colors and line number colors are written to user settings under [{0}]: every project without presets in its workspace settings uses them',
              state.themeName,
          );

/**
 * 框線樣式在面板上的名字。
 * @param style 框線樣式
 * @returns 名字（照介面語言）
 */
const BorderStyleLabel = (style: BorderStyles): string => {
    switch (style) {
        case BorderStyles.Solid:
            return l10n.t('Solid');
        case BorderStyles.Dashed:
            return l10n.t('Dashed');
        case BorderStyles.Dotted:
            return l10n.t('Dotted');
    }
};

/**
 * 介面語言在下拉裡的名字：各語言寫成那個語言自己的字，介面是哪個語言都認得出來。
 * @param setting 設定值
 * @returns 名字
 */
const LanguageLabel = (setting: LanguageSettings): string => {
    switch (setting) {
        case LanguageSettings.Auto:
            return l10n.t('Follow VS Code');
        case LanguageSettings.English:
            return 'English';
        case LanguageSettings.TraditionalChinese:
            return '繁體中文';
    }
};

/** 面板的樣式：用 VS Code 主題的 CSS 變數，跟著明暗主題走 */
const PANEL_STYLE = `
body { padding: 8px 16px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
h2 { font-size: 1.1em; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-panel-border); }
.toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.row { display: grid; grid-template-columns: 9em 3em 4.5em 1fr; gap: 4px 8px; align-items: center; margin: 6px 0 12px; }
.row.simple { grid-template-columns: 9em 1fr; margin: 6px 0; }
.row > .slider-line { grid-column: 2 / -1; }
.check-line { margin: 6px 0; }
.check-line > label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.hint { color: var(--vscode-descriptionForeground); margin: 2px 0 6px; }
.warning { border: 1px solid var(--vscode-inputValidation-warningBorder); background: var(--vscode-inputValidation-warningBackground); padding: 6px 10px; margin: 8px 0; }
select, input[type=number] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 2px 4px; }
input[type=color] { width: 3em; height: 1.8em; padding: 0; border: 1px solid var(--vscode-input-border, transparent); background: none; }
input[type=range] { width: 100%; }
button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 10px; cursor: pointer; }
button:hover { background: var(--vscode-button-secondaryHoverBackground); }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
code { font-family: var(--vscode-editor-font-family); }
.disabled { opacity: 0.5; pointer-events: none; }
`;

const vscodeApi = acquireVsCodeApi();

/** 目前那一組的工作副本：控制項改的是它，改完整份送回擴充 */
let working: IDiffStylePreset | undefined = undefined;

/**
 * 建立元素。
 * @param tag 標籤
 * @param className class
 * @param text 文字
 * @returns 元素
 */
const CreateElement = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = '',
    text = '',
): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
};

/** 把工作副本整份送回擴充 */
const SendUpdate = (): void => {
    if (working !== undefined) {
        vscodeApi.postMessage({ type: PanelMessageTypes.Update, preset: ClonePreset(working) });
    }
};

/**
 * 一列「取色器 ＋ 百分比 ＋ 色碼」，透明度滑桿在下一行（擠在同一行時面板一窄滑桿就只剩一點點）。
 * @param label 名字
 * @param value 目前的 `#rrggbbaa`
 * @param OnChange 值改了
 * @returns 那一列
 */
const CreateColorRow = (label: string, value: string, OnChange: (hex: string) => void): HTMLElement => {
    const parts = SplitHexColor(value);
    const row = CreateElement('div', 'row');
    const picker = CreateElement('input');
    picker.type = 'color';
    picker.value = parts.rgb;
    const slider = CreateElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(parts.alphaPercent);
    const percent = CreateElement('input');
    percent.type = 'number';
    percent.min = '0';
    percent.max = '100';
    percent.value = String(parts.alphaPercent);
    const code = CreateElement('code', '', value);
    const Emit = (alphaPercent: number): void => {
        const hex = JoinHexColor(picker.value, alphaPercent);
        slider.value = String(alphaPercent);
        percent.value = String(alphaPercent);
        code.textContent = hex;
        OnChange(hex);
    };
    picker.addEventListener('input', () => Emit(Number(slider.value)));
    slider.addEventListener('input', () => Emit(Number(slider.value)));
    percent.addEventListener('input', () => Emit(Number(percent.value)));
    slider.className = 'slider-line';
    row.append(CreateElement('span', '', label), picker, percent, code, slider);
    return row;
};

/**
 * 一列「名字 ＋ 目前的值」，滑桿在下一行。
 * @param label 名字
 * @param value 目前的值
 * @param range 範圍
 * @param OnChange 值改了
 * @returns 那一列
 */
const CreateNumberRow = (
    label: string,
    value: number,
    range: { readonly min: number; readonly max: number },
    OnChange: (next: number) => void,
): HTMLElement => {
    const row = CreateElement('div', 'row');
    const slider = CreateElement('input');
    slider.type = 'range';
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.value = String(value);
    const text = CreateElement('code', '', `${value}px`);
    slider.addEventListener('input', () => {
        text.textContent = `${slider.value}px`;
        OnChange(Number(slider.value));
    });
    slider.className = 'slider-line';
    row.append(CreateElement('span', '', label), CreateElement('span'), text, CreateElement('span'), slider);
    return row;
};

/**
 * 一列「勾選框 ＋ 名字」。
 *
 * 點得到的只有勾選框與名字：整列都包在 `<label>` 裡時，點到那一列右邊的空白也會切換勾選。
 * @param label 名字
 * @param isChecked 目前是否勾著
 * @param OnChange 勾選改了
 * @returns 那一列
 */
const CreateCheckRow = (label: string, isChecked: boolean, OnChange: (isNextChecked: boolean) => void): HTMLElement => {
    const row = CreateElement('div', 'check-line');
    const checkbox = CreateElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', () => OnChange(checkbox.checked));
    const clickable = CreateElement('label');
    clickable.append(checkbox, CreateElement('span', '', label));
    row.append(clickable);
    return row;
};

/**
 * 參數組那一排：下拉切換、複製、改名、刪除、開範例。
 * @param state 擴充送來的狀態
 * @returns 那一排
 */
const RenderToolbar = (state: IPanelState): HTMLElement => {
    const toolbar = CreateElement('div', 'toolbar');
    const select = CreateElement('select');
    for (const preset of state.presets) {
        const option = CreateElement('option', '', preset.name);
        option.value = preset.name;
        option.selected = preset.name === working?.name;
        select.append(option);
    }
    select.addEventListener('change', () =>
        vscodeApi.postMessage({ type: PanelMessageTypes.Select, name: select.value }),
    );
    const CreateButton = (text: string, type: PanelMessageTypes, className = ''): HTMLButtonElement => {
        const button = CreateElement('button', className, text);
        button.addEventListener('click', () => vscodeApi.postMessage({ type }));
        return button;
    };
    toolbar.append(
        select,
        CreateButton(l10n.t('Copy as a new preset'), PanelMessageTypes.Add),
        CreateButton(l10n.t('Rename'), PanelMessageTypes.Rename),
        CreateButton(l10n.t('Delete'), PanelMessageTypes.Remove),
        CreateButton(l10n.t('Open sample diff'), PanelMessageTypes.OpenSample, 'primary'),
    );
    return toolbar;
};

/**
 * 介面語言那一列：只換這支擴充的，VS Code 的顯示語言不動。
 * @param state 擴充送來的狀態
 * @returns 那一列與說明
 */
const RenderLanguageRow = (state: IPanelState): HTMLElement[] => {
    const row = CreateElement('div', 'toolbar');
    const select = CreateElement('select');
    for (const setting of Object.values(LanguageSettings)) {
        const option = CreateElement('option', '', LanguageLabel(setting));
        option.value = setting;
        option.selected = setting === state.language;
        select.append(option);
    }
    select.addEventListener('change', () =>
        vscodeApi.postMessage({ type: PanelMessageTypes.SetLanguage, language: select.value }),
    );
    row.append(CreateElement('span', '', l10n.t('Language')), select);
    return [
        row,
        CreateElement(
            'p',
            'hint',
            l10n.t("Changes this extension only. Command Palette names follow VS Code's display language"),
        ),
    ];
};

/**
 * 框線那一節。
 * @param preset 工作副本
 * @returns 那一節的元素
 */
const RenderBorderSection = (preset: IDiffStylePreset): HTMLElement[] => {
    const border = preset.border;
    const body = CreateElement('div', border.isEnabled ? '' : 'disabled');
    const styleRow = CreateElement('div', 'row simple');
    const styleSelect = CreateElement('select');
    for (const style of Object.values(BorderStyles)) {
        const option = CreateElement('option', '', BorderStyleLabel(style));
        option.value = style;
        option.selected = style === border.style;
        styleSelect.append(option);
    }
    styleSelect.addEventListener('change', () => {
        border.style = Object.values(BorderStyles).find((style) => style === styleSelect.value) ?? BorderStyles.Solid;
        SendUpdate();
    });
    styleRow.append(CreateElement('span', '', l10n.t('Style')), styleSelect);
    body.append(
        CreateColorRow(l10n.t('Added side'), border.insertedColor, (hex) => {
            border.insertedColor = hex;
            SendUpdate();
        }),
        CreateColorRow(l10n.t('Removed side'), border.removedColor, (hex) => {
            border.removedColor = hex;
            SendUpdate();
        }),
        CreateNumberRow(l10n.t('Width'), border.width, BORDER_WIDTH_RANGE, (width) => {
            border.width = width;
            SendUpdate();
        }),
        styleRow,
        CreateNumberRow(l10n.t('Radius'), border.radius, BORDER_RADIUS_RANGE, (radius) => {
            border.radius = radius;
            SendUpdate();
        }),
        CreateCheckRow(l10n.t('Also box whole added / removed lines'), border.isWholeLineIncluded, (isChecked) => {
            border.isWholeLineIncluded = isChecked;
            SendUpdate();
        }),
        CreateCheckRow(
            l10n.t('Also box whitespace-only changes (indentation, trailing spaces)'),
            border.isWhitespaceIncluded,
            (isChecked) => {
                border.isWhitespaceIncluded = isChecked;
                SendUpdate();
            },
        ),
    );
    return [
        CreateElement('h2', '', l10n.t('Borders (changed characters)')),
        CreateElement(
            'p',
            'hint',
            l10n.t(
                "Boxes only the changed characters in partly changed lines. VS Code's built-in border color boxes the whole line, so the borders are drawn here",
            ),
        ),
        CreateCheckRow(l10n.t('Draw borders'), border.isEnabled, (isChecked) => {
            border.isEnabled = isChecked;
            body.className = isChecked ? '' : 'disabled';
            SendUpdate();
        }),
        body,
    ];
};

/**
 * 底色那一節。
 * @param preset 工作副本
 * @returns 那一節的元素
 */
const RenderColorSection = (preset: IDiffStylePreset): HTMLElement[] => [
    CreateElement('h2', '', l10n.t("Background colors (VS Code's built-in diff)")),
    CreateElement(
        'p',
        'hint',
        l10n.t(
            'In fully added or removed lines, the "whole line" and "characters" layers stack. Keep the opacity below 100, or selection and search highlights get covered',
        ),
    ),
    ...DIFF_COLOR_FIELDS.map((field) =>
        CreateColorRow(DiffColorLabel(field), preset.colors[field], (hex) => {
            preset.colors[field] = hex;
            SendUpdate();
        }),
    ),
];

/**
 * 註解色那一節。
 * @param preset 工作副本
 * @returns 那一節的元素
 */
const RenderCommentSection = (preset: IDiffStylePreset): HTMLElement[] => {
    const isThemeDefault = preset.commentColor === undefined;
    const row = CreateElement('div', isThemeDefault ? 'row disabled' : 'row');
    const picker = CreateElement('input');
    picker.type = 'color';
    picker.value = preset.commentColor ?? READABLE_COMMENT_COLOR;
    const code = CreateElement('code', '', picker.value);
    picker.addEventListener('input', () => {
        preset.commentColor = picker.value;
        code.textContent = picker.value;
        SendUpdate();
    });
    row.append(CreateElement('span', '', l10n.t('Comment color')), picker, CreateElement('span'), code);
    return [
        CreateElement('h2', '', l10n.t('Comment color (changed text in comments)')),
        CreateElement(
            'p',
            'hint',
            l10n.t(
                'Changes only the changed text inside comments in the diff view (the changed characters in partly changed lines, whole lines in added or removed blocks). Comments in normal editors keep their color. Comments are found by the language comment symbols, so a // inside a multi-line string may be treated as a comment',
            ),
        ),
        CreateCheckRow(l10n.t("Keep (use the theme's color)"), isThemeDefault, (isChecked) => {
            if (isChecked) {
                delete preset.commentColor;
            } else {
                preset.commentColor = picker.value;
            }
            row.className = isChecked ? 'row disabled' : 'row';
            SendUpdate();
        }),
        row,
    ];
};

/**
 * 行號色那一節。
 * @param preset 工作副本
 * @returns 那一節的元素
 */
const RenderLineNumberSection = (preset: IDiffStylePreset): HTMLElement[] => {
    const isThemeDefault = preset.lineNumbers === undefined;
    const lineNumbers = preset.lineNumbers ?? GetReadableLineNumbers();
    const body = CreateElement('div', isThemeDefault ? 'disabled' : '');
    body.append(
        CreateColorRow(l10n.t('Regular line numbers'), lineNumbers.color, (hex) => {
            lineNumbers.color = hex;
            SendUpdate();
        }),
        CreateColorRow(l10n.t('Line with the cursor'), lineNumbers.activeColor, (hex) => {
            lineNumbers.activeColor = hex;
            SendUpdate();
        }),
    );
    return [
        CreateElement('h2', '', l10n.t('Line number colors')),
        CreateElement(
            'p',
            'hint',
            l10n.t(
                'VS Code has no line number color for diffs only, so line numbers change in every editor. Make the cursor line brighter than the rest so it stands out',
            ),
        ),
        CreateCheckRow(l10n.t("Keep (use the theme's color)"), isThemeDefault, (isChecked) => {
            if (isChecked) {
                delete preset.lineNumbers;
            } else {
                preset.lineNumbers = lineNumbers;
            }
            body.className = isChecked ? 'disabled' : '';
            SendUpdate();
        }),
        body,
    ];
};

/**
 * 依擴充送來的狀態整個重畫。
 * @param state 擴充送來的狀態
 */
const Render = (state: IPanelState): void => {
    const active = state.presets.find((preset) => preset.name === state.activeName) ?? state.presets[0];
    working = active === undefined ? undefined : ClonePreset(active);
    const app = document.getElementById('app');
    if (app === null || working === undefined) {
        return;
    }
    const children: HTMLElement[] = [
        ...RenderLanguageRow(state),
        CreateElement('h2', '', l10n.t('Presets')),
        RenderToolbar(state),
    ];
    if (state.overriddenKeys.length > 0) {
        children.push(
            CreateElement(
                'div',
                'warning',
                l10n.t(
                    'Workspace settings (.vscode/settings.json) also set {1} under [{0}], which overrides the values here: changing these has no visible effect in this workspace',
                    state.themeName,
                    state.overriddenKeys.join(', '),
                ),
            ),
        );
    }
    children.push(
        ...RenderBorderSection(working),
        ...RenderColorSection(working),
        ...RenderCommentSection(working),
        ...RenderLineNumberSection(working),
        CreateElement('p', 'hint', DescribeLayer(state)),
    );
    app.replaceChildren(...children);
};

const style = document.createElement('style');
style.textContent = PANEL_STYLE;
document.head.append(style);

window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = ParseStateMessage(event.data);
    if (message === undefined) {
        return;
    }
    // 每次都換：介面語言可以在面板開著時換，英文時給空的翻譯表（回到原文）
    l10n.config({ contents: { ...message.state.l10nBundle } });
    document.documentElement.lang = message.state.displayLanguage;
    Render(message.state);
});

vscodeApi.postMessage({ type: PanelMessageTypes.Ready });
