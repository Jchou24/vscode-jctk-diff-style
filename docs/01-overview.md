# 01. 總覽

## 為什麼有它

- VS Code 內建的 diff 畫面
    - 只改了幾個字的那一行：改動的字的底色跟整行的底色分不太出來
    - 把改動的字的底色調亮：整段新增 / 刪除的行有兩層底色疊在一起，灰色的註解讀不到
    - ⇒ 一組顏色顧不到所有狀況
- 這支擴充做的
    - 改動的字畫框線
        - VS Code 內建的框線色（`diffEditor.insertedTextBorder`）會連整行一起框，只框字要自己畫
    - 設定面板：底色、框線、註解色、行號色，拖動即時看到效果
    - 參數組：存好幾組，一組顧不到時一鍵切換
    - 註解裡改動的字換色，只在 diff 畫面裡
        - VS Code 的註解色設定是整個主題共用的，平常寫 code 時的註解也會跟著變

---

## 範圍

- 涵蓋：一般的 diff 分頁
    - 兩欄
    - 單欄（inline）：只畫新增那一側
- 不涵蓋
    - 多檔 diff（SCM 的 View Changes）與 merge editor：不畫框線
    - 單欄時刪除的那幾行：VS Code 插進編輯器的顯示區塊，decoration 畫不上去
- 發佈在 Visual Studio Marketplace
    - 擴充 ID：`Jchou24.vscode-jctk-diff-style`（publisher `Jchou24`，顯示名稱 JC）
    - 怎麼發新版本見 [10-development.md](10-development.md)〈發佈新版本〉

---

## 獨立

- 這支擴充自成一個專案，不相依 jctk
    - 不 import 任何 jctk 的套件
    - 相依的版本寫在本目錄的 `package.json`
    - 打包、測試、程式碼風格的檢查、F5 的設定都在本目錄
    - 開發用的 Node / pnpm 版本在 `mise.toml`
    - 變更紀錄在本目錄的 `CHANGELOG.md`
- 判準：clone 下來、裝相依之後，打包、測試、檢查、F5 都能用

---

## 介面語言

- 設定 `jctkDiffStyle.language`：這支擴充自己的介面語言，VS Code 的顯示語言不動
    - `auto`（預設）：跟著 VS Code 的顯示語言
        - 中文 (繁體)（`zh-tw`）：繁體中文
        - 其他語言：英文
    - `en`、`zh-tw`：不管 VS Code 是什麼語言
    - 只在使用者設定（`scope: application`）：是個人的偏好，不跟著專案的版控走
    - 選回 `auto` 時拿掉這個鍵，設定檔不留預設值
    - 設定面板最上面的「語言」下拉就是改它（見 [07-panel.md](07-panel.md)〈畫面〉）
- 跟著介面語言的
    - 通知、輸入框、快速選單、狀態列、設定面板、範例 diff 的註解、診斷紀錄
    - 內建兩組參數組的名字：還沒寫進設定時才跟著換（見 [05-presets.md](05-presets.md)〈內建的參數組〉）
    - 換了當場生效，不必重新啟動
- 不跟著介面語言的
    - 命令選擇區裡的命令名、設定頁的說明
        - VS Code 照它自己的顯示語言讀 `package.nls*.json`，擴充改不了
    - 參數組的名字：那是使用者的資料
    - 診斷紀錄的頻道名「Jctk Diff Style」：是名稱
    - 已經開著的範例 diff 分頁標題
- 原文寫英文，翻譯另放
    - `package.json` 給人看的欄位
        - 寫成 `%鍵名%`
        - 英文在 `package.nls.json`，每一種語言一份 `package.nls.<語言>.json`
    - 程式裡的字
        - 寫成 `l10n.t('原文')`（`@vscode/l10n`）
        - 每一種語言一份 `l10n/bundle.l10n.<語言>.json`，鍵是英文原文
        - 翻譯表打包進擴充（`src/displayLanguage.ts`）：換語言時換掉 `@vscode/l10n` 的翻譯表
        - 不用 `vscode.l10n`：它只跟著 VS Code 的顯示語言，擴充沒辦法自己換
    - 設定面板
        - 擴充端把那個語言的翻譯表放進狀態交過去（見 [07-panel.md](07-panel.md)〈擴充 → 面板〉）
- `tests/l10nCoverage.test.ts` 擋
    - 漏翻、翻譯檔裡多出程式已經不用的
    - 翻譯的 `{0}`、`{1}` 跟原文對不上
    - `l10n.t` 的原文不是字串字面值（對不到翻譯）
    - 一種語言只有其中一份翻譯
    - 設定的 `enum`、`LanguageSettings`、打包進擴充的翻譯表、`l10n/` 裡的翻譯檔四處對不上
- 加一種語言
    - 補那兩份翻譯檔
    - `LanguageSettings`、設定的 `enum`、`src/displayLanguage.ts` 的翻譯表清單各加一項
    - 漏了哪一處，上面那支測試會紅

---

## 名詞

- **改動的字**
    - VS Code 在「字」那一層上底色的地方
    - 改了一部分的行：裡面改動的那幾段
    - 整段新增 / 刪除：整行
- **改了一部分的行**
    - 兩側都有行的那一段變動裡的行
- **整段新增 / 刪除**
    - 只有一側有行的那一段變動
- **整行**
    - 一段改動的字以外，那一行只剩空白
    - ex 整段新增的行、縮排沒變而字全換了的行
- **只改了空白**
    - 一段改動的字全是空白
    - ex 外面包了一層而多出來的縮排、行尾空白
