export const SCRIPT_STDLIB_BUNDLE_SOURCE = String.raw`
const EPSILON = 1e-9;
const NumberEx = Object.freeze({
  approximately(left, right, epsilon = 0.000001) { return Math.abs(NumberEx.finite(left, 0) - NumberEx.finite(right, 0)) <= Math.max(0, NumberEx.finite(epsilon, 0.000001)); },
  clamp(value, min, max) { const low = Math.min(NumberEx.finite(min, 0), NumberEx.finite(max, 0)); const high = Math.max(NumberEx.finite(min, 0), NumberEx.finite(max, 0)); return Math.min(Math.max(NumberEx.finite(value, low), low), high); },
  finite(value, fallback) { return typeof value === "number" && Number.isFinite(value) ? value : fallback ?? 0; },
  inverseLerp(min, max, value) { const start = NumberEx.finite(min, 0); const end = NumberEx.finite(max, 0); return Math.abs(end - start) <= EPSILON ? 0 : NumberEx.saturate((NumberEx.finite(value, start) - start) / (end - start)); },
  lerp(left, right, alpha) { const t = NumberEx.saturate(alpha); return NumberEx.finite(left, 0) + (NumberEx.finite(right, 0) - NumberEx.finite(left, 0)) * t; },
  moveToward(current, target, maxDelta) { const from = NumberEx.finite(current, 0); const to = NumberEx.finite(target, 0); const delta = Math.max(0, NumberEx.finite(maxDelta, 0)); return Math.abs(to - from) <= delta ? to : from + Math.sign(to - from) * delta; },
  pingPong(value, length = 1) { const size = Math.max(EPSILON, Math.abs(NumberEx.finite(length, 1))); return size - Math.abs(NumberEx.repeat(value, size * 2) - size); },
  remap(inMin, inMax, outMin, outMax, value) { return NumberEx.lerp(outMin, outMax, NumberEx.inverseLerp(inMin, inMax, value)); },
  repeat(value, length = 1) { const size = Math.max(EPSILON, Math.abs(NumberEx.finite(length, 1))); return ((NumberEx.finite(value, 0) % size) + size) % size; },
  round(value, precision = 3) { const scale = 10 ** Math.max(0, Math.trunc(NumberEx.finite(precision, 3))); return Math.round(NumberEx.finite(value, 0) * scale) / scale; },
  saturate(value) { return NumberEx.clamp(value, 0, 1); },
  sign(value) { const number = NumberEx.finite(value, 0); return number === 0 ? 0 : Math.sign(number); },
  wrap(value, min, max) { const low = NumberEx.finite(min, 0); const high = NumberEx.finite(max, 0); const size = high - low; return Math.abs(size) <= EPSILON ? low : low + NumberEx.repeat(NumberEx.finite(value, low) - low, size); },
});
const AngleEx = Object.freeze({
  degToRad(degrees) { return (NumberEx.finite(degrees, 0) * Math.PI) / 180; },
  deltaAngle(current, target) { return NumberEx.repeat(NumberEx.finite(target, 0) - NumberEx.finite(current, 0) + Math.PI, Math.PI * 2) - Math.PI; },
  moveTowardAngle(current, target, maxDelta) { return NumberEx.finite(current, 0) + NumberEx.moveToward(0, AngleEx.deltaAngle(current, target), maxDelta); },
  radToDeg(radians) { return (NumberEx.finite(radians, 0) * 180) / Math.PI; },
});
const Vec2 = Object.freeze({
  add(left, right) { const a = Vec2.from(left); const b = Vec2.from(right); return [a[0] + b[0], a[1] + b[1]]; },
  angle(value) { const vec = Vec2.from(value); return Math.atan2(vec[1], vec[0]); },
  distance(left, right) { return Vec2.length(Vec2.sub(left, right)); },
  dot(left, right) { const a = Vec2.from(left); const b = Vec2.from(right); return a[0] * b[0] + a[1] * b[1]; },
  from(value, fallback = [0, 0]) { const base = vec2Parts(value); const backup = vec2Parts(fallback); return [NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)), NumberEx.finite(base[1], NumberEx.finite(backup[1], 0))]; },
  fromAngle(angle, length = 1) { const size = NumberEx.finite(length, 1); return [Math.cos(NumberEx.finite(angle, 0)) * size, Math.sin(NumberEx.finite(angle, 0)) * size]; },
  length(value) { const vec = Vec2.from(value); return Math.hypot(vec[0], vec[1]); },
  lerp(left, right, alpha) { const a = Vec2.from(left); const b = Vec2.from(right); const t = NumberEx.saturate(alpha); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; },
  normalize(value) { const vec = Vec2.from(value); const length = Vec2.length(vec); return length <= EPSILON ? [0, 0] : [vec[0] / length, vec[1] / length]; },
  rotate(value, angle) { const vec = Vec2.from(value); const c = Math.cos(NumberEx.finite(angle, 0)); const s = Math.sin(NumberEx.finite(angle, 0)); return [vec[0] * c - vec[1] * s, vec[0] * s + vec[1] * c]; },
  round(value, precision = 3) { const vec = Vec2.from(value); return [NumberEx.round(vec[0], precision), NumberEx.round(vec[1], precision)]; },
  scale(value, scalar) { const vec = Vec2.from(value); const amount = NumberEx.finite(scalar, 0); return [vec[0] * amount, vec[1] * amount]; },
  sub(left, right) { const a = Vec2.from(left); const b = Vec2.from(right); return [a[0] - b[0], a[1] - b[1]]; },
});
const Vec3 = Object.freeze({
  add(left, right) { const a = Vec3.from(left); const b = Vec3.from(right); return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  angle(left, right) { const a = Vec3.normalize(left); const b = Vec3.normalize(right); return Math.acos(NumberEx.clamp(Vec3.dot(a, b), -1, 1)); },
  cross(left, right) { const a = Vec3.from(left); const b = Vec3.from(right); return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
  distance(left, right) { return Vec3.length(Vec3.sub(left, right)); },
  distance2d(left, right) { const a = Vec3.from(left); const b = Vec3.from(right); return Math.hypot(a[0] - b[0], a[2] - b[2]); },
  dot(left, right) { const a = Vec3.from(left); const b = Vec3.from(right); return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  from(value, fallback = [0, 0, 0]) { const base = vec3Parts(value); const backup = vec3Parts(fallback); return [NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)), NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)), NumberEx.finite(base[2], NumberEx.finite(backup[2], 0))]; },
  length(value) { const vec = Vec3.from(value); return Math.hypot(vec[0], vec[1], vec[2]); },
  lerp(left, right, alpha) { const a = Vec3.from(left); const b = Vec3.from(right); const t = NumberEx.saturate(alpha); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  moveToward(current, target, maxDistanceDelta) { const delta = Vec3.sub(target, current); const distance = Vec3.length(delta); if (distance <= EPSILON || distance <= NumberEx.finite(maxDistanceDelta, 0)) return Vec3.from(target); return Vec3.add(current, Vec3.scale(delta, Math.max(0, NumberEx.finite(maxDistanceDelta, 0)) / distance)); },
  normalize(value) { const vec = Vec3.from(value); const length = Vec3.length(vec); return length <= EPSILON ? [0, 0, 0] : [vec[0] / length, vec[1] / length, vec[2] / length]; },
  projectOnPlane(value, normal) { const n = Vec3.normalize(normal); return Vec3.sub(value, Vec3.scale(n, Vec3.dot(value, n))); },
  rotateYaw(value, yaw) { const vec = Vec3.from(value); const c = Math.cos(NumberEx.finite(yaw, 0)); const s = Math.sin(NumberEx.finite(yaw, 0)); return [vec[0] * c + vec[2] * s, vec[1], vec[2] * c - vec[0] * s]; },
  round(value, precision = 3) { const vec = Vec3.from(value); return [NumberEx.round(vec[0], precision), NumberEx.round(vec[1], precision), NumberEx.round(vec[2], precision)]; },
  scale(value, scalar) { const vec = Vec3.from(value); const amount = NumberEx.finite(scalar, 0); return [vec[0] * amount, vec[1] * amount, vec[2] * amount]; },
  sub(left, right) { const a = Vec3.from(left); const b = Vec3.from(right); return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  withY(value, y) { const vec = Vec3.from(value); return [vec[0], NumberEx.finite(y, 0), vec[2]]; },
});
const Quat = Object.freeze({
  identity() { return [0, 0, 0, 1]; },
  from(value, fallback = [0, 0, 0, 1]) { const base = quatParts(value); const backup = quatParts(fallback); return [NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)), NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)), NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)), NumberEx.finite(base[3], NumberEx.finite(backup[3], 1))]; },
  fromEuler(pitch = 0, yaw = 0, roll = 0) { const cy = Math.cos(NumberEx.finite(yaw, 0) * 0.5); const sy = Math.sin(NumberEx.finite(yaw, 0) * 0.5); const cp = Math.cos(NumberEx.finite(pitch, 0) * 0.5); const sp = Math.sin(NumberEx.finite(pitch, 0) * 0.5); const cr = Math.cos(NumberEx.finite(roll, 0) * 0.5); const sr = Math.sin(NumberEx.finite(roll, 0) * 0.5); return Quat.normalize([sp * cy * cr + cp * sy * sr, cp * sy * cr - sp * cy * sr, cp * cy * sr - sp * sy * cr, cp * cy * cr + sp * sy * sr]); },
  fromYaw(yaw) { return Quat.fromEuler(0, yaw, 0); },
  lookAt(eye, target) { return Quat.lookRotation(Vec3.sub(target, eye)); },
  lookRotation(forwardValue, upValue = [0, 1, 0]) { const forward = Vec3.normalize(forwardValue); if (Vec3.length(forward) <= EPSILON) return [0, 0, 0, 1]; const up = Vec3.normalize(upValue); const zAxis = Vec3.scale(forward, -1); const xAxis = Vec3.normalize(Vec3.cross(up, zAxis)); if (Vec3.length(xAxis) <= EPSILON) return Quat.fromYaw(Math.atan2(forward[0], forward[2])); const yAxis = Vec3.cross(zAxis, xAxis); return quatFromBasis(xAxis, yAxis, zAxis); },
  multiply(left, right) { const a = Quat.from(left); const b = Quat.from(right); return Quat.normalize([a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]); },
  normalize(value) { const q = Quat.from(value); const length = Math.hypot(q[0], q[1], q[2], q[3]); return length <= EPSILON ? [0, 0, 0, 1] : [q[0] / length, q[1] / length, q[2] / length, q[3] / length]; },
  rotateVec3(rotation, value) { const q = Quat.normalize(rotation); const v = Vec3.from(value); const u = [q[0], q[1], q[2]]; return Vec3.add(Vec3.add(Vec3.scale(u, 2 * Vec3.dot(u, v)), Vec3.scale(v, q[3] * q[3] - Vec3.dot(u, u))), Vec3.scale(Vec3.cross(u, v), 2 * q[3])); },
  slerp(left, right, alpha) { let a = Quat.normalize(left); let b = Quat.normalize(right); let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (dot < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; dot = -dot; } const t = NumberEx.saturate(alpha); if (dot > 0.9995) return Quat.normalize([NumberEx.lerp(a[0], b[0], t), NumberEx.lerp(a[1], b[1], t), NumberEx.lerp(a[2], b[2], t), NumberEx.lerp(a[3], b[3], t)]); const theta0 = Math.acos(NumberEx.clamp(dot, -1, 1)); const theta = theta0 * t; const sinTheta = Math.sin(theta); const sinTheta0 = Math.sin(theta0); const scale0 = Math.cos(theta) - dot * sinTheta / sinTheta0; const scale1 = sinTheta / sinTheta0; return [a[0] * scale0 + b[0] * scale1, a[1] * scale0 + b[1] * scale1, a[2] * scale0 + b[2] * scale1, a[3] * scale0 + b[3] * scale1]; },
  yaw(rotation, fallback = 0) { const q = Quat.from(rotation); const siny = 2 * (q[3] * q[1] + q[2] * q[0]); const cosy = 1 - 2 * (q[1] * q[1] + q[2] * q[2]); return NumberEx.finite(Math.atan2(siny, cosy), fallback); },
});
const TransformMath = Object.freeze({
  forward(pose) { return Quat.rotateVec3(readRotation(pose), [0, 0, 1]); },
  lookAtPose(eye, target) { return { position: Vec3.from(eye), rotation: Quat.lookAt(eye, target) }; },
  pose(options) { return { position: Vec3.from(options.position), rotation: options.rotation === undefined ? Quat.fromYaw(options.yaw ?? 0) : Quat.from(options.rotation) }; },
  position(value, fallback = [0, 0, 0]) { return isRecord(value) && "position" in value ? Vec3.from(value.position, fallback) : Vec3.from(value, fallback); },
  right(pose) { return Quat.rotateVec3(readRotation(pose), [1, 0, 0]); },
  translate(pose, offset) { return { position: Vec3.add(Vec3.from(pose.position), offset), rotation: Quat.from(pose.rotation) }; },
  up(pose) { return Quat.rotateVec3(readRotation(pose), [0, 1, 0]); },
  withPosition(pose, position) { return { position: Vec3.from(position), rotation: Quat.from(pose.rotation) }; },
  yaw(rotation, fallback = 0) { return isRecord(rotation) && "rotation" in rotation ? Quat.yaw(rotation.rotation, fallback) : Quat.yaw(rotation, fallback); },
});
const Bounds2 = Object.freeze({
  center(bounds) { return Vec2.scale(Vec2.add(Vec2.from(bounds.min), Vec2.from(bounds.max)), 0.5); },
  closestPoint(bounds, point) { const min = Vec2.from(bounds.min); const max = Vec2.from(bounds.max); const p = Vec2.from(point); return [NumberEx.clamp(p[0], min[0], max[0]), NumberEx.clamp(p[1], min[1], max[1])]; },
  containsPoint(bounds, point) { const p = Vec2.from(point); const min = Vec2.from(bounds.min); const max = Vec2.from(bounds.max); return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1]; },
  distanceToPoint(bounds, point) { return Vec2.distance(point, Bounds2.closestPoint(bounds, point)); },
  expand(bounds, amount) { const size = Math.max(0, NumberEx.finite(amount, 0)); return { min: Vec2.sub(Vec2.from(bounds.min), [size, size]), max: Vec2.add(Vec2.from(bounds.max), [size, size]) }; },
  overlaps(left, right) { const a0 = Vec2.from(left.min); const a1 = Vec2.from(left.max); const b0 = Vec2.from(right.min); const b1 = Vec2.from(right.max); return a0[0] <= b1[0] && a1[0] >= b0[0] && a0[1] <= b1[1] && a1[1] >= b0[1]; },
  rect(x, y, width, height) { const min = [NumberEx.finite(x, 0), NumberEx.finite(y, 0)]; return { min, max: [min[0] + Math.max(0, NumberEx.finite(width, 0)), min[1] + Math.max(0, NumberEx.finite(height, 0))] }; },
  size(bounds) { return Vec2.sub(Vec2.from(bounds.max), Vec2.from(bounds.min)); },
});
const Bounds3 = Object.freeze({
  aabb(minValue, maxValue) { const min = Vec3.from(minValue); const max = Vec3.from(maxValue); return { min: [Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2])], max: [Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2])] }; },
  center(bounds) { return Vec3.scale(Vec3.add(Vec3.from(bounds.min), Vec3.from(bounds.max)), 0.5); },
  closestPoint(bounds, point) { const min = Vec3.from(bounds.min); const max = Vec3.from(bounds.max); const p = Vec3.from(point); return [NumberEx.clamp(p[0], min[0], max[0]), NumberEx.clamp(p[1], min[1], max[1]), NumberEx.clamp(p[2], min[2], max[2])]; },
  containsPoint(bounds, point) { const p = Vec3.from(point); const min = Vec3.from(bounds.min); const max = Vec3.from(bounds.max); return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1] && p[2] >= min[2] && p[2] <= max[2]; },
  distanceToPoint(bounds, point) { return Vec3.distance(point, Bounds3.closestPoint(bounds, point)); },
  expand(bounds, amount) { const size = Math.max(0, NumberEx.finite(amount, 0)); return { min: Vec3.sub(Vec3.from(bounds.min), [size, size, size]), max: Vec3.add(Vec3.from(bounds.max), [size, size, size]) }; },
  overlaps(left, right) { const a0 = Vec3.from(left.min); const a1 = Vec3.from(left.max); const b0 = Vec3.from(right.min); const b1 = Vec3.from(right.max); return a0[0] <= b1[0] && a1[0] >= b0[0] && a0[1] <= b1[1] && a1[1] >= b0[1] && a0[2] <= b1[2] && a1[2] >= b0[2]; },
  size(bounds) { return Vec3.sub(Vec3.from(bounds.max), Vec3.from(bounds.min)); },
});
const Ease = Object.freeze({
  inOutCubic(t) { const x = NumberEx.saturate(t); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; },
  inOutQuad(t) { const x = NumberEx.saturate(t); return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2; },
  inQuad(t) { const x = NumberEx.saturate(t); return x * x; },
  linear(t) { return NumberEx.saturate(t); },
  outCubic(t) { return 1 - (1 - NumberEx.saturate(t)) ** 3; },
  outQuad(t) { const x = NumberEx.saturate(t); return 1 - (1 - x) * (1 - x); },
  smoothStep(t) { const x = NumberEx.saturate(t); return x * x * (3 - 2 * x); },
  smootherStep(t) { const x = NumberEx.saturate(t); return x * x * x * (x * (x * 6 - 15) + 10); },
  step(edge, value) { return NumberEx.finite(value, 0) < NumberEx.finite(edge, 0) ? 0 : 1; },
});
const RandomEx = Object.freeze({
  chance(seed, index, probability) { return RandomEx.float01(seed, index) < NumberEx.saturate(probability); },
  float01(seed, index = 0) { return RandomEx.hash32(seed, index) / 4294967296; },
  hash32(seed, index = 0) { let value = (Math.trunc(NumberEx.finite(seed, 0)) ^ Math.imul(Math.trunc(NumberEx.finite(index, 0)), 0x9e3779b9)) >>> 0; value ^= value >>> 16; value = Math.imul(value, 0x7feb352d) >>> 0; value ^= value >>> 15; value = Math.imul(value, 0x846ca68b) >>> 0; value ^= value >>> 16; return value >>> 0; },
  pickIndex(seed, index, length) { const count = Math.max(0, Math.trunc(NumberEx.finite(length, 0))); return count === 0 ? -1 : Math.floor(RandomEx.float01(seed, index) * count) % count; },
  range(seed, index, min, max) { return NumberEx.lerp(min, max, RandomEx.float01(seed, index)); },
  rangeInt(seed, index, min, max) { const low = Math.ceil(Math.min(NumberEx.finite(min, 0), NumberEx.finite(max, 0))); const high = Math.floor(Math.max(NumberEx.finite(min, 0), NumberEx.finite(max, 0))); return low + Math.floor(RandomEx.float01(seed, index) * (high - low + 1)); },
});
const ColorEx = Object.freeze({
  from(value, fallback = [1, 1, 1, 1]) { if (typeof value === "string") return ColorEx.hex(value, fallback); const base = colorParts(value); const backup = colorParts(fallback); return [NumberEx.saturate(NumberEx.finite(base[0], NumberEx.finite(backup[0], 1))), NumberEx.saturate(NumberEx.finite(base[1], NumberEx.finite(backup[1], 1))), NumberEx.saturate(NumberEx.finite(base[2], NumberEx.finite(backup[2], 1))), NumberEx.saturate(NumberEx.finite(base[3], NumberEx.finite(backup[3], 1)))]; },
  hex(value, fallback = [1, 1, 1, 1]) { const text = typeof value === "string" ? value.replace(/^#/, "") : ""; if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(text)) return ColorEx.rgba(...ColorEx.from(fallback)); const r = Number.parseInt(text.slice(0, 2), 16) / 255; const g = Number.parseInt(text.slice(2, 4), 16) / 255; const b = Number.parseInt(text.slice(4, 6), 16) / 255; const a = text.length === 8 ? Number.parseInt(text.slice(6, 8), 16) / 255 : 1; return [r, g, b, a]; },
  lerp(left, right, alpha) { const a = ColorEx.from(left); const b = ColorEx.from(right); const t = NumberEx.saturate(alpha); return [NumberEx.lerp(a[0], b[0], t), NumberEx.lerp(a[1], b[1], t), NumberEx.lerp(a[2], b[2], t), NumberEx.lerp(a[3], b[3], t)]; },
  multiply(color, scalar) { const c = ColorEx.from(color); const amount = Math.max(0, NumberEx.finite(scalar, 1)); return [NumberEx.saturate(c[0] * amount), NumberEx.saturate(c[1] * amount), NumberEx.saturate(c[2] * amount), c[3]]; },
  rgb(r, g, b) { return ColorEx.rgba(r, g, b, 1); },
  rgba(r, g, b, a = 1) { return [NumberEx.saturate(r), NumberEx.saturate(g), NumberEx.saturate(b), NumberEx.saturate(a)]; },
  toHex(color, includeAlpha = false) { const c = ColorEx.from(color); const parts = c.slice(0, includeAlpha ? 4 : 3).map((value) => Math.round(NumberEx.saturate(value) * 255).toString(16).padStart(2, "0")); return "#" + parts.join(""); },
  withAlpha(color, alpha) { const c = ColorEx.from(color); return [c[0], c[1], c[2], NumberEx.saturate(alpha)]; },
});
const TextEx = Object.freeze({
  fixed(value, precision = 0) { return NumberEx.round(value, precision).toFixed(Math.max(0, Math.trunc(NumberEx.finite(precision, 0)))); },
  joinNonEmpty(parts, separator = " ") { return parts.map((part) => part === undefined || part === null ? "" : String(part)).filter((part) => part.length > 0).join(String(separator)); },
  padLeft(value, length, fill = "0") { return String(value).padStart(Math.max(0, Math.trunc(NumberEx.finite(length, 0))), String(fill)[0] ?? " "); },
  percent(value, precision = 0) { return TextEx.fixed(NumberEx.finite(value, 0) * 100, precision) + "%"; },
  signedFixed(value, precision = 0) { const number = NumberEx.finite(value, 0); return (number >= 0 ? "+" : "-") + TextEx.fixed(Math.abs(number), precision); },
  timeSeconds(seconds) { const total = Math.max(0, Math.floor(NumberEx.finite(seconds, 0))); return Math.floor(total / 60) + ":" + TextEx.padLeft(total % 60, 2, "0"); },
});
const InputEx = Object.freeze({
  axis(value, options = {}) { const raw = NumberEx.clamp(value, -1, 1); const deadzone = NumberEx.saturate(options.deadzone ?? 0); if (Math.abs(raw) <= deadzone) return 0; const normalized = (Math.abs(raw) - deadzone) / (1 - deadzone); return Math.sign(raw) * normalized ** Math.max(1, NumberEx.finite(options.exponent, 1)); },
  axis2(value, options = {}) { const shaped = Vec2.from(value).map((axis) => InputEx.axis(axis, options)); const length = Vec2.length(shaped); return length > 1 || options.normalize === true ? Vec2.normalize(shaped) : shaped; },
});
const MotionEx = Object.freeze({
  arrive(options) { const offset = Vec3.sub(options.target, options.position); const distance = Vec3.length(offset); if (distance <= EPSILON) return [0, 0, 0]; const ramp = NumberEx.saturate(distance / Math.max(EPSILON, NumberEx.finite(options.slowingDistance, 1))); return Vec3.scale(Vec3.normalize(offset), Math.max(0, NumberEx.finite(options.maxSpeed, 0)) * ramp); },
  applyFriction(velocity, friction, dt) { return Vec3.moveToward(velocity, [0, 0, 0], Math.max(0, NumberEx.finite(friction, 0)) * Math.max(0, NumberEx.finite(dt, 0))); },
  integrate(position, velocity, dt) { return Vec3.add(position, Vec3.scale(velocity, Math.max(0, NumberEx.finite(dt, 0)))); },
  planarVelocity(options) { const input = Vec2.normalize(options.input ?? [0, 0]); const dt = Math.max(0, NumberEx.finite(options.dt, 0)); let velocity = Vec3.from(options.velocity); const accel = Math.max(0, NumberEx.finite(options.acceleration, 0)); velocity = Vec3.add(velocity, [input[0] * accel * dt, 0, input[1] * accel * dt]); if (Vec2.length(input) <= EPSILON) velocity = MotionEx.applyFriction(velocity, options.friction ?? 0, dt); const speed = Vec3.length([velocity[0], 0, velocity[2]]); const maxSpeed = Math.max(0, NumberEx.finite(options.maxSpeed, speed)); if (speed > maxSpeed && speed > EPSILON) velocity = Vec3.scale(velocity, maxSpeed / speed); return { velocity, speed: Vec3.length([velocity[0], 0, velocity[2]]), heading: Math.atan2(velocity[0], velocity[2]) }; },
  seek(options) { return Vec3.scale(Vec3.normalize(Vec3.sub(options.target, options.position)), Math.max(0, NumberEx.finite(options.maxSpeed, 0))); },
});
const BasisEx = Object.freeze({
  create(input = {}) { const basis = { forward: input.forward ?? "z", right: input.right ?? "x", up: input.up ?? "y" }; const rightVector = basisAxisVector(basis.right); const upVector = basisAxisVector(basis.up); const forwardVector = basisAxisVector(basis.forward); const uniqueAxes = new Set([basisAxisBase(basis.right), basisAxisBase(basis.up), basisAxisBase(basis.forward)]); if (uniqueAxes.size !== 3) throw new Error("TN_STDLIB_BASIS_AXIS_DUPLICATE"); if (Vec3.dot(Vec3.cross(rightVector, forwardVector), upVector) >= 0) throw new Error("TN_STDLIB_BASIS_HANDEDNESS_INVALID"); return Object.freeze({ ...basis, forwardVector, rightVector, upVector }); },
  controlSignal(options) { const basis = BasisEx.create(options.basis); const input = InputEx.axis2([options.x ?? 0, options.y ?? 0], { normalize: true }); const world = Vec3.add(Vec3.scale(basis.rightVector, input[0]), Vec3.scale(basis.forwardVector, input[1])); return { input, world, yaw: BasisEx.forwardToYaw(world) }; },
  distance2d(left, right, basis) { return Vec2.distance(BasisEx.toPlanar(left, basis), BasisEx.toPlanar(right, basis)); },
  flatten(value, basis) { const descriptor = BasisEx.create(basis); const vec = Vec3.from(value); return Vec3.sub(vec, Vec3.scale(descriptor.upVector, Vec3.dot(vec, descriptor.upVector))); },
  forwardToYaw(forward) { const vec = Vec3.normalize(BasisEx.flatten(forward)); return Vec3.length(vec) <= EPSILON ? 0 : Math.atan2(vec[0], vec[2]); },
  fromBasisComponents(components, basis) { const descriptor = BasisEx.create(basis); return Vec3.add(Vec3.add(Vec3.scale(descriptor.rightVector, NumberEx.finite(components.right, 0)), Vec3.scale(descriptor.upVector, NumberEx.finite(components.up, 0))), Vec3.scale(descriptor.forwardVector, NumberEx.finite(components.forward, 0))); },
  toPlanar(value, basis) { const descriptor = BasisEx.create(basis); const vec = Vec3.from(value); return [Vec3.dot(vec, descriptor.rightVector), Vec3.dot(vec, descriptor.forwardVector)]; },
  yawPitchRollFrame(options = {}, basis) { const descriptor = BasisEx.create(basis); const rotation = Quat.fromEuler(options.pitch ?? 0, options.yaw ?? 0, options.roll ?? 0); return { forward: Quat.rotateVec3(rotation, descriptor.forwardVector), right: Quat.rotateVec3(rotation, descriptor.rightVector), rotation, up: Quat.rotateVec3(rotation, descriptor.upVector) }; },
});
const ControllerEx = Object.freeze({
  worldCardinalCharacter(options) { const dt = Math.max(0, NumberEx.finite(options.dt, 0)); const basis = BasisEx.create(options.basis); const input = InputEx.axis2(options.input ?? [0, 0], { normalize: true }); const desired = Vec3.scale(Vec3.add(Vec3.scale(basis.rightVector, input[0]), Vec3.scale(basis.forwardVector, input[1])), Math.max(0, NumberEx.finite(options.speed, 0))); const currentVelocity = Vec3.from(options.velocity); const vertical = (options.grounded === true && options.jump === true ? Math.max(0, NumberEx.finite(options.jumpSpeed, 0)) : currentVelocity[1]) - Math.max(0, NumberEx.finite(options.gravity, 0)) * dt; const velocity = [desired[0], vertical, desired[2]]; const targetYaw = Vec3.length(desired) <= EPSILON ? NumberEx.finite(options.yaw, 0) : BasisEx.forwardToYaw(desired); const maxTurn = Math.max(0, NumberEx.finite(options.turnRate, Number.POSITIVE_INFINITY)) * dt; const yaw = Number.isFinite(maxTurn) ? NumberEx.finite(options.yaw, targetYaw) + gameplayAngleDelta(NumberEx.finite(options.yaw, targetYaw), targetYaw, maxTurn) : targetYaw; return { grounded: options.grounded === true && vertical <= EPSILON, intent: desired, position: MotionEx.integrate(options.position ?? [0, 0, 0], velocity, dt), velocity, yaw }; },
});
const TimerEx = Object.freeze({
  cooldown(remaining, dt) { const next = Math.max(0, NumberEx.finite(remaining, 0) - Math.max(0, NumberEx.finite(dt, 0))); return { remaining: next, ready: next <= EPSILON }; },
  progress(remaining, duration) { const total = Math.max(EPSILON, NumberEx.finite(duration, 0)); return NumberEx.saturate(1 - Math.max(0, NumberEx.finite(remaining, 0)) / total); },
  restart(duration) { return Math.max(0, NumberEx.finite(duration, 0)); },
  tick(remaining, dt) { return TimerEx.cooldown(remaining, dt).remaining; },
});
const ArrayEx = Object.freeze({
  cycle(items, index, fallback) { return items.length === 0 ? fallback : items[ArrayEx.wrapIndex(index, items.length)]; },
  groupBy(items, keyOf) { const groups = {}; for (const item of items) { const key = String(keyOf(item)); groups[key] = [...(groups[key] ?? []), item]; } return groups; },
  wrapIndex(index, length) { const count = Math.max(0, Math.trunc(NumberEx.finite(length, 0))); return count === 0 ? -1 : NumberEx.repeat(Math.trunc(NumberEx.finite(index, 0)), count); },
});
const CameraMath = Object.freeze({
  followPose(options) { const offset = Vec3.rotateYaw(Vec3.from(options.offset, [0, 0, -8]), NumberEx.finite(options.yaw, 0)); const position = Vec3.add(options.target, offset); return TransformMath.lookAtPose(position, options.target); },
  lookAtPose(eye, target) { return TransformMath.lookAtPose(eye, target); },
  orbitPose(options) { const distance = Math.max(0, NumberEx.finite(options.distance, 8)); const pitch = NumberEx.finite(options.pitch, 0); const yaw = NumberEx.finite(options.yaw, 0); const offset = [Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance]; const position = Vec3.add(options.target, offset); return TransformMath.lookAtPose(position, options.target); },
  shakeOffset(seed, amplitude, index = 0) { const amount = Math.max(0, NumberEx.finite(amplitude, 0)); return [RandomEx.range(seed, index, -amount, amount), RandomEx.range(seed, index + 1, -amount, amount), RandomEx.range(seed, index + 2, -amount, amount)]; },
});
const CharacterRig = Object.freeze({
  update(context, entityRef, options = {}) { const entity = typeof entityRef === "string" ? context.entity?.(entityRef) : entityRef; const entityId = typeof entityRef === "string" ? entityRef : entityRef.id; const transform = entity?.transform?.(); const start = transform?.positionOr([0, 0, 0]) ?? rigReadComponentPosition(entity, [0, 0, 0]); const dt = Math.max(0, NumberEx.finite(options.fixedDelta, rigReadFixedDelta(context))); const state = context.state("tn.characterRig." + entityId, { dirX: 0, dirZ: 1, speed: 0, yaw: transform?.yawOr(0) ?? TransformMath.yaw(rigReadComponentRotation(entity), 0) }); const input = InputEx.axis2([context.input?.axis(options.moveXAxis ?? "MoveX") ?? 0, context.input?.axis(options.moveZAxis ?? "MoveZ") ?? 0], { normalize: true }); const hasInput = Vec2.length(input) > EPSILON; const sprinting = options.sprintAction === undefined ? false : context.input?.action(options.sprintAction) === true; const targetSpeed = hasInput ? (sprinting ? options.sprintSpeed ?? 5.5 : options.walkSpeed ?? 3.1) : 0; const accel = targetSpeed > state.speed ? options.acceleration ?? 18 : options.deceleration ?? 24; state.speed = NumberEx.moveToward(state.speed, targetSpeed, Math.max(0, accel) * dt); const inputDirection = hasInput ? Vec3.normalize(Vec3.rotateYaw([input[0], 0, input[1]], NumberEx.finite(options.cameraYaw, 0))) : [state.dirX, 0, state.dirZ]; if (hasInput) { state.dirX = inputDirection[0]; state.dirZ = inputDirection[2]; } const moving = state.speed > EPSILON; const moveDirection = moving ? Vec3.normalize([NumberEx.finite(state.dirX, inputDirection[0]), 0, NumberEx.finite(state.dirZ, inputDirection[2])]) : [0, 0, 0]; const targetYaw = hasInput ? rigYawForForwardAxis(inputDirection, options.forwardAxis ?? "+z") : state.yaw; const maxTurn = Math.max(0, NumberEx.finite(options.maxTurnSpeed, Math.PI * 8)) * dt; const smoothing = Math.max(0, NumberEx.finite(options.turnSmoothing, 1)); const yawStep = smoothing <= EPSILON ? maxTurn : maxTurn * Math.min(1, smoothing); state.yaw = rigMoveAngleToward(state.yaw, targetYaw, yawStep); const trace = moving ? context.character?.move(entityRef, { direction: [moveDirection[0], moveDirection[2]], fixedDelta: dt, speed: state.speed }) ?? null : null; const position = rigClampVec3(Vec3.from(trace?.resolved, start), options.bounds); transform?.setPose(position, Quat.fromYaw(state.yaw)); rigPlayCharacterClip(context, entityRef, state.speed, sprinting, options.clips); return { moving, position, speed: state.speed, sprinting, yaw: state.yaw }; },
});
const CameraRig = Object.freeze({
  thirdPerson(context, options) { const target = typeof options.target === "string" ? context.entity?.(options.target) : options.target; const cameraId = options.cameraId ?? "camera"; const camera = context.entity?.(cameraId); const targetTransform = target?.transform?.(); const targetPosition = targetTransform?.positionOr([0, 0, 0]) ?? rigReadComponentPosition(target, [0, 0, 0]); const dt = Math.max(0, rigReadDelta(context)); const state = context.state("tn.cameraRig." + cameraId, { followX: targetPosition[0], followY: targetPosition[1], followZ: targetPosition[2], yaw: NumberEx.finite(options.yaw, targetTransform?.yawOr(0) ?? 0) }); const targetYaw = NumberEx.finite(options.yaw, targetTransform?.yawOr(state.yaw) ?? state.yaw); state.yaw = rigMoveAngleToward(state.yaw, targetYaw, Math.max(0, NumberEx.finite(options.maxYawSpeed, Math.PI * 3)) * dt * Math.max(1, NumberEx.finite(options.yawSmoothing, 1))); const followTarget = Vec3.add(targetPosition, Vec3.rotateYaw(Vec3.from(options.lookAhead, [0, 0, 0.75]), state.yaw)); const followAlpha = rigExponentialAlpha(options.followSmoothing ?? 12, dt); state.followX = NumberEx.lerp(state.followX, followTarget[0], followAlpha); state.followY = NumberEx.lerp(state.followY, followTarget[1], followAlpha); state.followZ = NumberEx.lerp(state.followZ, followTarget[2], followAlpha); const pullback = options.sprinting === true ? Math.max(0, NumberEx.finite(options.sprintPullback, 1.25)) : 0; const offset = Vec3.add(Vec3.from(options.offset, [0, 3.2, -6]), [0, 0, -pullback]); const shoulder = Vec3.from(options.shoulderOffset, [0.55, 0, 0]); const pose = CameraMath.followPose({ offset: Vec3.add(offset, shoulder), target: [state.followX, state.followY, state.followZ], yaw: state.yaw }); camera?.transform?.().setPose(pose.position, pose.rotation); return { yaw: state.yaw }; },
});
const TriggerEx = Object.freeze({
  entered(context, triggerRef, options = {}) { const sensorId = typeof triggerRef === "string" ? triggerRef : triggerRef.id; const state = context.state("tn.triggerEx." + sensorId, { active: [] }); const result = context.physics?.sensor({ sensor: sensorId, phases: ["enter", "stay"] }); if (result === undefined) { state.active = []; return []; } const previous = new Set(state.active); const current = new Set(); const entered = []; for (const event of result.events) { if (event.sensor !== sensorId || (event.phase !== "enter" && event.phase !== "stay")) continue; for (const occupantId of event.occupants) { const occupant = context.entity?.(occupantId) ?? { id: occupantId }; if (!rigMatchesTriggerOptions(occupant, options)) continue; current.add(occupantId); if (!previous.has(occupantId)) entered.push(occupant); } } state.active = [...current].sort(); return entered; },
  cooldown(context, key, seconds) { const state = context.state("tn.triggerCooldown." + key, { nextReady: Number.NEGATIVE_INFINITY }); const now = rigReadElapsed(context); if (now < state.nextReady) return false; state.nextReady = now + Math.max(0, NumberEx.finite(seconds, 0)); return true; },
});
const KinematicMoverEx = Object.freeze({
  sweep(context, entityRef, options = {}) { const entity = rigResolveEntity(context, entityRef); const transform = entity?.transform?.(); const start = transform?.positionOr([0, 0, 0]) ?? rigReadComponentPosition(entity, [0, 0, 0]); const rotation = rigReadComponentRotation(entity); const origin = Vec3.from(options.origin, start); const direction = Vec3.normalize(options.direction === undefined ? rigAxisVector(options.axis ?? "x") : options.direction); const radius = Math.max(0, NumberEx.finite(options.radius, 1)); const speed = NumberEx.finite(options.speed, 1); const theta = NumberEx.finite(options.phase, 0) + rigReadElapsed(context) * speed; const position = Vec3.add(origin, Vec3.scale(direction, Math.sin(theta) * radius)); const velocity = Vec3.scale(direction, Math.cos(theta) * speed * radius); transform?.setPose(position, rotation); entity?.patch?.("RigidBody", { velocity }); return { position, velocity }; },
});
const RespawnEx = Object.freeze({
  reset(context, entityRef, options = {}) { const entity = rigResolveEntity(context, entityRef); const entityId = typeof entityRef === "string" ? entityRef : entityRef.id; const transform = entity?.transform?.(); const currentPosition = transform?.positionOr([0, 0, 0]) ?? rigReadComponentPosition(entity, [0, 0, 0]); const position = Vec3.from(options.position, currentPosition); const yaw = NumberEx.finite(options.yaw, transform?.yawOr(0) ?? TransformMath.yaw(rigReadComponentRotation(entity), 0)); transform?.setPose(position, Quat.fromYaw(yaw)); for (const [component, value] of Object.entries(options.components ?? {})) { if (entity?.patch !== undefined) entity.patch(component, value); else entity?.set?.(component, value); } for (const [name, value] of Object.entries(options.resources ?? {})) context.resources?.set(name, value); return { entity: entityId, position }; },
});
const CheckpointRaceEx = Object.freeze({
  init(options = {}) { return freezeCheckpointState({ checkpoint: Math.max(0, Math.trunc(NumberEx.finite(options.checkpoint, 0))), events: [], lap: Math.max(0, Math.trunc(NumberEx.finite(options.lap, 0))), status: options.status ?? "ready", timeSeconds: Math.max(0, NumberEx.finite(options.timeSeconds, 0)) }); },
  passCheckpoint(state, options) { if (state.status !== "racing") return freezeCheckpointState({ ...state, events: [] }); const checkpointCount = Math.max(1, Math.trunc(NumberEx.finite(options.checkpointCount, 1))); const timeSeconds = Math.max(0, NumberEx.finite(options.timeSeconds, state.timeSeconds)); const nextCheckpoint = (Math.max(0, Math.trunc(NumberEx.finite(state.checkpoint, 0))) + 1) % checkpointCount; const completedLap = nextCheckpoint === 0; const lap = completedLap ? state.lap + 1 : state.lap; const lapsToFinish = Math.max(1, Math.trunc(NumberEx.finite(options.lapsToFinish, 1))); const finished = lap >= lapsToFinish; const events = [{ checkpoint: state.checkpoint, kind: "checkpoint", lap: state.lap, timeSeconds }, ...(completedLap ? [{ checkpoint: checkpointCount - 1, kind: "lap", lap, timeSeconds }] : []), ...(finished ? [{ checkpoint: nextCheckpoint, kind: "player-finish", lap, timeSeconds }, { checkpoint: nextCheckpoint, kind: "race-finish", lap, timeSeconds }] : [])]; return freezeCheckpointState({ checkpoint: nextCheckpoint, events, lap, status: finished ? "finished" : "racing", timeSeconds }); },
  reset() { return freezeCheckpointState({ checkpoint: 0, events: [{ checkpoint: 0, kind: "reset", lap: 0, timeSeconds: 0 }], lap: 0, status: "ready", timeSeconds: 0 }); },
  snapshot(state) { return freezeCheckpointState({ ...state, events: [...state.events] }); },
  start(state, timeSeconds = state.timeSeconds) { const time = Math.max(0, NumberEx.finite(timeSeconds, 0)); return freezeCheckpointState({ ...state, events: [{ checkpoint: state.checkpoint, kind: "start", lap: state.lap, timeSeconds: time }], status: "racing", timeSeconds: time }); },
  step(state, dt) { return freezeCheckpointState({ ...state, events: [], timeSeconds: state.timeSeconds + Math.max(0, NumberEx.finite(dt, 0)) }); },
});
const SpawnEx = Object.freeze({
  contains(region, point) { const p = Vec2.from(point); if (region.kind === "circle") return Vec2.distance(p, region.center) <= Math.max(0, NumberEx.finite(region.radius, 0)); if (region.kind === "rect") { const min = Vec2.from(region.min); const max = Vec2.from(region.max); return p[0] >= Math.min(min[0], max[0]) && p[0] <= Math.max(min[0], max[0]) && p[1] >= Math.min(min[1], max[1]) && p[1] <= Math.max(min[1], max[1]); } if (region.kind === "segment-corridor") return gameplayDistanceToSegment2(p, Vec2.from(region.from), Vec2.from(region.to)) <= Math.max(0, NumberEx.finite(region.radius, 0)); return gameplayPolygonContains(region.points.map((entry) => Vec2.from(entry)), p); },
  sample(options) { const attempts = Math.max(1, Math.trunc(NumberEx.finite(options.attempts, 8))); for (let attempt = 0; attempt < attempts; attempt += 1) { const point = gameplaySampleRegion(options.region, options.seed, (options.index ?? 0) + attempt * 2); if (!(options.blocked ?? []).some((blocked) => SpawnEx.contains(blocked, point))) return point; } return null; },
});
function vec2Parts(value) { if (Array.isArray(value)) return [value[0], value[1]]; if (isRecord(value)) return [value.x, value.y]; return [undefined, undefined]; }
function vec3Parts(value) { if (Array.isArray(value)) return [value[0], value[1], value[2]]; if (isRecord(value)) return [value.x, value.y, value.z]; return [undefined, undefined, undefined]; }
function quatParts(value) { if (Array.isArray(value)) return [value[0], value[1], value[2], value[3]]; if (isRecord(value)) return [value.x, value.y, value.z, value.w]; return [undefined, undefined, undefined, undefined]; }
function colorParts(value) { if (Array.isArray(value)) return [value[0], value[1], value[2], value[3]]; if (isRecord(value)) return [value.r, value.g, value.b, value.a]; return [undefined, undefined, undefined, undefined]; }
function isRecord(value) { return typeof value === "object" && value !== null; }
function rigPlayCharacterClip(context, entity, speed, sprinting, clips) { const selected = speed <= EPSILON ? clips?.idle : sprinting ? clips?.run ?? clips?.walk : clips?.walk ?? clips?.run; if (selected === undefined) return; const clip = typeof selected === "string" ? selected : selected.clip; const referenceSpeed = typeof selected === "string" ? undefined : selected.referenceSpeed; const sourceClip = typeof selected === "string" ? selected : selected.sourceClip ?? selected.clip; context.animation?.play(entity, clip, { loop: true, sourceClip, speed: referenceSpeed === undefined ? 1 : Math.max(0.01, speed / Math.max(0.01, NumberEx.finite(referenceSpeed, 1))) }); }
function rigReadFixedDelta(context) { return context.time?.fixedDelta?.({ fallback: context.time?.fixedDt ?? 1 / 60 }) ?? context.time?.fixedDt ?? context.time?.delta ?? 1 / 60; }
function rigReadDelta(context) { return context.time?.delta ?? context.time?.dt ?? context.time?.fixedDt ?? 1 / 60; }
function rigReadComponentPosition(entity, fallback) { const transform = entity?.get?.("Transform") ?? entity?.components?.Transform; return isRecord(transform) ? Vec3.from(transform.position, fallback) : Vec3.from(fallback); }
function rigReadComponentRotation(entity) { const transform = entity?.get?.("Transform") ?? entity?.components?.Transform; return isRecord(transform) ? Quat.from(transform.rotation) : Quat.identity(); }
function rigClampVec3(value, bounds) { if (bounds === undefined) return value; const min = Vec3.from(bounds.min, value); const max = Vec3.from(bounds.max, value); return [NumberEx.clamp(value[0], min[0], max[0]), NumberEx.clamp(value[1], min[1], max[1]), NumberEx.clamp(value[2], min[2], max[2])]; }
function rigYawForForwardAxis(direction, forwardAxis) { const yaw = BasisEx.forwardToYaw(direction); if (forwardAxis === "-z") return yaw + Math.PI; if (forwardAxis === "+x") return yaw - Math.PI / 2; if (forwardAxis === "-x") return yaw + Math.PI / 2; return yaw; }
function rigMoveAngleToward(current, target, maxDelta) { const delta = NumberEx.repeat(target - current + Math.PI, Math.PI * 2) - Math.PI; return current + NumberEx.clamp(delta, -Math.max(0, maxDelta), Math.max(0, maxDelta)); }
function rigExponentialAlpha(rate, dt) { return 1 - Math.exp(-Math.max(0, NumberEx.finite(rate, 0)) * Math.max(0, NumberEx.finite(dt, 0))); }
function rigResolveEntity(context, entityRef) { return typeof entityRef === "string" ? context.entity?.(entityRef) : entityRef; }
function rigReadElapsed(context) { return Math.max(0, NumberEx.finite(context.time?.elapsed, 0)); }
function rigAxisVector(axis) { if (axis === "y") return [0, 1, 0]; if (axis === "z") return [0, 0, 1]; return [1, 0, 0]; }
function rigMatchesTriggerOptions(entity, options) { if (options.component !== undefined && !rigHasComponent(entity, options.component)) return false; if (options.layer !== undefined && !rigMatchesColliderLayer(entity, options.layer)) return false; return true; }
function rigHasComponent(entity, component) { if (entity.has?.(component) === true) return true; if (entity.components !== undefined && component in entity.components) return true; return entity.get?.(component) !== undefined; }
function rigMatchesColliderLayer(entity, layer) { const collider = entity.get?.("Collider") ?? entity.components?.Collider; if (!isRecord(collider)) return false; if (collider.layer === layer) return true; if (Array.isArray(collider.layers)) return collider.layers.includes(layer); return false; }
function quatFromBasis(x, y, z) { const trace = x[0] + y[1] + z[2]; if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; return Quat.normalize([(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, 0.25 * s]); } if (x[0] > y[1] && x[0] > z[2]) { const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2; return Quat.normalize([0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]); } if (y[1] > z[2]) { const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2; return Quat.normalize([(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]); } const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2; return Quat.normalize([(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s]); }
function readRotation(pose) { return isRecord(pose) && "rotation" in pose ? pose.rotation : pose; }
function basisAxisBase(axis) { return String(axis).replace("-", ""); }
function basisAxisVector(axis) { const sign = String(axis).startsWith("-") ? -1 : 1; const base = basisAxisBase(axis); return base === "x" ? [sign, 0, 0] : base === "y" ? [0, sign, 0] : [0, 0, sign]; }
function freezeCheckpointState(state) { return Object.freeze({ ...state, events: Object.freeze([...state.events]) }); }
function gameplayAngleDelta(current, target, maxDelta) { const delta = NumberEx.repeat(target - current + Math.PI, Math.PI * 2) - Math.PI; return NumberEx.clamp(delta, -maxDelta, maxDelta); }
function gameplayDistanceToSegment2(point, start, end) { const segment = Vec2.sub(end, start); const lengthSquared = Vec2.dot(segment, segment); if (lengthSquared <= EPSILON) return Vec2.distance(point, start); const t = NumberEx.saturate(Vec2.dot(Vec2.sub(point, start), segment) / lengthSquared); return Vec2.distance(point, Vec2.add(start, Vec2.scale(segment, t))); }
function gameplayPolygonContains(points, point) { if (points.length < 3) return false; let inside = false; for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) { const currentPoint = points[index]; const previousPoint = points[previous]; if ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) / (previousPoint[1] - currentPoint[1] + EPSILON) + currentPoint[0]) inside = !inside; } return inside; }
function gameplaySampleRegion(region, seed, index) { if (region.kind === "circle") { const angle = RandomEx.range(seed, index, 0, Math.PI * 2); const radius = Math.sqrt(RandomEx.float01(seed, index + 1)) * Math.max(0, NumberEx.finite(region.radius, 0)); return Vec2.add(region.center, Vec2.fromAngle(angle, radius)); } if (region.kind === "polygon") { const points = region.points.map((point) => Vec2.from(point)); const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); return [RandomEx.range(seed, index, Math.min(...xs), Math.max(...xs)), RandomEx.range(seed, index + 1, Math.min(...ys), Math.max(...ys))]; } if (region.kind === "segment-corridor") { const t = RandomEx.float01(seed, index); const from = Vec2.from(region.from); const to = Vec2.from(region.to); const center = Vec2.lerp(from, to, t); const direction = Vec2.normalize(Vec2.sub(to, from)); const normal = [-direction[1], direction[0]]; return Vec2.add(center, Vec2.scale(normal, RandomEx.range(seed, index + 1, -Math.max(0, region.radius), Math.max(0, region.radius)))); } const min = Vec2.from(region.min); const max = Vec2.from(region.max); return [RandomEx.range(seed, index, Math.min(min[0], max[0]), Math.max(min[0], max[0])), RandomEx.range(seed, index + 1, Math.min(min[1], max[1]), Math.max(min[1], max[1]))]; }
`.trim();
