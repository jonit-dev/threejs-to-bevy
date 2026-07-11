import type { ILightProbeIr, Vec3 } from "@threenative/ir";
import * as THREE from "three";

export interface IWebBakedProbeLighting {
  readonly appliedProbeIds: readonly string[];
  readonly light: THREE.LightProbe;
  sync(position: THREE.Vector3): void;
}

interface IBakedProbe {
  bounds: ILightProbeIr["bounds"];
  coefficients: readonly number[];
  id: string;
  influenceRadius: number;
}

export function createWebBakedProbeLighting(probes: readonly ILightProbeIr[] | undefined): IWebBakedProbeLighting | undefined {
  const baked = (probes ?? []).flatMap((probe): IBakedProbe[] => isBakedSource(probe.source)
    ? [{ bounds: probe.bounds, coefficients: probe.source.coefficients, id: probe.id, influenceRadius: probe.influenceRadius }]
    : []);
  if (baked.length === 0) return undefined;

  const light = new THREE.LightProbe(new THREE.SphericalHarmonics3(), 0);
  light.name = "threenative:baked-gi-probes";
  light.userData.threeNativeAppliedMode = "camera-weighted-sh2";
  const sync = (position: THREE.Vector3): void => {
    const weights = baked.map((probe) => probeWeight(position, probe));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const coefficients = Array<number>(27).fill(0);
    if (totalWeight > 0) {
      for (let probeIndex = 0; probeIndex < baked.length; probeIndex++) {
        const scale = weights[probeIndex]! / totalWeight;
        for (let coefficient = 0; coefficient < 27; coefficient++) {
          coefficients[coefficient] = coefficients[coefficient]! + baked[probeIndex]!.coefficients[coefficient]! * scale;
        }
      }
      light.sh.fromArray(coefficients);
      light.intensity = 1;
    } else {
      light.sh.zero();
      light.intensity = 0;
    }
  };
  return { appliedProbeIds: baked.map((probe) => probe.id), light, sync };
}

function isBakedSource(source: ILightProbeIr["source"]): source is Extract<ILightProbeIr["source"], { format: "sh2" }> {
  return "format" in source && source.format === "sh2" && source.coefficients.length === 27;
}

function probeWeight(position: THREE.Vector3, probe: IBakedProbe): number {
  const distance = distanceToBounds([position.x, position.y, position.z], probe.bounds);
  if (distance === 0) return 1;
  if (probe.influenceRadius <= 0 || distance >= probe.influenceRadius) return 0;
  const normalized = 1 - distance / probe.influenceRadius;
  return normalized * normalized;
}

function distanceToBounds(position: Vec3, bounds: ILightProbeIr["bounds"]): number {
  const dx = Math.max(bounds.min[0] - position[0], 0, position[0] - bounds.max[0]);
  const dy = Math.max(bounds.min[1] - position[1], 0, position[1] - bounds.max[1]);
  const dz = Math.max(bounds.min[2] - position[2], 0, position[2] - bounds.max[2]);
  return Math.hypot(dx, dy, dz);
}
