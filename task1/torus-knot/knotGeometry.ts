import {vec3, Vec3Arg} from 'wgpu-matrix';

// parameters defining the shape of the torus knot tube
export interface KnotShape {
    p: number;              // windings around the hole
    q: number;              // windings around the tube of the guide torus
    outerRadius: number;    // R: radius of the guide torus
    innerRadius: number;    // r: tube radius of the guide torus
    tubeRadius: number;     // thickness of the rendered tube
}

// point on the knot's centre line
export function knotCentre(k: KnotShape, t: number): Vec3Arg {
    const ring = k.outerRadius + k.innerRadius * Math.cos(k.q * t);
    return [ring * Math.cos(k.p * t), ring * Math.sin(k.p * t), k.innerRadius * Math.sin(k.q * t)];
}

// derivative of knotCentre: direction of travel along the centre line, times its speed
export function knotVelocity(k: KnotShape, t: number): Vec3Arg {
    const {p, q, outerRadius: R, innerRadius: r} = k;
    const ring = R + r * Math.cos(q * t);
    return vec3.add(
        vec3.scale([-Math.sin(p * t), Math.cos(p * t), 0], p * ring),
        vec3.scale([-Math.sin(q * t) * Math.cos(p * t), -Math.sin(q * t) * Math.sin(p * t), Math.cos(q * t)], q * r),
    );
}

// unit vector from guide torus core line out to the centre line
export function knotOutward(k: KnotShape, t: number): Vec3Arg {
    const {p, q} = k;
    return [Math.cos(p * t) * Math.cos(q * t), Math.sin(p * t) * Math.cos(q * t), Math.sin(q * t)];
}

// unit vector from the center line to the tube surface
export function tubeNormal(k: KnotShape, t: number, s: number): Vec3Arg {
    const outward = knotOutward(k, t);
    const tangent = vec3.normalize(knotVelocity(k, t));
    const binormal = vec3.cross(tangent, outward);
    return vec3.normalize(vec3.add(vec3.scale(outward, Math.cos(s)), vec3.scale(binormal, Math.sin(s))));
}

// point on the tube surface at (t, s)
export function tubePoint(k: KnotShape, t: number, s: number): Vec3Arg {
    return vec3.add(knotCentre(k, t), vec3.scale(tubeNormal(k, t, s), k.tubeRadius));
}
