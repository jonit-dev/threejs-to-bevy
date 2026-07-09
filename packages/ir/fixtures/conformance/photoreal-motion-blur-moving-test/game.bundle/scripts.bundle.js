const system_moveMotionMarker = (ctx) => {
  const marker = ctx.query({ with: ["Transform"], without: ["Camera", "Light"] }).find((entity) => entity.id === "motion.marker");
  if (marker === undefined) {
    return;
  }
  const transform = marker.get("Transform");
  const x = Math.min(1.35, -2.4 + ctx.time.elapsed * 1.45);
  marker.patch("Transform", { ...transform, position: [x, 1.22, -1.92] });
};

export const systemIds = Object.freeze({ system_moveMotionMarker: "moveMotionMarker" });
export const systems = Object.freeze({ system_moveMotionMarker });
