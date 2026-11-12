// 程式碼檢查：ESLint 與 typescript-eslint 的建議規則
// 擴充端跑在 Node（extension host），面板（src/webview）跑在瀏覽器
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['node_modules/', 'dist/', '*.vsix'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,mts,mjs}'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['src/webview/**/*.ts'],
        languageOptions: { globals: globals.browser },
    },
);
