export interface ControlNet {
  countU: number;       // control points in u (n + 1)
  countV: number;       // control points in v (m + 1)
  p: number;            // degree in u (3 = cubic)
  q: number;            // degree in v
  knotsU: number[];     // countU + p + 1 values
  knotsV: number[];     // countV + q + 1 values
  points: Float32Array; // (w*x, w*y, w*z, w), index j * countU + i
}

export function clampedUniformKnots(count: number, degree: number): number[] {
  const last = count + degree; // index of the last knot
  const spans = count - degree; // number of non-empty knot intervals
  const knots: number[] = [];
  for (let i = 0; i <= last; i++) {
    if (i <= degree) knots.push(0);
    else if (i >= last - degree) knots.push(1);
    else knots.push((i - degree) / spans);
  }
  return knots;
}

export function flatControlNet(countU = 6, countV = 6, size = 2, p = 3, q = 3): ControlNet {
  const points = new Float32Array(countU * countV * 4);
  for (let j = 0; j < countV; j++) {
    for (let i = 0; i < countU; i++) {
      const x = (i / (countU - 1) - 0.5) * size;
      const y = (j / (countV - 1) - 0.5) * size;
      const z = 0;
      const w = 1;
      points.set([w * x, w * y, w * z, w], (j * countU + i) * 4);
    }
  }
  return {
    countU, countV, p, q,
    knotsU: clampedUniformKnots(countU, p),
    knotsV: clampedUniformKnots(countV, q),
    points,
  };
}
