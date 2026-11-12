/**
 * `#rrggbbaa` 與「顏色 ＋ 透明度百分比」的換算（`src/colorHex.ts`）。
 *
 * 面板的滑桿是百分比、設定存的是十六進位：來回轉一次值要回得來，
 * 否則打開面板什麼都沒動，存回去的顏色就變了。
 */
import { describe, expect, it } from 'vitest';

import { IsHexColor, JoinHexColor, SplitHexColor } from '../src/colorHex';

describe('SplitHexColor', () => {
    it('帶透明度', () => {
        expect(SplitHexColor('#2EA04326')).toEqual({ rgb: '#2ea043', alphaPercent: 15 });
    });

    it('沒帶透明度 ⇒ 不透明', () => {
        expect(SplitHexColor('#3fb950')).toEqual({ rgb: '#3fb950', alphaPercent: 100 });
    });
});

describe('JoinHexColor', () => {
    it('百分比 → 兩位十六進位', () => {
        expect(JoinHexColor('#2ea043', 15)).toBe('#2ea04326');
        expect(JoinHexColor('#2EA043', 0)).toBe('#2ea04300');
    });

    it('超出範圍夾回 0〜100', () => {
        expect(JoinHexColor('#2ea043', -5)).toBe('#2ea04300');
        expect(JoinHexColor('#2ea043', 150)).toBe('#2ea043ff');
    });

    it('[DS-48] 每一個百分比來回轉一次都回得來', () => {
        for (let percent = 0; percent <= 100; percent++) {
            expect(SplitHexColor(JoinHexColor('#123456', percent)).alphaPercent).toBe(percent);
        }
    });
});

describe('IsHexColor', () => {
    it('只收 #rrggbb 與 #rrggbbaa', () => {
        expect(IsHexColor('#123456')).toBe(true);
        expect(IsHexColor('#12345678')).toBe(true);
        expect(IsHexColor('#123')).toBe(false);
        expect(IsHexColor('red')).toBe(false);
        expect(IsHexColor(undefined)).toBe(false);
    });
});
