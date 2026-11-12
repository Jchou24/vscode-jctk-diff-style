/**
 * 參數組的正規化（`src/presetModel.ts`）。
 *
 * 參數組存在 VS Code 設定、人可以手改；讀回來的值壞掉時擴充不能整個不動，
 * 要收斂回完整的形狀——這支測試守的就是「壞的值進來，出去的一定能用」。
 */
import { describe, expect, it } from 'vitest';

import {
    BorderStyles,
    ClonePreset,
    CreateUniqueName,
    DIFF_COLOR_FIELDS,
    GetDefaultPresets,
    GetReadableLineNumbers,
    NormalizePresets,
    READABLE_COMMENT_COLOR,
    RenameBuiltInPresets,
    ResolveActivePreset,
} from '../src/presetModel';

describe('DIFF_COLOR_FIELDS', () => {
    it('與底色的欄位一一對應', () => {
        const [preset] = GetDefaultPresets();
        expect([...DIFF_COLOR_FIELDS].sort()).toEqual(Object.keys(preset?.colors ?? {}).sort());
    });
});

describe('NormalizePresets', () => {
    it('[DS-26] 不是陣列 ⇒ 內建的兩組', () => {
        expect(NormalizePresets(undefined).map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
        expect(NormalizePresets({ name: 'A' }).map((preset) => preset.name)).toEqual(['Bright', 'Dark']);
    });

    it('[DS-24][DS-26] 一筆合法的都沒有 ⇒ 內建的兩組', () => {
        expect(NormalizePresets([null, 3, { name: '  ' }, { colors: {} }]).map((preset) => preset.name)).toEqual([
            'Bright',
            'Dark',
        ]);
    });

    it('缺的欄位用亮色那一組補；沒寫註解色、行號色 ⇒ 不換', () => {
        const [fallback] = GetDefaultPresets();
        const [preset] = NormalizePresets([{ name: 'A' }]);
        expect(preset).toEqual({ name: 'A', colors: fallback?.colors, border: fallback?.border });
    });

    it('內建的亮色那一組預設換註解色與行號色、暗色那一組不換', () => {
        const [bright, dark] = GetDefaultPresets();
        expect(bright?.commentColor).toBe(READABLE_COMMENT_COLOR);
        expect(bright?.lineNumbers).toEqual(GetReadableLineNumbers());
        expect(dark).not.toHaveProperty('commentColor');
        expect(dark).not.toHaveProperty('lineNumbers');
    });

    it('[DS-24] 型別不對、超出範圍的值換成預設或夾回範圍', () => {
        const [fallback] = GetDefaultPresets();
        const [preset] = NormalizePresets([
            {
                name: ' A ',
                colors: { insertedLine: 'red', insertedText: '#ABCDEF80' },
                border: { width: 99, radius: -3, style: 'wavy', isEnabled: 'yes', insertedColor: '#123456' },
                commentColor: 'gray',
            },
        ]);
        expect(preset?.name).toBe('A');
        expect(preset?.colors.insertedLine).toBe(fallback?.colors.insertedLine);
        expect(preset?.colors.insertedText).toBe('#abcdef80');
        expect(preset?.border.width).toBe(4);
        expect(preset?.border.radius).toBe(0);
        expect(preset?.border.style).toBe(BorderStyles.Solid);
        expect(preset?.border.isEnabled).toBe(fallback?.border.isEnabled);
        expect(preset?.border.insertedColor).toBe('#123456');
        expect(preset).not.toHaveProperty('commentColor');
    });

    it('註解色合法時保留（轉小寫）', () => {
        const [preset] = NormalizePresets([{ name: 'A', commentColor: '#959CAB' }]);
        expect(preset?.commentColor).toBe('#959cab');
    });

    it('行號色合法時保留（轉小寫）；個別欄位不合法時補讀得到的那一色', () => {
        const readable = GetReadableLineNumbers();
        const [valid, partial] = NormalizePresets([
            { name: 'A', lineNumbers: { color: '#AABBCC', activeColor: '#FFFFFF80' } },
            { name: 'B', lineNumbers: { color: 'gray' } },
        ]);
        expect(valid?.lineNumbers).toEqual({ color: '#aabbcc', activeColor: '#ffffff80' });
        expect(partial?.lineNumbers).toEqual(readable);
    });

    it('行號色不是物件 ⇒ 不換', () => {
        const [preset] = NormalizePresets([{ name: 'A', lineNumbers: '#c6c6c6' }]);
        expect(preset).not.toHaveProperty('lineNumbers');
    });

    it('只改了空白的也框：預設不框；設了布林值就照設的', () => {
        const [missing, enabled] = NormalizePresets([
            { name: 'A' },
            { name: 'B', border: { isWhitespaceIncluded: true } },
        ]);
        expect(missing?.border.isWhitespaceIncluded).toBe(false);
        expect(enabled?.border.isWhitespaceIncluded).toBe(true);
    });

    it('內建兩組的名字由呼叫端給（擴充端給照顯示語言翻好的）', () => {
        expect(NormalizePresets(undefined, { bright: '亮色', dark: '暗色' }).map((preset) => preset.name)).toEqual([
            '亮色',
            '暗色',
        ]);
        expect(NormalizePresets([], { bright: '亮色', dark: '暗色' }).map((preset) => preset.name)).toEqual([
            '亮色',
            '暗色',
        ]);
    });

    it('[DS-56] 換介面語言：內建兩組換名字、值與其他組不動，目前那一組跟著換', () => {
        const english = { bright: 'Bright', dark: 'Dark' };
        const chinese = { bright: '亮色', dark: '暗色' };
        const [bright, dark] = NormalizePresets(undefined, english);
        if (bright === undefined || dark === undefined) {
            throw new Error('內建應有兩組');
        }
        const edited = { ...bright, border: { ...bright.border, width: 4 } };
        const own = ClonePreset(dark, '我的');
        const renamed = RenameBuiltInPresets({ presets: [edited, dark, own], activeName: 'Dark' }, english, chinese);
        expect(renamed.presets.map((preset) => preset.name)).toEqual(['亮色', '暗色', '我的']);
        expect(renamed.presets[0]?.border.width).toBe(4);
        expect(renamed.activeName).toBe('暗色');
        expect(RenameBuiltInPresets({ presets: [own], activeName: '我的' }, english, chinese).activeName).toBe('我的');
    });

    it('[DS-25] 名字重複只留第一筆', () => {
        const presets = NormalizePresets([
            { name: 'A', border: { width: 2 } },
            { name: 'A', border: { width: 3 } },
            { name: 'B' },
        ]);
        expect(presets.map((preset) => [preset.name, preset.border.width])).toEqual([
            ['A', 2],
            ['B', 1],
        ]);
    });
});

describe('GetDefaultPresets', () => {
    it('每次一份新的：改了上一次拿到的不影響下一次', () => {
        const first = GetDefaultPresets();
        const [preset] = first;
        if (preset !== undefined) {
            preset.colors.insertedLine = '#000000';
            preset.border.width = 4;
        }
        const [again] = GetDefaultPresets();
        expect(again?.colors.insertedLine).not.toBe('#000000');
        expect(again?.border.width).toBe(1);
    });
});

describe('ResolveActivePreset', () => {
    const presets = NormalizePresets([{ name: 'A' }, { name: 'B' }]);

    it('依名字找', () => {
        expect(ResolveActivePreset(presets, 'B').name).toBe('B');
    });

    it('找不到用第一組', () => {
        expect(ResolveActivePreset(presets, 'Z').name).toBe('A');
    });

    it('清單是空的用內建的第一組', () => {
        expect(ResolveActivePreset([], 'A').name).toBe('Bright');
    });
});

describe('CreateUniqueName', () => {
    const presets = NormalizePresets([{ name: '亮色 複本' }, { name: '亮色 複本 2' }]);

    it('沒人用就照原樣', () => {
        expect(CreateUniqueName('暗色', presets)).toBe('暗色');
    });

    it('有人用就往後編號', () => {
        expect(CreateUniqueName('亮色 複本', presets)).toBe('亮色 複本 3');
    });
});

describe('ClonePreset', () => {
    it('[DS-33] 深拷貝：改複本不影響原本那一組', () => {
        const [original] = NormalizePresets([
            { name: 'A', commentColor: '#959cab', lineNumbers: { color: '#c6c6c6', activeColor: '#ffffff' } },
        ]);
        if (original === undefined) {
            throw new Error('NormalizePresets 應至少回一組');
        }
        const clone = ClonePreset(original, 'B');
        clone.colors.insertedLine = '#000000';
        clone.border.width = 4;
        if (clone.lineNumbers !== undefined) {
            clone.lineNumbers.color = '#000000';
        }
        expect(clone.name).toBe('B');
        expect(clone.commentColor).toBe('#959cab');
        expect(original.colors.insertedLine).not.toBe('#000000');
        expect(original.border.width).toBe(1);
        expect(original.lineNumbers?.color).toBe('#c6c6c6');
    });
});
