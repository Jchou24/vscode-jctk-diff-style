// @vitest-environment node

/**
 * 冒煙測試：用正式的打包選項打包擴充，交給假的 `vscode` 載入，照使用者會走的順序走一遍。
 *
 * 單元測試驗純邏輯；這一支驗的是只有接上 VS Code 才看得到的那些：
 * 打包後能不能執行（`jsonc-parser` 的打包方式）、decoration 畫在哪、設定寫到哪一層、面板收到什麼。
 * 各條按順序跑、共用同一個擴充的狀態，一條接著上一條的結果往下走。
 * 環境固定是 Node：esbuild 在 jsdom 裡跑不起來（被別的測試設定以 jsdom 載入時也照樣跑）。
 */
import esbuild from 'esbuild';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GetExtensionBuildOptions } from '../build.mts';
import { type IPanelState, ParseStateMessage } from '../src/panelMessages';
import { type IDiffStylePreset, IsRecord, NormalizePresets } from '../src/presetModel';
import {
    CreateFakeVscode,
    FakeUri,
    type IFakeDecorationType,
    type IFakeEditor,
    type IFakeVscode,
} from './fakes/fakeVscode';

declare global {
    /** 打包好的擴充 `require('vscode')` 拿到的東西：由暫存資料夾裡的 `node_modules/vscode` 轉手 */
    var fakeVscodeModule: unknown;
}

/** 打包好的擴充對外的兩個函式 */
interface ILoadedExtension {
    activate: (context: unknown) => void;
    deactivate: () => Promise<void>;
}

/** 測試用的主題 */
const THEME = 'One Monokai';

/** 主題那一格的鍵 */
const THEME_SCOPE = `[${THEME}]`;

/** 使用者自己設的、不歸擴充管的顏色 */
const USER_OWN_COLOR = { 'tab.activeBorder': '#7d9dbe' };

/** 範例 diff 新增那一側框到的字（預設的參數組、VS Code 預設的比對設定；介面語言是英文） */
const SAMPLE_INSERTED_BOXES = ['App', 'every VS Code', ' under it', '<extension-name>', 'App', 'true', ' CreateMenu,'];

/** 同上，介面語言是繁中：只有註解的字不同 */
const SAMPLE_INSERTED_BOXES_ZH_TW = ['App', '底下每一支 VS Code', '<擴充名>', 'App', 'true', ' CreateMenu,'];

/** 等節流的工作跑完：比最慢的那一個（存參數組）的間隔長 */
const SETTLE_MS = 1000;

/**
 * 是不是打包好的擴充。
 * @param value `require` 回來的東西
 * @returns 有 activate 與 deactivate 時為 true
 */
const IsLoadedExtension = (value: unknown): value is ILoadedExtension =>
    IsRecord(value) && typeof value.activate === 'function' && typeof value.deactivate === 'function';

let fake: IFakeVscode;
let extension: ILoadedExtension;
let bundleDirectory = '';
const subscriptions: { dispose: () => void }[] = [];

/** 讓節流的工作跑完 */
const SettleAsync = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
};

/**
 * 某一層設定裡、目前主題那一格的顏色。
 * @param layer 使用者或專案
 * @returns 那一格；沒有時為 undefined
 */
const ReadThemeScope = (layer: 'user' | 'workspace'): Record<string, unknown> | undefined => {
    const colors = fake.settings[layer]['workbench.colorCustomizations'];
    const scope = IsRecord(colors) ? colors[THEME_SCOPE] : undefined;
    return IsRecord(scope) ? scope : undefined;
};

/**
 * 某一層設定裡的參數組（收斂過，方便讀欄位）。
 * @param layer 使用者或專案
 * @returns 參數組；那一層沒有時為空陣列
 */
const ReadPresets = (layer: 'user' | 'workspace'): IDiffStylePreset[] => {
    const raw = fake.settings[layer]['jctkDiffStyle.presets'];
    return Array.isArray(raw) ? NormalizePresets(raw) : [];
};

/**
 * 面板最後收到的狀態。
 * @returns 狀態；還沒送過時為 undefined
 */
const LastPanelState = (): IPanelState | undefined => {
    for (const message of [...fake.posted].reverse()) {
        const parsed = ParseStateMessage(message);
        if (parsed !== undefined) {
            return parsed.state;
        }
    }
    return undefined;
};

