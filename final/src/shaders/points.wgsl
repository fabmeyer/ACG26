// Control points (dots of constant pixel size); positions from control-point storage buffer

struct Camera {
  viewProjection : mat4x4f,
  eye            : vec4f,
  viewport       : vec4f, // width, height in pixels
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> controlPoints : array<vec4f>;
@group(0) @binding(2) var<uniform> selection : vec4i; // x = selected index, -1 for none

const RADIUS_PX : f32 = 6.0;
const SELECTED_RADIUS_PX : f32 = 9.0;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) corner : vec2f,
  @location(1) @interpolate(flat) selected : u32,
};

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let corner = corners[vi];
  let isSelected = i32(ii) == selection.x;
  let radius = select(RADIUS_PX, SELECTED_RADIUS_PX, isSelected);

  let Pw = controlPoints[ii];
  var clip = camera.viewProjection * vec4f(Pw.xyz / Pw.w, 1.0);
  // offset in clip space so the dot has a fixed size in pixels at any distance
  clip = vec4f(clip.xy + corner * radius * 2.0 / camera.viewport.xy * clip.w, clip.zw);

  var out : VertexOut;
  out.position = clip;
  out.corner = corner;
  out.selected = select(0u, 1u, isSelected);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let r = length(in.corner);
  if (r > 1.0) { discard; }
  let fill = select(vec3f(1.0, 0.6, 0.2), vec3f(1.0, 0.95, 0.4), in.selected == 1u);
  let rim = smoothstep(0.7, 0.85, r);
  return vec4f(mix(fill, vec3f(0.1), rim), 1.0);
}
