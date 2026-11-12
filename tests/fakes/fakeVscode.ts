/**
 * 假的 `vscode` 模組：冒煙測試用它載入打包好的擴充，走一遍只有在 VS Code 裡才會發生的流程。
 *
 * - 只做擴充用得到的那幾個 API；名稱照 VS Code 的（小寫開頭），擴充才找得到
 * - 設定分兩層：使用者、專案；寫入照 `ConfigurationTarget` 分層，讀的時候專案優先
 * - diff 的兩側照真的 VS Code：編輯器沒有欄號（見 `src/diffSides.ts`）
 * - 範例 diff 開的時候，旁邊一欄另外以一般分頁開著同一個檔案：用來驗它不會被框
 */

/** 設定的兩層：鍵是完整的設定名稱（`jctkDiffStyle.presets`） */
interface IFakeSettings {
    user: Record<string, unknown>;
    workspace: Record<string, unknown>;
}

/** 一次設定變更事件 */
interface IConfigurationChange {
    affectsConfiguration: (section: string) => boolean;
}

/** 事件：可以訂閱、也可以由測試觸發 */
interface IFakeEvent<T> {
    (listener: (value: T) => void): { dispose: () => void };
    Fire: (value: T) => void;
}

/** 假的文件位置 */
class FakeUri {
    readonly scheme: string;
    readonly path: string;

    constructor(scheme: string, path: string) {
        this.scheme = scheme;
        this.path = path;
    }

    static from(parts: { scheme: string; path: string }): FakeUri {
        return new FakeUri(parts.scheme, parts.path);
    }

    static joinPath(base: FakeUri, ...segments: string[]): FakeUri {
        return new FakeUri(base.scheme, [base.path, ...segments].join('/'));
    }

    toString(): string {
        return `${this.scheme}:${this.path}`;
    }
}

/** 假的範圍：只記下擴充給的四個數字 */
class FakeRange {
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;

    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
        this.startLine = startLine;
        this.startCharacter = startCharacter;
        this.endLine = endLine;
        this.endCharacter = endCharacter;
    }
}

/** 假的 diff 分頁內容 */
class FakeTabInputTextDiff {
    readonly original: FakeUri;
    readonly modified: FakeUri;

    constructor(original: FakeUri, modified: FakeUri) {
        this.original = original;
        this.modified = modified;
    }
}

/** 假的 decoration 樣式 */
interface IFakeDecorationType {
    options: { border?: string; color?: string };
    isDisposed: boolean;
    dispose: () => void;
}

/** 假的文件 */
interface IFakeDocument {
    uri: FakeUri;
    languageId: string;
    lineCount: number;
    lineAt: (index: number) => { text: string };
}

/** 假的編輯器：記下每一種 decoration 畫在哪裡 */
interface IFakeEditor {
    document: IFakeDocument;
    viewColumn: number | undefined;
    decorations: Map<IFakeDecorationType, FakeRange[]>;
    setDecorations: (type: IFakeDecorationType, ranges: FakeRange[]) => void;
}

/** 假的分頁群組 */
interface IFakeTabGroup {
    viewColumn: number;
    activeTab: { input: unknown } | undefined;
}

/** 假的文件內容來源 */
interface IFakeContentProvider {
    /** 內容換了：VS Code 會重讀開著的那一份 */
    onDidChange?: (listener: (uri: FakeUri) => void) => { dispose: () => void };
    provideTextDocumentContent: (uri: FakeUri) => string;
}

/** 假的 `vscode.EventEmitter`：擴充自己發的事件 */
class FakeEventEmitter<T> {
    private readonly listeners: ((value: T) => void)[] = [];

    /** 訂閱 */
    readonly event = (listener: (value: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners.splice(this.listeners.indexOf(listener), 1);
            },
        };
    };

    fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }

    dispose(): void {
        this.listeners.length = 0;
    }
}

/** 測試操作假 VS Code 的介面 */
interface IFakeVscode {
    /** 交給擴充的 `vscode` 模組 */
    module: Record<string, unknown>;
    settings: IFakeSettings;
    /** 擴充建立過的每一個 decoration 樣式（含已釋放的） */
    decorationTypes: IFakeDecorationType[];
    /** 擴充送給面板的每一則訊息 */
    posted: unknown[];
    /** 診斷紀錄的每一行 */
    logLines: string[];
    /** 狀態列 */
    statusBar: { text: string; isShown: boolean };
    /** 目前看得到的編輯器 */
    GetVisibleEditors: () => IFakeEditor[];
    /** 假裝面板送來一則訊息 */
    ReceiveFromPanel: (message: unknown) => void;
    /** 下一次輸入框要回答什麼（undefined ＝ 按 Esc） */
    SetInputBoxAnswer: (answer: string | undefined) => void;
    /** 觸發一次設定變更事件 */
    FireConfigurationChange: (section: string) => void;
    /** 執行命令（含擴充自己註冊的） */
    ExecuteCommandAsync: (id: string, ...args: unknown[]) => Promise<unknown>;
}

