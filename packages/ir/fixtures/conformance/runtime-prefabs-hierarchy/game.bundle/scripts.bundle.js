const system_spawnPrefab = (ctx) => {
  ctx.commands.instantiate("prefab.crate", "runtime.crate");
  ctx.commands.setParent("runtime.crate.root", "anchor");
  ctx.commands.clearParent("runtime.crate.child");
};

export const systemIds = Object.freeze({
  system_spawnPrefab: "spawnPrefab"
});

export const systems = Object.freeze({
  system_spawnPrefab
});
