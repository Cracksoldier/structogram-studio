/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
export default defineConfig(({ mode }) => ({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [angular({ tsconfig: mode === 'test' ? 'tsconfig.spec.json' : 'tsconfig.app.json' })],
  resolve: { mainFields: ['module'] },
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
}));
