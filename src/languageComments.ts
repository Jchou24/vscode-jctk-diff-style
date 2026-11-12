/**
 * 依語言 id 取得註解符號：從已安裝擴充的 `package.json` 找到那個語言的 `language-configuration.json` 讀出來。
 *
 * VS Code 沒有「某個語言的註解符號是什麼」的 API；內建語言也是由內建擴充貢獻的，同一條路找得到。
 * 讀過的結果留著，擴充有增減時整份重找。
 */
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { type ICommentSyntax, ParseCommentSyntax } from './commentSyntax';
import { IsRecord } from './presetModel';

/** 取註解符號的對外介面 */
interface ICommentSyntaxProvider {
    /**
     * 取得某個語言的註解符號。
     * @param languageId 文件的語言 id
     * @returns 註解符號；那個語言沒有語言設定、或設定裡沒有註解符號時為 undefined
     */
    GetAsync: (languageId: string) => Promise<ICommentSyntax | undefined>;
    /** 停止監看擴充的增減 */
    Destroy: () => void;
}

/**
 * 從所有擴充的 `package.json` 收集「語言 id → 語言設定檔」。
 * @returns 對照表；同一個語言有多個擴充貢獻時用先找到的那一個
 */
const CollectConfigurationFiles = (): Map<string, vscode.Uri> => {
    const files = new Map<string, vscode.Uri>();
    for (const extension of vscode.extensions.all) {
        const manifest: unknown = extension.packageJSON;
        const contributes = IsRecord(manifest) ? manifest.contributes : undefined;
        const languages = IsRecord(contributes) ? contributes.languages : undefined;
        if (!Array.isArray(languages)) {
            continue;
        }
        for (const language of languages) {
            if (
                IsRecord(language) &&
                typeof language.id === 'string' &&
                typeof language.configuration === 'string' &&
                !files.has(language.id)
            ) {
                files.set(language.id, vscode.Uri.joinPath(extension.extensionUri, language.configuration));
            }
        }
    }
    return files;
};

/**
 * 建立取註解符號的物件。
 * @param log 診斷紀錄
 * @returns 取註解符號的對外介面
 */
const CreateCommentSyntaxProvider = (log: (message: string) => void): ICommentSyntaxProvider => {
    let files: Map<string, vscode.Uri> | undefined = undefined;
    const cache = new Map<string, ICommentSyntax | undefined>();
    const extensionsWatcher = vscode.extensions.onDidChange(() => {
        files = undefined;
        cache.clear();
    });

    const GetAsync = async (languageId: string): Promise<ICommentSyntax | undefined> => {
        if (cache.has(languageId)) {
            return cache.get(languageId);
        }
        files ??= CollectConfigurationFiles();
        const file = files.get(languageId);
        let syntax: ICommentSyntax | undefined = undefined;
        if (file === undefined) {
            log(l10n.t('Language "{0}" has no language configuration; comment color stays as is', languageId));
        } else {
            try {
                syntax = ParseCommentSyntax(new TextDecoder().decode(await vscode.workspace.fs.readFile(file)));
            } catch (error: unknown) {
                log(
                    l10n.t(
                        'Failed to read the configuration of language "{0}": {1}: {2}',
                        languageId,
                        file.toString(),
                        String(error),
                    ),
                );
            }
            if (syntax === undefined) {
                log(
                    l10n.t(
                        'The configuration of language "{0}" has no comment symbols: {1}',
                        languageId,
                        file.toString(),
                    ),
                );
            }
        }
        cache.set(languageId, syntax);
        return syntax;
    };

    return { GetAsync, Destroy: () => extensionsWatcher.dispose() };
};

export { CreateCommentSyntaxProvider };
export type { ICommentSyntaxProvider };
