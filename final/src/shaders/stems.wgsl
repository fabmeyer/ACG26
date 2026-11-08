// red vertical line from each control point down to the plane (z = 0)

struct Camera {
  viewProjection : mat4x4f,
  eye            : vec4f,
  viewport       : vec4f,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> controlPoints : array<vec4f>;

const PLANE_Z : f32 = 0.0; // the plane stays flat at z = 0

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> @builtin(position) vec4f {
  let Pw = controlPoints[ii];
  var p = Pw.xyz / Pw.w;
  if (vi == 1u) { p.z = PLANE_Z; } // vertex 0: the point, vertex 1: its foot on the plane
  return camera.viewProjection * vec4f(p, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(0.9, 0.15, 0.15, 1.0);
}