/**
 * 目前還在用的 decoration 樣式裡，第一個符合條件的。
 * @param Match 條件
 * @returns 樣式
 */
const FindActiveType = (Match: (type: IFakeDecorationType) => boolean): IFakeDecorationType | undefined =>
    fake.decorationTypes.find((type) => !type.isDisposed && Match(type));

/** 新增那一側的框線（內建亮色那一組的框線色） */
const InsertedBorderType = (): IFakeDecorationType | undefined =>
    FindActiveType((type) => type.options.border?.includes('#d7f9dca3') === true);

/**
 * 某個編輯器上某一種 decoration 畫到的字。
 * @param editor 編輯器
 * @param type decoration 樣式
 * @returns 每一段的字
 */
const SliceDecorated = (editor: IFakeEditor | undefined, type: IFakeDecorationType | undefined): string[] =>
    editor === undefined || type === undefined
        ? []
        : (editor.decorations.get(type) ?? []).map((range) =>
              editor.document.lineAt(range.startLine).text.slice(range.startCharacter, range.endCharacter),
          );

/**
 * 面板送來目前那一組的新值。
 * @param Change 由面板手上那一份算出新值
 */
const SendUpdateAsync = async (Change: (preset: IDiffStylePreset) => IDiffStylePreset): Promise<void> => {
    const state = LastPanelState();
    const current = state?.presets.find((preset) => preset.name === state.activeName);
    if (current === undefined) {
        throw new Error('面板還沒收到狀態，送不了 Update');
    }
    fake.ReceiveFromPanel({ type: 'update', preset: Change(current) });
    await SettleAsync();
};

beforeAll(async () => {
    bundleDirectory = mkdtempSync(join(tmpdir(), 'diff-style-smoke-'));
    await esbuild.build({
        ...GetExtensionBuildOptions(),
        outfile: join(bundleDirectory, 'extension.js'),
        logLevel: 'silent',
    });
    mkdirSync(join(bundleDirectory, 'node_modules', 'vscode'), { recursive: true });
    writeFileSync(
        join(bundleDirectory, 'node_modules', 'vscode', 'index.js'),
        'module.exports = globalThis.fakeVscodeModule;\n',
    );
    fake = CreateFakeVscode({
        'workbench.colorTheme': THEME,
        'workbench.colorCustomizations': { ...USER_OWN_COLOR },
    });
    globalThis.fakeVscodeModule = fake.module;
    vi.useFakeTimers();
    const loaded: unknown = createRequire(import.meta.url)(join(bundleDirectory, 'extension.js'));
    if (!IsLoadedExtension(loaded)) {
        throw new Error('打包好的擴充沒有 activate ／ deactivate');
    }
    extension = loaded;
    extension.activate({ subscriptions, extensionUri: FakeUri.from({ scheme: 'file', path: '/extension' }) });
    await SettleAsync();
});

afterAll(() => {
    vi.useRealTimers();
    rmSync(bundleDirectory, { recursive: true, force: true });
});

