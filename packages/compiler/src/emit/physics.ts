import type { IPhysicsDeclaration } from "@threenative/sdk";

export function emitPhysics(physics: IPhysicsDeclaration | undefined, components: Record<string, unknown>): void {
  if (physics?.body !== undefined) components.RigidBody = definedFields(physics.body);
  if (physics?.collider !== undefined) components.Collider = definedFields(physics.collider);
  if (physics?.joint !== undefined) components.PhysicsJoint = definedFields(physics.joint);
  if (physics?.surface !== undefined) components.PhysicsSurface = definedFields(physics.surface);
  if (physics?.tireModel !== undefined) components.TireModel = definedFields(physics.tireModel);
  if (physics?.wheelAssembly !== undefined) components.WheelAssembly = definedFields(physics.wheelAssembly);
  if (physics?.vehicleController !== undefined) components.VehicleController = definedFields(physics.vehicleController);
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
