import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // core/ 是纯 TS，不需要 DOM 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
