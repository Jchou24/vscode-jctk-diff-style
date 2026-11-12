/**
 * 範例 diff 兩側的內容：調參數時一次看得到所有狀況。
 * 每一個案例在範例裡長怎樣、框到哪幾個字，由 `tests/sampleLines.test.ts` 釘住（每一種介面語言各一份）。
 *
 * - 改了一部分的行（框線、改動的字的底色）
 * - 註解行裡只改了幾個字（框線與底色落在灰色的註解上；繁中版是中文與 `<…>` 混在一起）
 * - 整段新增、整段刪除（兩層底色疊在一起、裡面有灰色的註解）
 * - 外面包了一層、裡面整段多一層縮排（只改了空白的行）
 * - 沒改的行（對照用）
 *
 * 註解的字跟著介面語言（`l10n.t`）；程式碼的字兩種語言都一樣。
 */
import * as l10n from '@vscode/l10n';

/** 範例 diff 兩側的每一行 */
interface ISampleLines {
    /** 原本那一側 */
    original: readonly string[];
    /** 修改後那一側 */
    modified: readonly string[];
}

/** 函式內的縮排 */
const INDENT = '    ';

/**
 * 一行註解。
 * @param text 註解的字
 * @param indent 縮排
 * @returns 那一行
 */
const LineComment = (text: string, indent = ''): string => `${indent}// ${text}`;

/**
 * 一行 JSDoc。
 * @param text 註解的字
 * @returns 那一行
 */
const DocComment = (text: string): string => `/** ${text} */`;

/**
 * 範例 diff 兩側的內容（照目前的介面語言）。
 * @returns 兩側的每一行
 */
const GetSampleLines = (): ISampleLines => {
    const lineEnding = DocComment(l10n.t('Always save with LF: VS Code does not read .editorconfig natively'));
    const workspaceOnly = LineComment(l10n.t('Only works when the project root is opened as the workspace'));
    const buttonLabel = LineComment(l10n.t('Button text is copied from the screen'), INDENT);
    return {
        original: [
            "import { OverflowButton } from './components';",
            '',
            lineEnding,
            'const LINE_ENDING = "\\n";',
            '',
            LineComment(l10n.t('For the docs extension: F5 opens a VS Code window that loads it')),
            LineComment(l10n.t('⚠️ Run `pnpm --filter docs-helper build` first (VS Code loads the bundled JS)')),
            workspaceOnly,
            '',
            LineComment(l10n.t('These two lines are removed as a block: the old setting')),
            'const LEGACY_TIMEOUT = 3000;',
            '',
            'const CreateButton = (label: string) => {',
            buttonLabel,
            '    return new OverflowButton({ label, isDense: false });',
            '};',
            '',
            'const LoadAsync = async () => {',
            '    const data = await FetchAsync();',
            '    Render(data);',
            '};',
            '',
            'export { CreateButton, LINE_ENDING };',
        ],
        modified: [
            "import { AppOverflowButton } from './components';",
            '',
            lineEnding,
            'const LINE_ENDING = "\\n";',
            '',
            LineComment(l10n.t('For every VS Code extension under it: F5 opens a VS Code window that loads it')),
            LineComment(l10n.t('⚠️ Run `pnpm --filter <extension-name> build` first (VS Code loads the bundled JS)')),
            workspaceOnly,
            '',
            'const CreateButton = (label: string) => {',
            buttonLabel,
            '    return new AppOverflowButton({ label, isDense: true });',
            '};',
            '',
            'const LoadAsync = async () => {',
            '    try {',
            '        const data = await FetchAsync();',
            '        Render(data);',
            '    } finally {',
            '        HideLoading();',
            '    }',
            '};',
            '',
            LineComment(l10n.t('Added block: two background layers overlap, and gray comments must stay readable')),
            LineComment(l10n.t('Merged with colorCustomizations in user settings, not replacing it')),
            'const CreateMenu = (items: string[]) => items.map((item) => CreateButton(item));',
            '',
            'export { CreateButton, CreateMenu, LINE_ENDING };',
        ],
    };
};

export { GetSampleLines };
export type { ISampleLines };
