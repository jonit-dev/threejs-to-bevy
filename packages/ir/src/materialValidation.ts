import type { IAssetsManifest, IMaterialsIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { residualDiagnosticCode } from "./bevyCatalogResiduals.js";

export function validateMaterialTextureRefs(materials: IMaterialsIr, assets: IAssetsManifest | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  const textureAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "texture").map((asset) => asset.id));
  const renderTargetTextures = new Set(
    (assets?.assets ?? [])
      .filter((asset): asset is Extract<typeof asset, { kind: "render-target" }> => asset.kind === "render-target" && asset.usage === "color")
      .map((asset) => asset.id),
  );
  const slots = [
    "baseColorTexture",
    "normalTexture",
    "metallicRoughnessTexture",
    "emissiveTexture",
    "occlusionTexture",
    "clearcoatTexture",
    "clearcoatRoughnessTexture",
    "transmissionTexture",
    "specularTexture",
  ] as const;
  materials.materials.forEach((material, materialIndex) => {
    slots.forEach((slot) => {
      const value = (material as unknown as Record<string, unknown>)[slot];
      if (typeof value === "string" && !textureAssets.has(value) && !renderTargetTextures.has(value)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING",
          message: `Material '${material.id}' references unknown texture asset '${value}'.`,
          path: `${path}/materials/${materialIndex}/${slot}`,
          severity: "error",
          suggestion: `Add texture asset '${value}' to assets.manifest.json or remove the ${slot} reference from material '${material.id}'.`,
        });
      }
    });
    if (material.kind === "shader") {
      material.textures?.forEach((texture, textureIndex) => {
        if (!textureAssets.has(texture.asset) && !renderTargetTextures.has(texture.asset)) {
          diagnostics.push({
            code: "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING",
            message: `Shader material '${material.id}' references unknown texture asset '${texture.asset}'.`,
            path: `${path}/materials/${materialIndex}/textures/${textureIndex}/asset`,
            severity: "error",
            suggestion: `Add texture asset '${texture.asset}' to assets.manifest.json or remove the shader texture binding '${texture.name}'.`,
          });
        }
      });
    }
  });
}

