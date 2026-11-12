/**
 * 打包：`pnpm build`（`node build.mts`）跑它；打包選項只在這裡，冒煙測試也讀同一份。
 *
 * - `dist/extension.js`：擴充本體，跑在 extension host（Node、CommonJS）；`vscode` 由 VS Code 提供，不打包
 * - `dist/panel.js`：設定面板，跑在 webview 裡的瀏覽器
 * - 執行期相依（`vscode-diff`、`jsonc-parser`）打包進 `dist/`：vsix 以 `--no-dependencies` 打包，
 *   pnpm 的 `node_modules` 是 symlink，vsce 收不進去
 * - `mainFields` 先讀 `module`：`jsonc-parser` 的 `main` 是 UMD，裡面的 require 是 esbuild 收不到的動態寫法，
 *   打包後一執行就找不到 `./impl/format`
 */
import esbuild, { type BuildOptions } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本擴充的根目錄（打包的進入點與產出都相對它） */
const TOOL_ROOT = resolve(fileURLToPath(import.meta.url), '..');

/**
 * 擴充本體的打包選項。
 * @returns 每次一份新的物件
 */
const GetExtensionBuildOptions = (): BuildOptions => ({
    absWorkingDir: TOOL_ROOT,
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    mainFields: ['module', 'main'],
    external: ['vscode'],
    outfile: 'dist/extension.js',
});

/**
 * 設定面板的打包選項。
 * @returns 每次一份新的物件
 */
const GetPanelBuildOptions = (): BuildOptions => ({
    absWorkingDir: TOOL_ROOT,
    entryPoints: ['src/webview/panel.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    outfile: 'dist/panel.js',
});

/** 以 `node build.mts` 直接執行時才打包；被測試 import 時只提供選項 */
const isRunDirectly = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (isRunDirectly) {
    await esbuild.build(GetExtensionBuildOptions());
    await esbuild.build(GetPanelBuildOptions());
}

export { GetExtensionBuildOptions, GetPanelBuildOptions };
