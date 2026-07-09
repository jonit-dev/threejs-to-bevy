import type {
  IShaderExpressionIr,
  IShaderMaterialIr,
  IShaderTextureIr,
  IShaderUniformIr,
  ShaderOutput,
  ShaderUniformType,
} from "./types.js";

export interface IGeneratedShaderTarget {
  code: string;
  entryPoints: readonly string[];
  language: "glsl100" | "wgsl";
}

export interface IShaderBindingLayoutEntry {
  binding: number;
  kind: "sampler2d" | "uniform";
  name: string;
  type: string;
}

export interface IGeneratedPortableShader {
  bindingLayout: readonly IShaderBindingLayoutEntry[];
  fragmentOutputs: readonly ShaderOutput[];
  glsl: IGeneratedShaderTarget;
  materialId: string;
  wgsl: IGeneratedShaderTarget;
}

export function generatePortableShaderMaterial(material: IShaderMaterialIr): IGeneratedPortableShader {
  const uniforms = [...(material.uniforms ?? [])].sort((left, right) => left.name.localeCompare(right.name));
  const textures = [...(material.textures ?? [])].sort((left, right) => left.name.localeCompare(right.name));
  const outputs = Object.keys(material.program.fragment.outputs).sort() as ShaderOutput[];
  const bindingLayout: IShaderBindingLayoutEntry[] = [
    ...uniforms.map((uniform, index) => ({
      binding: index,
      kind: "uniform" as const,
      name: uniform.name,
      type: uniform.type,
    })),
    ...textures.map((texture, index) => ({
      binding: uniforms.length + index,
      kind: "sampler2d" as const,
      name: texture.name,
      type: "texture2d",
    })),
  ];

  return {
    bindingLayout,
    fragmentOutputs: outputs,
    glsl: {
      code: generateGlsl(material, uniforms, textures, outputs),
      entryPoints: ["vertexMain", "fragmentMain"],
      language: "glsl100",
    },
    materialId: material.id,
    wgsl: {
      code: generateWgsl(material, uniforms, textures, outputs),
      entryPoints: ["vertex_main", "fragment_main"],
      language: "wgsl",
    },
  };
}

function generateGlsl(
  material: IShaderMaterialIr,
  uniforms: readonly IShaderUniformIr[],
  textures: readonly IShaderTextureIr[],
  outputs: readonly ShaderOutput[],
): string {
  const lines = [
    "precision highp float;",
    "attribute vec3 position;",
    "attribute vec3 normal;",
    "attribute vec2 uv;",
    "attribute vec2 uv1;",
    "attribute vec4 color;",
    "uniform mat4 modelMatrix;",
    "uniform mat4 modelViewMatrix;",
    "uniform mat4 projectionMatrix;",
    "uniform mat4 viewMatrix;",
    "uniform vec3 cameraPosition;",
    "uniform float elapsedTime;",
    ...uniforms.map((uniform) => `uniform ${glslUniformType(uniform.type)} ${uniform.name};`),
    ...textures.map((texture) => `uniform sampler2D ${texture.name};`),
    "varying vec3 vNormal;",
    "varying vec2 vUv0;",
    "varying vec2 vUv1;",
    "varying vec4 vVertexColor;",
    "varying vec3 vWorldPosition;",
    "void vertexMain() {",
    "  vec3 transformed = position;",
  ];
  const displacement = material.program.vertex?.displacement;
  if (displacement !== undefined) {
    lines.push(`  transformed += ${glslDisplacementAxis(displacement.axis)} * (${glslExpression(displacement.amount)});`);
  }
  lines.push(
    "  vNormal = normal;",
    "  vUv0 = uv;",
    "  vUv1 = uv1;",
    "  vVertexColor = color;",
    "  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);",
    "  vWorldPosition = worldPosition.xyz;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);",
    "}",
    "void main() { vertexMain(); }",
    "void fragmentMain() {",
  );
  const fragmentOutputs = material.program.fragment.outputs;
  if (fragmentOutputs.discard !== undefined) {
    lines.push(`  if (${glslExpression(fragmentOutputs.discard)} > 0.5) discard;`);
  }
  lines.push(`  vec4 outColor = ${glslOutputColor(fragmentOutputs.baseColor)};`);
  if (fragmentOutputs.alpha !== undefined) {
    lines.push(`  outColor.a = ${glslExpression(fragmentOutputs.alpha)};`);
  }
  if (outputs.includes("emissive") && fragmentOutputs.emissive !== undefined) {
    lines.push(`  outColor.rgb += ${glslExpression(fragmentOutputs.emissive)}.rgb;`);
  }
  lines.push("  gl_FragColor = outColor;", "}", "void main() { fragmentMain(); }");
  return `${lines.join("\n")}\n`;
}