- **參數組**
    - 一組樣式：底色、框線、註解色、行號色
- **受管的鍵**
    - 擴充寫進 `workbench.colorCustomizations` 的那幾個色碼名稱
    - 同一個物件裡的其他鍵是使用者自己的，擴充不動
- **主題那一格**
    - `workbench.colorCustomizations` 裡的 `[主題名]`：只套用到那個主題
- **參數組所在的那一層**
    - 專案設定（`.vscode/settings.json`）有參數組就是專案，否則是使用者設定

---

## 檔案分工

- 純邏輯：不 import `vscode`，`tests/` 一檔對一檔的單元測試
    - `presetModel.ts`：參數組的型別、內建的參數組、讀回來的值怎麼收斂
    - `colorHex.ts`：`#rrggbbaa` 與「顏色 ＋ 透明度百分比」的換算
    - `diffRanges.ts`：比對兩側，算出框線範圍與改動的字
    - `diffSides.ts`：從看得到的編輯器挑出 diff 分頁的兩側
    - `commentSyntax.ts`：從 `language-configuration.json` 讀出註解符號
    - `commentRanges.ts`：照註解符號找註解，與改動的字取交集
    - `colorSettings.ts`：參數組 → `workbench.colorCustomizations` 的新值；找出被蓋掉的鍵
    - `settingLayers.ts`：參數組與顏色寫在哪一層
    - `echoGuard.ts`：認出自己寫設定造成的變更事件
    - `throttledTask.ts`：節流 ＋ 序列化的非同步工作
    - `panelMessages.ts`：面板與擴充之間的訊息種類與守門
    - `sampleLines.ts`：範例 diff 兩側的內容（註解跟著介面語言）
    - `languageSettings.ts`：介面語言的設定值
    - `displayLanguage.ts`：介面用哪一個語言、換掉 `l10n.t` 的翻譯表
- 接上 VS Code 的那一層
    - `extension.ts`：進入點；參數組狀態的單一來源；命令、狀態列、設定變更事件
    - `settingsStore.ts`：讀寫 VS Code 設定
    - `decorator.ts`：找出 diff 分頁、算範圍、畫 decoration
    - `languageComments.ts`：從已安裝擴充找出各語言的語言設定檔
    - `panelHost.ts`：設定面板的擴充端
    - `sample.ts`：範例 diff 的虛擬文件與開啟
- 打包與測試
    - `build.mts`：打包選項的單一來源；`node build.mts` 直接執行時打包
    - `vitest.config.mts`：本目錄自己的測試設定（套件是 CommonJS，設定檔要是 `.mts` 才是 ESM）
    - `tests/extensionSmoke.test.ts`：冒煙測試，用 `build.mts` 的選項打包、交給假的 `vscode` 載入
        - 假的 `vscode`：`tests/fakes/fakeVscode.ts`
    - `tests/scenarioRegistry.test.ts`：測試情境（見 [09-test-scenarios.md](09-test-scenarios.md)）與測試名稱的編號對照
- 面板
    - `webview/panel.ts`：跑在 webview 裡的畫面，打包成 `dist/panel.js`
        - 跑在瀏覽器裡，沒有單元測試；它用到的訊息守門與參數組收斂在共用的純邏輯裡，有測試
    - 與擴充端共用 `panelMessages.ts`、`presetModel.ts`、`colorHex.ts`：訊息種類、參數組的型別與收斂、色碼換算只有一份
- 翻譯（見上方〈介面語言〉）
    - `package.nls.json`、`package.nls.<語言>.json`：`package.json` 給人看的欄位
    - `l10n/bundle.l10n.<語言>.json`：程式裡的字（打包進 `dist/`，不另外放進 vsix）
    - `tests/l10nCoverage.test.ts`：翻譯齊不齊
- 給使用者看的
    - `README.md`：介紹與操作
    - `CHANGELOG.md`：變更紀錄；Marketplace 的 Changelog 分頁顯示它
    - `images/icon.png`：擴充圖示（256×256）；原稿是同目錄的 `icon.svg`，不打包

---

## 外部套件

- `vscode-diff`
    - 從 VS Code 原始碼抽出的同一套比對
    - 為什麼自己算：VS Code 不把它算好的「哪幾個字改了」交給擴充
        - `TextEditor.diffInformation` 只到行，而且是 proposed API
    - 框線才會落在 VS Code 上色的那幾個字上
- `jsonc-parser`
    - 讀 `language-configuration.json`：那個檔是 JSONC（可帶註解與結尾逗號）
    - VS Code 自己解析設定檔用的也是它
- `@vscode/l10n`
    - 擴充端與設定面板都用它取字
        - 翻譯表可以隨時換：介面語言能不跟著 VS Code
        - 面板跑在 webview 裡，本來就沒有 `vscode.l10n`
    - VS Code 官方給 webview 與子行程用的同一套，`{0}` 的帶入規則與 `vscode.l10n.t` 一樣
- 打包：esbuild，選項只在 `build.mts`（`pnpm build` 與冒煙測試都讀它）
    - vsix 以 `--no-dependencies` 打包：pnpm 的 `node_modules` 是 symlink，vsce 收不進去
        - ⇒ 執行期相依要打包進 `dist/`
    - `mainFields` 先讀 `module`：`jsonc-parser` 的 `main` 是 UMD
        - 裡面的 require 是 esbuild 收不到的動態寫法，打包後一執行就找不到 `./impl/format`
        - 單元測試照樣綠：vitest 的解析不同
        - ⇒ 先讀 ESM 版；冒煙測試用同一份選項打包，打包壞了它會紅
