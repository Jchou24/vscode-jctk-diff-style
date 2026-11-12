/**
 * 設定面板（webview）的擴充端：開面板、送狀態、收面板的訊息。
 *
 * 面板的畫面與互動在 `webview/panel.ts`（打包成 `dist/panel.js`）；
 * 這裡只負責把它放進 VS Code、轉送訊息——要做什麼由呼叫端的 `OnMessageAsync` 決定。
 */
import * as l10n from '@vscode/l10n';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

import {
    type IPanelState,
    type IStateMessage,
    PanelMessageTypes,
    type PanelToHostMessage,
    ParsePanelMessage,
} from './panelMessages';
import type { IDiffStylePreset } from './presetModel';

/** webview 的種類 id */
const PANEL_VIEW_TYPE = 'jctkDiffStyle.panel';

/** 打包後的面板程式（相對擴充根目錄） */
const PANEL_SCRIPT_PATH = ['dist', 'panel.js'] as const;

/** 面板的對外介面 */
interface IPanelHost {
    /** 開啟（或帶到前面） */
    Show: () => void;
    /** 送一份新狀態給面板（清單、目前那一組、主題、被蓋掉的鍵有變時） */
    PostState: () => void;
    /** 介面語言換了：分頁標題換掉、送一份新狀態（面板照裡面的翻譯表重畫） */
    Relocalize: () => void;
    /** 關閉面板 */
    Destroy: () => void;
}

/** 建立面板需要的東西 */
interface IPanelHostOptions {
    extensionUri: vscode.Uri;
    /** 目前的狀態 */
    GetState: () => IPanelState;
    /** 目前那一組（面板送來的值缺欄位時補的值） */
    GetActivePreset: () => IDiffStylePreset;
    /** 處理面板送來的訊息 */
    OnMessageAsync: (message: PanelToHostMessage) => Promise<void>;
    /** 診斷紀錄 */
    Log: (message: string) => void;
}

/**
 * 面板分頁的標題（照目前的介面語言）。
 * @returns 標題
 */
const PanelTitle = (): string => l10n.t('Diff Style');

/**
 * 面板的 HTML：只放殼與腳本，畫面由腳本畫（`lang` 也由腳本照狀態設）。
 * @param webview 面板
 * @param scriptUri 面板程式的位址
 * @returns HTML
 */
const BuildHtml = (webview: vscode.Webview, scriptUri: vscode.Uri): string => {
    const nonce = randomBytes(16).toString('base64');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${PanelTitle()}</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${webview.asWebviewUri(scriptUri).toString()}"></script>
</body>
</html>`;
};

/**
 * 建立面板的擴充端。
 * @param options 建立面板需要的東西
 * @returns 面板的對外介面
 */
const CreatePanelHost = (options: IPanelHostOptions): IPanelHost => {
    let panel: vscode.WebviewPanel | undefined = undefined;
    const distUri = vscode.Uri.joinPath(options.extensionUri, PANEL_SCRIPT_PATH[0]);

    const PostState = (): void => {
        if (panel === undefined) {
            return;
        }
        const message: IStateMessage = { type: PanelMessageTypes.State, state: options.GetState() };
        void panel.webview
            .postMessage(message)
            .then(undefined, (error: unknown) =>
                options.Log(l10n.t('Failed to send state to the panel: {0}', String(error))),
            );
    };

    const HandleMessage = (value: unknown): void => {
        const message = ParsePanelMessage(value, options.GetActivePreset());
        if (message === undefined) {
            options.Log(l10n.t('The panel sent an unrecognized message: {0}', JSON.stringify(value)));
            return;
        }
        options
            .OnMessageAsync(message)
            .catch((error: unknown) =>
                options.Log(l10n.t('Failed to handle panel message {0}: {1}', message.type, String(error))),
            );
    };

    const Show = (): void => {
        if (panel !== undefined) {
            panel.reveal();
            return;
        }
        panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, PanelTitle(), vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [distUri],
        });
        panel.webview.html = BuildHtml(panel.webview, vscode.Uri.joinPath(options.extensionUri, ...PANEL_SCRIPT_PATH));
        panel.webview.onDidReceiveMessage(HandleMessage);
        panel.onDidDispose(() => {
            panel = undefined;
        });
    };

    const Relocalize = (): void => {
        if (panel !== undefined) {
            panel.title = PanelTitle();
        }
        PostState();
    };

    const Destroy = (): void => {
        panel?.dispose();
        panel = undefined;
    };

    return { Show, PostState, Relocalize, Destroy };
};

export { CreatePanelHost };
export type { IPanelHost };
