/**
 * 節流 ＋ 序列化的工作（`src/throttledTask.ts`）。
 *
 * 面板拖動時連續送值：畫面要邊拖邊變（不能等停下來），寫設定檔又不能每一格都寫、兩次寫入不能交錯。
 * 守的是那三件事，外加「停用時還沒寫的值要寫完」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateThrottledTask } from '../src/throttledTask';

/** 兩次開跑之間的最短間隔 */
const INTERVAL_MS = 100;

/**
 * 一個由測試決定何時完成的工作。
 * @returns 工作本體、開跑次數、讓目前這一次完成
 */
const CreateControlledTask = (): { task: () => Promise<void>; GetStarts: () => number; FinishCurrent: () => void } => {
    let starts = 0;
    let Finish: (() => void) | undefined = undefined;
    const task = (): Promise<void> => {
        starts += 1;
        return new Promise<void>((resolve) => {
            Finish = resolve;
        });
    };
    return {
        task,
        GetStarts: () => starts,
        FinishCurrent: () => {
            Finish?.();
            Finish = undefined;
        },
    };
};

describe('CreateThrottledTask', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('第一次要求馬上跑', async () => {
        const controlled = CreateControlledTask();
        const throttled = CreateThrottledTask(controlled.task, INTERVAL_MS, () => undefined);
        throttled.Request();
        await vi.advanceTimersByTimeAsync(0);
        expect(controlled.GetStarts()).toBe(1);
    });

    it('[DS-45] 跑的期間來的要求合併成一次，跑完、隔滿間隔才跑', async () => {
        const controlled = CreateControlledTask();
        const throttled = CreateThrottledTask(controlled.task, INTERVAL_MS, () => undefined);
        throttled.Request();
        await vi.advanceTimersByTimeAsync(0);
        throttled.Request();
        throttled.Request();
        throttled.Request();
        controlled.FinishCurrent();
        await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
        expect(controlled.GetStarts()).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(controlled.GetStarts()).toBe(2);
        controlled.FinishCurrent();
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
        expect(controlled.GetStarts()).toBe(2);
    });

    it('同一時間只跑一個', async () => {
        let running = 0;
        let maxRunning = 0;
        const throttled = CreateThrottledTask(
            async () => {
                running += 1;
                maxRunning = Math.max(maxRunning, running);
                await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 2));
                running -= 1;
            },
            0,
            () => undefined,
        );
        for (let index = 0; index < 5; index++) {
            throttled.Request();
            await vi.advanceTimersByTimeAsync(INTERVAL_MS);
        }
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10);
        expect(maxRunning).toBe(1);
    });

    it('擲錯交給 onError，之後的要求照跑', async () => {
        const errors: unknown[] = [];
        let starts = 0;
        const throttled = CreateThrottledTask(
            () => {
                starts += 1;
                return Promise.reject(new Error(`第 ${starts} 次`));
            },
            0,
            (error) => errors.push(error),
        );
        throttled.Request();
        await vi.advanceTimersByTimeAsync(0);
        throttled.Request();
        await vi.advanceTimersByTimeAsync(0);
        expect(starts).toBe(2);
        expect(errors).toHaveLength(2);
    });

    it('[DS-45] FlushAsync：不等間隔，把排好的那一次跑完', async () => {
        const controlled = CreateControlledTask();
        const throttled = CreateThrottledTask(controlled.task, INTERVAL_MS, () => undefined);
        throttled.Request();
        await vi.advanceTimersByTimeAsync(0);
        controlled.FinishCurrent();
        await vi.advanceTimersByTimeAsync(0);
        throttled.Request();
        const flushed = throttled.FlushAsync();
        expect(controlled.GetStarts()).toBe(2);
        controlled.FinishCurrent();
        await flushed;
    });

    it('Destroy：排好還沒跑的那一次不跑', async () => {
        const controlled = CreateControlledTask();
        const throttled = CreateThrottledTask(controlled.task, INTERVAL_MS, () => undefined);
        throttled.Request();
        throttled.Destroy();
        await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
        expect(controlled.GetStarts()).toBe(0);
    });
});
