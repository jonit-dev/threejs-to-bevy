export const img2ThreejsCompatibility = {
  allowedExtensions: ["KHR_materials_emissive_strength", "KHR_materials_unlit", "KHR_texture_transform"],
  geometryAttributes: { color: [3, 4], normal: [3], position: [3], tangent: [4], uv: [2], uv1: [2], uv2: [2], uv3: [2] },
  materialTypes: ["MeshBasicMaterial", "MeshStandardMaterial"],
  maxResourceBytes: 16 * 1024 * 1024,
  maxTextureDimension: 4096,
  objectTypes: ["Group", "Mesh", "Object3D"],
  textureSlots: {
    aoMap: "NoColorSpace",
    emissiveMap: "SRGBColorSpace",
    map: "SRGBColorSpace",
    metalnessMap: "NoColorSpace",
    normalMap: "NoColorSpace",
    roughnessMap: "NoColorSpace",
  },
} as const;

export interface IImg2ThreejsGlbContract {
  extensions: string[];
  images: Array<{ bufferView: number; mimeType: string }>;
}

export function inspectImg2ThreejsGlbContract(bytes: Uint8Array): IImg2ThreejsGlbContract {
  if (bytes.byteLength < 20 || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "glTF") {
    throw compatibilityError("TN_IMG2THREEJS_GLTF_INVALID", "Generated output is not a binary GLB.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > bytes.byteLength - 20) {
    throw compatibilityError("TN_IMG2THREEJS_GLTF_INVALID", "Generated GLB has an invalid JSON chunk.");
  }
  let json: {
    buffers?: Array<{ uri?: unknown }>;
    extensionsRequired?: string[];
    extensionsUsed?: string[];
    images?: Array<{ bufferView?: unknown; mimeType?: unknown; uri?: unknown }>;
  };
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim()) as typeof json;
  } catch {
    throw compatibilityError("TN_IMG2THREEJS_GLTF_INVALID", "Generated GLB JSON chunk cannot be parsed.");
  }
  for (const [index, buffer] of (json.buffers ?? []).entries()) {
    if (buffer.uri !== undefined) throw compatibilityError("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", `/buffers/${index}/uri: external buffers are unsupported.`);
  }
  const allowed = new Set<string>(img2ThreejsCompatibility.allowedExtensions);
  const extensions = [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])].sort();
  for (const extension of extensions) {
    if (!allowed.has(extension)) throw compatibilityError("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", `/extensionsUsed: '${extension}' is outside the v1 compatibility matrix.`);
  }
  const images = (json.images ?? []).map((image, index) => {
    if (image.uri !== undefined || !Number.isInteger(image.bufferView) || typeof image.mimeType !== "string" || !/^image\/(?:png|jpeg)$/u.test(image.mimeType)) {
      throw compatibilityError("TN_IMG2THREEJS_TEXTURE_LOAD_FAILED", `/images/${index}: images must be embedded bufferViews with PNG or JPEG MIME.`);
    }
    return { bufferView: image.bufferView as number, mimeType: image.mimeType };
  });
  return { extensions, images };
}

export function renderImg2ThreejsCompatibilityModule(): string {
  return `export const compatibility = ${JSON.stringify(img2ThreejsCompatibility)};`;
}

function compatibilityError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
