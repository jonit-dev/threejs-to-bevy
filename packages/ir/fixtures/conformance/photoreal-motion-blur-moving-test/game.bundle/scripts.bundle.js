const system_moveMotionMarker = (ctx) => {
  const marker = ctx.query({ with: ["Transform"], without: ["Camera", "Light"] }).find((entity) => entity.id === "motion.marker");
  if (marker === undefined) {
    return;
  }
  const transform = marker.get("Transform");
  // Keep the marker moving through every capture window. The previous linear
  // path clamped at the right edge, so host timing could capture a stationary
  // object and falsely "prove" motion blur with no motion to blur.
  const x = Math.sin(ctx.time.elapsed * Math.PI) * 1.35;
  marker.patch("Transform", { ...transform, position: [x, 1.22, -1.92] });
};

export const systemIds = Object.freeze({ system_moveMotionMarker: "moveMotionMarker" });
export const systems = Object.freeze({ system_moveMotionMarker });
