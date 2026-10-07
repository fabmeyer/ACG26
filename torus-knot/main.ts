import {mat4, vec3, Vec3Arg} from "wgpu-matrix";
import {
    createBuffersAndAttributesFromArrays,
    drawArrays,
    makeShaderDataDefinitions,
    makeStructuredView
} from "webgpu-utils";

import {initWebGPU} from './webgpu-init.ts';
import shaderCode from './shader.wgsl?raw';
import {TorusKnotUI} from './torusKnotUI.ts';

const torusKnotUI = new TorusKnotUI(10000, 100);

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const {device, context, format} = await initWebGPU(canvas);

function generate_torus_knot_vertices(p: number, q: number, segments: number, tubeSegments: number, outerRadius: number, innerRadius: number, tubeRadius: number) {
    let deltaT: number = 2 * Math.PI / segments
    let deltaTube: number = 2 * Math.PI / tubeSegments

    let normals: number[] = []
    let vertexPositions: number[] = []
    let colors: number[] = []
    let indices: number[] = []

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

            vertexPositions.push(
                ...vec3.add(center, vec3.scale(normal, tubeRadius))
            )
            normals.push(...normal);
            colors.push(...vec3.scale([Math.cos(t) + 1.0, Math.cos(s) + 1.0, Math.sin(t) + 1.0], 0.5))

            // Calculate the index of the 4 corners and create the two phases

            let a: number = t_i * tubeSegments + s_i;
            let b: number = t_i * tubeSegments + (s_i + 1) % tubeSegments;
            let d: number = ((t_i + 1) % segments) * tubeSegments + s_i;
            let c: number = ((t_i + 1) % segments) * tubeSegments + (s_i + 1) % tubeSegments;
            indices.push(a, d, c, a, c, b)
        }
    }
    return {
        vertexPositions,
        normals,
        colors,
        indices,
    }
}

function createTorusKnotBuffer() {
    let data = generate_torus_knot_vertices(torusKnotUI.params.p, torusKnotUI.params.q, torusKnotUI.params.segments, torusKnotUI.params.tubeSegments, torusKnotUI.params.outerRadius, torusKnotUI.params.innerRadius, torusKnotUI.params.tubeRadius)

    let result = createBuffersAndAttributesFromArrays(device, {
        position: {
            numComponents: 3,
            data: data.vertexPositions
        },
        color: {
            numComponents: 3,
            data: data.colors
        },
        normals: {
            numComponents: 3,
            data: data.normals
        },
        indices: data.indices
    })
    return result
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

let buffers = createTorusKnotBuffer()

const shaderModule = device.createShaderModule({code: shaderCode});
const defs = makeShaderDataDefinitions(shaderCode);
const uniformView = makeStructuredView(defs.uniforms.matrices);

function createRenderPipeline() {
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: buffers.bufferLayouts
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

//#region Camera and orbit controls
// let animator: number = 0.0

// create orbit
const orbit = { yaw: 0, elevation: 0, radius: 40 };
const target: Vec3Arg = [0, 0, 0];

// camera projection
function getCamera(): { position: Vec3Arg; up: Vec3Arg } {
    const sinElevation = Math.sin(orbit.elevation);
    const cosElevation = Math.cos(orbit.elevation);
    const sinYaw = Math.sin(orbit.yaw);
    const cosYaw = Math.cos(orbit.yaw);

    return {
        position: [
            orbit.radius * cosElevation * cosYaw,
            orbit.radius * cosElevation * sinYaw,
            orbit.radius * sinElevation,
        ],
        up: [
            -sinElevation * cosYaw,
            -sinElevation * sinYaw,
            cosElevation,
        ],
    };
}

// camera orbit controls for keyboard
const pressedKeys = new Set<string>();
const arrowKeys = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
]);

// Let keyboard controls apply when the canvas has focus.
canvas.tabIndex = 0;

canvas.addEventListener('keydown', (event) => {
    if (!arrowKeys.has(event.key)) return;

    pressedKeys.add(event.key);
    event.preventDefault();
});

canvas.addEventListener('keyup', (event) => {
    if (!arrowKeys.has(event.key)) return;

    pressedKeys.delete(event.key);
    event.preventDefault();
});

canvas.addEventListener('blur', () => pressedKeys.clear());
window.addEventListener('blur', () => pressedKeys.clear());

const keyboardSpeed = 1.5; // radians per second
let previousTime: number | undefined;

function updateKeyboardOrbit(time: number) {
    const deltaTime = previousTime === undefined
        ? 0
        : Math.min((time - previousTime) / 1000, 0.1);

    previousTime = time;

    let horizontal =
        Number(pressedKeys.has('ArrowRight')) -
        Number(pressedKeys.has('ArrowLeft'));

    let vertical =
        Number(pressedKeys.has('ArrowUp')) -
        Number(pressedKeys.has('ArrowDown'));

    // calculating the squareroot of both movements
    const length = Math.hypot(horizontal, vertical);
    // divide by squareroot to normalize to 1 again
    if (length > 0) {
        horizontal /= length;
        vertical /= length;
    }

    orbit.yaw += horizontal * keyboardSpeed * deltaTime;
    orbit.elevation += vertical * keyboardSpeed * deltaTime;
}
//#endregion

//#region Mouse and trackpad controls
const dragSensitivity = 0.005; // radians per CSS pixel

let activePointerId: number | undefined;
let previousX = 0;
let previousY = 0;

canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || activePointerId !== undefined) return;

    canvas.focus({ preventScroll: true });

    activePointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;

    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointerId) return;

    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;

    previousX = event.clientX;
    previousY = event.clientY;

    orbit.yaw -= deltaX * dragSensitivity;
    orbit.elevation += deltaY * dragSensitivity;
});

function finishDrag(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;

    activePointerId = undefined;

    if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
    }
}

canvas.addEventListener('pointerup', finishDrag);
canvas.addEventListener('pointercancel', finishDrag);

canvas.addEventListener('lostpointercapture', (event) => {
    if (event.pointerId === activePointerId) {
        activePointerId = undefined;
    }
});
//#endregion

function frame(time: number) {
    updateKeyboardOrbit(time);
    
    torusKnotUI.fpsTick();
    if (torusKnotUI.haveParamsChanged()) {
      buffers = createTorusKnotBuffer()
      pipeline = createRenderPipeline()
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{binding: 0, resource: {buffer: uniformBuffer}}],
      });
    }

    // unpack two values from camera projection
    const { position, up } = getCamera();

    const viewProj = mat4.multiply(
        mat4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100),
        // mat4.lookAt([Math.cos(animator) * 40, 0, Math.sin(animator) * 40], [0, 0, 0], [0, 1, 0]),
        mat4.lookAt(position, target, up)
    );

    // animator += torusKnotUI.params.speed

    uniformView.set({viewProjection: viewProj});
    device.queue.writeBuffer(uniformBuffer, 0, uniformView.arrayBuffer);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                clearValue: {r: 0.1, g: 0.01, b: 0.01, a: 1},
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
    drawArrays(pass, buffers);
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
