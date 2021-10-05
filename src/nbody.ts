// WGSL shader source.
const wgsl = `
[[stage(vertex)]]
fn vs_main([[location(0)]] inPos: vec3<f32>) -> [[builtin(position)]] vec4<f32> {
    return vec4<f32>(inPos, 1.0);
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
    1.0, -1.0, 0.0,
    -1.0, -1.0, 0.0,
    0.0, 1.0, 0.0,
  ]);
  positionsBuffer = device.createBuffer({
    size: 3 * 3 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true
  });
  let positionsMapped = new Float32Array(positionsBuffer.getMappedRange());
  positionsMapped.set(positions);
  positionsBuffer.unmap();

  // Create the shader module.
  const module = device.createShaderModule({ code: wgsl });

  // Create the render pipeline.
  const positionsAttribute: GPUVertexAttribute = {
    shaderLocation: 0,
    offset: 0,
    format: 'float32x3',
  };
  const positionsLayout: GPUVertexBufferLayout = {
    attributes: [positionsAttribute],
    arrayStride: 4 * 3,
    stepMode: 'vertex',
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
  renderPassEncoder.setVertexBuffer(0, positionsBuffer);
  renderPassEncoder.draw(3);
  renderPassEncoder.endPass();

  queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(draw);
}

init();
