/**
 * 擴充入口：把參數組、框線、設定面板、狀態列接到 VS Code。
 *
 * 狀態的單一來源是記憶體裡的 {@link presetState}：
 * - 面板改值 ⇒ 改它 ⇒ 當場重畫框線、節流寫回設定
 * - 設定檔被別處改了（手改、另一個視窗）⇒ 重讀進來
 */
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { CreateDiffDecorator } from './decorator';
import { ApplyDisplayLanguage, type IDisplayLanguage, ResolveDisplayLanguage } from './displayLanguage';
import { CreateCommentSyntaxProvider } from './languageComments';
import { LanguageSettings } from './languageSettings';
import { CreatePanelHost } from './panelHost';
import { type IPanelState, PanelMessageTypes, type PanelToHostMessage } from './panelMessages';
import {
    ClonePreset,
    CreateUniqueName,
    GetDefaultPresetNames,
    type IDefaultPresetNames,
    type IDiffStylePreset,
    RenameBuiltInPresets,
    ResolveActivePreset,
} from './presetModel';
import { OpenSampleAsync, RefreshSample, RegisterSampleProvider } from './sample';
import { SettingLayers } from './settingLayers';
import {
    ApplyColorsAsync,
    DescribeConfigurationChange,
    FindWorkspaceOverrides,
    GetLocalizedPresetNames,
    GetPresetLayer,
    GetThemeName,
    HasStoredPresets,
    type IPresetState,
    IsOwnPresetWrite,
    ReadLanguageSetting,
    ReadPresetState,
    RemoveAppliedColorsAsync,
    WriteLanguageSettingAsync,
    WritePresetStateAsync,
} from './settingsStore';
import { CreateThrottledTask } from './throttledTask';

/** 命令 id——與 `package.json` 的 `contributes.commands` 同值 */
enum CommandIds {
    OpenPanel = 'jctkDiffStyle.openPanel',
    SwitchPreset = 'jctkDiffStyle.switchPreset',
    OpenSample = 'jctkDiffStyle.openSample',
    ClearColors = 'jctkDiffStyle.clearColors',
    ShowLog = 'jctkDiffStyle.showLog',
}

/** 診斷輸出頻道的名字——使用者在 Output 面板的下拉選單看到的就是它 */
const LOG_CHANNEL_NAME = 'Jctk Diff Style';

/** 重畫框線的最短間隔（毫秒）：拖動時跟得上手，又不每一格都重算 */
const REFRESH_INTERVAL_MS = 30;

/** 寫顏色（底色、行號色）進設定的最短間隔（毫秒）：拖動時看得到顏色跟著變，又不每一格都寫檔 */
const APPLY_COLORS_INTERVAL_MS = 120;

/** 寫參數組清單的最短間隔（毫秒）：不影響畫面，只要最後存得到 */
const SAVE_PRESETS_INTERVAL_MS = 500;

/**
 * 每一層在診斷紀錄裡的名字（照目前的介面語言）。
 * @param layer 寫入的那一層
 * @returns 名字
 */
const DescribeLayer = (layer: SettingLayers): string => {
    switch (layer) {
        case SettingLayers.User:
            return l10n.t('user settings');
        case SettingLayers.Workspace:
            return l10n.t('workspace settings');
    }
};

/** 狀態列的排序權重（越大越靠左） */
const STATUS_BAR_PRIORITY = 100;

let logChannel: vscode.OutputChannel | undefined = undefined;

/** 參數組清單與目前那一組——本擴充狀態的單一來源 */
let presetState: IPresetState = { presets: [], activeName: '' };

/** 上一次送給面板的「被工作區蓋掉的鍵」——沒變就不重送，免得拖動中面板被重畫 */
let lastOverriddenKeys = '';

/** 介面實際用的語言；啟用與 `jctkDiffStyle.language` 改了時重算 */
let displayLanguage: IDisplayLanguage = { language: LanguageSettings.English };

/** 內建兩組目前用的名字：介面語言換了、參數組又還沒寫進設定時，照它們找出要改名的那兩組 */
let builtInPresetNames: IDefaultPresetNames = GetDefaultPresetNames();

/** 停用時要等的收尾（還沒寫進設定的值）；啟用時換成真的那一份 */
let deactivateAsync: () => Promise<void> = () => Promise.resolve();

/**
 * 寫一行診斷紀錄。
 * @param message 內容
 */
const Log = (message: string): void => {
    logChannel?.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
};