function generateWgsl(
  material: IShaderMaterialIr,
  uniforms: readonly IShaderUniformIr[],
  textures: readonly IShaderTextureIr[],
  _outputs: readonly ShaderOutput[],
): string {
  const bindingLines = uniforms.flatMap((uniform, index) => [
    `@group(1) @binding(${index}) var<uniform> ${uniform.name}: ${wgslUniformType(uniform.type)};`,
  ]);
  const textureLines = textures.flatMap((texture, index) => {
    const binding = uniforms.length + index;
    return [
      `@group(1) @binding(${binding}) var ${texture.name}: texture_2d<f32>;`,
      `@group(1) @binding(${binding + textures.length}) var ${texture.name}Sampler: sampler;`,
    ];
  });
  const displacement = material.program.vertex?.displacement;
  const fragmentOutputs = material.program.fragment.outputs;
  return `${[
    "struct VertexInput {",
    "  @location(0) position: vec3<f32>,",
    "  @location(1) normal: vec3<f32>,",
    "  @location(2) uv0: vec2<f32>,",
    "  @location(3) uv1: vec2<f32>,",
    "  @location(4) color: vec4<f32>,",
    "};",
    "struct VertexOutput {",
    "  @builtin(position) clip_position: vec4<f32>,",
    "  @location(0) normal: vec3<f32>,",
    "  @location(1) uv0: vec2<f32>,",
    "  @location(2) uv1: vec2<f32>,",
    "  @location(3) color: vec4<f32>,",
    "  @location(4) world_position: vec3<f32>,",
    "};",
    ...bindingLines,
    ...textureLines,
    "@vertex",
    "fn vertex_main(input: VertexInput) -> VertexOutput {",
    "  var out: VertexOutput;",
    `  let displaced = input.position${displacement === undefined ? "" : ` + (${wgslDisplacementAxis(displacement.axis)} * (${wgslExpression(displacement.amount)}))`};`,
    "  out.clip_position = vec4<f32>(displaced, 1.0);",
    "  out.normal = input.normal;",
    "  out.uv0 = input.uv0;",
    "  out.uv1 = input.uv1;",
    "  out.color = input.color;",
    "  out.world_position = displaced;",
    "  return out;",
    "}",
    "@fragment",
    "fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {",
    fragmentOutputs.discard === undefined ? "" : `  if (${wgslExpression(fragmentOutputs.discard)} > 0.5) { discard; }`,
    `  var out_color = ${wgslOutputColor(fragmentOutputs.baseColor)};`,
    fragmentOutputs.alpha === undefined ? "" : `  out_color.a = ${wgslExpression(fragmentOutputs.alpha)};`,
    fragmentOutputs.emissive === undefined ? "" : `  out_color = vec4<f32>(out_color.rgb + ${wgslExpression(fragmentOutputs.emissive)}.rgb, out_color.a);`,
    "  return out_color;",
    "}",
  ].filter((line) => line.length > 0).join("\n")}\n`;
}

function glslExpression(expression: IShaderExpressionIr | undefined): string {
  if (expression === undefined) {
    return "vec4(1.0)";
  }
  switch (expression.kind) {
    case "builtin":
      return glslBuiltin(expression.builtin);
    case "literal":
      return glslLiteral(expression.value);
    case "sampleTexture":
      return `texture2D(${expression.texture}, vUv0)`;
    case "uniform":
      return expression.uniform ?? "0.0";
  }
}

function wgslExpression(expression: IShaderExpressionIr | undefined): string {
  if (expression === undefined) {
    return "vec4<f32>(1.0, 1.0, 1.0, 1.0)";
  }
  switch (expression.kind) {
    case "builtin":
      return wgslBuiltin(expression.builtin);
    case "literal":
      return wgslLiteral(expression.value);
    case "sampleTexture":
      return `textureSample(${expression.texture}, ${expression.texture}Sampler, input.uv0)`;
    case "uniform":
      return expression.uniform ?? "0.0";
  }
}

