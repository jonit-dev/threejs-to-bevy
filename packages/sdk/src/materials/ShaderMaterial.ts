import { SdkError, assertFiniteNumber } from "../errors.js";
import type { IAssetReference } from "../assets.js";
import {
  type ColorValue,
  type MaterialAlphaMode,
  type MaterialBlendMode,
  type TextureSlotReference,
  validateColor,
} from "./MeshStandardMaterial.js";

export type ShaderBuiltinInput = "cameraPosition" | "elapsedTime" | "modelMatrix" | "normal" | "position" | "projectionMatrix" | "uv0" | "uv1" | "vertexColor" | "viewMatrix" | "worldPosition";
export type ShaderOutput = "alpha" | "baseColor" | "discard" | "emissive";
export type ShaderUniformType = "bool" | "color" | "float" | "int" | "vec2" | "vec3" | "vec4";
export type ShaderExpressionKind = "builtin" | "literal" | "sampleTexture" | "uniform";
export type ShaderLiteralValue = boolean | number | string | readonly number[];

export interface IShaderUniformOptions {
  default: ShaderLiteralValue;
  name: string;
  type: ShaderUniformType;
}

export interface IShaderTextureOptions {
  asset: TextureSlotReference;
  name: string;
}

export interface IShaderExpression {
  builtin?: ShaderBuiltinInput;
  kind: ShaderExpressionKind;
  texture?: string;
  uniform?: string;
  value?: ShaderLiteralValue;
}

export interface IShaderProgramOptions {
  fragment: {
    outputs: Partial<Record<ShaderOutput, IShaderExpression>>;
  };
  vertex?: {
    displacement?: {
      amount: IShaderExpression;
      axis: "normal" | "x" | "y" | "z";
    };
  };
}

export interface IShaderMaterialOptions {
  alphaCutoff?: number;
  alphaMode?: MaterialAlphaMode;
  blendMode?: MaterialBlendMode;
  color?: ColorValue;
  depthTest?: boolean;
  depthWrite?: boolean;
  emissive?: ColorValue;
  emissiveIntensity?: number;
  inputs?: readonly ShaderBuiltinInput[];
  outputs?: readonly ShaderOutput[];
  program: IShaderProgramOptions;
  renderOrder?: number;
  textures?: readonly IShaderTextureOptions[];
  uniforms?: readonly IShaderUniformOptions[];
}

export class ShaderMaterial {
  public readonly alphaCutoff?: number;
  public readonly alphaMode: MaterialAlphaMode;
  public readonly blendMode?: MaterialBlendMode;
  public readonly color?: ColorValue;
  public readonly depthTest?: boolean;
  public readonly depthWrite?: boolean;
  public readonly emissive?: ColorValue;
  public readonly emissiveIntensity: number;
  public readonly inputs?: readonly ShaderBuiltinInput[];
  public readonly kind = "shader" as const;
  public readonly outputs?: readonly ShaderOutput[];
  public readonly program: IShaderProgramOptions & { language: "threenative-shader-v1" };
  public readonly renderOrder?: number;
  public readonly textures?: readonly IShaderTextureOptions[];
  public readonly uniforms?: readonly IShaderUniformOptions[];

  public constructor(options: IShaderMaterialOptions) {
    this.alphaCutoff = options.alphaCutoff;
    this.alphaMode = options.alphaMode ?? "opaque";
    this.blendMode = options.blendMode;
    this.color = options.color === undefined ? undefined : validateColor(options.color);
    this.depthTest = options.depthTest;
    this.depthWrite = options.depthWrite;
    this.emissive = options.emissive === undefined ? undefined : validateColor(options.emissive);
    this.emissiveIntensity = options.emissiveIntensity ?? 1;
    this.inputs = options.inputs === undefined ? undefined : [...options.inputs];
    this.outputs = options.outputs === undefined ? undefined : [...options.outputs];
    this.program = { ...options.program, language: "threenative-shader-v1" };
    this.renderOrder = options.renderOrder;
    this.textures = options.textures?.map((texture) => ({ asset: texture.asset, name: texture.name }));
    this.uniforms = options.uniforms?.map((uniform) => ({ default: cloneLiteral(uniform.default), name: uniform.name, type: uniform.type }));
    if (this.blendMode !== undefined && this.alphaMode !== "blend") {
      throw new SdkError("TN_SDK_MATERIAL_BLEND_MODE_INVALID", "ShaderMaterial.blendMode requires alphaMode 'blend'.");
    }
    if (this.alphaCutoff !== undefined) {
      assertFiniteNumber(this.alphaCutoff, "TN_SDK_MATERIAL_INVALID_VALUE", "ShaderMaterial.alphaCutoff");
    }
    if (this.renderOrder !== undefined) {
      assertFiniteNumber(this.renderOrder, "TN_SDK_MATERIAL_INVALID_VALUE", "ShaderMaterial.renderOrder");
    }
    assertFiniteNumber(this.emissiveIntensity, "TN_SDK_MATERIAL_INVALID_VALUE", "ShaderMaterial.emissiveIntensity");
    validateShaderNames(this.uniforms?.map((uniform) => uniform.name) ?? [], "uniform");
    validateShaderNames(this.textures?.map((texture) => texture.name) ?? [], "texture");
  }
}

export function shaderUniform(name: string, type: ShaderUniformType, defaultValue: ShaderLiteralValue): IShaderUniformOptions {
  return { default: cloneLiteral(defaultValue), name, type };
}

export function shaderTexture(name: string, asset: TextureSlotReference | IAssetReference): IShaderTextureOptions {
  return { asset, name };
}

export function shaderLiteral(value: ShaderLiteralValue): IShaderExpression {
  return { kind: "literal", value: cloneLiteral(value) };
}

export function shaderUniformRef(uniform: string): IShaderExpression {
  return { kind: "uniform", uniform };
}

export function shaderTextureSample(texture: string): IShaderExpression {
  return { kind: "sampleTexture", texture };
}

export function shaderBuiltin(builtin: ShaderBuiltinInput): IShaderExpression {
  return { builtin, kind: "builtin" };
}

function validateShaderNames(values: readonly string[], label: string): void {
  for (const value of values) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new SdkError("TN_SDK_SHADER_IDENTIFIER_INVALID", `Shader ${label} name '${value}' must be a portable identifier.`);
    }
  }
}

function cloneLiteral(value: ShaderLiteralValue): ShaderLiteralValue {
  return Array.isArray(value) ? [...value] : value;
}
