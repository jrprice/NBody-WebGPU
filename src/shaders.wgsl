// Simulation parameters.
let kDelta = 0.000025;
let kSoftening = 0.2;

[[block]]
struct Float4Buffer {
  data : array<vec4<f32>>;
};

[[group(0), binding(0)]]
var<storage, read_write> positionsIn : Float4Buffer;

[[group(0), binding(1)]]
var<storage, read_write> positionsOut : Float4Buffer;

[[group(0), binding(2)]]
var<storage, read_write> velocities : Float4Buffer;

fn computeForce(ipos : vec4<f32>,
                jpos : vec4<f32>,
                ) -> vec4<f32> {
  let d = vec4<f32>((jpos - ipos).xyz, 0.0);
  let distSq = d.x*d.x + d.y*d.y + d.z*d.z + kSoftening*kSoftening;
  let dist   = inverseSqrt(distSq);
  let coeff  = jpos.w * (dist*dist*dist);
  return coeff * d;
}

[[stage(compute), workgroup_size(kWorkgroupSize)]]
fn cs_main(
  [[builtin(global_invocation_id)]] gid : vec3<u32>,
  ) {
  let idx = gid.x;
  let pos = positionsIn.data[idx];

  // Compute force.
  var force = vec4<f32>(0.0);
  for (var i = 0; i < kNumBodies; i = i + 1) {
    force = force + computeForce(pos, positionsIn.data[i]);
  }

  // Update velocity.
  var velocity = velocities.data[idx];
  velocity = velocity + force * kDelta;
  velocities.data[idx] = velocity;

  // Update position.
  positionsOut.data[idx] = pos + velocity * kDelta;
}

[[block]]
struct RenderParams {
  viewProjectionMatrix : mat4x4<f32>;
};

[[group(0), binding(0)]]
var<uniform> renderParams : RenderParams;

struct VertexOut {
  [[builtin(position)]] position : vec4<f32>;
  [[location(0)]] positionInQuad : vec2<f32>;
  [[location(1), interpolate(flat)]] color : vec3<f32>;
};

[[stage(vertex)]]
fn vs_main(
  [[builtin(instance_index)]] idx : u32,
  [[builtin(vertex_index)]] vertex : u32,
  [[location(0)]] position : vec4<f32>,
  ) -> VertexOut {

  let kPointRadius = 0.005;
  var vertexOffsets = array<vec2<f32>, 6>(
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, -1.0),
  );
  let offset = vertexOffsets[vertex];

  var out : VertexOut;
  out.position = renderParams.viewProjectionMatrix *
    vec4<f32>(position.xy + offset * kPointRadius, position.zw);
  out.positionInQuad = offset;
  if (idx % 2u == 0u) {
    out.color = vec3<f32>(0.4, 0.4, 1.0);
  } else {
    out.color = vec3<f32>(1.0, 0.4, 0.4);
  }
  return out;
}

[[stage(fragment)]]
fn fs_main(
  [[builtin(position)]] position : vec4<f32>,
  [[location(0)]] positionInQuad : vec2<f32>,
  [[location(1), interpolate(flat)]] color : vec3<f32>,
  ) -> [[location(0)]] vec4<f32> {
  // Calculate the normalized distance from this fragment to the quad center.
  let distFromCenter = length(positionInQuad);

  // Discard fragments that are outside the circle.
  if (distFromCenter > 1.0) {
    discard;
  }

  let intensity = 1.0 - distFromCenter;
  return vec4<f32>(intensity*color, 1.0);
}
