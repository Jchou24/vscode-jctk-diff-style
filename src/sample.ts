/**
 * 範例 diff：註冊虛擬文件、開啟 diff 分頁（兩側的內容與每一個案例見 `sampleLines.ts`）。
 */
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { GetSampleLines } from './sampleLines';

/** 範例文件的 scheme——只在這個擴充裡用 */
const SAMPLE_SCHEME = 'jctk-diff-style-sample';

/** 原本那一側（副檔名決定語法上色） */
const ORIGINAL_PATH = '/original.ts';

/** 修改後那一側 */
const MODIFIED_PATH = '/modified.ts';

/** 範例的兩側 */
const SAMPLE_URIS = [ORIGINAL_PATH, MODIFIED_PATH].map((path) => vscode.Uri.from({ scheme: SAMPLE_SCHEME, path }));

/** 範例的內容換了（介面語言換了）：開著的範例跟著重讀 */
const sampleChanged = new vscode.EventEmitter<vscode.Uri>();

/** 提供範例文件的內容（唯讀的虛擬文件） */
const sampleProvider: vscode.TextDocumentContentProvider = {
    onDidChange: sampleChanged.event,
    provideTextDocumentContent: (uri: vscode.Uri): string => {
        const lines = GetSampleLines();
        return (uri.path === ORIGINAL_PATH ? lines.original : lines.modified).join('\n');
    },
};

/**
 * 註冊範例文件的來源。
 * @returns 收尾用的 Disposable
 */
const RegisterSampleProvider = (): vscode.Disposable =>
    vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(SAMPLE_SCHEME, sampleProvider),
        sampleChanged,
    );

/** 介面語言換了：開著的範例換成那個語言的註解 */
const RefreshSample = (): void => {
    for (const uri of SAMPLE_URIS) {
        sampleChanged.fire(uri);
    }
};

/** 開啟範例 diff */
const OpenSampleAsync = async (): Promise<void> => {
    const [original, modified] = SAMPLE_URIS;
    await vscode.commands.executeCommand('vscode.diff', original, modified, l10n.t('Jctk Diff Style Sample'));
};

export { OpenSampleAsync, RefreshSample, RegisterSampleProvider };
