// shader for a simple plane

struct Camera {
  viewProjection : mat4x4f,
  eye            : vec4f,
  viewport       : vec4f,
};

@group(0) @binding(0) var<uniform> camera : Camera;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) world : vec3f,
};

@vertex
fn vs_main(@location(0) position : vec4f) -> VertexOut {
  var out : VertexOut;
  out.position = camera.viewProjection * vec4f(position.xyz, 1.0);
  out.world = position.xyz;
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var n = vec3f(0.0, 0.0, 1.0);
  let toEye = normalize(camera.eye.xyz - in.world);
  if (dot(n, toEye) < 0.0) { n = -n; } // lit from both sides
  let light = normalize(toEye + vec3f(0.3, 0.3, 0.6));
  let diffuse = max(dot(n, light), 0.0);
  let base = vec3f(0.45, 0.55, 0.75);
  return vec4f(base * (0.3 + 0.7 * diffuse), 1.0);
}
