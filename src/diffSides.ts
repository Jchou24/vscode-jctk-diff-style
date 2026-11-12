/**
 * 從看得到的編輯器裡，挑出某個 diff 分頁的兩側。
 *
 * diff 的兩側在擴充眼中是兩個一般的 `TextEditor`，**沒有 `viewColumn`**：
 * VS Code 以「分頁的控制項 === 這個編輯器」找它在哪一欄，而 diff 分頁的控制項是整個 diff 元件、
 * 不是裡面那兩個編輯器（`mainThreadEditor.ts` 的 `matches`）。
 * 同一個檔案在別欄以一般分頁開著時，那個編輯器有自己的欄 ⇒ 不會被挑進來。
 */

/** 挑選時要知道的編輯器資訊 */
interface IEditorInfo {
    /** 文件位置（`Uri.toString()`） */
    uri: string;
    /** 所在的欄；diff 的兩側是 undefined */
    viewColumn: number | undefined;
}

/** 挑出來的兩側 */
interface IDiffSides<T> {
    original: T | undefined;
    modified: T | undefined;
}

/**
 * 挑出 diff 分頁的兩側。
 * @param editors 看得到的編輯器
 * @param Describe 取出編輯器的位置與欄
 * @param groupColumn diff 分頁所在的分頁群組的欄
 * @param originalUri 原本那一側的文件位置
 * @param modifiedUri 修改後那一側的文件位置
 * @returns 兩側的編輯器；找不到的那一側為 undefined
 */
const FindDiffSides = <T>(
    editors: readonly T[],
    Describe: (editor: T) => IEditorInfo,
    groupColumn: number,
    originalUri: string,
    modifiedUri: string,
): IDiffSides<T> => {
    const candidates = editors.filter((editor) => {
        const { viewColumn } = Describe(editor);
        // 等於群組那一欄的也收：VS Code 哪天替 diff 的兩側補上欄號時照樣找得到
        return viewColumn === undefined || viewColumn === groupColumn;
    });
    return {
        original: candidates.find((editor) => Describe(editor).uri === originalUri),
        modified: candidates.find((editor) => Describe(editor).uri === modifiedUri),
    };
};

export { FindDiffSides };
export type { IDiffSides, IEditorInfo };
