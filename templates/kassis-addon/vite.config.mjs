import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const externals = createRequire(import.meta.url)('@kassis/addon-sdk/browser-externals.json');

export default defineConfig({
  build: {
    lib: {
      entry: 'frontend/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: Object.keys(externals),
    },
  },
});
