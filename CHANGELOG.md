# Changelog

## 0.2.1

- README: side-by-side comparison with VS Code's built-in diff (still image and animation)
- Source code is on GitHub

## 0.2.0

- The built-in **Bright** preset has a new look
    - No whole-line background: only the changed characters and the line number gutter are tinted
    - Borders are pale and semi-transparent, with a 2px radius
- Presets already saved in your settings are not changed

## 0.1.0

First release.

- **Borders around changed characters** in the diff view
    - Fully added or removed lines and whitespace-only changes get no border by default; each preset can turn either one on
- **Comment color in diffs only**: changed text inside comments gets its own color; comments in normal editors keep the theme's color
- **Readable line numbers** on the red and green diff gutters
- **Live settings panel** for background colors, borders, comment color and line number colors
- **Presets**: keep several and switch from the panel or the status bar
    - Presets in a project's `.vscode/settings.json` travel with the repository
- **Sample diff** that shows every case on one screen
- **English and Traditional Chinese**
    - Follows VS Code's display language by default
    - The settings panel can switch this extension's language without changing VS Code's

---

# 變更紀錄

## 0.2.1

- README 加上跟 VS Code 原生的比較圖（靜態圖與動畫）
- 原始碼放上 GitHub

## 0.2.0

- 內建的 **亮色** 換了樣子
    - 整行不上底色，只有改動的字與行號欄上色
    - 框線改成淡色、半透明、圓角 2px
- 已經存進設定的參數組不會變

## 0.1.0

第一版。

- **改動的字加框線**
    - 預設不框整段新增或刪除的行，也不框只改了空白的；每一組參數都可以各自打開
- **只在 diff 裡換註解色**：註解裡改動的字換一個顏色；平常的編輯器裡，註解照主題原本的顏色
- **看得清楚的行號**：diff 的紅色、綠色行號欄上也讀得到
- **即時預覽的設定面板**：底色、框線、註解色、行號色
- **參數組**：存好幾組，從面板或狀態列切換
    - 參數組放在專案的 `.vscode/settings.json`，就跟著 repo 走
- **範例 diff**：所有狀況在同一個畫面
- **英文與繁體中文**
    - 預設跟著 VS Code 的顯示語言
    - 設定面板可以只換這支擴充的語言，VS Code 的不動
