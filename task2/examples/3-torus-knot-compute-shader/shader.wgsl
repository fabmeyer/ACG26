const PI: f32 = 3.141592653589793;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f
};

struct Matrices {
  viewProjection: mat4x4f,
};

struct TorusKnotParams {
  p: i32,
  q: i32,
  segments: i32,
  tubeSegments: i32,
  outerRadius: f32,
  innerRadius: f32,
  tubeRadius: f32
}

@group(0) @binding(0) var<uniform> matrices: Matrices;
@group(1) @binding(0) var<uniform> params: TorusKnotParams;
@group(1) @binding(1) var<storage, read_write> positionData: array<f32>;
@group(1) @binding(2) var<storage, read_write> normalData: array<f32>;
@group(1) @binding(3) var<storage, read_write> colorData: array<f32>;
@group(1) @binding(4) var<storage, read_write> indexData: array<i32>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id_a: vec3u) {
    var id: i32 = i32(id_a.x);
    if (id >= params.tubeSegments * params.segments) {
        return;
    }

    var t_i = id / params.tubeSegments;
    var s_i = id % params.tubeSegments;
    var t = f32(t_i) * 2 * PI / f32(params.segments);
    var s = f32(s_i) * 2 * PI / f32(params.tubeSegments);

    var center: vec3f = vec3f(
        (params.outerRadius + params.innerRadius * cos(f32(params.q) * t)) * cos(f32(params.p) * t),
        (params.outerRadius + params.innerRadius * cos(f32(params.q) * t)) * sin(f32(params.p) * t),
        params.innerRadius * sin(f32(params.q) * t)
    );
    
    var nPrime: vec3f = vec3f(
        cos(f32(params.p) * t) * cos(f32(params.q) * t),
        sin(f32(params.p) * t) * cos(f32(params.q) * t),
        sin(f32(params.q) * t)
    );

    var tPrime: vec3f = vec3f(-sin(f32(params.p) * t), cos(f32(params.p) * t), 0.0) + vec3f(
        -sin(f32(params.q) * t) * cos(f32(params.p) * t),
        -sin(f32(params.q) * t) * sin(f32(params.p) * t),
        cos(f32(params.q) * t)
    ) * f32(params.q) * params.innerRadius;
    tPrime = normalize(tPrime * f32(params.p) * (params.outerRadius + params.innerRadius * cos(f32(params.q) * t)));
    var bPrime: vec3f = cross(tPrime, nPrime);
    var normal: vec3f = normalize(nPrime * cos(s) + bPrime * sin(s));
    var position: vec3f = center + normal * params.tubeRadius;

    var vbase = id * 3;
    positionData[vbase] = position.x;
    positionData[vbase+1] = position.y;
    positionData[vbase+2] = position.z;

    normalData[vbase] = normal.x;
    normalData[vbase+1] = normal.y;
    normalData[vbase+2] = normal.z;

    colorData[vbase] = (cos(t) + 1) * 0.5;
    colorData[vbase+1] = (cos(s) + 1) * 0.5;
    colorData[vbase+2] = (sin(t) + 1) * 0.5;

    var base: i32 = id * 6;
    var a: i32 = t_i * params.tubeSegments + s_i;
    var b: i32 = t_i * params.tubeSegments + (s_i + 1) % params.tubeSegments;
    var d: i32 = ((t_i + 1) % params.segments) * params.tubeSegments + s_i;
    var c: i32 = ((t_i + 1) % params.segments) * params.tubeSegments + (s_i + 1) % params.tubeSegments;
    indexData[base] = a;
    indexData[base + 1] = d;
    indexData[base + 2] = c;
    indexData[base + 3] = a;
    indexData[base + 4] = c;
    indexData[base + 5] = b;
}

@vertex
fn vs_main(
    @location(0) position : vec3f,
    @location(1) color : vec3f,
    @location(2) normal: vec3f
) -> VertexOut {
  var out: VertexOut;
  out.position = matrices.viewProjection * vec4f(position, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
