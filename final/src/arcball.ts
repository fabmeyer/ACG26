import { mat4, quat, vec3, type Mat4, type Quat, type Vec3 } from 'wgpu-matrix';

export class ArcballCamera {
  target: Vec3;
  distance: number;
  orientation: Quat;
  fovY = Math.PI / 4;
  enabled = true;

  private dragging = false;
  private last: Vec3 = vec3.create();

  constructor(canvas: HTMLCanvasElement, opts: { target?: number[]; distance?: number; orientation?: Quat } = {}) {
    this.target = vec3.fromValues(...((opts.target ?? [0, 0, 0]) as [number, number, number]));
    this.distance = opts.distance ?? 5;
    this.orientation = opts.orientation ?? quat.identity();

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      canvas.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.last = this.toBall(canvas, e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const next = this.toBall(canvas, e);
      this.rotate(this.last, next);
      this.last = next;
    });
    const stop = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.min(50, Math.max(0.5, this.distance * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
  }

  private toBall(canvas: HTMLCanvasElement, e: PointerEvent): Vec3 {
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width, r.height) / 2;
    const x = (e.clientX - r.left - r.width / 2) / s;
    const y = (r.top + r.height / 2 - e.clientY) / s;
    const d2 = x * x + y * y;
    const z = d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2);
    return vec3.normalize(vec3.fromValues(x, y, z));
  }

  private rotate(a: Vec3, b: Vec3) {
    const axis = vec3.cross(a, b);
    if (vec3.length(axis) < 1e-6) return;
    const angle = Math.acos(Math.min(1, Math.max(-1, vec3.dot(a, b))));
    const delta = quat.fromAxisAngle(vec3.normalize(axis), -angle);
    this.orientation = quat.normalize(quat.multiply(this.orientation, delta));
  }

  get eye(): Vec3 {
    const back = vec3.transformQuat([0, 0, this.distance], this.orientation);
    return vec3.add(this.target, back);
  }

  viewProjection(aspect: number): Mat4 {
    const up = vec3.transformQuat([0, 1, 0], this.orientation);
    const view = mat4.lookAt(this.eye, this.target, up);
    const proj = mat4.perspective(this.fovY, aspect, 0.05, 100);
    return mat4.multiply(proj, view);
  }
}
