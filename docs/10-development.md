# 10. 開發

- 給使用者看的介紹與操作：上一層的 [README.md](../README.md)
    - Marketplace 與 VS Code 的擴充詳細頁顯示的就是它
- 規格：[README.md](README.md)

---

## 本機安裝

```bash
pnpm install:vscode
```

- 編譯、打包、裝進 VS Code 一次做完（步驟在 `package.json` 的那個 script，這裡不複述）
- 裝完要 **Reload Window**（Ctrl+Shift+P → Developer: Reload Window）才生效
    - 開著的每一個 VS Code 視窗都要 Reload：沒 Reload 的那一個還跑著舊版，兩個視窗表現不一樣
- ⚠️ 以 vsix 安裝的擴充**預設不自動更新** ⇒ 改了程式碼要重跑上面那一行
- 換回 Marketplace 的版本（之後會自動更新）
    - 版本號跟本機那一份一樣時，`code --install-extension Jchou24.vscode-jctk-diff-style --force` 不會重裝（只回「已經裝了」）
    - ⇒ 先 `code --uninstall-extension Jchou24.vscode-jctk-diff-style`，再 `code --install-extension Jchou24.vscode-jctk-diff-style`

---

## 開始開發

```bash
mise trust       # 第一次：讓 mise 用本目錄的 mise.toml（Node / pnpm 版本）
pnpm install
```

- 這支擴充自成一個專案，不相依 jctk（見 [01-overview.md](01-overview.md)〈獨立〉）
- 設定都在本目錄
    - 打包：`build.mts`
    - 測試：`vitest.config.mts`
    - 程式碼風格：`eslint.config.mjs`、`.prettierrc`
    - F5：`.vscode/launch.json`

---

## 指令

```bash
pnpm build         # 打包：dist/extension.js（extension host）、dist/panel.js（面板）；選項在 build.mts
pnpm typecheck
pnpm test          # 單元測試、冒煙測試（打包後交給假的 vscode 載入）、情境編號對照
pnpm lint          # ESLint ＋ typescript-eslint 的建議規則
pnpm format:check  # Prettier；pnpm format 直接改好
pnpm package       # 打出 vscode-jctk-diff-style.vsix
```

- `pnpm build` 是 `node build.mts`：Node 要能直接執行 TypeScript（22.18 以上）
- F5：以本目錄為 workspace 開 VS Code，開一個載入本擴充的視窗
- 測試情境：[09-test-scenarios.md](09-test-scenarios.md)；新增情境時，守著它的測試名稱帶上同一個編號
- 加介面文字
    - 程式裡用 `@vscode/l10n` 的 `l10n.t('英文原文')`，第一個參數寫字串字面值
        - 不用 `vscode.l10n.t`：它不跟著設定面板選的語言
    - 同一批把翻譯補進每一份 `l10n/bundle.l10n.<語言>.json`；`package.json` 的欄位補進每一份 `package.nls*.json`
    - 漏了 `pnpm test` 會紅；規則見 [01-overview.md](01-overview.md)〈介面語言〉
- 擴充圖示
    - 改 `images/icon.svg`，再轉成 256×256 的 `images/icon.png`（任何 SVG 轉 PNG 的工具都行）
    - Marketplace 只收 PNG：SVG 不打包（`.vscodeignore`）
- 變更紀錄寫在本目錄的 `CHANGELOG.md`
    - 英文在前、中文在後（同 README）
    - 發佈前把「Unreleased ／ 尚未發佈」換成那一版的版本號

---

## 改完要跑

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

---

## 發佈新版本

- 發在 Visual Studio Marketplace，publisher `Jchou24`
- 步驟
    - `package.json` 的 `version` 往上加
    - `CHANGELOG.md` 兩種語言各加一節那個版本號
    - `pnpm build`、`pnpm package` 打出 vsix
    - Marketplace 管理頁（`https://marketplace.visualstudio.com/manage/publishers/Jchou24`）
        - 那支擴充的「⋯」→ Update，上傳新的 vsix
        - 可能會跳 reCAPTCHA，要人來點（第一次上傳跳過、更新那一次沒跳）
        - 上傳後先是 Verifying，掃描完才對外公開（幾分鐘）
- 公開之後驗收
    - 公開頁 `https://marketplace.visualstudio.com/items?itemName=Jchou24.vscode-jctk-diff-style` 寫的是新的版本號
    - 介紹頁的圖真的載入了：看圖的實際寬度（瀏覽器裡 `img.naturalWidth` 大於 0），不是只看 `<img>` 在不在
    - VS Code 的擴充搜尋找得到：搜 `jctk diff style`
- 原始碼在 GitHub：`https://github.com/Jchou24/vscode-jctk-diff-style`（`package.json` 的 `repository`）
    - README 裡的圖、連到其他檔案的連結：打包時 vsce 換成這個 repo 的網址
    - ⇒ 改了 README 用到的圖，要先 push 上去，Marketplace 的介紹頁才看得到

---

## README 怎麼寫

- 上一層的 `README.md` 是給裝這支擴充的人看的
    - 打包進 vsix；Marketplace 與 VS Code 的擴充詳細頁都顯示它
    - 寫給開發者的內容放這份，不放那裡
- 中文與英文寫在同一個檔：英文在前、中文在後
    - Marketplace 只顯示 `README.md`：拆成兩個檔，讀者要離開 Marketplace 才看得到另一種語言
- 圖片寫相對路徑（`images/…`）：打包時 vsce 照 `repository` 換成 GitHub 的網址
    - 不能用 SVG（徽章服務除外）
    - README 用的截圖不打包（`.vscodeignore` 排除 `images/compare.*`）：介紹頁從 GitHub 讀
- 與原生的對照截圖（`images/compare.png`、`compare.gif`）
    - 兩個獨立的 VS Code（一個沒裝擴充、一個裝了）以 `--diff` 開同一份範例 diff 的兩個檔
    - 兩邊同樣的視窗大小、主題（Dark Modern）、設定；錯誤波浪線用顏色設定設成透明
    - 範例改了、預設樣式改了，就要重拍
    - ⚠️ 平常用的 VS Code 有更新還沒裝完時（Windows），另開的獨立 VS Code 起不來
        - 它會先等「更新中」的鎖 30 秒，等不到就自己結束，不出視窗
        - ⇒ 先關掉所有 VS Code 視窗讓更新裝完，再拍
- 兩種語言的內容要一致：改一邊時另一邊同一批改
