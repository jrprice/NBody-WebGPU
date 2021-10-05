// WGSL shader source.
const wgsl = `
[[block]]
struct Float4Buffer {
  data : array<vec4<f32>>;
};

[[group(0), binding(0)]]
var<storage> positions : Float4Buffer;

[[stage(vertex)]]
fn vs_main(
  [[builtin(instance_index)]] idx : u32,
  [[builtin(vertex_index)]] vertex : u32,
  ) -> [[builtin(position)]] vec4<f32> {

  var vertexOffsets = array<vec2<f32>, 3>(
    vec2<f32>(0.1, -0.1),
    vec2<f32>(-0.1, -0.1),
    vec2<f32>(0.0, 0.1),
  );

  let pos = positions.data[idx];
  return vec4<f32>(pos.xy + vertexOffsets[vertex], pos.zw);
}

[[stage(fragment)]]
fn fs_main() -> [[location(0)]] vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
`

let device: GPUDevice = null;
let queue: GPUQueue = null;
let renderPipeline: GPURenderPipeline;
let canvas: HTMLCanvasElement = null;
let canvasContext: GPUCanvasContext = null;
let positionsBuffer: GPUBuffer = null;
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
  positionsBuffer = device.createBuffer({
    size: 3 * 4 * 4,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true
  });
  let positionsMapped = new Float32Array(positionsBuffer.getMappedRange());
  positionsMapped.set(positions);
  positionsBuffer.unmap();

  // Create the shader module.
  const module = device.createShaderModule({ code: wgsl });

  // Create the render pipeline.
  renderPipeline = device.createRenderPipeline({
    vertex: {
      module: module,
      entryPoint: 'vs_main',
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

  // Create the bind group.
  bindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: positionsBuffer,
        },
      },
    ],
  });

  draw();
}

// Render loop.
const draw = () => {
  const colorTexture: GPUTexture = canvasContext.getCurrentTexture();
  const colorTextureView: GPUTextureView = colorTexture.createView();
  const colorAttachment: GPURenderPassColorAttachment = {
    view: colorTextureView,
    loadValue: { r: 0, g: 0, b: 0, a: 1 },
    storeOp: 'store'
  };
  const commandEncoder = device.createCommandEncoder();
  const renderPassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [colorAttachment],
  });
  renderPassEncoder.setPipeline(renderPipeline);
  renderPassEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
  renderPassEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
  renderPassEncoder.setBindGroup(0, bindGroup);
  renderPassEncoder.draw(3, 3);
  renderPassEncoder.endPass();

  queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(draw);
}

init();
