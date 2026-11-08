import { quat } from 'wgpu-matrix';
import { initWebGPU } from './webgpu-init.ts';
import { ArcballCamera } from './arcball.ts';
import { flatControlNet } from './controlNet.ts';
import { PointDragger } from './pointDrag.ts';
import planeCode from './shaders/plane.wgsl?raw';
import pointsCode from './shaders/points.wgsl?raw';

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

// storage buffer, so a later compute pass can read the same data
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

// re-upload only when the selection or a point changes
function uploadPoints() {
  device.queue.writeBuffer(controlPointBuffer, 0, net.points);
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
// Plane
// ---------------------------------------------------------

const corner = (i: number, j: number) => {
  const k = (j * net.countU + i) * 4;
  return Array.from(net.points.subarray(k, k + 4));
};
const last = { i: net.countU - 1, j: net.countV - 1 };
const planeVertices = new Float32Array([
  ...corner(0, 0), ...corner(last.i, 0), ...corner(0, last.j), ...corner(last.i, last.j),
]);
const planeIndices = new Uint32Array([0, 1, 3, 0, 3, 2]);

const planeVertexBuffer = device.createBuffer({
  label: 'plane vertices',
  size: planeVertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(planeVertexBuffer, 0, planeVertices);

const planeIndexBuffer = device.createBuffer({
  label: 'plane indices',
  size: planeIndices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(planeIndexBuffer, 0, planeIndices);


// ---------------------------------------------------------
// Pipelines
// ---------------------------------------------------------

const planeModule = device.createShaderModule({ label: 'plane', code: planeCode });
const planePipeline = device.createRenderPipeline({
  label: 'plane',
  layout: 'auto',
  vertex: {
    module: planeModule,
    entryPoint: 'vs_main',
    buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }],
  },
  fragment: { module: planeModule, entryPoint: 'fs_main', targets: [{ format }] },
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

const planeBindGroup = device.createBindGroup({
  layout: planePipeline.getBindGroupLayout(0),
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


// ---------------------------------------------------------
// Frame loop
// ---------------------------------------------------------

function frame() {
  cameraData.set(camera.viewProjection(canvas.width / canvas.height), 0);
  cameraData.set([...camera.eye, 1], 16);
  cameraData.set([canvas.width, canvas.height, 0, 0], 20);
  device.queue.writeBuffer(cameraBuffer, 0, cameraData);

  const encoder = device.createCommandEncoder();
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

  pass.setPipeline(planePipeline);
  pass.setBindGroup(0, planeBindGroup);
  pass.setVertexBuffer(0, planeVertexBuffer);
  pass.setIndexBuffer(planeIndexBuffer, 'uint32');
  pass.drawIndexed(planeIndices.length);

  pass.setPipeline(pointsPipeline);
  pass.setBindGroup(0, pointsBindGroup);
  pass.draw(6, pointCount);

  pass.end();
  device.queue.submit([encoder.finish()]);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
