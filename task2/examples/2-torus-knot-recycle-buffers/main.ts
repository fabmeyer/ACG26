import {mat4, vec3, Vec3Arg} from "wgpu-matrix";
import {
    makeShaderDataDefinitions,
    makeStructuredView
} from "webgpu-utils";

import {initWebGPU} from '../_shared/webgpu-init.ts';
import shaderCode from './shader.wgsl?raw';
import {TorusKnotUI} from "../_shared/torusKnotUI.ts";

const MAX_SEGMENTS = 10000
const MAX_TUBE_SEGMENTS = 100
const MAX_VERTICES = MAX_SEGMENTS * MAX_TUBE_SEGMENTS
const MAX_INDICES = MAX_VERTICES * 6

const torusKnotUI = new TorusKnotUI(MAX_SEGMENTS, MAX_TUBE_SEGMENTS);

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const {device, context, format} = await initWebGPU(canvas);

// ---- Pre-allocated CPU-side typed arrays (reused every generation, no per-frame alloc) ----
const positionData = new Float32Array(MAX_VERTICES * 3);
const normalData = new Float32Array(MAX_VERTICES * 3);
const colorData = new Float32Array(MAX_VERTICES * 3);
const indexData = new Uint32Array(MAX_INDICES);
let activeVertexCount = 0;
let activeIndexCount = 0;

function generate_torus_knot_vertices(p: number = torusKnotUI.params.p, q: number = torusKnotUI.params.q, segments: number = torusKnotUI.params.segments, tubeSegments: number = torusKnotUI.params.tubeSegments, outerRadius: number = torusKnotUI.params.outerRadius, innerRadius: number = torusKnotUI.params.innerRadius, tubeRadius: number = torusKnotUI.params.tubeRadius) {
    let deltaT: number = 2 * Math.PI / segments
    let deltaTube: number = 2 * Math.PI / tubeSegments

    for (let t_i: number = 0; t_i < segments; t_i++) {
        let t: number = t_i * deltaT;

        // Get the tuber center point
        let center: Vec3Arg = [
            (outerRadius + innerRadius * Math.cos(q * t)) * Math.cos(p * t),
            (outerRadius + innerRadius * Math.cos(q * t)) * Math.sin(p * t),
            innerRadius * Math.sin(q * t)
        ];

        for (let s_i: number = 0; s_i < tubeSegments; s_i++) {
            let s: number = s_i * deltaTube;

            // Calculate the normal
            let nPrime: Vec3Arg = [
                Math.cos(p * t) * Math.cos(q * t),
                Math.sin(p * t) * Math.cos(q * t),
                Math.sin(q * t)
            ];
            let tPrime: Vec3Arg = vec3.normalize(vec3.scale(
                vec3.add([-Math.sin(p * t), Math.cos(p * t), 0.0], vec3.scale([-Math.sin(q * t) * Math.cos(p * t), -Math.sin(q * t) * Math.sin(p * t), Math.cos(q * t)], q * innerRadius)),
                p * (outerRadius + innerRadius * Math.cos(q * t))
            ));
            let bPrime: Vec3Arg = vec3.cross(tPrime, nPrime);
            let normal: number[] = vec3.add(
                vec3.scale(nPrime, Math.cos(s)),
                vec3.scale(bPrime, Math.sin(s)),
            );
            normal = vec3.normalize(normal);

            let vI = (t_i * tubeSegments + s_i) * 3
            positionData[vI] = center[0] + normal[0] * tubeRadius;
            positionData[vI + 1] = center[1] + normal[1] * tubeRadius;
            positionData[vI + 2] = center[2] + normal[2] * tubeRadius;

            normalData[vI] = normal[0]
            normalData[vI + 1] = normal[1]
            normalData[vI + 2] = normal[2]

            colorData[vI] = (Math.cos(t) + 1.0) * 0.5
            colorData[vI + 1] = (Math.cos(s) + 1.0) * 0.5
            colorData[vI + 2] = (Math.sin(t) + 1.0) * 0.5

            // Calculate the index of the 4 corners and create the two phases
            vI *= 2
            let a: number = t_i * tubeSegments + s_i;
            let b: number = t_i * tubeSegments + (s_i + 1) % tubeSegments;
            let d: number = ((t_i + 1) % segments) * tubeSegments + s_i;
            let c: number = ((t_i + 1) % segments) * tubeSegments + (s_i + 1) % tubeSegments;

            indexData[vI] = a
            indexData[vI + 1] = d
            indexData[vI + 2] = c
            indexData[vI + 3] = a
            indexData[vI + 4] = c
            indexData[vI + 5] = b
        }
    }

    activeVertexCount = segments * tubeSegments;
    activeIndexCount = segments * tubeSegments * 6;
}