/** 語言設定檔：JSONC（帶註解與結尾逗號），同 VS Code 內建語言的寫法 */
const LANGUAGE_CONFIGURATION = `{
  // 註解符號
  "comments": { "lineComment": "//", "blockComment": ["/*", "*/"], },
}`;

/** `vscode.ConfigurationTarget.Workspace` 的值 */
const WORKSPACE_TARGET = 2;

/**
 * 建立事件。
 * @returns 可訂閱、可觸發的事件
 */
const CreateEvent = <T>(): IFakeEvent<T> => {
    const listeners: ((value: T) => void)[] = [];
    return Object.assign(
        (listener: (value: T) => void) => {
            listeners.push(listener);
            return {
                dispose: () => {
                    listeners.splice(listeners.indexOf(listener), 1);
                },
            };
        },
        {
            Fire: (value: T) => {
                for (const listener of [...listeners]) {
                    listener(value);
                }
            },
        },
    );
};

/**
 * 建立假的 VS Code。
 * @param initialSettings 一開始的使用者設定
 * @returns 測試操作它的介面
 */
const CreateFakeVscode = (initialSettings: Record<string, unknown>): IFakeVscode => {
    const settings: IFakeSettings = { user: structuredClone(initialSettings), workspace: {} };
    const decorationTypes: IFakeDecorationType[] = [];
    const posted: unknown[] = [];
    const logLines: string[] = [];
    const statusBar = { text: '', isShown: false };
    const contentProviders = new Map<string, IFakeContentProvider>();
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const onDidChangeConfiguration = CreateEvent<IConfigurationChange>();
    const onDidChangeVisibleTextEditors = CreateEvent<unknown>();
    const onDidChangeTabs = CreateEvent<unknown>();
    const onDidChangeTextDocument = CreateEvent<{ document: IFakeDocument }>();
    let visibleEditors: IFakeEditor[] = [];
    let tabGroups: IFakeTabGroup[] = [];
    let receiveFromPanel: (message: unknown) => void = () => undefined;
    let inputBoxAnswer: string | undefined = undefined;

    const CreateDocument = (uri: FakeUri): IFakeDocument => {
        const lines = (contentProviders.get(uri.scheme)?.provideTextDocumentContent(uri) ?? '').split('\n');
        return {
            uri,
            languageId: uri.path.endsWith('.ts') ? 'typescript' : 'plaintext',
            lineCount: lines.length,
            lineAt: (index) => ({ text: lines[index] ?? '' }),
        };
    };

    const CreateEditor = (uri: FakeUri, viewColumn: number | undefined): IFakeEditor => {
        const decorations = new Map<IFakeDecorationType, FakeRange[]>();
        return {
            document: CreateDocument(uri),
            viewColumn,
            decorations,
            setDecorations: (type, ranges) => {
                decorations.set(type, ranges);
            },
        };
    };

    const FireConfigurationChange = (section: string): void => {
        onDidChangeConfiguration.Fire({
            affectsConfiguration: (prefix) => section === prefix || section.startsWith(`${prefix}.`),
        });
    };

    const OpenDiff = (original: FakeUri, modified: FakeUri): void => {
        tabGroups = [
            { viewColumn: 1, activeTab: { input: new FakeTabInputTextDiff(original, modified) } },
            { viewColumn: 2, activeTab: { input: {} } },
        ];
        visibleEditors = [
            CreateEditor(original, undefined),
            CreateEditor(modified, undefined),
            CreateEditor(modified, 2),
        ];
        onDidChangeTabs.Fire({});
        onDidChangeVisibleTextEditors.Fire(visibleEditors);
    };

    const ExecuteCommandAsync = async (id: string, ...args: unknown[]): Promise<unknown> => {
        const [original, modified] = args;
        if (id === 'vscode.diff' && original instanceof FakeUri && modified instanceof FakeUri) {
            OpenDiff(original, modified);
            return undefined;
        }
        return await commands.get(id)?.(...args);
    };

    const window = {
        get visibleTextEditors(): IFakeEditor[] {
            return visibleEditors;
        },
        tabGroups: {
            get all(): IFakeTabGroup[] {
                return tabGroups;
            },
            onDidChangeTabs,
            onDidChangeTabGroups: CreateEvent<unknown>(),
        },
        onDidChangeVisibleTextEditors,
        createOutputChannel: () => ({
            appendLine: (line: string) => {
                logLines.push(line);
            },
            show: () => undefined,
            dispose: () => undefined,
        }),
        createStatusBarItem: () => ({
            set text(value: string) {
                statusBar.text = value;
            },
            get text(): string {
                return statusBar.text;
            },
            show: () => {
                statusBar.isShown = true;
            },
            hide: () => {
                statusBar.isShown = false;
            },
            dispose: () => undefined,
        }),
        createTextEditorDecorationType: (options: IFakeDecorationType['options']) => {
            const type: IFakeDecorationType = {
                options,
                isDisposed: false,
                dispose: () => {
                    type.isDisposed = true;
                },
            };
            decorationTypes.push(type);
            return type;
        },
        createWebviewPanel: () => ({
            webview: {
                html: '',
                postMessage: (message: unknown) => {
                    posted.push(structuredClone(message));
                    return Promise.resolve(true);
                },
                onDidReceiveMessage: (callback: (message: unknown) => void) => {
                    receiveFromPanel = callback;
                    return { dispose: () => undefined };
                },
                asWebviewUri: (uri: FakeUri) => uri,
            },
            reveal: () => undefined,
            onDidDispose: () => ({ dispose: () => undefined }),
            dispose: () => undefined,
        }),
        showInputBox: (options: { validateInput?: (value: string) => string | undefined }) => {
            const answer = inputBoxAnswer;
            const problem = answer === undefined ? undefined : options.validateInput?.(answer);
            return Promise.resolve(problem === undefined ? answer : undefined);
        },
        // 一律按第一顆按鈕（確認刪除）
        showWarningMessage: (_message: string, _options: unknown, ...items: string[]) => Promise.resolve(items[0]),
        showInformationMessage: () => Promise.resolve(undefined),
        showQuickPick: (items: { label: string }[]) => Promise.resolve(items.find((item) => item.label === 'Dark')),
    };

    /** 內容來源說內容換了：開著的那幾份照 VS Code 的做法重讀，再發文件變更事件 */
    const ReloadDocument = (uri: FakeUri): void => {
        for (const editor of visibleEditors) {
            if (editor.document.uri.toString() === uri.toString()) {
                editor.document = CreateDocument(uri);
                onDidChangeTextDocument.Fire({ document: editor.document });
            }
        }
    };

    const ReadSetting = (key: string): unknown => settings.workspace[key] ?? settings.user[key];

    const workspace = {
        textDocuments: [],
        onDidChangeConfiguration,
        onDidChangeTextDocument,
        registerTextDocumentContentProvider: (scheme: string, provider: IFakeContentProvider) => {
            contentProviders.set(scheme, provider);
            return provider.onDidChange?.(ReloadDocument) ?? { dispose: () => undefined };
        },
        openTextDocument: (uri: FakeUri) => Promise.resolve(CreateDocument(uri)),
        fs: {
            readFile: (uri: FakeUri) =>
                Promise.resolve(
                    new TextEncoder().encode(
                        uri.path.endsWith('language-configuration.json') ? LANGUAGE_CONFIGURATION : '',
                    ),
                ),
        },
        getConfiguration: (section?: string) => {
            const Full = (key: string): string => (section === undefined ? key : `${section}.${key}`);
            return {
                get: (key: string) => ReadSetting(Full(key)),
                inspect: (key: string) => ({
                    globalValue: settings.user[Full(key)],
                    workspaceValue: settings.workspace[Full(key)],
                }),
                update: (key: string, value: unknown, target: number) => {
                    const full = Full(key);
                    const store = target === WORKSPACE_TARGET ? settings.workspace : settings.user;
                    if (value === undefined) {
                        Reflect.deleteProperty(store, full);
                    } else {
                        store[full] = structuredClone(value);
                    }
                    FireConfigurationChange(full);
                    return Promise.resolve();
                },
            };
        },
    };

    const module: Record<string, unknown> = {
        Uri: FakeUri,
        Range: FakeRange,
        TabInputTextDiff: FakeTabInputTextDiff,
        window,
        workspace,
        extensions: {
            all: [
                {
                    packageJSON: {
                        contributes: {
                            languages: [{ id: 'typescript', configuration: './language-configuration.json' }],
                        },
                    },
                    extensionUri: FakeUri.from({ scheme: 'file', path: '/typescript-extension' }),
                },
            ],
            onDidChange: CreateEvent<unknown>(),
        },
        commands: {
            registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
                commands.set(id, callback);
                return { dispose: () => undefined };
            },
            executeCommand: ExecuteCommandAsync,
        },
        // VS Code 的顯示語言：英文（介面語言設成「跟著 VS Code」時就是英文）
        env: { language: 'en' },
        EventEmitter: FakeEventEmitter,
        Disposable: {
            from: (...items: { dispose: () => void }[]) => ({
                dispose: () => {
                    for (const item of items) {
                        item.dispose();
                    }
                },
            }),
        },
        ConfigurationTarget: { Global: 1, Workspace: WORKSPACE_TARGET },
        StatusBarAlignment: { Left: 1, Right: 2 },
        ViewColumn: { Beside: -2 },
        QuickPickItemKind: { Separator: -1 },
        DecorationRangeBehavior: { ClosedClosed: 1 },
    };

    return {
        module,
        settings,
        decorationTypes,
        posted,
        logLines,
        statusBar,
        GetVisibleEditors: () => visibleEditors,
        ReceiveFromPanel: (message) => {
            receiveFromPanel(message);
        },
        SetInputBoxAnswer: (answer) => {
            inputBoxAnswer = answer;
        },
        FireConfigurationChange,
        ExecuteCommandAsync,
    };
};

export { CreateFakeVscode, FakeRange, FakeUri };
export type { IFakeDecorationType, IFakeEditor, IFakeVscode };
