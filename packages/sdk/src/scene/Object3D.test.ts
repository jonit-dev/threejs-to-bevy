import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { Group } from "./Group.js";
import { Object3D } from "./Object3D.js";

test("should reparent child when added to new parent", () => {
  const firstParent = new Object3D({ id: "parent.first" });
  const secondParent = new Object3D({ id: "parent.second" });
  const child = new Object3D({ id: "child" });

  firstParent.add(child);
  secondParent.add(child);
  secondParent.add(child);

  assert.equal(child.parent, secondParent);
  assert.deepEqual(firstParent.children, []);
  assert.deepEqual(secondParent.children, [child]);
});

test("should reject hierarchy cycles", () => {
  const root = new Object3D({ id: "root" });
  const child = new Object3D({ id: "child" });

  root.add(child);

  assert.throws(
    () => {
      child.add(root);
    },
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_HIERARCHY_CYCLE",
  );
});

test("group should inherit object hierarchy behavior", () => {
  const root = new Group({ id: "room.entry" });
  const child = new Object3D({ id: "spawn.enemy" });
  const visited: string[] = [];

  root.add(child);
  root.traverse((object) => visited.push(object.id ?? ""));
  root.remove(child);

  assert.equal(root.name, "room.entry");
  assert.equal(child.parent, undefined);
  assert.deepEqual(root.children, []);
  assert.deepEqual(visited, ["room.entry", "spawn.enemy"]);
});
