/**
 * 自己寫設定造成的變更事件（`src/echoGuard.ts`）。
 *
 * 參數組分兩個鍵寫：寫到一半時設定裡的內容跟寫進去的那一份對不上，
 * 判成「別處改的」就會重讀、把剛選的那一組改回去——守的就是這件事。
 */
import { describe, expect, it } from 'vitest';

import { CreateEchoGuard } from '../src/echoGuard';

describe('CreateEchoGuard', () => {
    it('[DS-43] 寫的期間：內容對不上（只寫完一個鍵）也算回音', () => {
        const guard = CreateEchoGuard();
        guard.BeginWrite('新清單+新的那一組');
        expect(guard.IsEcho('新清單+舊的那一組')).toBe(true);
    });

    it('[DS-43] 寫完之後：內容就是寫進去的那一份 ⇒ 回音', () => {
        const guard = CreateEchoGuard();
        guard.BeginWrite('A');
        guard.EndWrite();
        expect(guard.IsEcho('A')).toBe(true);
    });

    it('寫完之後：內容不一樣 ⇒ 別處改的', () => {
        const guard = CreateEchoGuard();
        guard.BeginWrite('A');
        guard.EndWrite();
        expect(guard.IsEcho('手改過的')).toBe(false);
    });

    it('還沒寫過 ⇒ 都是別處改的', () => {
        expect(CreateEchoGuard().IsEcho('A')).toBe(false);
    });

    it('兩次寫入重疊：兩次都寫完才不算寫的期間', () => {
        const guard = CreateEchoGuard();
        guard.BeginWrite('A');
        guard.BeginWrite('B');
        guard.EndWrite();
        expect(guard.IsEcho('其他')).toBe(true);
        guard.EndWrite();
        expect(guard.IsEcho('其他')).toBe(false);
    });
});
