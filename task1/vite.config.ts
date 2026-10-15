import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    // Adds #include "./common.wgsl" support inside .wgsl files
    // and enables HMR when a shader file changes.
    glsl({
      include: ['**/*.wgsl'],
      minify: false,
    }),
  ],
  build: {
    // WebGPU only exists in recent browsers, so there's no reason to
    // transpile down further - this also allows top-level await, which
    // the examples use for `const { device } = await initWebGPU(...)`.
    target: 'esnext',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    // localhost is a secure context, so navigator.gpu works fine in dev
    // without any HTTPS setup.
    port: 5173,
  },
});
