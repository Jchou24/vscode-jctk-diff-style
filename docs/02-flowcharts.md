# 02. 流程圖

- 節點用程式碼裡的名字；文字只補圖講不出的
- 各流程的規則與理由在對應的那一份規格

---

## 啟用與停用

```mermaid
flowchart TD
    A["VS Code 啟動完成（onStartupFinished）"] --> B["ReadPresetState：讀合併後的參數組並收斂"]
    B --> C[FindWorkspaceOverrides：記下被蓋掉的鍵]
    C --> D[ApplyActivePreset]
    D --> D1[decorator.SetPreset：重建 decoration]
    D --> D2[refreshTask.Request：重畫框線]
    D --> D3[applyColorsTask.Request：寫顏色]
    D --> D4[UpdateStatusBar]
    D --> E[註冊命令、狀態列、事件]
    E --> F[診斷紀錄：幾組、哪一層、目前那一組、主題]
    G[停用 deactivate] --> H[applyColorsTask.FlushAsync]
    H --> I[savePresetsTask.FlushAsync]
```

---

## 設定變更事件

每個判斷各自獨立，一次事件可能走好幾條。

```mermaid
flowchart TD
    A[onDidChangeConfiguration] --> LANG{影響 jctkDiffStyle.language？}
    LANG -- 是 --> LANG1["ChangeLanguage（見〈介面語言換了〉）"] --> B
    LANG -- 否 --> B{"影響 jctkDiffStyle.presets 或 activePreset？"}
    B -- 是 --> C{IsOwnPresetWrite：自己寫的回音？}
    C -- 否 --> D["ReadPresetState → ApplyActivePreset → panel.PostState"]
    C -- 是 --> E
    D --> E
    B -- 否 --> E{影響 workbench.colorTheme？}
    E -- 是 --> F["applyColorsTask.Request → panel.PostState"]
    E -- 否 --> G
    F --> G{影響 workbench.colorCustomizations？}
    G -- 是 --> H{被蓋掉的鍵跟上次不同？}
    H -- 是 --> I[panel.PostState]
    H -- 否 --> J
    I --> J
    G -- 否 --> J{影響 diffEditor？}
    J -- 是 --> K[refreshTask.Request]
    J -- 否 --> L[結束]
    K --> L
```

---

## 畫面變化 → 重畫框線

```mermaid
flowchart TD
    A1[看得到的編輯器變了] --> R[refreshTask.Request]
    A2[分頁或分頁群組變了] --> R
    A3[看得到的文件內容變了] --> R
    A4[參數組換了或值變了] --> R
    A5[diffEditor 設定變了] --> R
    R --> S[RefreshAsync]
    S --> T[FindVisibleDiffs：記下有沒有 diff]
    T --> T1{"有任何 decoration？（框線關掉、註解色不換時沒有）"}
    T1 -- 否 --> Z1
    T1 -- 是 --> U{還有下一個分頁群組？}
    U -- 否 --> Z[不在任何 diff 裡的編輯器：清掉 decoration]
    Z --> Z1[UpdateStatusBar：有 diff 才顯示]
    U -- 是 --> V{目前的分頁是 TabInputTextDiff？}
    V -- 否 --> U
    V -- 是 --> W["FindDiffSides：文件對得上、欄號是空的或等於群組那一欄"]
    W --> X{兩側都找不到？}
    X -- 是 --> X1[診斷紀錄：看得到的編輯器與欄號] --> U
    X -- 否 --> Y["OpenDocumentAsync：兩側的文件（單欄時原本那一側不是編輯器）"]
    Y --> Y1["ComputeDiffRanges（見下方〈框線範圍〉）"]
    Y1 --> Y2{有新增那一側的編輯器？}
    Y2 -- 是 --> Y3[DecorateSideAsync：框線 ＋ 註解色]
    Y2 -- 否 --> Y4
    Y3 --> Y4{有刪除那一側的編輯器、而且不是同一個？}
    Y4 -- 是 --> Y5[DecorateSideAsync]
    Y4 -- 否 --> U
    Y5 --> U
```

