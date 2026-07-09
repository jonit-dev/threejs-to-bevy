export const systems = {
  system_queueDelayedSpawn(ctx) {
    const state = ctx.resources.get("SchedulerState", { queued: false });
    if (state.queued) {
      return;
    }
    ctx.schedule.afterTicks({ id: "spawnMarker", delayTicks: 2 });
    ctx.schedule.afterTicks({ id: "emitDelayedSpawned", delayTicks: 2 });
    ctx.resources.set("SchedulerState", { queued: true });
  }
};