const VERTEX_STRIDE = 3 * 4; // 3 floats * 4 bytes, per attribute buffer

const positionBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const normalBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const colorBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
// index buffer size must be multiple of 4 bytes; Uint32 already satisfies this
const indexBuffer = device.createBuffer({
    size: MAX_INDICES * 4,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

const vertexBufferLayouts: GPUVertexBufferLayout[] = [
    {
        arrayStride: VERTEX_STRIDE,
        attributes: [{shaderLocation: 0, offset: 0, format: 'float32x3'}],
    },
    {
        arrayStride: VERTEX_STRIDE,
        attributes: [{shaderLocation: 1, offset: 0, format: 'float32x3'}],
    },
    {
        arrayStride: VERTEX_STRIDE,
        attributes: [{shaderLocation: 2, offset: 0, format: 'float32x3'}],
    },
];

function uploadActiveRange() {
    // writeBuffer offsets/sizes are in bytes when using ArrayBuffer views like this;
    // slicing the typed array view keeps this a cheap subarray, not a copy
    device.queue.writeBuffer(positionBuffer, 0, positionData, 0, activeVertexCount * 3);
    device.queue.writeBuffer(normalBuffer, 0, normalData, 0, activeVertexCount * 3);
    device.queue.writeBuffer(colorBuffer, 0, colorData, 0, activeVertexCount * 3);
    device.queue.writeBuffer(indexBuffer, 0, indexData, 0, activeIndexCount);
}

let depthTexture: GPUTexture | undefined;

function getDepthTexture(): GPUTexture {
    if (
        depthTexture &&
        depthTexture.width === canvas.width &&
        depthTexture.height === canvas.height
    ) {
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

const shaderModule = device.createShaderModule({code: shaderCode});
const defs = makeShaderDataDefinitions(shaderCode);
const uniformView = makeStructuredView(defs.uniforms.matrices);

function createRenderPipeline() {
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: vertexBufferLayouts
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{format}],
    },
    primitive: {topology: 'triangle-list'},
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });
}
let pipeline = createRenderPipeline()

const uniformBuffer = device.createBuffer({
    size: uniformView.arrayBuffer.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{binding: 0, resource: {buffer: uniformBuffer}}],
});

generate_torus_knot_vertices()
uploadActiveRange()

let animator: number = 0.0

function frame() {
    torusKnotUI.fpsTick()
    if (torusKnotUI.haveParamsChanged()) {
        generate_torus_knot_vertices()
        uploadActiveRange()
    }

    const viewProj = mat4.multiply(
        mat4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100),
        mat4.lookAt([Math.cos(animator) * 40, 0, Math.sin(animator) * 40], [0, 0, 0], [0, 1, 0]),
    );

    animator += torusKnotUI.params.speed

    uniformView.set({viewProjection: viewProj});
    device.queue.writeBuffer(uniformBuffer, 0, uniformView.arrayBuffer);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                clearValue: {r: 0.07, g: 0.07, b: 0.09, a: 1},
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
        depthStencilAttachment: {
            view: getDepthTexture().createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        },
    });
    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, colorBuffer);
    pass.setVertexBuffer(2, normalBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(activeIndexCount);
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