---

## 框線範圍

```mermaid
flowchart TD
    A[ComputeDiffRanges] --> B["vscode-diff 比對（照讀 diffAlgorithm、ignoreTrimWhitespace、maxComputationTime）"]
    B --> C{還有下一段變動？}
    C -- 否 --> Z[回傳框線範圍與改動的字]
    C -- 是 --> D{只有一側有行？}
    D -- 是 --> E["WholeLines：那一側每一行（空行除外）一段"]
    E --> S[CollectSegments]
    D -- 否 --> F{還有下一段 innerChanges？}
    F -- 否 --> C
    F -- 是 --> G{起點落在那一側的變動行裡？}
    G -- 否 --> F
    G -- 是 --> H["SplitByLine：切成每行一段、丟掉長度 0 的"]
    H --> S
    S --> S1[每一段都算進改動的字]
    S1 --> S2{"整行？（這一段以外只剩空白）"}
    S2 -- 是 --> S3{isWholeLineIncluded？}
    S3 -- 否 --> N[不畫框線]
    S3 -- 是 --> S4
    S2 -- 否 --> S4{只改了空白？}
    S4 -- 是 --> S5{isWhitespaceIncluded？}
    S5 -- 否 --> N
    S5 -- 是 --> Y[畫框線]
    S4 -- 否 --> Y
    N --> T{這一批是整段新增 / 刪除？}
    Y --> T
    T -- 是 --> C
    T -- 否 --> F
```

---

## 註解色

```mermaid
flowchart TD
    A[DecorateSideAsync] --> B{參數組有註解色？}
    B -- 否 --> Z[這一側不換註解色]
    B -- 是 --> C{這一側有改動的字？}
    C -- 否 --> Z
    C -- 是 --> D[commentSyntax.GetAsync：語言 id → 註解符號]
    D --> E{已經讀過？}
    E -- 是 --> G
    E -- 否 --> F["從擴充的 package.json 找語言設定檔 → ParseCommentSyntax"]
    F --> G{有註解符號？}
    G -- 否 --> Z
    G -- 是 --> H["FindCommentRanges：從檔頭掃到最後一個有改動的字的行"]
    H --> I{有行註解？}
    I -- 是 --> J[略過同一行引號裡的註解符號]
    I -- 否 --> K[不略過引號]
    J --> L[與改動的字取交集]
    K --> L
    L --> M[setDecorations：註解色]
```

---

## 面板的訊息

```mermaid
flowchart TD
    A[面板 postMessage] --> B{ParsePanelMessage 認得？}
    B -- 否 --> B1[診斷紀錄：認不得的訊息]
    B -- 是 --> C{訊息種類}
    C -- Ready --> P[panel.PostState]
    C -- Update --> D{名字是目前那一組？}
    D -- 否 --> D1[診斷紀錄：略過]
    D -- 是 --> D2["換掉那一組 → ApplyActivePreset → savePresetsTask.Request（不回送狀態）"]
    C -- Select --> SEL["ResolveActivePreset：找不到用第一組"] --> COMMIT
    C -- Add --> ADD{輸入名字}
    ADD -- Esc --> END[不動]
    ADD -- 名字 --> ADD1[複製目前那一組、切過去] --> COMMIT
    C -- Rename --> REN{輸入名字}
    REN -- "Esc 或沒變" --> END
    REN -- 新名字 --> REN1[改名] --> COMMIT
    C -- Remove --> REM{只剩一組？}
    REM -- 是 --> REM1[跳訊息：至少要留一組]
    REM -- 否 --> REM2{確認刪除？}
    REM2 -- 否 --> END
    REM2 -- 是 --> REM3[刪除、目前那一組換成第一組] --> COMMIT
    C -- OpenSample --> SAMPLE[OpenSampleAsync]
    COMMIT["CommitStructureChange：ApplyActivePreset → savePresetsTask.Request → panel.PostState"]
```

