import {mat4} from "wgpu-matrix"; // import matrix/vector library 
import {
    makeShaderDataDefinitions,
    makeStructuredView
} from "webgpu-utils"; // utility libraries for computing the byte count of shader data
import {TorusKnotUI} from "../_shared/torusKnotUI.ts"; // UI for controlling the torus knot parameters

import {initWebGPU} from '../_shared/webgpu-init.ts'; // utility function for initializing WebGPU
import shaderCode from './shader.wgsl?raw'; // import from Vite to load the shader code as a string

//Define constants for the maximum number of segments, tube segments, vertices, and indices
//segments: steps around the torus knot's long path.
//tubeSegments: steps around the tube's circular cross-section.
//These values are allocated in memory only once, to avoid resizing GPU buffers during runtime
const MAX_SEGMENTS = 10000
const MAX_TUBE_SEGMENTS = 100
const MAX_VERTICES = MAX_SEGMENTS * MAX_TUBE_SEGMENTS
const MAX_INDICES = MAX_VERTICES * 6

//Builds the UI using the maximum values for segments and tube segments
const torusKnotUI = new TorusKnotUI(MAX_SEGMENTS, MAX_TUBE_SEGMENTS);

//Get the canvas element from the HTML document
const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
//Async initialization of WebGPU
//device: handle for creating webGPU resources (buffers, textures, pipelines, etc.)
//context: canvas presentation context for rendering
//format: texture format of the canvas
const {device, context, format} = await initWebGPU(canvas);

//structured buffer layout for vertex attributes (position, normal, color)
const VERTEX_STRIDE = 3 * 4; // 3 floats * 4 bytes, per attribute buffer


//Create GPU buffers for vertex attributes and indices
//The buffer has both vertex and storage usage,
// STORAGE allows the compute shader to write to the buffer
// VERTEX lets the render pipeline read from the buffer as vertex input

const positionBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const normalBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const colorBuffer = device.createBuffer({
    size: MAX_VERTICES * VERTEX_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
//INDEX buffer is used to define the order of vertices to form triangles,
// bound with setIndexBuffer in the render pass
// STORAGE allows the compute shader to write Uint32 indices to the buffer
// index buffer size must be multiple of 4 bytes; Uint32 already satisfies this
const indexBuffer = device.createBuffer({
    size: MAX_INDICES * 4,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});


//Describes to the render pipeline how to read the vertex attributes from the GPU buffers
//Because each buffer contains only one attribute, offset is always 0,
//  and arrayStride is the same for all buffers (3 floats * 4 bytes)
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

// Depth texture is used to store the memory of how close things are at every pixel.
// The size of the depth buffer must match the size of the canvas
// Cleared to 1.0 ("as far away as possible") at the start of each pass; smaller values mean closer to the camera.

let depthTexture: GPUTexture | undefined;

//To create a new texture only when the canvas is resized (or on the first frame),
//  we check if the depth texture already exists and if its size matches the canvas size.
//  If not, we destroy the old texture and create a new one with the correct size.
// GPUTextureUsage.RENDER_ATTACHMENT indicates this texture will be written to during a render pass.
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

//Compiles the WGSL (containing cs_main, vs_main, fs_main) shader code into a GPUShaderModule
const shaderModule = device.createShaderModule({code: shaderCode});

//webgpu-utils inspects the wgsl and finds two uniform blocks declared in the shader:
// matrices: viewProjection matrix for the vertex shader
// params: p, q, segments, tubeSegments, radii for the compute shader
const defs = makeShaderDataDefinitions(shaderCode);
// makeStructuredView() returns an object that lets you
// set the values of the uniform buffer in a structured way
const uniformView = makeStructuredView(defs.uniforms.matrices);
const computerUniformView = makeStructuredView(defs.uniforms.params);


//The actual GPU buffer is created for the torus knot parameters,
//It is UNIFORM for binding as a uniform buffer in the compute shader,
//  and COPY_DST to allow writing from the CPU whenever the sliders change
const computUniformBuffer = device.createBuffer({
    size: computerUniformView.arrayBuffer.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Layout: 'auto' allows the pipeline to automatically infer the layout of the
//  bind groups based on the shader code
const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'cs_main' },
});

// The bind group wires the CPU-side buffers to the GPU-side shader bindings.
// The compute shader reads params and writes vertex/index data directly
// into the same buffers the render pipeline later reads as vertex/index buffers.
// Note: both the writing (compute shader) and reading (render pipeline)
// happen entirely on the GPU using the same memory, no copying at all.

const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(1),
    entries: [
        {binding: 0 , resource: { buffer: computUniformBuffer}},
        { binding: 1, resource: { buffer: positionBuffer } },
        { binding: 2, resource: { buffer: normalBuffer } },
        { binding: 3, resource: { buffer: colorBuffer } },
        { binding: 4, resource: { buffer: indexBuffer } },
    ],
});

