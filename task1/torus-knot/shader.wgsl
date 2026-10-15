struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f
};

struct Matrices {
  viewProjection: mat4x4f,
};

@group(0) @binding(0) var<uniform> matrices: Matrices;

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
