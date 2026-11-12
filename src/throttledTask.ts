/**
 * 節流 ＋ 序列化的非同步工作。
 *
 * 面板拖動滑桿時每一格都送一次值，而畫面要跟著手即時變 ⇒ 不能等停下來才跑（防抖），要邊拖邊跑：
 * - 第一次要求馬上跑；跑的期間來的要求合併成「跑完再跑一次」，用的是那時最新的狀態
 * - 兩次之間至少隔 `minIntervalMs`：寫設定檔是慢的，不讓它每一格都寫
 * - 同一時間只跑一個：兩次寫入不交錯，後寫的一定是新的值
 */

/** 節流後的工作 */
interface IThrottledTask {
    /** 要求執行 */
    Request: () => void;
    /** 不等間隔，馬上把還沒跑的那一次跑完（停用擴充時用） */
    FlushAsync: () => Promise<void>;
    /** 取消還沒跑的那一次 */
    Destroy: () => void;
}

/**
 * 建立節流的工作。
 * @param task 要跑的工作（每次都讀當下最新的狀態）
 * @param minIntervalMs 兩次開跑之間至少隔多久（毫秒）
 * @param onError 工作擲錯時的處理（留紀錄）；擲錯不會讓之後的要求失效
 * @returns 節流後的工作
 */
const CreateThrottledTask = (
    task: () => Promise<void>,
    minIntervalMs: number,
    onError: (error: unknown) => void,
): IThrottledTask => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    let isRunning = false;
    let isPending = false;
    let lastStartedAt = Number.NEGATIVE_INFINITY;
    let current: Promise<void> = Promise.resolve();

    const RunAsync = async (): Promise<void> => {
        timer = undefined;
        isRunning = true;
        isPending = false;
        lastStartedAt = Date.now();
        try {
            await task();
        } catch (error: unknown) {
            onError(error);
        } finally {
            isRunning = false;
        }
        if (isPending) {
            Request();
        }
    };

    const Request = (): void => {
        if (isRunning) {
            isPending = true;
            return;
        }
        if (timer !== undefined) {
            return;
        }
        const waitMs = Math.max(0, lastStartedAt + minIntervalMs - Date.now());
        timer = setTimeout(() => {
            current = RunAsync();
        }, waitMs);
    };

    const RunScheduledNowAsync = async (): Promise<void> => {
        if (timer !== undefined) {
            clearTimeout(timer);
            current = RunAsync();
        }
        await current;
    };

    const FlushAsync = async (): Promise<void> => {
        await RunScheduledNowAsync();
        // 跑的期間又來了要求 ⇒ 它已排好下一次，一併跑完
        await RunScheduledNowAsync();
    };

    const Destroy = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        isPending = false;
    };

    return { Request, FlushAsync, Destroy };
};

export { CreateThrottledTask };
export type { IThrottledTask };
