# Task 1

1. Implement Arcball camera controls for the Torus Knot example with rotate and zoom (with keyboard and mouse).
1. Implement **ONE of the two tasks bellow**:
   2. Implement the Arcball camera also with multi-touch input (e.g. for smartphone/tablet)
   3. Implement some form of guided navigation on the Torus Knot surface (for example: Hoover Cam or walking on Torus Knot surface)

You might add new dependencies via ```npm install```. however, please do so sparsely and quickly explain in ```SOLUTION.txt``` (see below) why you did so. 

## Submission

Upload a zip file of your task_1 folder **without the node_modules folder** and **including a text document called ```SOLUTION.txt``` with 3-5 sentences on what you did and the names of your team members** to OLAT.

Please note that each team member should upload the folder including an individual SOLUTION.txt (e.g. everybody writes their own SOLUTION.txt).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173. `localhost` is a secure
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

