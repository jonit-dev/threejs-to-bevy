/** @jsxImportSource @threenative/r3f */
import { boxCollider, capsuleCollider, physics, rigidBody } from "@threenative/sdk";

export const playerPhysics = physics({
  body: rigidBody("kinematic", { velocity: [0, 0, 0] }),
  collider: capsuleCollider(0.35, 1.4),
});

export const enemyPhysics = physics({
  body: rigidBody("dynamic", { mass: 1 }),
  collider: capsuleCollider(0.3, 1.2),
});

export const arenaPhysics = physics({ collider: boxCollider([8, 0.2, 8]) });