/**
 * 把 catch 到的值寫成一行看得懂的字。
 * @param error catch 到的值
 * @returns 訊息（Error 的話含堆疊）
 */
const DescribeError = (error: unknown): string =>
    error instanceof Error ? (error.stack ?? error.message) : String(error);

/**
 * 記下失敗：extension host 會吞掉事件處理器擲出的例外，不記就沒有任何痕跡。
 * @param Where 哪個進入點（失敗時才取，照那時的介面語言）
 * @returns 接 catch 到的值的處理器
 */
const LogFailure =
    (Where: () => string) =>
    (error: unknown): void =>
        Log(l10n.t('{0} failed: {1}', Where(), DescribeError(error)));

/** 照 `jctkDiffStyle.language` 重算介面語言，換掉 `l10n.t` 的翻譯表 */
const ApplyLanguageSetting = (): void => {
    displayLanguage = ResolveDisplayLanguage(ReadLanguageSetting(), vscode.env.language);
    ApplyDisplayLanguage(displayLanguage);
};

/**
 * 目前那一組。
 * @returns 目前那一組（清單是空的時用內建的第一組）
 */
const GetActivePreset = (): IDiffStylePreset => ResolveActivePreset(presetState.presets, presetState.activeName);

/**
 * 面板要畫的狀態。
 * @returns 面板要畫的狀態
 */
const GetPanelState = (): IPanelState => ({
    presets: presetState.presets.map((preset) => ClonePreset(preset)),
    activeName: GetActivePreset().name,
    themeName: GetThemeName(),
    layer: GetPresetLayer(),
    overriddenKeys: FindWorkspaceOverrides(),
    language: ReadLanguageSetting(),
    displayLanguage: displayLanguage.language,
    ...(displayLanguage.bundle === undefined ? {} : { l10nBundle: { ...displayLanguage.bundle } }),
});

/**
 * 啟用擴充。
 * @param context 擴充的 context
 */
