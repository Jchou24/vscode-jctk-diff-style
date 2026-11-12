/**
 * 測試設定：在本目錄 `pnpm test`。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