function glslOutputColor(expression: IShaderExpressionIr | undefined): string {
  const value = glslExpression(expression);
  return expression?.kind === "literal" && Array.isArray(expression.value) && expression.value.length === 3
    ? `vec4(${value}, 1.0)`
    : value;
}

function wgslOutputColor(expression: IShaderExpressionIr | undefined): string {
  const value = wgslExpression(expression);
  return expression?.kind === "literal" && Array.isArray(expression.value) && expression.value.length === 3
    ? `vec4<f32>(${value}, 1.0)`
    : value;
}

function glslLiteral(value: IShaderExpressionIr["value"]): string {
  if (typeof value === "boolean") {
    return value ? "1.0" : "0.0";
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string") {
    return cssHexToVec(value, "glsl");
  }
  if (Array.isArray(value)) {
    return `vec${value.length}(${value.map(formatNumber).join(", ")})`;
  }
  return "0.0";
}

function wgslLiteral(value: IShaderExpressionIr["value"]): string {
  if (typeof value === "boolean") {
    return value ? "1.0" : "0.0";
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string") {
    return cssHexToVec(value, "wgsl");
  }
  if (Array.isArray(value)) {
    return `vec${value.length}<f32>(${value.map(formatNumber).join(", ")})`;
  }
  return "0.0";
}

function glslBuiltin(value: IShaderExpressionIr["builtin"]): string {
  switch (value) {
    case "cameraPosition": return "cameraPosition";
    case "elapsedTime": return "elapsedTime";
    case "normal": return "vNormal";
    case "position": return "position";
    case "uv0": return "vec4(vUv0, 0.0, 1.0)";
    case "uv1": return "vec4(vUv1, 0.0, 1.0)";
    case "vertexColor": return "vVertexColor";
    case "worldPosition": return "vWorldPosition";
    case "modelMatrix": return "modelMatrix[0]";
    case "projectionMatrix": return "projectionMatrix[0]";
    case "viewMatrix": return "viewMatrix[0]";
    default: return "vec4(0.0)";
  }
}

function wgslBuiltin(value: IShaderExpressionIr["builtin"]): string {
  switch (value) {
    case "normal": return "input.normal";
    case "uv0": return "vec4<f32>(input.uv0, 0.0, 1.0)";
    case "uv1": return "vec4<f32>(input.uv1, 0.0, 1.0)";
    case "vertexColor": return "input.color";
    case "worldPosition":
    case "position": return "input.world_position";
    case "elapsedTime": return "elapsedTime";
    case "cameraPosition": return "cameraPosition";
    default: return "vec4<f32>(0.0, 0.0, 0.0, 0.0)";
  }
}

function glslUniformType(type: ShaderUniformType): string {
  return type === "color" ? "vec4" : type;
}

function wgslUniformType(type: ShaderUniformType): string {
  if (type === "color") {
    return "vec4<f32>";
  }
  if (type.startsWith("vec")) {
    return `vec${type.slice(3)}<f32>`;
  }
  return type === "bool" ? "u32" : "f32";
}

function glslDisplacementAxis(axis: "normal" | "x" | "y" | "z"): string {
  if (axis === "normal") {
    return "normal";
  }
  return axis === "x" ? "vec3(1.0, 0.0, 0.0)" : axis === "y" ? "vec3(0.0, 1.0, 0.0)" : "vec3(0.0, 0.0, 1.0)";
}

function wgslDisplacementAxis(axis: "normal" | "x" | "y" | "z"): string {
  if (axis === "normal") {
    return "input.normal";
  }
  return axis === "x" ? "vec3<f32>(1.0, 0.0, 0.0)" : axis === "y" ? "vec3<f32>(0.0, 1.0, 0.0)" : "vec3<f32>(0.0, 0.0, 1.0)";
}

function cssHexToVec(value: string, target: "glsl" | "wgsl"): string {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (match === null) {
    return target === "glsl" ? "vec4(1.0)" : "vec4<f32>(1.0, 1.0, 1.0, 1.0)";
  }
  const hex = match[1]!;
  const channels = [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
    hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  ];
  return target === "glsl"
    ? `vec4(${channels.map(formatNumber).join(", ")})`
    : `vec4<f32>(${channels.map(formatNumber).join(", ")})`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}.0`;
  }
  return Number(value.toFixed(6)).toString();
}