export function validateMaterials(materials: IMaterialsIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const supportedBlendModes = new Set(["normal", "additive", "multiply", "premultipliedAlpha"]);
  const supportedExtendedPresets = new Set(["unlitMasked", "foliage"]);
  const supportedShaderUniformTypes = new Set(["bool", "color", "float", "int", "vec2", "vec3", "vec4"]);
  const supportedShaderInputs = new Set(["cameraPosition", "elapsedTime", "modelMatrix", "normal", "position", "projectionMatrix", "uv0", "uv1", "vertexColor", "viewMatrix", "worldPosition"]);
  const supportedShaderOutputs = new Set(["alpha", "baseColor", "discard", "emissive"]);
  const supportedShaderExpressionKinds = new Set(["builtin", "literal", "sampleTexture", "uniform"]);
  materials.materials.forEach((material, index) => {
    const raw = material as unknown as Record<string, unknown>;
    diagnoseUnsupportedAdvancedMaterialFields(raw, `${path}/materials/${index}`, diagnostics);
    if (raw.kind !== "standard" && raw.kind !== "extended" && raw.kind !== "shader") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_UNSUPPORTED",
        message: `Material '${material.id}' uses unsupported material kind '${String(raw.kind)}'.`,
        path: `${path}/materials/${index}/kind`,
      });
    }
    if (material.kind === "extended") {
      if (material.extension === undefined) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EXTENSION_MISSING",
          message: `Extended material '${String(raw.id)}' must declare an extension preset.`,
          path: `${path}/materials/${index}/extension`,
          severity: "error",
          suggestion: "Add extension.preset with a supported portable preset such as 'unlitMasked' or 'foliage'.",
        });
      } else if (!supportedExtendedPresets.has(material.extension.preset)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EXTENSION_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported extended preset '${material.extension.preset}'.`,
          path: `${path}/materials/${index}/extension/preset`,
          severity: "error",
          suggestion: "Use a supported extended preset: unlitMasked or foliage.",
        });
      }
    } else if (raw.extension !== undefined) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EXTENSION_INVALID",
        message: `Material '${material.id}' cannot declare extension metadata unless kind is 'extended'.`,
        path: `${path}/materials/${index}/extension`,
        severity: "error",
        suggestion: "Remove extension from standard materials or change kind to 'extended'.",
      });
    }
    if (material.kind === "shader") {
      validateShaderMaterial(material as unknown as Record<string, unknown>, `${path}/materials/${index}`, diagnostics, {
        supportedShaderExpressionKinds,
        supportedShaderInputs,
        supportedShaderOutputs,
        supportedShaderUniformTypes,
      });
    } else if (material.color === undefined) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_COLOR_MISSING",
        message: `Material '${material.id}' must declare color unless kind is 'shader'.`,
        path: `${path}/materials/${index}/color`,
        severity: "error",
        suggestion: "Add a portable color or change kind to 'shader' with a program output.",
      });
    }
    if (material.renderOrder !== undefined && (!Number.isInteger(material.renderOrder) || !Number.isFinite(material.renderOrder))) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_RENDER_ORDER_INVALID",
        message: `Material '${material.id}' renderOrder must be a finite integer.`,
        path: `${path}/materials/${index}/renderOrder`,
        severity: "error",
        suggestion: "Set renderOrder to an integer such as 0, 1, or -1.",
      });
    }
    if (material.depthWrite !== undefined && typeof material.depthWrite !== "boolean") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_WRITE_INVALID",
        message: `Material '${material.id}' depthWrite must be a boolean.`,
        path: `${path}/materials/${index}/depthWrite`,
        severity: "error",
      });
    }
    if (material.depthTest !== undefined && typeof material.depthTest !== "boolean") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_TEST_INVALID",
        message: `Material '${material.id}' depthTest must be a boolean.`,
        path: `${path}/materials/${index}/depthTest`,
        severity: "error",
      });
    }
    if (material.blendMode !== undefined) {
      if (!supportedBlendModes.has(material.blendMode)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported blendMode '${material.blendMode}'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Use blendMode 'normal', 'additive', 'multiply', or 'premultipliedAlpha'.",
        });
      } else if (material.alphaMode !== "blend") {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_INVALID",
          message: `Material '${material.id}' blendMode is only supported when alphaMode is 'blend'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Set alphaMode to 'blend' or remove blendMode.",
        });
      }
      if (material.blendMode !== "normal" && material.alphaMode === "mask") {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_INVALID",
          message: `Material '${material.id}' cannot combine alphaMode 'mask' with blendMode '${material.blendMode}'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Use alphaMode 'blend' for non-normal blend modes.",
        });
      }
    }
    const alphaMode = material.alphaMode ?? "opaque";
    if (material.depthTest === false && alphaMode === "opaque") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_TEST_INVALID",
        message: `Material '${material.id}' cannot disable depthTest on opaque materials.`,
        path: `${path}/materials/${index}/depthTest`,
        severity: "error",
        suggestion: "Use alphaMode 'blend' or remove depthTest: false from opaque materials.",
      });
    }
    if (material.alphaMode !== undefined && !["opaque", "mask", "blend"].includes(material.alphaMode)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_ALPHA_MODE_INVALID",
        message: `Material '${material.id}' uses unsupported alphaMode '${String(material.alphaMode)}'.`,
        path: `${path}/materials/${index}/alphaMode`,
        severity: "error",
        suggestion: "Use alphaMode 'opaque', 'mask', or 'blend'.",
      });
    }
    if (material.alphaCutoff !== undefined && (!Number.isFinite(material.alphaCutoff) || material.alphaCutoff < 0 || material.alphaCutoff > 1)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_ALPHA_CUTOFF_INVALID",
        message: `Material '${material.id}' alphaCutoff must be between 0 and 1.`,
        path: `${path}/materials/${index}/alphaCutoff`,
        severity: "error",
        suggestion: "Set alphaCutoff to a normalized value between 0 and 1.",
      });
    }
    if (material.opacity !== undefined && (!Number.isFinite(material.opacity) || material.opacity < 0 || material.opacity > 1)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_OPACITY_INVALID",
        message: `Material '${material.id}' opacity must be between 0 and 1.`,
        path: `${path}/materials/${index}/opacity`,
        severity: "error",
        suggestion: "Set opacity to a normalized value between 0 and 1.",
      });
    }
    const emissiveIntensity = raw.emissiveIntensity;
    if (typeof emissiveIntensity === "number" && (!Number.isFinite(emissiveIntensity) || emissiveIntensity < 0)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EMISSIVE_INTENSITY_INVALID",
        message: `Material '${material.id}' emissiveIntensity must be a non-negative finite number.`,
        path: `${path}/materials/${index}/emissiveIntensity`,
        severity: "error",
        suggestion: "Set emissiveIntensity to 0 or a positive finite value.",
      });
    }
    if (raw.emissiveBloom !== undefined) {
      const bloom = raw.emissiveBloom as Record<string, unknown>;
      if (typeof bloom.enabled !== "boolean") {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
          message: `Material '${material.id}' emissiveBloom.enabled must be a boolean.`,
          path: `${path}/materials/${index}/emissiveBloom/enabled`,
          severity: "error",
          suggestion: "Set emissiveBloom.enabled to true or false.",
        });
      }
      for (const key of ["intensity", "threshold"] as const) {
        const value = bloom[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          diagnostics.push({
            code: "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
            message: `Material '${material.id}' emissiveBloom.${key} must be a non-negative finite number.`,
            path: `${path}/materials/${index}/emissiveBloom/${key}`,
            severity: "error",
            suggestion: `Set emissiveBloom.${key} to 0 or a positive finite value.`,
          });
        }
      }
      if (bloom.enabled === true && raw.emissive === undefined && raw.emissiveTexture === undefined) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EMISSIVE_BLOOM_INVALID",
          message: `Material '${material.id}' enables emissiveBloom but has no emissive color or emissive texture.`,
          path: `${path}/materials/${index}/emissiveBloom`,
          severity: "error",
          suggestion: "Add emissive, emissiveTexture, or disable emissiveBloom.",
        });
      }
    }
    for (const key of ["clearcoat", "clearcoatRoughness", "specularIntensity", "transmission"] as const) {
      const value = raw[key];
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 1)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_FACTOR_INVALID",
          message: `Material '${material.id}' ${key} must be between 0 and 1.`,
          path: `${path}/materials/${index}/${key}`,
          severity: "error",
          suggestion: `Set ${key} to a normalized value between 0 and 1.`,
        });
      }
    }
    const unsupportedShaderFields: Array<{ code: string; field: string; feature: string }> = [
      { code: "TN_IR_SHADER_CUSTOM_UNSUPPORTED", field: "shader", feature: "custom shader payload" },
      { code: "TN_IR_SHADER_CUSTOM_UNSUPPORTED", field: "vertexShader", feature: "custom vertex shader payload" },
      { code: "TN_IR_SHADER_CUSTOM_UNSUPPORTED", field: "fragmentShader", feature: "custom fragment shader payload" },
      { code: "TN_IR_SHADER_CUSTOM_UNSUPPORTED", field: "nodeGraph", feature: "custom shader node graph" },
      { code: "TN_IR_SHADER_DEFS_UNSUPPORTED", field: "shaderDefs", feature: "shader definitions" },
      { code: "TN_IR_SHADER_STORAGE_BUFFER_UNSUPPORTED", field: "storageBuffer", feature: "shader storage buffer" },
      { code: "TN_IR_SHADER_STORAGE_BUFFER_UNSUPPORTED", field: "storageBuffers", feature: "shader storage buffers" },
      { code: "TN_IR_SHADER_RENDER_PHASE_UNSUPPORTED", field: "renderPhase", feature: "custom render phase" },
      { code: "TN_IR_SHADER_RENDER_PHASE_UNSUPPORTED", field: "renderPhases", feature: "custom render phases" },
      { code: "TN_IR_SHADER_BINDLESS_UNSUPPORTED", field: "bindless", feature: "bindless shader resources" },
      { code: "TN_IR_SHADER_BINDLESS_UNSUPPORTED", field: "bindlessTextures", feature: "bindless textures" },
      { code: "TN_IR_SHADER_CUSTOM_UNSUPPORTED", field: "postprocess", feature: "material-owned postprocess shader" },
    ];
    for (const { code, feature, field } of unsupportedShaderFields) {
      if (raw[field] !== undefined) {
        diagnostics.push({
          code,
          message: `Material '${material.id}' uses unsupported shader feature '${field}'.`,
          path: `${path}/materials/${index}/${field}`,
          severity: "error",
          suggestion: `Do not author ${feature} until ThreeNative has a constrained portable shader model, deterministic web/native resource binding, rejected-fixture coverage, and visual evidence.`,
        });
      }
    }
  });
}

function validateShaderMaterial(
  raw: Record<string, unknown>,
  path: string,
  diagnostics: IIrDiagnostic[],
  supported: {
    supportedShaderExpressionKinds: ReadonlySet<string>;
    supportedShaderInputs: ReadonlySet<string>;
    supportedShaderOutputs: ReadonlySet<string>;
    supportedShaderUniformTypes: ReadonlySet<string>;
  },
): void {
  const id = String(raw.id);
  const uniforms = Array.isArray(raw.uniforms) ? raw.uniforms : [];
  const textures = Array.isArray(raw.textures) ? raw.textures : [];
  const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
  const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
  const program = isRecord(raw.program) ? raw.program : undefined;
  const uniformNames = new Set<string>();
  const textureNames = new Set<string>();

  if (!program) {
    diagnostics.push({
      code: "TN_IR_SHADER_PROGRAM_MISSING",
      message: `Shader material '${id}' must declare a portable program.`,
      path: `${path}/program`,
      severity: "error",
      suggestion: "Add program.language 'threenative-shader-v1' and fragment outputs.",
    });
    return;
  }
  if (program.language !== "threenative-shader-v1") {
    diagnostics.push({
      code: "TN_IR_SHADER_DSL_UNSUPPORTED",
      message: `Shader material '${id}' uses unsupported shader language '${String(program.language)}'.`,
      path: `${path}/program/language`,
      severity: "error",
      suggestion: "Use language 'threenative-shader-v1'. Raw GLSL, WGSL, node graphs, and backend snippets are not portable.",
    });
  }
  for (const [uniformIndex, uniform] of uniforms.entries()) {
    if (!isRecord(uniform)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/uniforms/${uniformIndex}`, "uniform declaration must be an object"));
      continue;
    }
    if (typeof uniform.name === "string") {
      uniformNames.add(uniform.name);
    }
    if (typeof uniform.name !== "string" || !isPortableShaderName(uniform.name)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/uniforms/${uniformIndex}/name`, "uniform name must be a portable identifier"));
    }
    if (typeof uniform.type !== "string" || !supported.supportedShaderUniformTypes.has(uniform.type)) {
      diagnostics.push({
        code: "TN_IR_SHADER_UNIFORM_UNSUPPORTED",
        message: `Shader material '${id}' uses unsupported uniform type '${String(uniform.type)}'.`,
        path: `${path}/uniforms/${uniformIndex}/type`,
        severity: "error",
        suggestion: "Use uniform type bool, color, float, int, vec2, vec3, or vec4.",
      });
    }
    if (!isShaderLiteralValue(uniform.default)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/uniforms/${uniformIndex}/default`, "uniform default must be finite and JSON-serializable"));
    }
  }
  for (const [textureIndex, texture] of textures.entries()) {
    if (!isRecord(texture)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/textures/${textureIndex}`, "texture binding must be an object"));
      continue;
    }
    if (typeof texture.name === "string") {
      textureNames.add(texture.name);
    }
    if (typeof texture.name !== "string" || !isPortableShaderName(texture.name)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/textures/${textureIndex}/name`, "texture binding name must be a portable identifier"));
    }
    if (typeof texture.asset !== "string" || texture.asset.length === 0) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/textures/${textureIndex}/asset`, "texture binding must reference a texture asset id"));
    }
  }
  for (const [inputIndex, input] of inputs.entries()) {
    if (typeof input !== "string" || !supported.supportedShaderInputs.has(input)) {
      diagnostics.push({
        code: "TN_IR_SHADER_BUILTIN_UNSUPPORTED",
        message: `Shader material '${id}' requests unsupported shader input '${String(input)}'.`,
        path: `${path}/inputs/${inputIndex}`,
        severity: "error",
        suggestion: "Use promoted shader inputs such as position, normal, uv0, vertexColor, matrices, cameraPosition, or elapsedTime.",
      });
    }
  }
  for (const [outputIndex, output] of outputs.entries()) {
    if (typeof output !== "string" || !supported.supportedShaderOutputs.has(output)) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/outputs/${outputIndex}`, `unsupported shader output '${String(output)}'`));
    }
  }
  const fragment = isRecord(program.fragment) ? program.fragment : undefined;
  const fragmentOutputs = isRecord(fragment?.outputs) ? fragment.outputs : undefined;
  if (!fragmentOutputs || Object.keys(fragmentOutputs).length === 0) {
    diagnostics.push({
      code: "TN_IR_SHADER_OUTPUT_MISSING",
      message: `Shader material '${id}' must declare at least one fragment output.`,
      path: `${path}/program/fragment/outputs`,
      severity: "error",
      suggestion: "Declare a promoted output such as baseColor, emissive, alpha, or discard.",
    });
  } else {
    for (const [output, expression] of Object.entries(fragmentOutputs)) {
      if (!supported.supportedShaderOutputs.has(output)) {
        diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/program/fragment/outputs/${output}`, `unsupported shader output '${output}'`));
        continue;
      }
      validateShaderExpression(expression, `${path}/program/fragment/outputs/${output}`, id, uniformNames, textureNames, supported, diagnostics);
    }
  }
  const vertex = isRecord(program.vertex) ? program.vertex : undefined;
  const displacement = isRecord(vertex?.displacement) ? vertex.displacement : undefined;
  if (displacement !== undefined) {
    if (!["normal", "x", "y", "z"].includes(String(displacement.axis))) {
      diagnostics.push(makeShaderNodeDiagnostic(id, `${path}/program/vertex/displacement/axis`, "vertex displacement axis must be normal, x, y, or z"));
    }
    validateShaderExpression(displacement.amount, `${path}/program/vertex/displacement/amount`, id, uniformNames, textureNames, supported, diagnostics);
  }
}

function validateShaderExpression(
  value: unknown,
  path: string,
  materialId: string,
  uniformNames: ReadonlySet<string>,
  textureNames: ReadonlySet<string>,
  supported: {
    supportedShaderExpressionKinds: ReadonlySet<string>;
    supportedShaderInputs: ReadonlySet<string>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(makeShaderNodeDiagnostic(materialId, path, "shader expression must be an object"));
    return;
  }
  if (typeof value.kind !== "string" || !supported.supportedShaderExpressionKinds.has(value.kind)) {
    diagnostics.push(makeShaderNodeDiagnostic(materialId, `${path}/kind`, `unsupported shader expression kind '${String(value.kind)}'`));
    return;
  }
  if (value.kind === "uniform" && (typeof value.uniform !== "string" || !uniformNames.has(value.uniform))) {
    diagnostics.push({
      code: "TN_IR_SHADER_BINDING_UNDECLARED",
      message: `Shader material '${materialId}' references undeclared uniform '${String(value.uniform)}'.`,
      path: `${path}/uniform`,
      severity: "error",
      suggestion: "Declare the uniform in material.uniforms before referencing it from the portable shader program.",
    });
  }
  if (value.kind === "sampleTexture" && (typeof value.texture !== "string" || !textureNames.has(value.texture))) {
    diagnostics.push({
      code: "TN_IR_SHADER_BINDING_UNDECLARED",
      message: `Shader material '${materialId}' references undeclared texture '${String(value.texture)}'.`,
      path: `${path}/texture`,
      severity: "error",
      suggestion: "Declare the texture in material.textures before sampling it from the portable shader program.",
    });
  }
  if (value.kind === "builtin" && (typeof value.builtin !== "string" || !supported.supportedShaderInputs.has(value.builtin))) {
    diagnostics.push({
      code: "TN_IR_SHADER_BUILTIN_UNSUPPORTED",
      message: `Shader material '${materialId}' references unsupported builtin '${String(value.builtin)}'.`,
      path: `${path}/builtin`,
      severity: "error",
      suggestion: "Use promoted shader builtins such as position, normal, uv0, vertexColor, matrices, cameraPosition, or elapsedTime.",
    });
  }
  if (value.kind === "literal" && !isShaderLiteralValue(value.value)) {
    diagnostics.push(makeShaderNodeDiagnostic(materialId, `${path}/value`, "literal shader expression must use a finite scalar, boolean, color string, or finite number array"));
  }
}

function makeShaderNodeDiagnostic(materialId: string, path: string, issue: string): IIrDiagnostic {
  return {
    code: "TN_IR_SHADER_DSL_UNSUPPORTED",
    message: `Shader material '${materialId}' has unsupported portable shader node: ${issue}.`,
    path,
    severity: "error",
    suggestion: "Use the promoted shader v1 DSL: literal values, declared uniforms, declared texture samples, and promoted builtins only.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPortableShaderName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isShaderLiteralValue(value: unknown): boolean {
  if (typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function diagnoseUnsupportedAdvancedMaterialFields(raw: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const unsupportedFields = new Map<string, { code: string; message: string; suggestion: string }>([
    ["lightMap", {
      code: residualDiagnosticCode("materials.lightmaps"),
      message: "Material lightmaps and mixed baked/dynamic lighting are not part of the portable material contract.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["lightmapIntensity", {
      code: residualDiagnosticCode("materials.lightmaps"),
      message: "Material lightmap intensity is not portable without promoted lightmap metadata.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["lightmapTexture", {
      code: residualDiagnosticCode("materials.lightmaps"),
      message: "Material lightmap textures are not part of the portable material contract.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["depthMap", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Parallax/depth material maps are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["depthTexture", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Parallax/depth material textures are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["heightMap", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Height maps for parallax material rendering are not part of the portable material contract.",
      suggestion: "Bake the height detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["heightScale", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Height/parallax scale is not portable without promoted parallax mapping.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["parallaxScale", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Parallax scale is not portable without promoted parallax mapping.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["parallaxTexture", {
      code: residualDiagnosticCode("materials.parallax"),
      message: "Parallax textures are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["anisotropy", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Anisotropy is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["anisotropyRotation", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Anisotropy rotation is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["anisotropyTexture", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Anisotropy textures are not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["iridescence", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Iridescence is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["sheen", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Sheen is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["specularColor", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Specular tint/color is not part of the portable material contract.",
      suggestion: "Use promoted specularIntensity and specularTexture until advanced PBR fields are promoted.",
    }],
    ["specularTint", {
      code: residualDiagnosticCode("materials.advanced-pbr"),
      message: "Specular tint is not part of the portable material contract.",
      suggestion: "Use promoted specularIntensity and specularTexture until advanced PBR fields are promoted.",
    }],
  ]);
  for (const [field, diagnostic] of unsupportedFields) {
    if (raw[field] !== undefined) {
      diagnostics.push({
        code: diagnostic.code,
        message: diagnostic.message,
        path: `${path}/${field}`,
        severity: "error",
        suggestion: diagnostic.suggestion,
      });
    }
  }
}
