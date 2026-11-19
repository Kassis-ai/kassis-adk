import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.{js,mjs,ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '__tests__/fixtures/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
