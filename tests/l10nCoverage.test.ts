/**
 * 中英文介面的翻譯齊不齊。
 *
 * 原文（英文）寫在程式裡、翻譯寫在另一個檔：漏翻一句不會有任何錯誤，畫面上只是那一句變回英文；
 * 改了原文而沒改翻譯也一樣。這一支把兩邊對起來：
 * - `package.json` 的 `%鍵名%` ↔ `package.nls.json`（英文）與每一個 `package.nls.<語言>.json`
 * - 程式裡每一處 `l10n.t('…')` 的原文 ↔ 每一個 `l10n/bundle.l10n.<語言>.json`
 *
 * 翻譯檔由目錄找出來，不列清單：加一種語言時，這一支自動把它也對起來。
 * 另外對照介面語言的三處：設定的 `enum`、`LanguageSettings`、打包進擴充的翻譯表（`src/displayLanguage.ts`）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GetTranslatedLanguages } from '../src/displayLanguage';
import { LanguageSettings } from '../src/languageSettings';
import { IsRecord } from '../src/presetModel';

/** 本擴充的根目錄 */
const TOOL_ROOT = resolve(import.meta.dirname, '..');

/** 英文的 `package.json` 翻譯檔 */
const DEFAULT_NLS_FILE = 'package.nls.json';

/** `package.json` 的翻譯檔；第一組是語言 */
const NLS_FILE_PATTERN = /^package\.nls(?:\.([\w-]+))?\.json$/;

/** 程式裡的翻譯表所在的目錄（`package.json` 的 `l10n`） */
const BUNDLE_DIRECTORY = 'l10n';

/** 程式裡的翻譯表（英文原文 → 那個語言）；第一組是語言 */
const BUNDLE_FILE_PATTERN = /^bundle\.l10n\.([\w-]+)\.json$/;

/** `package.json` 裡的 `%鍵名%` */
const NLS_PLACEHOLDER_PATTERN = /^%([^%]+)%$/;

/** 每一處 `l10n.t(`（含 `vscode.l10n.t(`） */
const L10N_CALL_PATTERN = /l10n\.t\(/g;

/** `l10n.t(` 後面第一個參數是字串字面值的那幾處 */
const L10N_LITERAL_PATTERN = /l10n\.t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

/** 原文裡的 `{0}`、`{1}`… */
const ARGUMENT_PATTERN = /\{\d+\}/g;

/**
 * 沿著鍵往下取值（JSON 讀回來的值當成不可信，任一層不是物件就是 undefined）。
 * @param value 起點
 * @param keys 一層一層的鍵
 * @returns 取到的值
 */
const GetPath = (value: unknown, ...keys: string[]): unknown =>
    keys.reduce<unknown>((current, key) => (IsRecord(current) ? current[key] : undefined), value);

/**
 * 讀一個 JSON 檔。
 * @param file 相對本擴充根目錄的路徑
 * @returns 內容
 */
const ReadJson = (file: string): unknown => JSON.parse(readFileSync(join(TOOL_ROOT, file), 'utf8'));

/**
 * 讀一個字串對字串的翻譯檔。
 * @param file 相對本擴充根目錄的路徑
 * @returns 鍵 → 文字
 */
const ReadStringTable = (file: string): Record<string, string> => {
    const table = ReadJson(file);
    if (typeof table !== 'object' || table === null || Array.isArray(table)) {
        throw new Error(`${file} 不是物件`);
    }
    const entries = Object.entries(table);
    const invalid = entries.filter(([, value]) => typeof value !== 'string').map(([key]) => key);
    if (invalid.length > 0) {
        throw new Error(`${file} 有不是字串的值：${invalid.join('、')}`);
    }
    return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
};

/**
 * 找出值裡每一個 `%鍵名%`。
 * @param value `package.json` 的任一部分
 * @returns 鍵名
 */
const CollectNlsKeys = (value: unknown): string[] => {
    if (typeof value === 'string') {
        const match = NLS_PLACEHOLDER_PATTERN.exec(value);
        return match?.[1] === undefined ? [] : [match[1]];
    }
    if (Array.isArray(value)) {
        return value.flatMap(CollectNlsKeys);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(CollectNlsKeys);
    }
    return [];
};

/** 程式裡的 `l10n.t` 呼叫 */
interface ISourceMessages {
    /** 原文 → 出現在哪幾支檔 */
    messages: Map<string, string[]>;
    /** 第一個參數不是字串字面值的那幾支檔：這裡讀不出原文，也就對不到翻譯 */
    nonLiteralFiles: string[];
}

/**
 * 讀出程式裡每一處 `l10n.t` 的原文。
 * @returns 原文與讀不出原文的檔
 */
const CollectSourceMessages = (): ISourceMessages => {
    const messages = new Map<string, string[]>();
    const nonLiteralFiles: string[] = [];
    const sourceDirectory = join(TOOL_ROOT, 'src');
    const files = readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' }).filter((file) =>
        file.endsWith('.ts'),
    );
    for (const file of files) {
        const text = readFileSync(join(sourceDirectory, file), 'utf8');
        const literals = [...text.matchAll(L10N_LITERAL_PATTERN)];
        if (literals.length !== (text.match(L10N_CALL_PATTERN) ?? []).length) {
            nonLiteralFiles.push(file);
        }
        for (const match of literals) {
            const message = (match[1] ?? match[2] ?? '').replace(/\\(.)/g, '$1');
            messages.set(message, [...(messages.get(message) ?? []), file]);
        }
    }
    return { messages, nonLiteralFiles };
};

