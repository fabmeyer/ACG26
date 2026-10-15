import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { glob } from 'glob';
import glsl from 'vite-plugin-glsl';

// Every examples/*/index.html becomes its own page + build entry.
// Add a new example just by adding a new folder - no config changes needed.
const exampleEntries = Object.fromEntries(
  glob.sync('examples/*/index.html').map((file) => {
    const name = file.split('/')[1]; // e.g. "01-triangle"
    return [name, resolve(__dirname, file)];
  }),
);

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
        ...exampleEntries,
      },
    },
  },
  server: {
    // localhost is a secure context, so navigator.gpu works fine in dev
    // without any HTTPS setup.
    port: 5173,
  },
});
