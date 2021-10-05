// WGSL shader source.
const wgsl = `
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

// TODO: Better workgroup size
[[stage(compute), workgroup_size(1)]]
fn cs_main(
  [[builtin(global_invocation_id)]] gid : vec3<u32>,
  ) {
  let idx = gid.x;
  // TODO: Implement N-Body logic.
  let pos = positionsIn.data[idx];
  positionsOut.data[idx] = pos + vec4<f32>(0.001, 0.0, 0.0, 0.0);
  ignore(velocities);
}

[[stage(vertex)]]
fn vs_main(
  [[builtin(instance_index)]] idx : u32,
  [[builtin(vertex_index)]] vertex : u32,
  [[location(0)]] position : vec4<f32>,
  ) -> [[builtin(position)]] vec4<f32> {

  var vertexOffsets = array<vec2<f32>, 3>(
    vec2<f32>(0.1, -0.1),
    vec2<f32>(-0.1, -0.1),
    vec2<f32>(0.0, 0.1),
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
  const positions = new Float32Array([
    0.5, -0.5, 0.0, 1.0,
    -0.5, -0.5, 0.0, 1.0,
    0.0, 0.5, 0.0, 1.0,
  ]);
  positionsIn = device.createBuffer({
    size: 3 * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    mappedAtCreation: true
  });
  positionsOut = device.createBuffer({
    size: 3 * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    mappedAtCreation: false
  });
  velocities = device.createBuffer({
    size: 3 * 4 * 4,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: false
  });
  let positionsMapped = new Float32Array(positionsIn.getMappedRange());
  positionsMapped.set(positions);
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

  draw();
}

// Render loop.
const draw = () => {
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
  computePassEncoder.dispatch(3);
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
  renderPassEncoder.draw(3, 3);
  renderPassEncoder.endPass();

  queue.submit([commandEncoder.finish()]);

  // Swap the positions buffers.
  [positionsIn, positionsOut] = [positionsOut, positionsIn];

  requestAnimationFrame(draw);
}

init();