describe('擴充走一遍（打包後、假的 VS Code）', () => {
    it('[DS-34][DS-26] 啟用就把內建亮色那一組的底色與行號色寫進目前主題那一格', () => {
        expect(ReadThemeScope('user')).toMatchObject({
            'diffEditor.insertedTextBackground': '#4cc05f42',
            'editorLineNumber.foreground': '#c6c6c6',
            'editorLineNumber.activeForeground': '#ffffff',
        });
    });

    it('[DS-35] 使用者自己設的分頁顏色原樣留著', () => {
        expect(fake.settings.user['workbench.colorCustomizations']).toMatchObject(USER_OWN_COLOR);
    });

    it('[DS-01][DS-11][DS-21] 開範例 diff：沒有欄號的兩側都找得到，只框改動的字', async () => {
        await fake.ExecuteCommandAsync('jctkDiffStyle.openSample');
        await SettleAsync();
        const [originalEditor, modifiedEditor] = fake.GetVisibleEditors();
        expect(SliceDecorated(modifiedEditor, InsertedBorderType())).toEqual(SAMPLE_INSERTED_BOXES);
        const removedType = FindActiveType((type) => type.options.border?.includes('#fecfcda3') === true);
        expect(SliceDecorated(originalEditor, removedType)).toEqual(['the docs', 'docs-helper', 'false']);
    });

    it('[DS-12] 同一個檔案在別欄以一般分頁開著：那個分頁不被框', () => {
        const normalEditor = fake.GetVisibleEditors()[2];
        expect([...(normalEditor?.decorations.values() ?? [])].flat()).toEqual([]);
    });

    it('[DS-16][DS-21] 註解色只換註解裡改動的字，程式碼裡改動的字不換', () => {
        const [originalEditor, modifiedEditor] = fake.GetVisibleEditors();
        const commentType = FindActiveType((type) => type.options.color === '#959cab');
        expect(SliceDecorated(modifiedEditor, commentType)).toEqual([
            'every VS Code',
            ' under it',
            '<extension-name>',
            '// Added block: two background layers overlap, and gray comments must stay readable',
            '// Merged with colorCustomizations in user settings, not replacing it',
        ]);
        expect(SliceDecorated(originalEditor, commentType)).toEqual([
            'the docs',
            'docs-helper',
            '// These two lines are removed as a block: the old setting',
        ]);
    });

    it('[DS-52] 有 diff 分頁：狀態列顯示目前那一組', () => {
        expect(fake.statusBar.isShown).toBe(true);
        expect(fake.statusBar.text).toContain('Bright');
    });

    it('[DS-26] 開面板：收到內建的兩組', async () => {
        await fake.ExecuteCommandAsync('jctkDiffStyle.openPanel');
        fake.ReceiveFromPanel({ type: 'ready' });
        await SettleAsync();
        expect(LastPanelState()?.presets.map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
    });

    it('[DS-56] 面板選繁中：面板、狀態列、範例、內建兩組的名字換成繁中，寫進使用者設定', async () => {
        fake.ReceiveFromPanel({ type: 'setLanguage', language: 'zh-tw' });
        await SettleAsync();
        expect(fake.settings.user['jctkDiffStyle.language']).toBe('zh-tw');
        const state = LastPanelState();
        expect(state?.language).toBe('zh-tw');
        expect(state?.displayLanguage).toBe('zh-tw');
        expect(state?.l10nBundle?.Delete).toBe('刪除');
        expect(state?.presets.map((preset) => preset.name)).toEqual(['亮色', '暗色']);
        expect(state?.activeName).toBe('亮色');
        expect(fake.statusBar.text).toContain('亮色');
        expect(SliceDecorated(fake.GetVisibleEditors()[1], InsertedBorderType())).toEqual(SAMPLE_INSERTED_BOXES_ZH_TW);
    });

    it('[DS-56] 面板選回「跟著 VS Code」（VS Code 是英文）：換回英文，設定裡不留這個鍵', async () => {
        fake.ReceiveFromPanel({ type: 'setLanguage', language: 'auto' });
        await SettleAsync();
        expect(fake.settings.user).not.toHaveProperty('jctkDiffStyle.language');
        const state = LastPanelState();
        expect(state?.language).toBe('auto');
        expect(state?.displayLanguage).toBe('en');
        expect(state).not.toHaveProperty('l10nBundle');
        expect(state?.presets.map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
        expect(fake.statusBar.text).toContain('Bright');
        expect(SliceDecorated(fake.GetVisibleEditors()[1], InsertedBorderType())).toEqual(SAMPLE_INSERTED_BOXES);
    });

    it('[DS-56] 面板送來認不得的語言：擋下，設定不動', async () => {
        const postedBefore = fake.posted.length;
        fake.ReceiveFromPanel({ type: 'setLanguage', language: 'xx' });
        await SettleAsync();
        expect(fake.settings.user).not.toHaveProperty('jctkDiffStyle.language');
        expect(fake.posted.length).toBe(postedBefore);
        expect(fake.logLines.at(-1)).toContain('unrecognized');
    });

    it('[DS-13][DS-38] 拖動面板：框線、底色、行號色、參數組都跟著改，面板不重畫', async () => {
        const postedBefore = fake.posted.length;
        await SendUpdateAsync((preset) => ({
            ...preset,
            border: { ...preset.border, width: 3 },
            colors: { ...preset.colors, insertedText: '#4cc05f33' },
            lineNumbers: { color: '#aaaaaa', activeColor: '#eeeeee' },
        }));
        expect(InsertedBorderType()?.options.border).toBe('3px solid #d7f9dca3');
        expect(SliceDecorated(fake.GetVisibleEditors()[1], InsertedBorderType())).toEqual(SAMPLE_INSERTED_BOXES);
        expect(ReadThemeScope('user')).toMatchObject({
            'diffEditor.insertedTextBackground': '#4cc05f33',
            'editorLineNumber.foreground': '#aaaaaa',
            'editorLineNumber.activeForeground': '#eeeeee',
        });
        expect(ReadPresets('user')[0]?.border.width).toBe(3);
        expect(fake.posted.length).toBe(postedBefore);
    });

    it('[DS-05] 照使用者的比對設定（縮排也算改動）：只多了縮排的行預設不框，打開「只改了空白的也框」才框', async () => {
        const modifiedEditor = (): IFakeEditor | undefined => fake.GetVisibleEditors()[1];
        const WhitespaceBoxes = (): string[] =>
            SliceDecorated(modifiedEditor(), InsertedBorderType()).filter((text) => text.trim() === '');
        fake.settings.user['diffEditor.ignoreTrimWhitespace'] = false;
        fake.FireConfigurationChange('diffEditor.ignoreTrimWhitespace');
        await SettleAsync();
        expect(WhitespaceBoxes()).toEqual([]);
        await SendUpdateAsync((preset) => ({ ...preset, border: { ...preset.border, isWhitespaceIncluded: true } }));
        expect(WhitespaceBoxes()).toEqual(['    ', '    ']);
        await SendUpdateAsync((preset) => ({ ...preset, border: { ...preset.border, isWhitespaceIncluded: false } }));
        expect(WhitespaceBoxes()).toEqual([]);
        Reflect.deleteProperty(fake.settings.user, 'diffEditor.ignoreTrimWhitespace');
        fake.FireConfigurationChange('diffEditor.ignoreTrimWhitespace');
        await SettleAsync();
    });

    it('[DS-27][DS-37][DS-22] 切到暗色：底色換掉、行號鍵拿掉、註解不換色', async () => {
        fake.ReceiveFromPanel({ type: 'select', name: 'Dark' });
        await SettleAsync();
        const scope = ReadThemeScope('user');
        expect(scope?.['diffEditor.insertedTextBackground']).toBe('#0e4429a6');
        expect(scope).not.toHaveProperty('editorLineNumber.foreground');
        expect(scope).not.toHaveProperty('editorLineNumber.activeForeground');
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('Dark');
        expect(FindActiveType((type) => type.options.color !== undefined)).toBeUndefined();
    });

    it('[DS-28] 複製成新的一組：多一組並切過去', async () => {
        fake.SetInputBoxAnswer('測試組');
        fake.ReceiveFromPanel({ type: 'add' });
        await SettleAsync();
        expect(ReadPresets('user').map((preset) => preset.name)).toEqual(['Bright', 'Dark', '測試組']);
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('測試組');
    });

    it('[DS-29] 改名成已存在的名字：擋下', async () => {
        fake.SetInputBoxAnswer('Dark');
        fake.ReceiveFromPanel({ type: 'rename' });
        await SettleAsync();
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('測試組');
    });

    it('[DS-30] 改名：名字換了、仍是目前那一組', async () => {
        fake.SetInputBoxAnswer('新名字');
        fake.ReceiveFromPanel({ type: 'rename' });
        await SettleAsync();
        expect(ReadPresets('user').map((preset) => preset.name)).toEqual(['Bright', 'Dark', '新名字']);
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('新名字');
    });

    it('[DS-31] 刪除：少一組、目前那一組換成第一組', async () => {
        fake.ReceiveFromPanel({ type: 'remove' });
        await SettleAsync();
        expect(ReadPresets('user').map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('Bright');
    });

    it('[DS-56] 參數組已經寫進設定：換介面語言不改名（那是使用者的資料）', async () => {
        fake.ReceiveFromPanel({ type: 'setLanguage', language: 'zh-tw' });
        await SettleAsync();
        expect(LastPanelState()?.displayLanguage).toBe('zh-tw');
        expect(LastPanelState()?.presets.map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
        expect(ReadPresets('user').map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
        fake.ReceiveFromPanel({ type: 'setLanguage', language: 'auto' });
        await SettleAsync();
        expect(LastPanelState()?.displayLanguage).toBe('en');
    });

    it('[DS-27] 狀態列的切換：切到暗色', async () => {
        await fake.ExecuteCommandAsync('jctkDiffStyle.switchPreset');
        await SettleAsync();
        expect(fake.settings.user['jctkDiffStyle.activePreset']).toBe('Dark');
    });

    it('[DS-40] 專案設定也設了受管的鍵：面板列出被蓋掉的鍵', async () => {
        fake.settings.workspace['workbench.colorCustomizations'] = {
            [THEME_SCOPE]: { 'diffEditor.insertedTextBackground': '#000000' },
        };
        fake.FireConfigurationChange('workbench.colorCustomizations');
        await SettleAsync();
        expect(LastPanelState()?.overriddenKeys).toEqual(['diffEditor.insertedTextBackground']);
        Reflect.deleteProperty(fake.settings.workspace, 'workbench.colorCustomizations');
        fake.FireConfigurationChange('workbench.colorCustomizations');
        await SettleAsync();
    });

    it('[DS-42] 參數組被別處改了：重讀、套用', async () => {
        fake.settings.user['jctkDiffStyle.presets'] = [{ name: '手改的', border: { width: 2 } }];
        fake.settings.user['jctkDiffStyle.activePreset'] = '手改的';
        fake.FireConfigurationChange('jctkDiffStyle.presets');
        await SettleAsync();
        expect(LastPanelState()?.activeName).toBe('手改的');
        expect(ReadThemeScope('user')?.['diffEditor.insertedTextBackground']).toBe('#4cc05f42');
    });

    it('[DS-32] 只剩一組時刪除：不刪', async () => {
        fake.ReceiveFromPanel({ type: 'remove' });
        await SettleAsync();
        expect(ReadPresets('user').map((preset) => preset.name)).toEqual(['手改的']);
    });

    it('[DS-39][DS-41] 專案設定有參數組：參數組與顏色寫回專案設定，使用者設定不動，也不跳被蓋掉的警告', async () => {
        const userColorsBefore = structuredClone(fake.settings.user['workbench.colorCustomizations']);
        const userPresetsBefore = structuredClone(fake.settings.user['jctkDiffStyle.presets']);
        fake.settings.workspace['jctkDiffStyle.presets'] = [
            {
                name: '專案的',
                colors: { insertedText: '#11223344' },
                lineNumbers: { color: '#bbbbbb', activeColor: '#ffffff' },
            },
        ];
        fake.settings.workspace['jctkDiffStyle.activePreset'] = '專案的';
        fake.FireConfigurationChange('jctkDiffStyle.presets');
        await SettleAsync();
        expect(ReadThemeScope('workspace')).toMatchObject({
            'diffEditor.insertedTextBackground': '#11223344',
            'editorLineNumber.foreground': '#bbbbbb',
        });
        expect(LastPanelState()?.layer).toBe('workspace');
        expect(LastPanelState()?.overriddenKeys).toEqual([]);
        await SendUpdateAsync((preset) => ({ ...preset, border: { ...preset.border, width: 4 } }));
        expect(ReadPresets('workspace')[0]?.border.width).toBe(4);
        expect(fake.settings.workspace['jctkDiffStyle.activePreset']).toBe('專案的');
        expect(fake.settings.user['workbench.colorCustomizations']).toEqual(userColorsBefore);
        expect(fake.settings.user['jctkDiffStyle.presets']).toEqual(userPresetsBefore);
    });

    it('[DS-44] 移除顏色：兩層的受管鍵都拿掉，使用者自己的分頁顏色留著', async () => {
        await fake.ExecuteCommandAsync('jctkDiffStyle.clearColors');
        expect(ReadThemeScope('user')).toBeUndefined();
        expect(ReadThemeScope('workspace')).toBeUndefined();
        expect(fake.settings.user['workbench.colorCustomizations']).toEqual(USER_OWN_COLOR);
    });

    it('[DS-53] 停用：診斷紀錄從頭到尾沒有失敗', async () => {
        await extension.deactivate();
        for (const subscription of subscriptions) {
            subscription.dispose();
        }
        expect(fake.logLines.filter((line) => line.includes('failed'))).toEqual([]);
    });
});
