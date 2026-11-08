export interface ControlNet {
  countU: number;
  countV: number;
  points: Float32Array;
}

export function flatControlNet(countU = 6, countV = 6, size = 2): ControlNet {
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
  return { countU, countV, points };
}
