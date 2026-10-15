/**
 * Boilerplate every application needs: get an adapter/device, configure the
 * canvas, and handle resize.
 */
export interface WebGPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  format: GPUTextureFormat;
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No suitable GPU adapter found.');
  }

  const device = await adapter.requestDevice();

  // Surface errors in the console instead of failing silently -
  // very useful when students are debugging pipeline/shader mistakes.
  device.lost.then((info) => {
    console.error(`WebGPU device was lost: ${info.message}`);
  });

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get a WebGPU canvas context.');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  const configure = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    context.configure({ device, format, alphaMode: 'opaque' });
  };

  configure();

  // Keep the canvas' backing resolution in sync with its displayed size.
  const resizeObserver = new ResizeObserver(configure);
  resizeObserver.observe(canvas);

  return { device, context, canvas, format };
}
