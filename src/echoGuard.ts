/**
 * 認出「自己寫設定造成的變更事件」。
 *
 * 擴充寫參數組時自己也會收到設定變更事件；把它當成別處改的而重讀，會蓋掉記憶體裡較新的狀態。
 * 參數組是兩個鍵、分兩次寫 ⇒ 寫完第一個鍵時的事件裡，第二個鍵還是舊值、跟寫進去的那一份對不上
 * ⇒ 不能只比對內容，寫的期間收到的事件一律算回音。
 */

/** 回音判定 */
interface IEchoGuard {
    /** 開始寫：記下要寫進去的內容 */
    BeginWrite: (serialized: string) => void;
    /** 寫完（不論成敗都要呼叫） */
    EndWrite: () => void;
    /**
     * 這次變更事件是不是自己寫的回音。
     * @param currentSerialized 設定裡現在的內容
     */
    IsEcho: (currentSerialized: string) => boolean;
}

/**
 * 建立回音判定。
 * @returns 回音判定
 */
const CreateEchoGuard = (): IEchoGuard => {
    let lastWritten: string | undefined = undefined;
    let writingCount = 0;
    return {
        BeginWrite: (serialized) => {
            lastWritten = serialized;
            writingCount += 1;
        },
        EndWrite: () => {
            writingCount = Math.max(0, writingCount - 1);
        },
        IsEcho: (currentSerialized) => writingCount > 0 || currentSerialized === lastWritten,
    };
};

export { CreateEchoGuard };
export type { IEchoGuard };
