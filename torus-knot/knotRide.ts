import {vec3, Vec3Arg} from 'wgpu-matrix';
import {type KnotShape, knotCentre, knotVelocity, knotOutward} from './knotGeometry.ts';

const TAU = 2 * Math.PI;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

export class KnotRide {
    t = 0;       // position parameter for torus knot center line

    move(k: KnotShape, distance: number) {
        const steps = Math.max(1, Math.ceil(Math.abs(distance) / 0.05));
        for (let i = 0; i < steps; i++) {
            const speed = vec3.length(knotVelocity(k, this.t));
            if (!(speed > 1e-9)) return;   // degenerate knot (p = q = 0)
            this.t = wrap(this.t + (distance / steps) / speed);
        }
    }

    camera(k: KnotShape): {position: Vec3Arg; target: Vec3Arg; up: Vec3Arg} {
        const position = knotCentre(k, this.t);
        const forward = vec3.normalize(knotVelocity(k, this.t));
        // built with vec3 like in the working version (a Float32Array, not a plain array)
        const up = vec3.normalize(knotOutward(k, this.t));
        return {position, target: vec3.add(position, forward), up};
    }
}
