# Torus Knot Examples

Vite + TypeScript scaffold for in-class Torus Knot examples.

## Setup

Install Node.js.

```bash
npm install
npm run dev
```

Open http://localhost:5173 — it lists the examples. `localhost` is a secure
context, so `navigator.gpu` works with no HTTPS setup needed.

## Shaders

`.wgsl` files are imported as raw strings via `?raw`:

```ts
import shaderCode from './shader.wgsl?raw';
```

`vite-plugin-glsl` is also enabled, so shaders can share code with
`#include "../_shared/common.wgsl"`-style imports once you have logic you
want to factor out (noise functions, shared structs, etc.), and shader
files hot-reload on save.

## Type checking

WebStorm's TS service + `@webgpu/types` gives live autocomplete on
`GPUDevice`, `GPUBuffer`, etc. Note that `vite build` does **not**
type-check by default (esbuild just strips types) — the `build` script
here runs `tsc --noEmit` first specifically to catch that, and there's a
standalone `npm run typecheck` too.

## Building & deploying

```bash
npm run build
npm run preview   # sanity-check the production build locally
```
