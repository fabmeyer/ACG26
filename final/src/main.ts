import { quat } from 'wgpu-matrix';
import { initWebGPU } from './webgpu-init.ts';
import { ArcballCamera } from './arcball.ts';
import { flatControlNet } from './controlNet.ts';
import { PointDragger } from './pointDrag.ts';
import tessellateCode from './shaders/tessellate.wgsl?raw';
import surfaceCode from './shaders/surface.wgsl?raw';
import pointsCode from './shaders/points.wgsl?raw';
import stemsCode from './shaders/stems.wgsl?raw';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const { device, context, format } = await initWebGPU(canvas);

// ---------------------------------------------------------
// Depth buffer and camera
// ---------------------------------------------------------

let depthTexture: GPUTexture | undefined;

function getDepthTexture(): GPUTexture {
  if (depthTexture && depthTexture.width === canvas.width && depthTexture.height === canvas.height) {
    return depthTexture;
  }
  depthTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return depthTexture;
}

const camera = new ArcballCamera(canvas, {
  target: [0, 0, 0],
  distance: 4,
  orientation: quat.fromAxisAngle([1, 0, 0], (50 * Math.PI) / 180),
});

const cameraData = new Float32Array(24);
const cameraBuffer = device.createBuffer({
  label: 'camera',
  size: cameraData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// ---------------------------------------------------------
// Control points
// ---------------------------------------------------------

const net = flatControlNet();
const pointCount = net.countU * net.countV;

// storage buffer, read by the compute pass and the point/line shaders
const controlPointBuffer = device.createBuffer({
  label: 'control points',
  size: net.points.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(controlPointBuffer, 0, net.points);

// selected point for highlighting
const selectionData = new Int32Array([-1, 0, 0, 0]);
const selectionBuffer = device.createBuffer({
  label: 'selection',
  size: selectionData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(selectionBuffer, 0, selectionData);

// copy of the initial positions, for the reset button
const initialPoints = net.points.slice();

// the surface is only re-evaluated when the control points changed
let surfaceDirty = true;

// re-upload only when the selection or a point changes
function uploadPoints() {
  device.queue.writeBuffer(controlPointBuffer, 0, net.points);
  surfaceDirty = true;
  selectionData[0] = dragger.selected;
  device.queue.writeBuffer(selectionBuffer, 0, selectionData);
}

const dragger = new PointDragger(canvas, camera, net, uploadPoints);

function clearSelection() {
  dragger.selected = -1;
  uploadPoints();
}

function resetPoints() {
  net.points.set(initialPoints);
  clearSelection();
}

document.getElementById('reset')!.addEventListener('click', resetPoints);

// ---------------------------------------------------------
// Mouse mode
// ---------------------------------------------------------

type Mode = 'rotate' | 'select';
const modeButtons = document.querySelectorAll<HTMLButtonElement>('#mode button');

function setMode(mode: Mode) {
  camera.enabled = mode === 'rotate';
  dragger.enabled = mode === 'select';
  canvas.dataset.mode = mode;
  if (mode === 'rotate') clearSelection(); // no highlight while rotating
  modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}

modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as Mode)));
setMode('rotate');

// ---------------------------------------------------------
// Surface
// ---------------------------------------------------------

// samples per direction: the surface is a RES_U x RES_V grid of points
const RES_U = 128;
const RES_V = 128;

// params for the compute shader (struct Params in tessellate.wgsl, 8 x u32)
const paramsData = new Uint32Array([
  net.countU, net.countV, net.p, net.q, RES_U, RES_V, net.knotsU.length, 0,
]);
const paramsBuffer = device.createBuffer({
  label: 'surface params',
  size: paramsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(paramsBuffer, 0, paramsData);

// both knot vectors in one buffer: U first, V starts at index knotsU.length
const knotData = new Float32Array([...net.knotsU, ...net.knotsV]);
const knotBuffer = device.createBuffer({
  label: 'knots',
  size: knotData.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(knotBuffer, 0, knotData);

// written by the compute pass (STORAGE), read by the render pass (VERTEX)
const positionBuffer = device.createBuffer({
  label: 'surface positions',
  size: RES_U * RES_V * 16, // one vec4f (16 bytes) per sample
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
});

// two triangles per grid cell; the patch is open, so no wrap-around like the torus knot
const surfaceIndices = new Uint32Array((RES_U - 1) * (RES_V - 1) * 6);
for (let j = 0, k = 0; j < RES_V - 1; j++) {
  for (let i = 0; i < RES_U - 1; i++, k += 6) {
    const a = j * RES_U + i; // (i, j)
    const b = a + 1;         // (i + 1, j)
    const c = a + RES_U;     // (i, j + 1)
    const d = c + 1;         // (i + 1, j + 1)
    surfaceIndices.set([a, b, d, a, d, c], k);
  }
}
const surfaceIndexBuffer = device.createBuffer({
  label: 'surface indices',
  size: surfaceIndices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(surfaceIndexBuffer, 0, surfaceIndices);

// ---------------------------------------------------------
// Pipelines
// ---------------------------------------------------------

const tessellatePipeline = device.createComputePipeline({
  label: 'tessellate',
  layout: 'auto',
  compute: {
    module: device.createShaderModule({ label: 'tessellate', code: tessellateCode }),
    entryPoint: 'cs_main',
  },
});

const surfaceModule = device.createShaderModule({ label: 'surface', code: surfaceCode });
const surfacePipeline = device.createRenderPipeline({
  label: 'surface',
  layout: 'auto',
  vertex: {
    module: surfaceModule,
    entryPoint: 'vs_main',
    buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }],
  },
  fragment: { module: surfaceModule, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'triangle-list', cullMode: 'none' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
});

const pointsModule = device.createShaderModule({ label: 'points', code: pointsCode });
const pointsPipeline = device.createRenderPipeline({
  label: 'control points',
  layout: 'auto',
  vertex: { module: pointsModule, entryPoint: 'vs_main' },
  fragment: { module: pointsModule, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'triangle-list' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
});

// red line from each point down to z = 0 (the starting height)
const stemsModule = device.createShaderModule({ label: 'stems', code: stemsCode });
const stemsPipeline = device.createRenderPipeline({
  label: 'stems',
  layout: 'auto',
  vertex: { module: stemsModule, entryPoint: 'vs_main' },
  fragment: { module: stemsModule, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'line-list' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
});

const tessellateBindGroup = device.createBindGroup({
  layout: tessellatePipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: paramsBuffer } },
    { binding: 1, resource: { buffer: controlPointBuffer } },
    { binding: 2, resource: { buffer: knotBuffer } },
    { binding: 3, resource: { buffer: positionBuffer } },
  ],
});
const surfaceBindGroup = device.createBindGroup({
  layout: surfacePipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: cameraBuffer } }],
});
const pointsBindGroup = device.createBindGroup({
  layout: pointsPipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: cameraBuffer } },
    { binding: 1, resource: { buffer: controlPointBuffer } },
    { binding: 2, resource: { buffer: selectionBuffer } },
  ],
});
const stemsBindGroup = device.createBindGroup({
  layout: stemsPipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: cameraBuffer } },
    { binding: 1, resource: { buffer: controlPointBuffer } },
  ],
});


