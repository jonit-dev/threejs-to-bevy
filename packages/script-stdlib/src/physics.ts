import type { IScriptVehicleSetInputsResult, IVehicleControllerInput } from "@threenative/ir";
import type { ScriptEntity, ScriptPhysicsFacade } from "./script-context.js";

export interface VehicleFacade {
  readonly entity: string;
  setInputs(inputs: IVehicleControllerInput): IScriptVehicleSetInputsResult;
}

/** Conventional per-vehicle wrapper layered on ctx.physics.vehicle.setInputs. */
export function vehicle(physics: ScriptPhysicsFacade, entity: string | ScriptEntity): VehicleFacade {
  const entityId = typeof entity === "string" ? entity : entity.id;
  return {
    entity: entityId,
    setInputs: (inputs) => physics.vehicle.setInputs(entityId, inputs),
  };
}
