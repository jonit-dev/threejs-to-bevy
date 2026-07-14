import test from "node:test";

import type { ScriptContext } from "@threenative/script-stdlib";

import type { ISystemContext } from "./contextTypes.js";

type Assert<T extends true> = T;
type RuntimeContextIsPublicContext = Assert<ISystemContext extends ScriptContext ? true : false>;

test("should keep the web runtime context assignable to public ScriptContext", () => {
  const assignable: RuntimeContextIsPublicContext = true;
  void assignable;
});
