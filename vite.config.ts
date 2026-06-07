import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
  },
  server: {
    port: 3000,
    open: true,
  },
});
