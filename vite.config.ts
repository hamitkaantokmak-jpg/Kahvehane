import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
