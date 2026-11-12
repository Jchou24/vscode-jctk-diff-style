/**
 * 介面用哪一個語言（`src/displayLanguage.ts`、`src/languageSettings.ts`）。
 *
 * 設定是「跟著 VS Code」時看 VS Code 的顯示語言；選了某個語言就用那個，不管 VS Code 是什麼語言。
 * 那個語言沒有翻譯時用英文（原文）。
 */
import * as l10n from '@vscode/l10n';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplyDisplayLanguage, ResolveDisplayLanguage } from '../src/displayLanguage';
import { LanguageSettings, ParseLanguageSetting } from '../src/languageSettings';

describe('ResolveDisplayLanguage', () => {
    it('[DS-58] 跟著 VS Code：VS Code 是繁中就用繁中（大小寫不拘）', () => {
        for (const vscodeLanguage of ['zh-tw', 'zh-TW']) {
            const display = ResolveDisplayLanguage(LanguageSettings.Auto, vscodeLanguage);
            expect(display.language).toBe('zh-tw');
            expect(display.bundle?.Delete).toBe('刪除');
        }
    });

    it('[DS-58] 跟著 VS Code：VS Code 是英文、或是沒有翻譯的語言 ⇒ 英文', () => {
        for (const vscodeLanguage of ['en', 'ja', 'zh-cn']) {
            expect(ResolveDisplayLanguage(LanguageSettings.Auto, vscodeLanguage)).toEqual({ language: 'en' });
        }
    });

    it('[DS-58] 選了某個語言：不管 VS Code 是什麼語言', () => {
        expect(ResolveDisplayLanguage(LanguageSettings.English, 'zh-tw')).toEqual({ language: 'en' });
        expect(ResolveDisplayLanguage(LanguageSettings.TraditionalChinese, 'en').language).toBe('zh-tw');
    });
});

describe('ApplyDisplayLanguage', () => {
    afterEach(() => {
        ApplyDisplayLanguage({ language: LanguageSettings.English });
    });

    it('換成繁中之後 l10n.t 取到繁中；換回英文就是原文', () => {
        ApplyDisplayLanguage(ResolveDisplayLanguage(LanguageSettings.TraditionalChinese, 'en'));
        expect(l10n.t('Delete')).toBe('刪除');
        expect(l10n.t('{0} copy', 'A')).toBe('A 複本');
        ApplyDisplayLanguage(ResolveDisplayLanguage(LanguageSettings.English, 'en'));
        expect(l10n.t('Delete')).toBe('Delete');
        expect(l10n.t('{0} copy', 'A')).toBe('A copy');
    });
});

describe('ParseLanguageSetting', () => {
    it('認得的照收；沒設、手改壞了 ⇒ 跟著 VS Code', () => {
        for (const setting of Object.values(LanguageSettings)) {
            expect(ParseLanguageSetting(setting)).toBe(setting);
        }
        for (const value of [undefined, 'zh-TW', 'ja', 3]) {
            expect(ParseLanguageSetting(value)).toBe(LanguageSettings.Auto);
        }
    });
});