// ---------------------------------------------------------
// Frame loop
// ---------------------------------------------------------

function frame() {
  cameraData.set(camera.viewProjection(canvas.width / canvas.height), 0);
  cameraData.set([...camera.eye, 1], 16);
  cameraData.set([canvas.width, canvas.height, 0, 0], 20);
  device.queue.writeBuffer(cameraBuffer, 0, cameraData);

  const encoder = device.createCommandEncoder();

  // evaluate the surface again, but only if a control point changed
  if (surfaceDirty) {
    const compute = encoder.beginComputePass();
    compute.setPipeline(tessellatePipeline);
    compute.setBindGroup(0, tessellateBindGroup);
    compute.dispatchWorkgroups(Math.ceil(RES_U / 8), Math.ceil(RES_V / 8));
    compute.end();
    surfaceDirty = false;
  }

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.07, g: 0.07, b: 0.09, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
    depthStencilAttachment: {
      view: getDepthTexture().createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  pass.setPipeline(surfacePipeline);
  pass.setBindGroup(0, surfaceBindGroup);
  pass.setVertexBuffer(0, positionBuffer);
  pass.setIndexBuffer(surfaceIndexBuffer, 'uint32');
  pass.drawIndexed(surfaceIndices.length);

  pass.setPipeline(stemsPipeline);
  pass.setBindGroup(0, stemsBindGroup);
  pass.draw(2, pointCount);

  pass.setPipeline(pointsPipeline);
  pass.setBindGroup(0, pointsBindGroup);
  pass.draw(6, pointCount);

  pass.end();
  device.queue.submit([encoder.finish()]);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
