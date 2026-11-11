// compute pass: evaluates the NURBS surface S(u, v) on a resU x resV grid,
// one thread per (u, v) sample. The result is used as vertex buffer

const MAX_DEGREE : u32 = 3u;
const MAX_P1 : u32 = MAX_DEGREE + 1u; // at most p + 1 basis functions are non-zero

struct Params {
  countU : u32, // control points in u
  countV : u32, // control points in v
  p      : u32, // degree in u
  q      : u32, // degree in v
  resU   : u32, // samples in u
  resV   : u32, // samples in v
  offV   : u32, // index where the v knots start in knots
  _pad   : u32, // unused, keeps the struct at 32 bytes
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read> controlPoints : array<vec4f>; // (wx, wy, wz, w)
@group(0) @binding(2) var<storage, read> knots : array<f32>;           // U, then V from offV
@group(0) @binding(3) var<storage, read_write> positions : array<vec4f>;

fn knot(off : u32, i : u32) -> f32 {
  return knots[off + i];
}

// binary search over the knots
fn findSpan(n : u32, p : u32, u : f32, off : u32) -> u32 {
  if (u >= knot(off, n + 1u)) { return n; } // u = 1 belongs to the last span
  if (u <= knot(off, p)) { return p; }
  var low = p;
  var high = n + 1u;
  var span = (low + high) / 2u;
  while (u < knot(off, span) || u >= knot(off, span + 1u)) {
    if (u < knot(off, span)) { high = span; } else { low = span; }
    span = (low + high) / 2u;
  }
  return span;
}

// non-zero basis functions at u:
// N[0] = N_{span-p, p}(u) ... N[p] = N_{span, p}(u)
fn basisFuns(span : u32, u : f32, p : u32, off : u32) -> array<f32, MAX_P1> {
  var N : array<f32, MAX_P1>;
  var left : array<f32, MAX_P1>;
  var right : array<f32, MAX_P1>;
  N[0] = 1.0;
  for (var j = 1u; j <= p; j++) {
    left[j] = u - knot(off, span + 1u - j);
    right[j] = knot(off, span + j) - u;
    var saved = 0.0;
    for (var r = 0u; r < j; r++) {
      let temp = N[r] / (right[r + 1u] + left[j - r]);
      N[r] = saved + right[r + 1u] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

// weighted sum of the active control points (in homogeneous coordinates)
fn surfacePoint(u : f32, v : f32) -> vec3f {
  let p = params.p;
  let q = params.q;
  let uspan = findSpan(params.countU - 1u, p, u, 0u);
  let vspan = findSpan(params.countV - 1u, q, v, params.offV);
  let Nu = basisFuns(uspan, u, p, 0u);
  let Nv = basisFuns(vspan, v, q, params.offV);

  var Sw = vec4f(0.0);
  for (var l = 0u; l <= q; l++) {
    let row = (vspan - q + l) * params.countU; // start of control point row j
    var temp = vec4f(0.0);
    for (var k = 0u; k <= p; k++) {
      temp += Nu[k] * controlPoints[row + uspan - p + k];
    }
    Sw += Nv[l] * temp;
  }
  return Sw.xyz / Sw.w;
}

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) id : vec3u) {
  // the grid is rounded up to whole workgroups: skip threads outside it
  if (id.x >= params.resU || id.y >= params.resV) { return; }

  let u = f32(id.x) / f32(params.resU - 1u);
  let v = f32(id.y) / f32(params.resV - 1u);
  positions[id.y * params.resU + id.x] = vec4f(surfacePoint(u, v), 1.0);
}
