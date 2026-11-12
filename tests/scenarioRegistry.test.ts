/**
 * 測試情境（`docs/09-test-scenarios.md`）與測試的對照。
 *
 * 情境寫在文件、守著它的測試名稱帶著同一個編號（`[DS-01]`）。
 * 兩邊各改各的時候不會有任何錯誤：文件說有測試守著、其實沒有，或測試帶著已經拿掉的編號。
 * ⇒ 這一支把兩邊對起來。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** 本擴充的根目錄 */
const TOOL_ROOT = resolve(import.meta.dirname, '..');

/** 情境文件 */
const SCENARIO_DOC = join(TOOL_ROOT, 'docs', '09-test-scenarios.md');

/** 測試目錄 */
const TESTS_DIRECTORY = join(TOOL_ROOT, 'tests');

/** 情境的驗證方式 */
enum VerificationKinds {
    Automatic = '自動',
    Manual = '手動',
}

/** 文件表格裡的一列情境：`| DS-01 | 做什麼 | 看到什麼 | 自動 |` */
const SCENARIO_ROW_PATTERN = /^\|\s*(DS-\d{2})\s*\|.*\|\s*(自動|手動)\s*\|\s*$/;

/** 測試名稱裡的情境編號 */
const SCENARIO_TAG_PATTERN = /\[(DS-\d{2})\]/g;

/**
 * 讀出文件登記的每一條情境。
 * @returns 編號 → 驗證方式
 */
const ReadRegisteredScenarios = (): Map<string, VerificationKinds> => {
    const scenarios = new Map<string, VerificationKinds>();
    for (const line of readFileSync(SCENARIO_DOC, 'utf8').split('\n')) {
        const match = SCENARIO_ROW_PATTERN.exec(line);
        const [, id, kind] = match ?? [];
        if (id === undefined || kind === undefined) {
            continue;
        }
        expect(scenarios.has(id), `${id} 在文件裡登記了兩次`).toBe(false);
        scenarios.set(
            id,
            kind === VerificationKinds.Automatic ? VerificationKinds.Automatic : VerificationKinds.Manual,
        );
    }
    return scenarios;
};

/**
 * 讀出每一支測試檔帶的情境編號。
 * @returns 編號 → 帶著它的測試檔
 */
const ReadTaggedScenarios = (): Map<string, string[]> => {
    const tags = new Map<string, string[]>();
    const files = readdirSync(TESTS_DIRECTORY, { recursive: true, encoding: 'utf8' }).filter((file) =>
        file.endsWith('.test.ts'),
    );
    for (const file of files) {
        for (const match of readFileSync(join(TESTS_DIRECTORY, file), 'utf8').matchAll(SCENARIO_TAG_PATTERN)) {
            const id = match[1];
            if (id !== undefined) {
                tags.set(id, [...(tags.get(id) ?? []), file]);
            }
        }
    }
    return tags;
};

describe('測試情境與測試的對照', () => {
    const registered = ReadRegisteredScenarios();
    const tagged = ReadTaggedScenarios();

    it('文件有登記情境，而且每一列都讀得懂（寫壞的列不會被安靜地跳過）', () => {
        expect(registered.size).toBeGreaterThan(0);
        const rows = readFileSync(SCENARIO_DOC, 'utf8')
            .split('\n')
            .filter((line) => line.startsWith('| DS-'));
        expect(rows.filter((line) => !SCENARIO_ROW_PATTERN.test(line))).toEqual([]);
        expect(rows.length).toBe(registered.size);
    });

    it('標「自動」的每一條，都有測試帶著它', () => {
        const missing = [...registered]
            .filter(([id, kind]) => kind === VerificationKinds.Automatic && !tagged.has(id))
            .map(([id]) => id);
        expect(missing).toEqual([]);
    });

    it('測試帶的每一個編號，文件都有、而且標「自動」', () => {
        const unregistered = [...tagged.keys()].filter((id) => registered.get(id) !== VerificationKinds.Automatic);
        expect(unregistered.map((id) => `${id}（${(tagged.get(id) ?? []).join('、')}）`)).toEqual([]);
    });
});
