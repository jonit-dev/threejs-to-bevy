const system_audioFacade = (ctx) => {
  const play = ctx.audio.play("sound.hit", { entity: "player" });
  const query = ctx.audio.query(play.playbackId);
  const stop = ctx.audio.stop(play.playbackId);
  const postStopQuery = ctx.audio.query(play.playbackId);
  ctx.resources.set("AudioReport", {
    play,
    postStopQuery,
    query,
    stop
  });
};

export const systemIds = Object.freeze({ system_audioFacade: "audioFacade" });
export const systems = Object.freeze({ system_audioFacade });
