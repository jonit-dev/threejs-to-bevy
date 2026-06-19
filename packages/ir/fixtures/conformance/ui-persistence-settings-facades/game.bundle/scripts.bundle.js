const system_reportFacades = (ctx) => {
  const slots = ctx.persistence.listSlots();
  const saved = ctx.persistence.save("slot.auto");
  const loaded = ctx.persistence.load("slot.auto");
  ctx.settings.set("difficulty", "hard");
  const focus = ctx.ui.focus("settings.volume");
  const activated = ctx.ui.activate("play");
  ctx.ui.setValue("settings.volume", 0.75);
  const value = ctx.ui.read("settings.volume");
  ctx.ui.setDisabled("settings.volume", true);
  const disabled = ctx.ui.read("settings.volume");

  ctx.resources.set("FacadeReport", {
    action: activated.action,
    difficulty: ctx.settings.get("difficulty"),
    disabled: disabled.disabled,
    focused: value.focused,
    loadedScore: loaded.record.resources.Score.value,
    previousFocus: focus.previous,
    saved: saved.accepted,
    slots,
    value: value.value,
    volume: ctx.settings.get("volume")
  });
};

export const systemIds = Object.freeze({
  system_reportFacades: "reportFacades"
});

export const systems = Object.freeze({
  system_reportFacades
});
