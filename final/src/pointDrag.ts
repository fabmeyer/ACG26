import { mat4, vec3, type Mat4, type Vec3 } from 'wgpu-matrix';
import type { ArcballCamera } from './arcball.ts';
import type { ControlNet } from './controlNet.ts';

const PICK_RADIUS_PX = 12; // how close the mouse must be to a point to pick it
const Z_MIN = -3;
const Z_MAX = 3;

/**
 * project every control point to the screen (on the CPU) and take the nearest one within PICK_RADIUS_PX of the mouse
 * the point moves only in height (z)
 */
export class PointDragger {
  enabled = false;
  selected = -1; // index of selected control point: (j * countU + i)

  private canvas: HTMLCanvasElement;
  private camera: ArcballCamera;
  private net: ControlNet;
  private onChange: () => void;
  private drag: { start: Vec3; s0: number } | null = null;

  constructor(canvas: HTMLCanvasElement, camera: ArcballCamera, net: ControlNet, onChange: () => void) {
    this.canvas = canvas;
    this.camera = camera;
    this.net = net;
    this.onChange = onChange;

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    canvas.addEventListener('pointercancel', () => { this.drag = null; });
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    const k = this.pick(e);
    this.selected = k;
    this.drag = null;
    if (k >= 0) {
      this.canvas.setPointerCapture(e.pointerId);
      const start = this.point(k);
      const s0 = this.heightUnderMouse(e, start);
      if (s0 !== null) this.drag = { start, s0 };
    }
    this.onChange();
  }

  private move(e: PointerEvent) {
    if (!this.enabled || !this.drag) return;
    const { start, s0 } = this.drag;
    const s = this.heightUnderMouse(e, start);
    if (s === null) return; // looking straight down the z-axis: height is undefined
    const z = Math.min(Z_MAX, Math.max(Z_MIN, start[2] + (s - s0)));
    this.setHeight(this.selected, z);
    this.onChange();
  }

  private point(k: number): Vec3 {
    const p = this.net.points;
    const w = p[k * 4 + 3];
    return vec3.fromValues(p[k * 4] / w, p[k * 4 + 1] / w, p[k * 4 + 2] / w);
  }

  private setHeight(k: number, z: number) {
    const p = this.net.points;
    p[k * 4 + 2] = z * p[k * 4 + 3];
  }

  private viewProjection(): Mat4 {
    return this.camera.viewProjection(this.canvas.width / this.canvas.height);
  }

  private pick(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const m = this.viewProjection();
    const count = this.net.countU * this.net.countV;

    let best = -1;
    let bestDist = PICK_RADIUS_PX;
    for (let k = 0; k < count; k++) {
      const [x, y, z] = this.point(k);
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0) continue; // behind the camera
      const sx = (cx / cw * 0.5 + 0.5) * r.width;
      const sy = (0.5 - cy / cw * 0.5) * r.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    return best;
  }

  private mouseRay(e: PointerEvent): { origin: Vec3; dir: Vec3 } {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    const inv = mat4.inverse(this.viewProjection());
    const near = vec3.transformMat4([nx, ny, 0], inv); // depth 0 = near plane in WebGPU
    const far = vec3.transformMat4([nx, ny, 1], inv);
    return { origin: near, dir: vec3.normalize(vec3.subtract(far, near)) };
  }

  private heightUnderMouse(e: PointerEvent, start: Vec3): number | null {
    const { origin, dir } = this.mouseRay(e);
    // Closest points between two lines; a = |axis|^2 = 1, c = |dir|^2 = 1.
    const b = dir[2]; // dot(axis, dir)
    const denom = 1 - b * b;
    if (denom < 1e-3) return null;
    const w = vec3.subtract(start, origin);
    const d = w[2]; // dot(axis, w)
    const e2 = vec3.dot(dir, w);
    return (b * e2 - d) / denom;
  }
}
