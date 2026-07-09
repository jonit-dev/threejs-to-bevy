const system_characterContactProbe = (ctx) => {
  ctx.character.move("player", { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 1 });
};

export const systemIds = Object.freeze({
  system_characterContactProbe: "characterContactProbe",
});

export const systems = Object.freeze({
  system_characterContactProbe,
});