---

## 面板收到狀態

```mermaid
flowchart TD
    A["擴充 panel.PostState（帶介面語言；不是英文時帶翻譯表）"] --> B{ParseStateMessage 認得？}
    B -- 否 --> B1[不重畫]
    B -- 是 --> D{帶著翻譯表？}
    D -- 是 --> D1["l10n.config(翻譯表)：之後取的字是那個語言"] --> L
    D -- 否 --> D2["l10n.config(空的)：回到英文原文"] --> L
    L["html lang ＝ 實際用的語言"] --> R[整個重畫]
```

---

## 介面語言換了

```mermaid
flowchart TD
    A["面板「語言」下拉選了另一個"] --> B["SetLanguage → WriteLanguageSettingAsync（使用者設定；auto 時拿掉這個鍵）"]
    M[手改 jctkDiffStyle.language] --> C
    B --> C{"設定變更事件：jctkDiffStyle.language？"}
    C -- 否 --> END[不動]
    C -- 是 --> D["ResolveDisplayLanguage：auto 時看 VS Code 的顯示語言；沒有翻譯用英文"]
    D --> E["ApplyDisplayLanguage：換掉 l10n.t 的翻譯表"]
    E --> F{有任何一層設定存了參數組？}
    F -- 否 --> F1["RenameBuiltInPresets：內建兩組改成這個語言的名字"] --> G
    F -- 是 --> G[參數組不動]
    G --> H["狀態列 → 範例 diff 重讀 → 面板換標題、重送狀態"]
```

---

## 寫到哪一層

```mermaid
flowchart TD
    A["GetPresetLayer：inspect jctkDiffStyle.presets"] --> B{專案設定有值？}
    B -- 是 --> W[專案設定]
    B -- 否 --> U[使用者設定]
    W --> C
    U --> C
    C[同一層寫入] --> C1["WritePresetStateAsync：presets、activePreset"]
    C --> C2[ApplyColorsAsync]
    C2 --> C3["BuildColorCustomizations：讀那一層自己的值、只換受管的鍵"]
    C3 --> C4{跟那一層現在的值一樣？}
    C4 -- 是 --> C5[不寫]
    C4 -- 否 --> C6[config.update 到那一層]
    C --> D["FindWorkspaceOverrides：GetOverridingValues"]
    D --> D1{寫入層}
    D1 -- 使用者設定 --> D2[看專案設定與專案資料夾設定]
    D1 -- 專案設定 --> D3[看專案資料夾設定]
    D2 --> D4[FindOverriddenKeys：目前主題那一格裡的受管鍵]
    D3 --> D4
    R["命令：移除寫進設定的顏色"] --> R1[使用者設定：拿掉受管的鍵]
    R1 --> R2{專案設定有 workbench.colorCustomizations？}
    R2 -- 是 --> R3[專案設定：拿掉受管的鍵]
    R2 -- 否 --> R4[結束]
    R3 --> R4
```

---

## 節流

```mermaid
flowchart TD
    A[Request] --> B{正在跑？}
    B -- 是 --> C[記下：跑完再跑一次]
    B -- 否 --> D{已經排好了？}
    D -- 是 --> E[不動：排好的那一次會讀到最新的狀態]
    D -- 否 --> F[排定：距上次開跑滿最短間隔時跑]
    F --> G[跑工作]
    G --> H{擲錯？}
    H -- 是 --> H1[onError：記進診斷紀錄]
    H -- 否 --> I
    H1 --> I{跑的期間有人要求？}
    I -- 是 --> A
    I -- 否 --> J[結束]
    K[FlushAsync] --> K1[排好的那一次馬上跑、等它跑完]
    K1 --> K2[跑的期間又排好的那一次也跑完]
    L[Destroy] --> L1[取消排好的那一次與「跑完再跑一次」]
```