// vertex/fragment select vs_main/fs_main from the same shader module,
// and tell the pipeline the vertex buffer layouts previously defined.
// targets must match the canvas preferred format.
// primitive topology is triangle-list, every 3 vertices form a triangle
// depthStencil enables a depth buffer test, depthCompare 'less' means
//  a fragment is drawn only if it is closer to the camera than what is already in the depth buffer.
const pipeline = device.createRenderPipeline({
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

//Creating a GPU buffer (warehouse) for the viewProjection matrix,
//Note that there is no compute shader involved here.
const uniformBuffer = device.createBuffer({
    size: uniformView.arrayBuffer.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{binding: 0, resource: {buffer: uniformBuffer}}],
});

let animator: number = 0.0

function frame() {
    torusKnotUI.fpsTick(); // update the FPS counter in the UI

    let encoder: GPUCommandEncoder | undefined = undefined;

    //the mesh is only regenerated when the parameters actually change.
    if (torusKnotUI.haveParamsChanged()) {
        computerUniformView.set(torusKnotUI.params);
        device.queue.writeBuffer(computUniformBuffer, 0, computerUniformView.arrayBuffer);

        encoder = device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(1, computeBindGroup);

        //Dispatch enough workgroups (of 64 threads each) to cover every vertex, rounded up.
        computePass.dispatchWorkgroups(Math.ceil((torusKnotUI.params.segments * torusKnotUI.params.tubeSegments) / 64));
        //Finished writing the set of instructions, nothing has run yet.
        computePass.end();
        //Submit the instructions to the GPU queue, now the compute shader
        // runs and writes to the vertex/index buffers.
        // device.queue.submit([encoder.finish()]);
    }

    //Builds the viewProjection matrix for the vertex shader.
    // The camera position orbits on a circle of radius 40 in the xz plane,
    // parameterized by the animator variable, and always looking at the origin with Y as up.
    const viewProj = mat4.multiply(
        mat4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100),
        mat4.lookAt([Math.cos(animator) * 40, 0, Math.sin(animator) * 40], [0, 0, 0], [0, 1, 0]),
    );

    animator += torusKnotUI.params.speed

    //The new camera matrix is uploaded to the render pipeline uniform buffer,
    // every frame, because the camera is always moving
    uniformView.set({viewProjection: viewProj});
    device.queue.writeBuffer(uniformBuffer, 0, uniformView.arrayBuffer);

    //Starts the render pass, clears the color and depth buffers.
    if (encoder === undefined) {
        encoder = device.createCommandEncoder();
    }
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
    // Each number 0, 1, 2 has to match the shaderLocation in the vertex shader,
    //  and the order of the buffers in the render pipeline
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, colorBuffer);
    pass.setVertexBuffer(2, normalBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    //Draws the triangles using the index buffer, which was written by the compute shader.
    pass.drawIndexed(6 * torusKnotUI.params.segments * torusKnotUI.params.tubeSegments);
    pass.end();

    //Submit the recorded render commands to the GPU queue, now the render pipeline runs
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
}

computerUniformView.set(torusKnotUI.params);
device.queue.writeBuffer(computUniformBuffer, 0, computerUniformView.arrayBuffer);

//Duplicates the regenerate mesh code inside the frame to initialize
//  all vextex/index buffers before the first render pass
const encoder = device.createCommandEncoder();
const computePass = encoder.beginComputePass();
computePass.setPipeline(computePipeline);
computePass.setBindGroup(1, computeBindGroup);
computePass.dispatchWorkgroups(Math.ceil((torusKnotUI.params.segments * torusKnotUI.params.tubeSegments) / 64));
computePass.end();
device.queue.submit([encoder.finish()]);

//Start the animation loop
requestAnimationFrame(frame);
