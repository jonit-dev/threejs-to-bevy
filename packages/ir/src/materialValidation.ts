import type { IAssetsManifest, IMaterialsIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

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
      const value = material[slot];
      if (value !== undefined && !textureAssets.has(value) && !renderTargetTextures.has(value)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING",
          message: `Material '${material.id}' references unknown texture asset '${value}'.`,
          path: `${path}/materials/${materialIndex}/${slot}`,
          severity: "error",
          suggestion: `Add texture asset '${value}' to assets.manifest.json or remove the ${slot} reference from material '${material.id}'.`,
        });
      }
    });
  });
}

export function validateMaterials(materials: IMaterialsIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const supportedBlendModes = new Set(["normal", "additive", "multiply", "premultipliedAlpha"]);
  const supportedExtendedPresets = new Set(["unlitMasked", "foliage"]);
  materials.materials.forEach((material, index) => {
    const raw = material as unknown as Record<string, unknown>;
    diagnoseUnsupportedAdvancedMaterialFields(raw, `${path}/materials/${index}`, diagnostics);
    if (raw.kind !== "standard" && raw.kind !== "extended") {
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
          message: `Extended material '${material.id}' must declare an extension preset.`,
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
    } else if (material.extension !== undefined) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EXTENSION_INVALID",
        message: `Standard material '${material.id}' cannot declare extension metadata.`,
        path: `${path}/materials/${index}/extension`,
        severity: "error",
        suggestion: "Remove extension from standard materials or change kind to 'extended'.",
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
    if (material.emissiveIntensity !== undefined && (!Number.isFinite(material.emissiveIntensity) || material.emissiveIntensity < 0)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EMISSIVE_INTENSITY_INVALID",
        message: `Material '${material.id}' emissiveIntensity must be a non-negative finite number.`,
        path: `${path}/materials/${index}/emissiveIntensity`,
        severity: "error",
        suggestion: "Set emissiveIntensity to 0 or a positive finite value.",
      });
    }
    if (material.emissiveBloom !== undefined) {
      const bloom = material.emissiveBloom as unknown as Record<string, unknown>;
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
      if (bloom.enabled === true && material.emissive === undefined && material.emissiveTexture === undefined) {
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
      const value = material[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
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

function diagnoseUnsupportedAdvancedMaterialFields(raw: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const unsupportedFields = new Map<string, { code: string; message: string; suggestion: string }>([
    ["lightMap", {
      code: "TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED",
      message: "Material lightmaps and mixed baked/dynamic lighting are not part of the portable material contract.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["lightmapIntensity", {
      code: "TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED",
      message: "Material lightmap intensity is not portable without promoted lightmap metadata.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["lightmapTexture", {
      code: "TN_IR_MATERIAL_LIGHTMAP_UNSUPPORTED",
      message: "Material lightmap textures are not part of the portable material contract.",
      suggestion: "Use promoted environment maps/light probes or wait for static lightmap metadata with web/native report evidence.",
    }],
    ["depthMap", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Parallax/depth material maps are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["depthTexture", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Parallax/depth material textures are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["heightMap", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Height maps for parallax material rendering are not part of the portable material contract.",
      suggestion: "Bake the height detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["heightScale", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Height/parallax scale is not portable without promoted parallax mapping.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["parallaxScale", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Parallax scale is not portable without promoted parallax mapping.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["parallaxTexture", {
      code: "TN_IR_MATERIAL_PARALLAX_UNSUPPORTED",
      message: "Parallax textures are not part of the portable material contract.",
      suggestion: "Bake the depth detail into normal/occlusion textures or wait for a promoted parallax mapping contract.",
    }],
    ["anisotropy", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Anisotropy is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["anisotropyRotation", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Anisotropy rotation is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["anisotropyTexture", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Anisotropy textures are not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["iridescence", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Iridescence is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["sheen", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Sheen is not part of the portable material contract.",
      suggestion: "Use promoted clearcoat, transmission, specular intensity, and texture slots until advanced PBR fields are promoted.",
    }],
    ["specularColor", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
      message: "Specular tint/color is not part of the portable material contract.",
      suggestion: "Use promoted specularIntensity and specularTexture until advanced PBR fields are promoted.",
    }],
    ["specularTint", {
      code: "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED",
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
