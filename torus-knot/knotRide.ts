import {vec3, Vec3Arg} from 'wgpu-matrix';

interface KnotShape {
    p: number;
    q: number;
    outerRadius: number;
    innerRadius: number;
    tubeRadius: number;
}

const TAU = 2 * Math.PI;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

function knotCentre(k: KnotShape, t: number): Vec3Arg {
    const ring = k.outerRadius + k.innerRadius * Math.cos(k.q * t);
    return [ring * Math.cos(k.p * t), ring * Math.sin(k.p * t), k.innerRadius * Math.sin(k.q * t)];
}

function knotVelocity(k: KnotShape, t: number): Vec3Arg {
    const {p, q, outerRadius: R, innerRadius: r} = k;
    const ring = R + r * Math.cos(q * t);
    return vec3.add(
        vec3.scale([-Math.sin(p * t), Math.cos(p * t), 0], p * ring),
        vec3.scale([-Math.sin(q * t) * Math.cos(p * t), -Math.sin(q * t) * Math.sin(p * t), Math.cos(q * t)], q * r),
    );
}

function knotOutward(k: KnotShape, t: number): Vec3Arg {
    const {p, q} = k;
    return [Math.cos(p * t) * Math.cos(q * t), Math.sin(p * t) * Math.cos(q * t), Math.sin(q * t)];
}

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
