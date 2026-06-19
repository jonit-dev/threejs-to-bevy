const movedTransform = {
  position: [4, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1]
};

const system_moveEnemy = (ctx) => {
  ctx.commands.setComponent("enemy.b", "Transform", movedTransform);
};

const system_reportChanged = (ctx) => {
  const ids = ctx.query({
    changed: ["Transform"],
    limit: 1,
    offset: 0,
    orderBy: "id",
    with: ["Transform"],
    without: ["Visibility"]
  }).map((entity) => entity.id);
  ctx.resources.set("QueryReport", { ids });
};

export const systemIds = Object.freeze({
  system_moveEnemy: "moveEnemy",
  system_reportChanged: "reportChanged"
});

export const systems = Object.freeze({
  system_moveEnemy,
  system_reportChanged
});
