const kNumBodies = 8192;
const kWorkgroupSize = 64;

// WGSL shader source.
const wgsl = `
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

[[stage(compute), workgroup_size(${kWorkgroupSize})]]
fn cs_main(
  [[builtin(global_invocation_id)]] gid : vec3<u32>,
  ) {
  let idx = gid.x;
  let pos = positionsIn.data[idx];

  // Compute force.
  var force = vec4<f32>(0.0);
  for (var i = 0; i < ${kNumBodies}; i = i + 1) {
    force = force + computeForce(pos, positionsIn.data[i]);
  }

  // Update velocity.
  var velocity = velocities.data[idx];
  velocity = velocity + force * kDelta;
  velocities.data[idx] = velocity;

  // Update position.
  positionsOut.data[idx] = pos + velocity * kDelta;
}

[[stage(vertex)]]
fn vs_main(
  [[builtin(instance_index)]] idx : u32,
  [[builtin(vertex_index)]] vertex : u32,
  [[location(0)]] position : vec4<f32>,
  ) -> [[builtin(position)]] vec4<f32> {

  var vertexOffsets = array<vec2<f32>, 3>(
    vec2<f32>(0.01, -0.01),
    vec2<f32>(-0.01, -0.01),
    vec2<f32>(0.0, 0.01),
  );

  return vec4<f32>(position.xy + vertexOffsets[vertex], position.zw);
}

[[stage(fragment)]]
fn fs_main() -> [[location(0)]] vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`

let device: GPUDevice = null;
let queue: GPUQueue = null;
let computePipeline: GPUComputePipeline;
let renderPipeline: GPURenderPipeline;
let canvas: HTMLCanvasElement = null;
let canvasContext: GPUCanvasContext = null;
let positionsIn: GPUBuffer = null;
let positionsOut: GPUBuffer = null;
let velocities: GPUBuffer = null;
let bindGroup: GPUBindGroup = null;

const init = async () => {
  // Reset pipelines.
  renderPipeline = null;
  computePipeline = null;

  // Initialize the WebGPU device.
  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  queue = device.queue;

  // Set up the canvas context.
  canvas = <HTMLCanvasElement>document.getElementById('canvas');
  canvasContext = canvas.getContext('webgpu');
  canvasContext.configure({
    device: device,
    format: 'bgra8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  // Create a vertex buffer for positions.
  positionsIn = device.createBuffer({
    size: kNumBodies * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    mappedAtCreation: true
  });
  positionsOut = device.createBuffer({
    size: kNumBodies * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    mappedAtCreation: false
  });
  velocities = device.createBuffer({
    size: kNumBodies * 4 * 4,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: false
  });
  let positionsMapped = new Float32Array(positionsIn.getMappedRange());
  initBodies(positionsMapped);
  positionsIn.unmap();

  // Create the shader module.
  const module = device.createShaderModule({ code: wgsl });

  // Create the render pipeline.
  const positionsAttribute: GPUVertexAttribute = {
    shaderLocation: 0,
    offset: 0,
    format: 'float32x4',
  };
  const positionsLayout: GPUVertexBufferLayout = {
    attributes: [positionsAttribute],
    arrayStride: 4 * 4,
    stepMode: 'instance',
  };
  renderPipeline = device.createRenderPipeline({
    vertex: {
      module: module,
      entryPoint: 'vs_main',
      buffers: [positionsLayout],
    },
    fragment: {
      module: module,
      entryPoint: 'fs_main',
      targets: [{ format: 'bgra8unorm' }],
    },
    primitive: {
      frontFace: 'cw',
      cullMode: 'none',
      topology: 'triangle-list',
    },
  });

  // Create the compute pipeline.
  computePipeline = device.createComputePipeline({
    compute: {
      module: module,
      entryPoint: 'cs_main',
    },
  });
}

const initBodies = (positions: Float32Array) => {
  // Generate initial positions on the surface of a sphere.
  const kRadius = 0.6;
  for (let i = 0; i < kNumBodies; i++) {
    let longitude = 2.0 * Math.PI * Math.random();
    let latitude = Math.acos((2.0 * Math.random() - 1.0));
    positions[i * 4 + 0] = kRadius * Math.sin(latitude) * Math.cos(longitude);
    positions[i * 4 + 1] = kRadius * Math.sin(latitude) * Math.sin(longitude);
    positions[i * 4 + 2] = kRadius * Math.cos(latitude);
    positions[i * 4 + 3] = 1.0;
  }
}

// Render loop.
const kFpsLogInterval = 2000;
let numFramesSinceLastLog = 0;
let lastLogTime = null;
const draw = () => {
  if (!computePipeline) {
    // Not ready yet.
    requestAnimationFrame(draw);
    return;
  }

  // Log the average FPS every 2 seconds.
  if (lastLogTime) {
    const now = performance.now();
    const timeSinceLastLog = now - lastLogTime;
    if (timeSinceLastLog >= kFpsLogInterval) {
      const fps = numFramesSinceLastLog / (timeSinceLastLog / 1000.0);
      console.log(`Average FPS = ${fps}`);
      lastLogTime = performance.now();
      numFramesSinceLastLog = 0;
    }
  } else {
    lastLogTime = performance.now();
  }
  numFramesSinceLastLog++;

  const commandEncoder = device.createCommandEncoder();

  // Create the bind group for the compute shader.
  bindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: positionsIn,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: positionsOut,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: velocities,
        },
      },
    ],
  });

  // Set up the compute shader dispatch.
  const computePassEncoder = commandEncoder.beginComputePass();
  computePassEncoder.setPipeline(computePipeline);
  computePassEncoder.setBindGroup(0, bindGroup);
  computePassEncoder.dispatch(kNumBodies / kWorkgroupSize);
  computePassEncoder.endPass();

  // Set up the render pass.
  const colorTexture: GPUTexture = canvasContext.getCurrentTexture();
  const colorTextureView: GPUTextureView = colorTexture.createView();
  const colorAttachment: GPURenderPassColorAttachment = {
    view: colorTextureView,
    loadValue: { r: 0, g: 0, b: 0, a: 1 },
    storeOp: 'store'
  };
  const renderPassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [colorAttachment],
  });
  renderPassEncoder.setPipeline(renderPipeline);
  renderPassEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
  renderPassEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
  renderPassEncoder.setVertexBuffer(0, positionsOut);
  renderPassEncoder.draw(3, kNumBodies);
  renderPassEncoder.endPass();

  queue.submit([commandEncoder.finish()]);

  // Swap the positions buffers.
  [positionsIn, positionsOut] = [positionsOut, positionsIn];

  requestAnimationFrame(draw);
}

function run() {
  init();
}

init();
draw();
