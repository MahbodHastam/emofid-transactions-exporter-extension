import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const here = (path: string) => new URL(path, import.meta.url).pathname;

export default defineConfig({
  root: here('.'),
  publicDir: here('../public'),
  plugins: [vue()],
  resolve: { alias: { 'wxt/browser': here('./mockBrowser.ts') } },
  server: { port: 5199, strictPort: true },
});