const activate = (context: vscode.ExtensionContext): void => {
    ApplyLanguageSetting();
    builtInPresetNames = GetLocalizedPresetNames();
    logChannel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
    const commentSyntax = CreateCommentSyntaxProvider(Log);
    const decorator = CreateDiffDecorator(Log, commentSyntax);
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUS_BAR_PRIORITY);
    statusBar.command = CommandIds.SwitchPreset;

    const UpdateStatusBar = (): void => {
        statusBar.text = `$(symbol-color) ${GetActivePreset().name}`;
        statusBar.tooltip = l10n.t('Switch diff style preset (Jctk Diff Style)');
        if (decorator.IsDiffVisible()) {
            statusBar.show();
        } else {
            statusBar.hide();
        }
    };

    const refreshTask = CreateThrottledTask(
        async () => {
            await decorator.RefreshAsync();
            UpdateStatusBar();
        },
        REFRESH_INTERVAL_MS,
        LogFailure(() => l10n.t('Redraw borders')),
    );
    const applyColorsTask = CreateThrottledTask(
        () => ApplyColorsAsync(GetActivePreset()),
        APPLY_COLORS_INTERVAL_MS,
        LogFailure(() => l10n.t('Write colors')),
    );
    const savePresetsTask = CreateThrottledTask(
        () => WritePresetStateAsync(presetState),
        SAVE_PRESETS_INTERVAL_MS,
        LogFailure(() => l10n.t('Save presets')),
    );

    const panel = CreatePanelHost({
        extensionUri: context.extensionUri,
        GetState: GetPanelState,
        GetActivePreset,
        OnMessageAsync: (message) => HandlePanelMessageAsync(message),
        Log,
    });

    /** 目前那一組換了或值變了：框線、底色、狀態列都跟上 */
    const ApplyActivePreset = (): void => {
        decorator.SetPreset(GetActivePreset());
        refreshTask.Request();
        applyColorsTask.Request();
        UpdateStatusBar();
    };

    /** 清單或目前那一組換了：套用、存檔、面板重畫 */
    const CommitStructureChange = (): void => {
        ApplyActivePreset();
        savePresetsTask.Request();
        panel.PostState();
    };

    /**
     * 問一個參數組名字：不可空白、不可與其他組重複。
     * @param title 輸入框的標題
     * @param value 預填的名字
     * @param exceptName 允許與它同名（改名時的原名）
     * @returns 名字；按 Esc 時為 undefined
     */
    const AskPresetNameAsync = async (
        title: string,
        value: string,
        exceptName?: string,
    ): Promise<string | undefined> => {
        const name = await vscode.window.showInputBox({
            title,
            value,
            validateInput: (input) => {
                const trimmed = input.trim();
                if (trimmed === '') {
                    return l10n.t('Name cannot be empty');
                }
                return presetState.presets.some((preset) => preset.name === trimmed && preset.name !== exceptName)
                    ? l10n.t('That name is already taken')
                    : undefined;
            },
        });
        return name?.trim();
    };

    const SelectPreset = (name: string): void => {
        presetState = { ...presetState, activeName: ResolveActivePreset(presetState.presets, name).name };
        CommitStructureChange();
    };

    const AddPresetAsync = async (): Promise<void> => {
        const active = GetActivePreset();
        const name = await AskPresetNameAsync(
            l10n.t('Name the new preset'),
            CreateUniqueName(l10n.t('{0} copy', active.name), presetState.presets),
        );
        if (name === undefined) {
            return;
        }
        presetState = { presets: [...presetState.presets, ClonePreset(active, name)], activeName: name };
        CommitStructureChange();
    };

    const RenamePresetAsync = async (): Promise<void> => {
        const active = GetActivePreset();
        const name = await AskPresetNameAsync(l10n.t('Rename to'), active.name, active.name);
        if (name === undefined || name === active.name) {
            return;
        }
        presetState = {
            presets: presetState.presets.map((preset) =>
                preset.name === active.name ? ClonePreset(preset, name) : preset,
            ),
            activeName: name,
        };
        CommitStructureChange();
    };

    const RemovePresetAsync = async (): Promise<void> => {
        const active = GetActivePreset();
        if (presetState.presets.length <= 1) {
            await vscode.window.showInformationMessage(l10n.t('Keep at least one preset'));
            return;
        }
        const deleteLabel = l10n.t('Delete');
        const answer = await vscode.window.showWarningMessage(
            l10n.t('Delete preset "{0}"?', active.name),
            { modal: true },
            deleteLabel,
        );
        if (answer !== deleteLabel) {
            return;
        }
        const presets = presetState.presets.filter((preset) => preset.name !== active.name);
        presetState = { presets, activeName: ResolveActivePreset(presets, '').name };
        CommitStructureChange();
    };

    /**
     * 面板改了目前那一組的值：只更新那一組，不重畫面板（拖動中）。
     * @param preset 面板送來的新值
     */
    const UpdateActivePreset = (preset: IDiffStylePreset): void => {
        const activeName = GetActivePreset().name;
        if (preset.name !== activeName) {
            Log(
                l10n.t(
                    'The panel sent preset "{0}", which is not the active preset "{1}"; ignored',
                    preset.name,
                    activeName,
                ),
            );
            return;
        }
        presetState = {
            ...presetState,
            presets: presetState.presets.map((item) => (item.name === activeName ? preset : item)),
        };
        ApplyActivePreset();
        savePresetsTask.Request();
    };

    const HandlePanelMessageAsync = async (message: PanelToHostMessage): Promise<void> => {
        switch (message.type) {
            case PanelMessageTypes.Ready:
                panel.PostState();
                return;
            case PanelMessageTypes.Update:
                UpdateActivePreset(message.preset);
                return;
            case PanelMessageTypes.Select:
                SelectPreset(message.name);
                return;
            case PanelMessageTypes.Add:
                await AddPresetAsync();
                return;
            case PanelMessageTypes.Rename:
                await RenamePresetAsync();
                return;
            case PanelMessageTypes.Remove:
                await RemovePresetAsync();
                return;
            case PanelMessageTypes.OpenSample:
                await OpenSampleAsync();
                return;
            case PanelMessageTypes.SetLanguage:
                // 寫進設定之後由設定變更事件套用（手改設定也走同一條）
                await WriteLanguageSettingAsync(message.language);
                return;
        }
    };

    const SwitchPresetAsync = async (): Promise<void> => {
        const activeName = GetActivePreset().name;
        const openPanelPick = `$(symbol-color) ${l10n.t('Open settings panel…')}`;
        const items: vscode.QuickPickItem[] = [
            ...presetState.presets.map((preset) => ({
                label: preset.name,
                description: preset.name === activeName ? l10n.t('Current') : '',
            })),
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: openPanelPick },
        ];
        const picked = await vscode.window.showQuickPick(items, { title: l10n.t('Switch diff style preset') });
        if (picked === undefined) {
            return;
        }
        if (picked.label === openPanelPick) {
            panel.Show();
            return;
        }
        SelectPreset(picked.label);
    };

    const ClearColorsAsync = async (): Promise<void> => {
        applyColorsTask.Destroy();
        await applyColorsTask.FlushAsync();
        await RemoveAppliedColorsAsync();
        await vscode.window.showInformationMessage(
            l10n.t(
                'Removed the background and line number colors this extension wrote to user and workspace settings. While the extension stays installed, they are written again the next time you switch or adjust a preset, or reload the window.',
            ),
        );
    };

    /** 介面語言換了：之後取的字、狀態列、面板、開著的範例都換成那個語言 */
    const ChangeLanguage = (): void => {
        ApplyLanguageSetting();
        const names = GetLocalizedPresetNames();
        if (!HasStoredPresets()) {
            presetState = RenameBuiltInPresets(presetState, builtInPresetNames, names);
        }
        builtInPresetNames = names;
        Log(l10n.t('Interface language: {0}', displayLanguage.language));
        UpdateStatusBar();
        RefreshSample();
        panel.Relocalize();
    };

    const HandleConfigurationChange = (event: vscode.ConfigurationChangeEvent): void => {
        const change = DescribeConfigurationChange(event);
        if (change.isLanguageChanged) {
            ChangeLanguage();
        }
        if (change.isPresetsChanged && !IsOwnPresetWrite()) {
            Log(l10n.t('Presets were changed elsewhere; reloading'));
            presetState = ReadPresetState();
            ApplyActivePreset();
            panel.PostState();
        }
        if (change.isThemeChanged) {
            applyColorsTask.Request();
            panel.PostState();
        }
        if (change.isColorsChanged) {
            const overriddenKeys = JSON.stringify(FindWorkspaceOverrides());
            if (overriddenKeys !== lastOverriddenKeys) {
                lastOverriddenKeys = overriddenKeys;
                panel.PostState();
            }
        }
        if (event.affectsConfiguration('diffEditor')) {
            refreshTask.Request();
        }
    };

    /**
     * 包一層：命令擲錯時記下來（VS Code 只會跳一個沒有原因的錯誤通知）。
     * @param id 命令 id
     * @param RunAsync 命令本體
     * @returns 註冊結果
     */
    const RegisterCommand = (id: CommandIds, RunAsync: () => Promise<void> | void): vscode.Disposable =>
        vscode.commands.registerCommand(id, async () => {
            try {
                await RunAsync();
            } catch (error: unknown) {
                LogFailure(() => l10n.t('Command {0}', id))(error);
                throw error;
            }
        });

    presetState = ReadPresetState();
    lastOverriddenKeys = JSON.stringify(FindWorkspaceOverrides());
    ApplyActivePreset();

    context.subscriptions.push(
        logChannel,
        statusBar,
        RegisterSampleProvider(),
        RegisterCommand(CommandIds.OpenPanel, () => panel.Show()),
        RegisterCommand(CommandIds.SwitchPreset, SwitchPresetAsync),
        RegisterCommand(CommandIds.OpenSample, OpenSampleAsync),
        RegisterCommand(CommandIds.ClearColors, ClearColorsAsync),
        RegisterCommand(CommandIds.ShowLog, () => logChannel?.show()),
        vscode.window.onDidChangeVisibleTextEditors(() => refreshTask.Request()),
        vscode.window.tabGroups.onDidChangeTabs(() => refreshTask.Request()),
        vscode.window.tabGroups.onDidChangeTabGroups(() => refreshTask.Request()),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (vscode.window.visibleTextEditors.some((editor) => editor.document === event.document)) {
                refreshTask.Request();
            }
        }),
        vscode.workspace.onDidChangeConfiguration(HandleConfigurationChange),
        {
            dispose: () => {
                refreshTask.Destroy();
                panel.Destroy();
                decorator.Destroy();
                commentSyntax.Destroy();
            },
        },
    );
    deactivateAsync = async () => {
        await applyColorsTask.FlushAsync();
        await savePresetsTask.FlushAsync();
    };
    Log(
        l10n.t(
            'Activated: {0} presets ({1}), active "{2}", theme "{3}", interface language {4}',
            presetState.presets.length,
            DescribeLayer(GetPresetLayer()),
            GetActivePreset().name,
            GetThemeName(),
            displayLanguage.language,
        ),
    );
};

/**
 * 停用擴充：把還沒寫進設定的值寫完。
 * @returns 寫完的 Promise（VS Code 會等它）
 */
const deactivate = (): Promise<void> => deactivateAsync();

export { activate, deactivate };
