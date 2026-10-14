import {vec3, Vec3Arg} from 'wgpu-matrix';

export interface KnotShape {
    p: number;
    q: number;
    outerRadius: number;
    innerRadius: number;
    tubeRadius: number;
}

const TAU = 2 * Math.PI;
const EPS = 1e-4;            // step for the numerical derivatives
const EYE_HEIGHT = 0.25;     // camera height above the surface in world units
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

function knotCentre(k: KnotShape, t: number): Vec3Arg {
    const ring = k.outerRadius + k.innerRadius * Math.cos(k.q * t);
    return [ring * Math.cos(k.p * t), ring * Math.sin(k.p * t), k.innerRadius * Math.sin(k.q * t)];
}

function tubeNormal(k: KnotShape, t: number, s: number): Vec3Arg {
    const {p, q, outerRadius: R, innerRadius: r} = k;
    const nPrime: Vec3Arg = [Math.cos(p * t) * Math.cos(q * t), Math.sin(p * t) * Math.cos(q * t), Math.sin(q * t)];
    const tPrime = vec3.normalize(vec3.add(
        vec3.scale([-Math.sin(p * t), Math.cos(p * t), 0], p * (R + r * Math.cos(q * t))),
        vec3.scale([-Math.sin(q * t) * Math.cos(p * t), -Math.sin(q * t) * Math.sin(p * t), Math.cos(q * t)], q * r),
    ));
    const bPrime = vec3.cross(tPrime, nPrime);
    return vec3.normalize(vec3.add(vec3.scale(nPrime, Math.cos(s)), vec3.scale(bPrime, Math.sin(s))));
}

function surfacePoint(k: KnotShape, t: number, s: number): Vec3Arg {
    return vec3.add(knotCentre(k, t), vec3.scale(tubeNormal(k, t, s), k.tubeRadius));
}

// Derivatives of the surface along t and s (finite differences) and the outward normal
function surfaceFrame(k: KnotShape, t: number, s: number) {
    const St = vec3.scale(vec3.sub(surfacePoint(k, t + EPS, s), surfacePoint(k, t - EPS, s)), 1 / (2 * EPS));
    const Ss = vec3.scale(vec3.sub(surfacePoint(k, t, s + EPS), surfacePoint(k, t, s - EPS)), 1 / (2 * EPS));
    let n = vec3.normalize(vec3.cross(St, Ss));
    if (vec3.dot(n, tubeNormal(k, t, s)) < 0) n = vec3.negate(n);
    return {St, Ss, n};
}

function heading(St: Vec3Arg, Ss: Vec3Arg, direction: number): Vec3Arg {
    return vec3.normalize(vec3.add(
        vec3.scale(vec3.normalize(St), Math.cos(direction)),
        vec3.scale(vec3.normalize(Ss), Math.sin(direction)),
    ));
}

export class SurfaceWalk {
    t = 0;
    s = 0;

    // Walk a certain distance in world units in the given direction
    move(k: KnotShape, distance: number, direction: number) {
        const steps = Math.max(1, Math.ceil(Math.abs(distance) / 0.05));
        for (let i = 0; i < steps; i++) {
            const {St, Ss} = surfaceFrame(k, this.t, this.s);
            const d = vec3.scale(heading(St, Ss, direction), distance / steps);
            const a = vec3.dot(St, St), b = vec3.dot(St, Ss), c = vec3.dot(Ss, Ss);
            const e = vec3.dot(St, d), f = vec3.dot(Ss, d);
            const det = a * c - b * b;
            if (!(det > 1e-12)) return;
            this.t = wrap(this.t + (c * e - b * f) / det);
            this.s = wrap(this.s + (a * f - b * e) / det);
        }
    }

    camera(k: KnotShape, direction: number): {position: Vec3Arg; target: Vec3Arg; up: Vec3Arg} {
        const {St, Ss, n} = surfaceFrame(k, this.t, this.s);
        const height = Math.min(EYE_HEIGHT, 0.5 * k.tubeRadius + 0.05);   // stay low on thin tubes
        const position = vec3.add(surfacePoint(k, this.t, this.s), vec3.scale(n, height));
        return {position, target: vec3.add(position, heading(St, Ss, direction)), up: n};
    }
}
