# vscode-jctk-diff-style 規格

- 擴充的行為合約、判定規則、設計理由與運作流程
- 給使用者看的介紹與操作：上一層的 [README.md](../README.md)（英文在前、中文在後）
- 本機安裝、打包、測試：[10-development.md](10-development.md)
- 型別以程式碼為準：規格只寫行為與理由，型別一律指到 `src/` 的那一個符號

## 檔案

| #   | 檔案                                         | 標題                                    | 章節                                                                                                           |
| --- | -------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| —   | README.md                                    | 規格落地頁                              | 檔案清單、架構速查、閱讀建議                                                                                   |
| 01  | [01-overview.md](01-overview.md)             | 總覽                                    | 為什麼有它；範圍；獨立；介面語言；名詞；檔案分工；外部套件與打包                                               |
| 02  | [02-flowcharts.md](02-flowcharts.md)         | 流程圖                                  | 啟用與停用；設定變更事件；重畫框線；框線範圍；註解色；面板的訊息；面板收到狀態；介面語言換了；寫到哪一層；節流 |
| 03  | [03-diff-ranges.md](03-diff-ranges.md)       | 框線與改動的字                          | 兩種輸出；照讀 VS Code 的比對設定；判定規則與對照表；為什麼這樣判；找 diff 的兩側；框線樣式；限制              |
| 04  | [04-comment-color.md](04-comment-color.md)   | 註解色                                  | 換哪些字；為什麼用 decoration；註解符號從哪來；怎麼找註解；限制                                                |
| 05  | [05-presets.md](05-presets.md)               | 參數組                                  | 欄位與落點；內建的參數組；讀回來的值怎麼收斂；目前那一組；新增、改名、刪除、切換                               |
| 06  | [06-settings.md](06-settings.md)             | 設定的讀寫                              | 照分層讀；寫回參數組那一層；受管的鍵與主題格子；移除顏色；介面語言；被蓋掉的警告；回音；節流                   |
| 07  | [07-panel.md](07-panel.md)                   | 設定面板                                | 開法；擴充與面板之間的訊息；畫面                                                                               |
| 08  | [08-entry-points.md](08-entry-points.md)     | 啟用、命令、狀態列、範例 diff、診斷紀錄 | 啟用；命令；狀態列；範例 diff；診斷紀錄                                                                        |
| 09  | [09-test-scenarios.md](09-test-scenarios.md) | 測試情境                                | 每一條情境「做什麼 → 看到什麼」與誰守著；手動驗的那幾條怎麼走                                                  |
| 10  | [10-development.md](10-development.md)       | 開發                                    | 本機安裝；開始開發；指令；改完要跑；發佈新版本；README 怎麼寫                                                  |

## 架構速查

```text
extension.ts  參數組狀態的單一來源（清單、目前那一組）
├─ settingsStore.ts   讀寫 VS Code 設定
│   ├─ settingLayers.ts   寫到哪一層
│   ├─ colorSettings.ts   受管的鍵、主題格子、被蓋掉的鍵
│   └─ echoGuard.ts       自己寫設定的回音
├─ decorator.ts       找 diff 的兩側、算範圍、畫 decoration
│   ├─ diffSides.ts
│   ├─ diffRanges.ts      ← vscode-diff
│   └─ commentRanges.ts   ← languageComments.ts ← commentSyntax.ts ← jsonc-parser
├─ panelHost.ts       面板的擴充端  ⇄  webview/panel.ts（訊息：panelMessages.ts）
├─ sample.ts          範例 diff  ← sampleLines.ts
├─ throttledTask.ts   重畫、寫顏色、存參數組的節流
└─ displayLanguage.ts 介面語言（翻譯表打包在這裡）← languageSettings.ts

兩端共用：presetModel.ts（參數組的型別與收斂）、colorHex.ts（色碼換算）
```

## 閱讀建議

| 目的                         | 讀                                       |
| ---------------------------- | ---------------------------------------- |
| 第一次了解                   | 01 → 02 → 03                             |
| 第一次改這支擴充             | 10 → 01 → 09                             |
| 框線框得不對                 | 03（對照表）→ 02〈框線範圍〉〈重畫框線〉 |
| 註解色沒換、換錯             | 04 → 02〈註解色〉                        |
| 參數組不見、被改回去、寫錯檔 | 06（寫到哪一層、回音）→ 05（收斂）       |
| 改設定面板                   | 07 → 05                                  |
| 加一個命令、改啟用           | 08 → 02〈啟用與停用〉                    |
| 改了行為、要補測試           | 09 → 對應的那一份                        |
| 加介面文字、加一種語言       | 01〈介面語言〉                           |
