// render pass for the tessellated NURBS surface

struct Camera {
  viewProjection : mat4x4f,
  eye            : vec4f,
  viewport       : vec4f,
};

@group(0) @binding(0) var<uniform> camera : Camera;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) height : f32,
};

@vertex
fn vs_main(@location(0) position : vec4f) -> VertexOut {
  var out : VertexOut;
  out.position = camera.viewProjection * vec4f(position.xyz, 1.0);
  out.height = position.z;
  return out;
}

// determine color of pixel (color shows the height for now)
@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let base = vec3f(0.45, 0.55, 0.75);
  let brightness = clamp(0.75 + 0.5 * in.height, 0.25, 1.0 / 0.75);
  return vec4f(base * brightness, 1.0);
}