/**
 * 原文與翻譯的 `{n}` 要一樣：少了一個，帶進去的值就不見了。
 * @param text 文字
 * @returns 排序過的 `{n}`
 */
const ArgumentsOf = (text: string): string[] => [...text.matchAll(ARGUMENT_PATTERN)].map((match) => match[0]).sort();

/** 一個翻譯檔 */
interface ILanguageFile {
    /** 相對本擴充根目錄的路徑 */
    file: string;
    /** 語言；英文的 `package.nls.json` 沒有 */
    language: string | undefined;
}

/**
 * 列出目錄裡的翻譯檔。
 * @param directory 相對本擴充根目錄的目錄
 * @param pattern 檔名；第一組是語言
 * @returns 翻譯檔
 */
const ListLanguageFiles = (directory: string, pattern: RegExp): ILanguageFile[] =>
    readdirSync(join(TOOL_ROOT, directory))
        .flatMap((name) => {
            const match = pattern.exec(name);
            return match === null ? [] : [{ file: join(directory, name), language: match[1] }];
        })
        .sort((left, right) => left.file.localeCompare(right.file));

const nlsFiles = ListLanguageFiles('.', NLS_FILE_PATTERN);
const bundleFiles = ListLanguageFiles(BUNDLE_DIRECTORY, BUNDLE_FILE_PATTERN);

it('[DS-55] 每一種語言兩份翻譯都有：package.json 的、程式裡的', () => {
    expect(nlsFiles.map((entry) => entry.file)).toContain(DEFAULT_NLS_FILE);
    const nlsLanguages = nlsFiles.flatMap((entry) => (entry.language === undefined ? [] : [entry.language]));
    expect(nlsLanguages.length).toBeGreaterThan(0);
    expect(bundleFiles.map((entry) => entry.language)).toEqual(nlsLanguages);
});

it('[DS-55] 打包進擴充的翻譯表就是 l10n/ 裡的那幾份', () => {
    expect([...GetTranslatedLanguages()].sort()).toEqual(bundleFiles.map((entry) => entry.language));
});

it('[DS-55] 介面語言的設定值：package.json 的 enum 與 LanguageSettings 一樣，每一個都有翻譯（英文是原文）', () => {
    const values = GetPath(
        ReadJson('package.json'),
        'contributes',
        'configuration',
        'properties',
        'jctkDiffStyle.language',
        'enum',
    );
    expect(values).toEqual(Object.values(LanguageSettings));
    const translated = new Set(GetTranslatedLanguages());
    const untranslated = Object.values(LanguageSettings).filter(
        (setting) =>
            setting !== LanguageSettings.Auto && setting !== LanguageSettings.English && !translated.has(setting),
    );
    expect(untranslated).toEqual([]);
});

describe('package.json 的翻譯', () => {
    const keys = [...new Set(CollectNlsKeys(ReadJson('package.json')))].sort();

    it('package.json 有用到 %鍵名%', () => {
        expect(keys.length).toBeGreaterThan(0);
    });

    for (const { file } of nlsFiles) {
        it(`[DS-55] ${file}：每一個 %鍵名% 都有，也沒有多出來的`, () => {
            expect(Object.keys(ReadStringTable(file)).sort()).toEqual(keys);
        });
    }
});

describe('程式裡的翻譯', () => {
    const { messages, nonLiteralFiles } = CollectSourceMessages();

    it('程式裡有用到 l10n.t', () => {
        expect(messages.size).toBeGreaterThan(0);
    });

    it('[DS-55] l10n.t 的第一個參數都是字串字面值（不然對不到翻譯）', () => {
        expect(nonLiteralFiles).toEqual([]);
    });

    for (const { file } of bundleFiles) {
        const bundle = ReadStringTable(file);

        it(`[DS-55] ${file}：每一句原文都有翻譯，也沒有程式裡已經不用的`, () => {
            const missing = [...messages.keys()].filter((message) => !(message in bundle));
            const unused = Object.keys(bundle).filter((message) => !messages.has(message));
            expect({ missing, unused }).toEqual({ missing: [], unused: [] });
        });

        it(`[DS-55] ${file}：每一句翻譯的 {0}、{1}… 跟原文一樣`, () => {
            const mismatched = Object.entries(bundle)
                .filter(([message, translation]) => ArgumentsOf(message).join() !== ArgumentsOf(translation).join())
                .map(([message]) => message);
            expect(mismatched).toEqual([]);
        });
    }
});
