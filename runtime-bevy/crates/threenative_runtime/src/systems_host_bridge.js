function __tnInvokeSystem(options) {
  const effects = { commands: [], events: [], observations: [], patches: [], resources: [], schedules: [], services: [] };
  const data = options.snapshot;
  const normalize = (handle) => typeof handle === "string" ? handle : (handle && typeof handle.name === "string" ? handle.name : String(handle));
  const observeResource = (kind, name) => effects.observations.push({ kind, resource: normalize(name) });
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const readVec3 = (value, fallback) => Array.isArray(value) ? [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2])] : fallback;
  const readQuat = (value, fallback) => Array.isArray(value) ? [Number(value[0] ?? fallback[0]), Number(value[1] ?? fallback[1]), Number(value[2] ?? fallback[2]), Number(value[3] ?? fallback[3])] : fallback;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const yawFromQuat = (value, fallback) => {
    const q = readQuat(value, [0, 0, 0, 1]);
    const yaw = Math.atan2(2 * (q[3] * q[1] + q[2] * q[0]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
    return Number.isFinite(yaw) ? yaw : fallback;
  };
  const normalForAxis = (axis, sign) => axis === 0 ? [sign, 0, 0] : (axis === 1 ? [0, sign, 0] : [0, 0, sign]);
  const round6 = (value) => Number(value.toFixed(6));
  const roundVec3 = (value) => [round6(value[0]), round6(value[1]), round6(value[2])];
  const positiveNumber = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const hashSeed = (seed) => {
    const source = typeof seed === "string" || typeof seed === "number" || typeof seed === "boolean" ? String(seed) : JSON.stringify(seed);
    let hash = 2166136261;
    for (const char of (source || "0")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const createRandom = (seed) => {
    let state = hashSeed(seed);
    const next = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
    return {
      bool(probability = 0.5) { return next() < clamp01(probability); },
      float() { return next(); },
      int(min, max) {
        const lower = Math.ceil(Math.min(min, max));
        const upper = Math.floor(Math.max(min, max));
        if (upper < lower) return lower;
        return Math.floor(next() * (upper - lower + 1)) + lower;
      },
      pick(values) { return Array.isArray(values) && values.length > 0 ? values[Math.floor(next() * values.length)] : undefined; },
      range(min, max) { return next() * (max - min) + min; }
    };
  };
  const randomSeed = data.resources.Random && data.resources.Random.seed !== undefined ? data.resources.Random.seed : (data.resources.__randomSeed ?? 0);
  const random = createRandom(randomSeed);
  const finiteNumber = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const createTimers = (now) => {
    const normalizedNow = finiteNumber(now, 0);
    const elapsed = (start) => Math.max(0, normalizedNow - finiteNumber(start, normalizedNow));
    return {
      done(start, duration) { return elapsed(start) >= Math.max(0, finiteNumber(duration, 0)); },
      elapsed,
      progress(start, duration) {
        const total = Math.max(0, finiteNumber(duration, 0));
        return total === 0 ? 1 : Math.max(0, Math.min(1, elapsed(start) / total));
      },
      ready(lastRun, cooldown) { return elapsed(lastRun) >= Math.max(0, finiteNumber(cooldown, 0)); },
      remaining(start, duration) { return Math.max(0, Math.max(0, finiteNumber(duration, 0)) - elapsed(start)); }
    };
  };
  const assetIndex = new Map();
  for (const asset of data.assets || []) {
    if (!assetIndex.has(asset.id)) assetIndex.set(asset.id, asset);
  }
  const entityIndex = new Map();
  let firstCameraEntity;
  for (const entity of data.entities || []) {
    if (!entityIndex.has(entity.id)) entityIndex.set(entity.id, entity);
    if (firstCameraEntity === undefined && entity.components.Camera) firstCameraEntity = entity;
  }
  const colliderEntities = (data.entities || [])
    .filter((entity) => entity.components.Collider)
    .sort((left, right) => left.id.localeCompare(right.id));
  const isSensorCollider = (collider) => collider.trigger === true || collider.sensor != null;
  const solidColliderEntities = colliderEntities.filter((entity) => !isSensorCollider(entity.components.Collider));
  const sensorEntities = colliderEntities.filter((entity) => isSensorCollider(entity.components.Collider));
  const navigationRegions = data.resources.Navigation && Array.isArray(data.resources.Navigation.regions)
    ? [...data.resources.Navigation.regions].sort((left, right) => left.id.localeCompare(right.id))
    : [];
  const settingIndex = new Map();
  for (const setting of data.localData.settings || []) {
    if (!settingIndex.has(setting.key)) settingIndex.set(setting.key, setting);
  }
  const assetById = (id) => assetIndex.get(id);
  const loadAsset = (id) => {
    const asset = assetById(id);
    return asset
      ? { accepted: true, asset: clone(asset), id, status: "ready" }
      : { accepted: false, asset: null, id, status: "missing" };
  };
  const particleEmitters = new Map();
  for (const asset of data.assets || []) {
    for (const emitter of asset.particleEmitters || []) {
      particleEmitters.set(`${asset.id}/${emitter.id}`, {
        lifetimeSeconds: Number(emitter.lifetimeSeconds || 0),
        maxParticles: Math.max(0, Math.floor(Number(emitter.maxParticles || 0))),
        ratePerSecond: Number(emitter.ratePerSecond || 0)
      });
    }
  }
  const particleStates = {};
  const particleSeed = (value) => {
    if (Number.isFinite(Number(value)) && typeof value !== "string") return Math.abs(Math.floor(Number(value))) >>> 0;
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const particleStatus = (command) => {
    if (command === "clear") return "cleared";
    if (command === "emit") return "emitted";
    if (command === "play") return "played";
    if (command === "start") return "started";
    if (command === "stop") return "stopped";
    return command;
  };
  const particleCommand = (command, asset, emitter, options = {}) => {
    const key = `${asset}/${emitter}`;
    const declaration = particleEmitters.get(key);
    const seed = particleSeed(options.seed ?? `${key}/${command}`);
    if (!declaration) {
      return { accepted: false, active: false, asset, command, count: 0, emitter, maxParticles: 0, seed, status: "missing-emitter" };
    }
    const requested = command === "stop" || command === "reset" || command === "clear"
      ? 0
      : (options.count ?? Math.max(1, Math.floor(declaration.ratePerSecond * declaration.lifetimeSeconds)));
    const numericCount = Number.isFinite(Number(requested)) ? Number(requested) : 0;
    const result = {
      accepted: true,
      active: command === "start" || command === "play" || command === "burst" || command === "emit",
      asset,
      command,
      count: Math.min(declaration.maxParticles, Math.max(0, Math.floor(numericCount))),
      emitter,
      maxParticles: declaration.maxParticles,
      seed,
      status: particleStatus(command)
    };
    if (command === "stop" || command === "reset" || command === "clear") delete particleStates[key];
    else particleStates[key] = clone(result);
    return clone(result);
  };
  const feedbackPresetById = (id) => {
    const presets = Array.isArray(data.feedbackPresets) ? data.feedbackPresets : [];
    const found = presets.find((preset) => preset && preset.id === id);
    if (found) return found;
    return ["dust", "explosion", "pickup-sparkle", "trail"].includes(id) ? { id } : undefined;
  };
  const deterministicVariance = (seed, variance) => {
    if (!(Number(variance) > 0)) return 0;
    return ((hashSeed(seed) % 100000) / 100000 * 2 - 1) * Number(variance);
  };
  const changedValues = (value, entityId) => {
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value[entityId])) return value[entityId].filter((item) => typeof item === "string");
    if (value.entities && Array.isArray(value.entities[entityId])) return value.entities[entityId].filter((item) => typeof item === "string");
    return [];
  };
  const changedComponents = (entity) => {
    const explicit = new Set([
      ...changedValues(entity.components.__changed, entity.id),
      ...changedValues(data.resources.__changed, entity.id),
      ...changedValues(data.resources.Changed, entity.id)
    ]);
    if (explicit.size > 0) {
      return explicit;
    }
    return new Set(changedValues(data.runtimeChanged, entity.id));
  };
  const queryKey = (query) => {
    const normalized = {
      changed: Array.isArray(query?.changed) ? query.changed.map(normalize).sort() : [],
      limit: query?.limit ?? null,
      offset: query?.offset ?? null,
      orderBy: query?.orderBy ?? null,
      with: Array.isArray(query?.with) ? query.with.map(normalize).sort() : [],
      without: Array.isArray(query?.without) ? query.without.map(normalize).sort() : []
    };
    return JSON.stringify(normalized);
  };
  const declaredQueries = Array.isArray(data.declaredQueries) ? data.declaredQueries : [];
  const declaredQueryKeys = new Set(declaredQueries.map(queryKey));
  const assertDeclaredQuery = (query) => {
    if (query === undefined || declaredQueryKeys.size === 0) return;
    if (declaredQueryKeys.has(queryKey(query))) return;
    const declared = declaredQueries.map((entry) => JSON.stringify(entry)).join(", ");
    throw new Error(`TN_SCRIPT_QUERY_UNDECLARED: context.query(${JSON.stringify(query)}) was not declared in this system's queries list. Native runtimes only expose declared query results; add defineQuery(${JSON.stringify(query)}) to queries. Declared queries: [${declared}]`);
  };
  const applyQuery = (source, query) => {
    const withComponents = Array.isArray(query.with) ? query.with.map(normalize) : [];
    const withoutComponents = Array.isArray(query.without) ? query.without.map(normalize) : [];
    const changed = Array.isArray(query.changed) ? query.changed.map(normalize) : [];
    const filtered = source.filter((entity) => {
      const changedSet = changedComponents(entity);
      return withComponents.every((component) => entity.components[component] !== undefined) &&
        withoutComponents.every((component) => entity.components[component] === undefined) &&
        changed.every((component) => changedSet.has(component));
    });
    const ordered = query.orderBy === "id" ? [...filtered].sort((left, right) => left.id.localeCompare(right.id)) : filtered;
    const offset = Math.max(0, Math.floor(Number(query.offset ?? 0)));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(Number(query.limit)));
    return ordered.slice(offset, limit === undefined ? undefined : offset + limit);
  };
  const normalizeVec3 = (value) => {
    const length = Math.hypot(value[0], value[1], value[2]);
    return length <= 0.000001 ? [0, 0, -1] : [value[0] / length, value[1] / length, value[2] / length];
  };
  const rotateVec3 = (value, quaternion) => {
    const [x, y, z] = value;
    const [qx, qy, qz, qw] = quaternion;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
  };
    const readColliderSize = (collider) => {
      if (Array.isArray(collider?.size)) return readVec3(collider.size, [1, 1, 1]);
      if (Array.isArray(collider?.mesh?.bounds?.size)) return readVec3(collider.mesh.bounds.size, [1, 1, 1]);
      if (typeof collider?.radius === "number") {
        const diameter = collider.radius * 2;
        return [diameter, typeof collider.height === "number" ? collider.height : diameter, diameter];
      }
      return [1, 1, 1];
    };
    const readColliderHalfExtents = (collider) => {
      const size = readColliderSize(collider);
      return [size[0] / 2, size[1] / 2, size[2] / 2];
    };
    const colliderOffset = (collider) => readVec3(collider && (collider.center || collider.mesh?.bounds?.center), [0, 0, 0]);
    const colliderBounds = (entity) => {
      const transform = entity.components.Transform || {};
      const collider = entity.components.Collider || {};
      const rotation = readQuat(transform.rotation, [0, 0, 0, 1]);
      const position = readVec3(transform.position, [0, 0, 0]);
      const offset = rotateVec3(colliderOffset(collider), rotation);
      const halfExtents = readColliderHalfExtents(collider);
      const xAxis = rotateVec3([halfExtents[0], 0, 0], rotation);
      const yAxis = rotateVec3([0, halfExtents[1], 0], rotation);
      const zAxis = rotateVec3([0, 0, halfExtents[2]], rotation);
      return {
        center: addVec3(position, offset),
        halfExtents: [
          Math.abs(xAxis[0]) + Math.abs(yAxis[0]) + Math.abs(zAxis[0]),
          Math.abs(xAxis[1]) + Math.abs(yAxis[1]) + Math.abs(zAxis[1]),
          Math.abs(xAxis[2]) + Math.abs(yAxis[2]) + Math.abs(zAxis[2])
        ]
      };
    };
    const queryHalfExtents = (shape) => {
      if (shape && shape.kind === "sphere") return [Number(shape.radius || 0), Number(shape.radius || 0), Number(shape.radius || 0)];
      if (shape && shape.kind === "box" && Array.isArray(shape.halfExtents)) return readVec3(shape.halfExtents, [0.5, 0.5, 0.5]);
      return [0.5, 0.5, 0.5];
    };
    const passesFilter = (collider, request) => {
      const mask = [...(request.mask || []), ...(request.layers || [])];
      const colliderLayer = typeof collider.layer === "string" ? collider.layer : undefined;
      if (mask.length > 0 && (!colliderLayer || !mask.includes(colliderLayer))) return false;
      if (request.layer && Array.isArray(collider.mask) && !collider.mask.includes(request.layer)) return false;
      return true;
    };
    const maskAccepts = (mask, layer) => !Array.isArray(mask) || mask.length === 0 || (typeof layer === "string" && mask.includes(layer));
    const collidersInteract = (left, right) => maskAccepts(left.mask, right.layer) && maskAccepts(right.mask, left.layer);
    const boundsOverlap = (left, right) => (
      Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
      Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
      Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
    );
  const intersectAabb = (request, center, size) => {
    const directionLength = Math.hypot(...request.direction);
    if (!Number.isFinite(directionLength) || directionLength <= 0.000001) return { hit: false };
    const normalizedDirection = request.direction.map((value) => value / directionLength);
    const half = size.map((value) => value / 2);
    const min = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
    const max = [center[0] + half[0], center[1] + half[1], center[2] + half[2]];
    let tMin = 0;
    let tMax = request.maxDistance;
    let normal = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const origin = request.origin[axis] ?? 0;
      const direction = normalizedDirection[axis] ?? 0;
      if (Math.abs(direction) < 0.000001) {
        if (origin < min[axis] || origin > max[axis]) return { hit: false };
        continue;
      }
      const inv = 1 / direction;
      let near = (min[axis] - origin) * inv;
      let far = (max[axis] - origin) * inv;
      let axisNormal = normalForAxis(axis, direction > 0 ? -1 : 1);
      if (near > far) {
        [near, far] = [far, near];
      }
      if (near > tMin) {
        tMin = near;
        normal = axisNormal;
      }
      tMax = Math.min(tMax, far);
      if (tMin > tMax) return { hit: false };
    }
    const distance = round6(tMin);
    return {
      distance,
      hit: true,
      normal,
      point: [
        round6(request.origin[0] + normalizedDirection[0] * distance),
        round6(request.origin[1] + normalizedDirection[1] * distance),
        round6(request.origin[2] + normalizedDirection[2] * distance)
      ]
    };
  };
  const raycast = (request) => {
    const ignored = new Set(request.ignore || []);
    let best = { hit: false };
    for (const entity of data.entities) {
      if (ignored.has(entity.id)) continue;
        const transform = entity.components.Transform;
        const collider = entity.components.Collider;
        if (!transform || !collider) continue;
        if (!passesFilter(collider, request)) continue;
        const bounds = colliderBounds(entity);
        const hit = intersectAabb(request, bounds.center, bounds.halfExtents.map((value) => value * 2));
        if (hit.hit && (!best.hit || hit.distance < best.distance)) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const overlap = (request) => {
      const ignored = new Set(request.ignore || []);
      const queryBounds = { center: readVec3(request.position, [0, 0, 0]), halfExtents: queryHalfExtents(request.shape) };
      return {
        entities: data.entities
          .filter((entity) => !ignored.has(entity.id))
          .filter((entity) => {
            const transform = entity.components.Transform;
            const collider = entity.components.Collider;
            if (!transform || !collider || !passesFilter(collider, request)) return false;
            return boundsOverlap(queryBounds, colliderBounds(entity));
          })
          .map((entity) => entity.id)
          .sort()
      };
    };
    const shapeCast = (request) => {
      const ignored = new Set(request.ignore || []);
      const queryExtents = queryHalfExtents(request.shape);
      let best = { hit: false };
      for (const entity of data.entities) {
        if (ignored.has(entity.id)) continue;
        const transform = entity.components.Transform;
        const collider = entity.components.Collider;
        if (!transform || !collider || !passesFilter(collider, request)) continue;
        const bounds = colliderBounds(entity);
        const size = bounds.halfExtents.map((value) => value * 2);
        const hit = intersectAabb(
          request,
          bounds.center,
          [size[0] + queryExtents[0] * 2, size[1] + queryExtents[1] * 2, size[2] + queryExtents[2] * 2]
        );
        if (hit.hit && (!best.hit || hit.distance < best.distance || (hit.distance === best.distance && entity.id < best.entity))) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const addVec3 = (left, right) => [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
    const scaleVec3 = (value, scalar) => [value[0] * scalar, value[1] * scalar, value[2] * scalar];
    const characterMovementDelta = (axisX, axisZ, speed, fixedDelta) => {
      const length = Math.hypot(axisX, axisZ);
      if (length === 0) return [0, 0, 0];
      const scale = speed * fixedDelta / Math.max(1, length);
      return [axisX * scale, 0, axisZ * scale];
    };
    const entityBounds = (entity) => {
      const collider = entity.components.Collider;
      if (!collider) return undefined;
      return {
        center: colliderBounds(entity).center,
        halfExtents: colliderBounds(entity).halfExtents,
        id: entity.id,
        layer: collider.layer,
        mask: collider.mask,
        slope: collider.slope ? {
          angle: Math.atan2(Number(collider.slope.rise || 0), Number(collider.slope.run || 1)) * 180 / Math.PI,
          axis: collider.slope.axis,
          direction: Number(collider.slope.direction || 1),
          rise: Number(collider.slope.rise || 0),
          run: Number(collider.slope.run || 1)
        } : undefined,
        velocity: entity.components.RigidBody && Array.isArray(entity.components.RigidBody.velocity) ? readVec3(entity.components.RigidBody.velocity, [0, 0, 0]) : undefined
      };
    };
    const characterPenetrates = (left, right) => (
      Math.abs(left.center[0] - right.center[0]) < left.halfExtents[0] + right.halfExtents[0] - 0.00001 &&
      Math.abs(left.center[1] - right.center[1]) < left.halfExtents[1] + right.halfExtents[1] - 0.00001 &&
      Math.abs(left.center[2] - right.center[2]) < left.halfExtents[2] + right.halfExtents[2] - 0.00001
    );
    const coversXZ = (point, bounds) => (
      Math.abs(point[0] - bounds.center[0]) <= bounds.halfExtents[0] &&
      Math.abs(point[2] - bounds.center[2]) <= bounds.halfExtents[2]
    );
    const surfaceTop = (position, bounds) => {
      if (!bounds.slope) return bounds.center[1] + bounds.halfExtents[1];
      const axisIndex = bounds.slope.axis === "x" ? 0 : 2;
      const min = bounds.center[axisIndex] - bounds.halfExtents[axisIndex];
      const max = bounds.center[axisIndex] + bounds.halfExtents[axisIndex];
      const span = Math.max(0.0001, max - min);
      const distance = bounds.slope.direction === 1 ? position[axisIndex] - min : max - position[axisIndex];
      const t = Math.min(1, Math.max(0, distance / span));
      return bounds.center[1] - bounds.halfExtents[1] + t * bounds.slope.rise;
    };
    const canWalkSlope = (position, bounds, slopeLimit) => !bounds.slope || (coversXZ(position, bounds) && bounds.slope.angle <= slopeLimit + 0.0001);
    const canStepOnto = (position, characterHalfExtents, bounds, stepOffset) => {
      const foot = position[1] - characterHalfExtents[1];
      const top = surfaceTop(position, bounds);
      return stepOffset > 0 && top > foot + 0.02 && top <= foot + stepOffset + 0.02;
    };
    const isSideBlocker = (position, characterHalfExtents, bounds) => surfaceTop(position, bounds) > position[1] - characterHalfExtents[1] + 0.02;
    const resolvePush = (pushPolicy, blocker, move) => {
      const body = blocker.components.RigidBody;
      if (!pushPolicy || pushPolicy.enabled !== true || !body || body.kind !== "dynamic") return { kind: "none" };
      const layer = blocker.components.Collider && blocker.components.Collider.layer;
      if (Array.isArray(pushPolicy.allowedLayers) && (typeof layer !== "string" || !pushPolicy.allowedLayers.includes(layer))) return { kind: "none" };
      const mass = body.mass ?? (body.inverseMass === undefined || body.inverseMass === 0 ? 1 : 1 / body.inverseMass);
      if (mass > (pushPolicy.maxPushMass ?? Number.POSITIVE_INFINITY)) {
        return pushPolicy.blockedWhenTooHeavy === false ? { kind: "none" } : { kind: "too-heavy" };
      }
      const speed = Math.hypot(move[0], move[2]);
      if (speed < (pushPolicy.minMoveSpeed ?? 0)) return { kind: "none" };
      const impulseScale = pushPolicy.impulseScale ?? 1;
      const impulse = [move[0] * impulseScale, 0, move[2] * impulseScale];
      const start = readVec3(blocker.components.Transform && blocker.components.Transform.position, [0, 0, 0]);
      return {
        kind: "pushed",
        pushed: {
          entity: blocker.id,
          impulse,
          position: addVec3(start, impulse)
        }
      };
    };
    const resolveHorizontalContact = (characterId, characterCollider, start, desired, characterHalfExtents, blockers, stepOffset, slopeLimit, pushPolicy) => {
      let position = desired;
      let characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
      const movement = [desired[0] - start[0], 0, desired[2] - start[2]];
      for (const blocker of blockers) {
        if (blocker.id === characterId) continue;
        const bounds = entityBounds(blocker);
        if (!bounds || !collidersInteract(characterCollider, blocker.components.Collider) || !characterPenetrates(characterBounds, bounds) || !isSideBlocker(position, characterHalfExtents, bounds)) continue;
        if (bounds.slope && canWalkSlope(position, bounds, slopeLimit)) {
          position = [position[0], surfaceTop(position, bounds) + characterHalfExtents[1], position[2]];
          characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
          continue;
        }
        if (canStepOnto(position, characterHalfExtents, bounds, stepOffset)) {
          position = [position[0], surfaceTop(position, bounds) + characterHalfExtents[1], position[2]];
          characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
          continue;
        }
        const push = resolvePush(pushPolicy, blocker, movement);
        if (push.kind === "pushed") {
          return { position, pushed: push.pushed };
        }
        if (push.kind === "too-heavy") {
          return { blockedBy: blocker.id, position: start, tooHeavy: blocker.id };
        }
        return { blockedBy: blocker.id, position: start };
      }
      return { position };
    };
    const groundPosition = (characterId, characterCollider, position, characterHalfExtents, blockers, fixedDelta, slopeLimit) => {
      let ground;
      let groundTop;
      for (const blocker of blockers) {
        if (blocker.id === characterId) continue;
        const bounds = entityBounds(blocker);
        if (!bounds || !collidersInteract(characterCollider, blocker.components.Collider) || !coversXZ(position, bounds) || !canWalkSlope(position, bounds, slopeLimit)) continue;
        const top = surfaceTop(position, bounds);
        const foot = position[1] - characterHalfExtents[1];
        if (top <= foot + 0.02 && (groundTop === undefined || top > groundTop)) {
          ground = bounds;
          groundTop = top;
        }
      }
      if (!ground || groundTop === undefined) return { position };
      const grounded = [position[0], groundTop + characterHalfExtents[1], position[2]];
      const platformDelta = ground.velocity ? scaleVec3(ground.velocity, fixedDelta) : undefined;
      return { entity: ground.id, platformDelta, position: platformDelta ? addVec3(grounded, platformDelta) : grounded };
    };
    const characterMove = (entityId, moveOptions = {}) => {
      const entity = entityIndex.get(entityId);
      const controller = entity && entity.components.CharacterController;
      const collider = entity && entity.components.Collider;
      if (!entity || !controller || !collider) return null;
      const fixedDelta = Number(moveOptions.fixedDelta ?? data.time.fixedDelta ?? 1);
      const axes = moveOptions.axes || {};
      const start = readVec3(entity.components.Transform && entity.components.Transform.position, [0, 0, 0]);
      const direction = Array.isArray(moveOptions.direction) ? moveOptions.direction : undefined;
      const speed = Number(moveOptions.speed ?? controller.speed ?? 0);
      const desired = addVec3(start, direction === undefined
        ? characterMovementDelta(
            Number(axes[controller.moveXAxis] ?? data.input.axes[controller.moveXAxis] ?? 0),
            Number(axes[controller.moveZAxis] ?? data.input.axes[controller.moveZAxis] ?? 0),
            speed,
            fixedDelta
          )
        : characterMovementDelta(Number(direction[0] ?? 0), Number(direction[1] ?? 0), speed, fixedDelta)
      );
      const blockers = solidColliderEntities;
      const offset = colliderOffset(collider);
      const halfExtents = readColliderHalfExtents(collider);
      const slopeLimit = Number(controller.slopeLimit ?? 45);
      const horizontal = controller.blocking === true
        ? resolveHorizontalContact(entity.id, collider, addVec3(start, offset), addVec3(desired, offset), halfExtents, blockers, Number(controller.stepOffset ?? 0), slopeLimit, controller.pushPolicy)
        : { position: addVec3(desired, offset) };
      const ground = controller.grounding === "raycast"
        ? groundPosition(entity.id, collider, horizontal.position, halfExtents, blockers, fixedDelta, slopeLimit)
        : { position: horizontal.position };
      return {
        ...(horizontal.blockedBy === undefined ? {} : { blockedBy: horizontal.blockedBy }),
        desired,
        entity: entity.id,
        ...(ground.entity === undefined ? {} : { groundEntity: ground.entity }),
        grounded: ground.entity !== undefined,
        ...(ground.platformDelta === undefined ? {} : { platformDelta: ground.platformDelta }),
        ...(horizontal.pushed === undefined ? {} : { pushed: horizontal.pushed, pushes: [horizontal.pushed] }),
        resolved: [
          ground.position[0] - offset[0],
          ground.position[1] - offset[1],
          ground.position[2] - offset[2]
        ],
        start,
        ...(horizontal.tooHeavy === undefined ? {} : { tooHeavy: horizontal.tooHeavy })
      };
    };
    const sensorSnapshot = (payload = {}) => {
      const requestedPhases = new Set(payload.phases || ["enter", "stay", "exit"]);
      const events = (Array.isArray(data.sensorEvents) ? data.sensorEvents : [])
        .filter((event) => (!payload.sensor || payload.sensor === event.sensor) && requestedPhases.has(event.phase))
        .map(clone);
      return { events };
    };
    const pointInPolygon = (point, polygon) => {
      let inside = false;
      for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const current = polygon[index];
        const prior = polygon[previous];
        const intersects = ((current[1] > point[1]) !== (prior[1] > point[1])) &&
          point[0] < (prior[0] - current[0]) * (point[1] - current[1]) / (prior[1] - current[1]) + current[0];
        if (intersects) inside = !inside;
      }
      return inside;
    };
    const navigationRegionFor = (regions, point) => regions.find((region) => pointInPolygon([point[0], point[2]], region.points || []));
    const navigationPath = (request) => {
      const navigation = data.resources.Navigation;
      const query = request.id || "query";
      if (!navigation || !Array.isArray(navigation.regions)) return { failureReason: "no-route", path: [], query, status: "failed", totalCost: 0, visitedRegions: [] };
      const start = navigationRegionFor(navigationRegions, readVec3(request.start, [0, 0, 0]));
      if (!start) return { failureReason: "start-outside", path: [], query, status: "failed", totalCost: 0, visitedRegions: [] };
      const goal = navigationRegionFor(navigationRegions, readVec3(request.goal, [0, 0, 0]));
      if (!goal) return { failureReason: "goal-outside", path: [], query, status: "failed", totalCost: 0, visitedRegions: [start.id] };
      const route = [start.id];
      if (start.id !== goal.id) {
        const neighbor = (start.neighbors || []).find((id) => id === goal.id);
        if (!neighbor) return { failureReason: "no-route", path: [], query, status: "failed", totalCost: 0, visitedRegions: [start.id] };
        route.push(goal.id);
      }
      return { path: [readVec3(request.start, [0, 0, 0]), readVec3(request.goal, [0, 0, 0])], query, status: "success", totalCost: route.length - 1, visitedRegions: route };
    };
    const pickMesh = (request) => {
      const ignored = new Set(request.ignore || []);
      let best = { hit: false };
      for (const entity of data.entities) {
        if (ignored.has(entity.id)) continue;
        const bounds = data.meshBounds[entity.id];
        const transform = entity.components.Transform;
        if (!bounds || !transform) continue;
        const position = readVec3(transform.position, [0, 0, 0]);
        const scale = readVec3(transform.scale, [1, 1, 1]);
        const localCenter = [
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2
        ];
        const center = [
          position[0] + localCenter[0] * scale[0],
          position[1] + localCenter[1] * scale[1],
          position[2] + localCenter[2] * scale[2]
        ];
        const size = [
          Math.abs((bounds.max[0] - bounds.min[0]) * scale[0]),
          Math.abs((bounds.max[1] - bounds.min[1]) * scale[1]),
          Math.abs((bounds.max[2] - bounds.min[2]) * scale[2])
        ];
        const hit = intersectAabb(request, center, size);
        if (hit.hit && (!best.hit || hit.distance < best.distance || (hit.distance === best.distance && entity.id < best.entity))) {
          best = { ...hit, entity: entity.id };
        }
      }
      return best;
    };
    const pointerRay = (request) => {
      const activeCamera = data.resources.ActiveCamera && typeof data.resources.ActiveCamera.entity === "string" ? data.resources.ActiveCamera.entity : undefined;
      const cameraId = typeof request.camera === "string" ? request.camera : activeCamera;
      let entity = cameraId ? entityIndex.get(cameraId) : firstCameraEntity;
      if (entity && !entity.components.Camera) entity = undefined;
      if (!entity) entity = firstCameraEntity;
      if (!entity) return { hit: false };
      const camera = entity.components.Camera;
      const transform = entity.components.Transform || {};
      const origin = readVec3(transform.position, [0, 0, 0]);
      const rotation = readQuat(transform.rotation, [0, 0, 0, 1]);
      const aspect = positiveNumber(request.aspect, 1);
      const maxDistance = positiveNumber(request.maxDistance, Number(camera.far || 100));
      const ndcX = Math.max(0, Math.min(1, Number(request.pointer?.[0] ?? 0.5))) * 2 - 1;
      const ndcY = 1 - Math.max(0, Math.min(1, Number(request.pointer?.[1] ?? 0.5))) * 2;
      if (camera.kind === "orthographic") {
        const size = positiveNumber(camera.size, 1);
        const offset = rotateVec3([ndcX * size * aspect * 0.5, ndcY * size * 0.5, 0], rotation);
        return {
          direction: roundVec3(normalizeVec3(rotateVec3([0, 0, -1], rotation))),
          hit: true,
          maxDistance,
          origin: roundVec3([origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]])
        };
      }
      const fovY = positiveNumber(camera.fovY, 60) * Math.PI / 180;
      const tanHalfFovY = Math.tan(fovY / 2);
      return {
        direction: roundVec3(normalizeVec3(rotateVec3([ndcX * tanHalfFovY * aspect, ndcY * tanHalfFovY, -1], rotation))),
        hit: true,
        maxDistance,
        origin: roundVec3(origin)
      };
    };
    const animations = {};
    const normalizeEntityRef = (entity) => typeof entity === "string" ? entity : entity.id;
    const physicsBodyCommand = (service, entity, value) => {
      const entityId = normalizeEntityRef(entity);
      const target = entityIndex.get(entityId);
      const validVector = Array.isArray(value) && value.length === 3 && value.every((part) => Number.isFinite(part));
      const result = !target
        ? { accepted: false, entity: entityId, status: "missing" }
        : !validVector
          ? { accepted: false, entity: entityId, status: "invalid-vector" }
          : target.components.RigidBody?.kind !== "dynamic"
            ? { accepted: false, entity: entityId, status: "invalid-body" }
            : { accepted: true, entity: entityId, status: "applied" };
      effects.services.push({
        service,
        payload: {
          request: {
            entity: entityId,
            fixedDelta: finiteNumber(data.time.fixedDelta, finiteNumber(data.time.fixedDt, 0.016)),
            value: clone(value)
          },
          result
        }
      });
      return clone(result);
    };
    const roundScalar = (value) => Number(Number(value).toFixed(6));
    const positiveRuntimeNumber = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const nonNegativeRuntimeNumber = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
    const normalizedAnimationTime = (timeSeconds, durationSeconds, loop) => {
      if (durationSeconds <= 0) return 0;
      const normalized = timeSeconds / durationSeconds;
      return roundScalar(loop ? normalized % 1 : Math.min(1, normalized));
    };
    const createBlendState = (fromClip, toClip, durationSeconds, elapsedSeconds) => {
      const elapsed = Math.min(durationSeconds, Math.max(0, elapsedSeconds));
      const alpha = durationSeconds <= 0 ? 1 : elapsed / durationSeconds;
      return {
        complete: elapsed >= durationSeconds,
        durationSeconds: roundScalar(durationSeconds),
        elapsedSeconds: roundScalar(elapsed),
        fromClip,
        fromWeight: roundScalar(1 - alpha),
        toClip,
        toWeight: roundScalar(alpha)
      };
    };
    const serializeAnimationState = (state) => ({
      active: state.active,
      activeState: state.activeState,
      ...(state.blend === undefined ? {} : { blend: state.blend }),
      clip: state.clip,
      entity: state.entity,
      loop: state.loop,
      normalizedTime: normalizedAnimationTime(state.timeSeconds, state.durationSeconds, state.loop),
      sourceClip: state.sourceClip,
      speed: roundScalar(state.speed),
      stopped: state.stopped,
      ...(state.stopReason === undefined ? {} : { stopReason: state.stopReason }),
      timeSeconds: roundScalar(state.timeSeconds)
    });
    const stoppedAnimationState = (entity, clip, stopReason) => ({
      active: false,
      activeState: clip || "",
      clip: clip || "",
      entity,
      loop: false,
      normalizedTime: 0,
      sourceClip: clip || "",
      speed: 0,
      stopped: true,
      stopReason,
      timeSeconds: 0
    });
    const animationPlay = (entity, clip, options = {}) => {
      const entityId = normalizeEntityRef(entity);
      const previous = animations[entityId];
      const blendSeconds = positiveRuntimeNumber(options.blendSeconds, 0);
      const blendElapsedSeconds = nonNegativeRuntimeNumber(options.blendElapsedSeconds, 0);
      const blend = previous && previous.active && previous.clip !== clip && blendSeconds > 0
        ? createBlendState(previous.clip, clip, blendSeconds, blendElapsedSeconds)
        : undefined;
      const state = {
        active: true,
        activeState: typeof options.activeState === "string" ? options.activeState : clip,
        ...(blend === undefined ? {} : { blend }),
        clip,
        durationSeconds: positiveRuntimeNumber(options.durationSeconds, 1),
        entity: entityId,
        loop: typeof options.loop === "boolean" ? options.loop : true,
        sourceClip: typeof options.sourceClip === "string" ? options.sourceClip : clip,
        speed: positiveRuntimeNumber(options.speed, 1),
        stopped: false,
        timeSeconds: 0
      };
      animations[entityId] = state;
      return serializeAnimationState(state);
    };
    const animationQuery = (entity, clip) => {
      const entityId = normalizeEntityRef(entity);
      const state = animations[entityId];
      if (!state || (clip !== undefined && state.clip !== clip)) return stoppedAnimationState(entityId, clip, "not-found");
      return serializeAnimationState(state);
    };
    const animationStop = (entity, clip) => {
      const entityId = normalizeEntityRef(entity);
      const state = animations[entityId];
      if (!state || (clip !== undefined && state.clip !== clip)) {
        const stopped = stoppedAnimationState(entityId, clip, "requested");
        animations[entityId] = { ...stopped, durationSeconds: 1 };
        return stopped;
      }
      state.active = false;
      state.blend = undefined;
      state.stopped = true;
      state.stopReason = "requested";
      animations[entityId] = state;
      return serializeAnimationState(state);
    };
    const audioCatalog = data.audioSounds || {};
    const audioPlaybacks = {};
    let audioSequence = 0;
    const unsupportedAudioOption = (options) => Object.keys(options).find((key) => ["codec", "decoderPlugin", "device", "deviceId", "nativeHandle", "networkStream", "networkUrl", "platformHandle", "src", "stream", "streaming", "streamingUrl", "url"].includes(key));
    const serializeAudioState = (state) => ({
      accepted: state.accepted,
      ...(state.entity === undefined ? {} : { entity: state.entity }),
      ...(state.kind === undefined ? {} : { kind: state.kind }),
      ...(state.loop === undefined ? {} : { loop: state.loop }),
      playbackId: state.playbackId,
      ...(state.reason === undefined ? {} : { reason: state.reason }),
      soundId: state.soundId,
      status: state.status,
      ...(state.volume === undefined ? {} : { volume: state.volume })
    });
    const audioPlay = (soundId, options = {}) => {
      const unsupported = unsupportedAudioOption(options);
      if (unsupported !== undefined) {
        return { accepted: false, playbackId: "", reason: "unsupported-option", soundId, status: "rejected" };
      }
      const declared = audioCatalog[soundId];
      if (!declared) {
        return { accepted: false, playbackId: "", reason: "undeclared-sound", soundId, status: "rejected" };
      }
      audioSequence += 1;
      const playbackId = `${soundId}#${audioSequence}`;
      const volume = Number.isFinite(Number(options.volume)) ? Number(options.volume) : declared.volume;
      const loop = typeof options.loop === "boolean" ? options.loop : declared.kind === "loop";
      const state = {
        accepted: true,
        ...(typeof options.entity === "string" ? { entity: options.entity } : {}),
        kind: declared.kind,
        loop,
        playbackId,
        soundId,
        status: "playing",
        ...(volume === undefined ? {} : { volume })
      };
      audioPlaybacks[playbackId] = state;
      return serializeAudioState(state);
    };
    const audioQuery = (playbackId) => {
      const state = audioPlaybacks[playbackId];
      if (!state) {
        return { accepted: false, playbackId, reason: "not-found", soundId: "", status: "stopped" };
      }
      return serializeAudioState(state);
    };
    const audioStop = (playbackId) => {
      const state = audioPlaybacks[playbackId];
      if (!state) {
        return { accepted: true, playbackId, reason: "not-found", soundId: "", status: "stopped" };
      }
      const stopped = { ...state, status: "stopped" };
      audioPlaybacks[playbackId] = stopped;
      return serializeAudioState(stopped);
    };
    const persistenceStore = {
      saves: clone(data.localData.persistedSaves || {}),
      settings: clone(data.localData.persistedSettings || {})
    };
    const ensurePersistenceStore = () => persistenceStore;
    const settingByKey = (key) => settingIndex.get(key);
    const defaultSettings = () => {
      const defaults = {};
      for (const setting of data.localData.settings || []) {
        defaults[setting.key] = clone(setting.defaultValue);
      }
      return defaults;
    };
    const ensureSettings = () => {
      const store = ensurePersistenceStore();
      const defaults = defaultSettings();
      store.settings = { ...defaults, ...(store.settings || {}) };
      return store.settings;
    };
    const validateSetting = (setting, value) => {
      if (!setting) return false;
      if (setting.kind === "boolean") return typeof value === "boolean";
      if (setting.kind === "number") {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return false;
        if (setting.min !== undefined && numeric < Number(setting.min)) return false;
        if (setting.max !== undefined && numeric > Number(setting.max)) return false;
        return true;
      }
      if (setting.kind === "string") {
        return typeof value === "string" && (!Array.isArray(setting.enumValues) || setting.enumValues.length === 0 || setting.enumValues.includes(value));
      }
      if (setting.kind === "enum") return typeof value === "string" && Array.isArray(setting.enumValues) && setting.enumValues.includes(value);
      return false;
    };
    const snapshotSaveRecord = (slot) => {
      const resourceIds = new Set((data.localData.resources || []).map((entry) => entry.id));
      const componentIds = new Set((data.localData.components || []).map((entry) => entry.id));
      const resources = {};
      const entities = [];
      for (const id of resourceIds) {
        if (data.resources[id] !== undefined) resources[id] = clone(data.resources[id]);
      }
      for (const entity of data.entities) {
        const components = {};
        for (const component of componentIds) {
          if (entity.components[component] !== undefined) {
            components[component] = clone(entity.components[component]);
          }
        }
        if (Object.keys(components).length > 0) entities.push({ id: entity.id, components });
      }
      const declaration = saveSlotDeclaration(slot);
      return {
        appVersion: declaration.appVersion,
        components: Object.fromEntries(entities.map((entity) => [entity.id, entity.components])),
        resources,
        schema: "threenative.persistence-record",
        schemaVersion: declaration.schemaVersion,
        settings: clone(ensureSettings()),
        slot,
        version: "0.1.0",
        world: { entities, resources }
      };
    };
    const saveSlotDeclaration = (slot) => (data.localData.saveSlots || []).find((candidate) => candidate.id === slot);
    const persistenceListSlots = () => {
      const slots = (data.localData.saveSlots || []).map((slot) => slot.id).sort();
      const request = {};
      const result = clone(slots);
      effects.services.push({ service: "persistence.listSlots", payload: { request, result } });
      return result;
    };
    const persistenceSave = (slot) => {
      const request = { slot };
      const declaration = saveSlotDeclaration(slot);
      const result = declaration
        ? { accepted: true, record: snapshotSaveRecord(slot), slot, status: "saved" }
        : { accepted: false, slot, status: "missing-slot" };
      if (declaration) ensurePersistenceStore().saves[slot] = clone(result.record);
      effects.services.push({ service: "persistence.save", payload: { request, result: clone(result) } });
      return clone(result);
    };
    const persistenceLoad = (slot) => {
      const request = { slot };
      const declaration = saveSlotDeclaration(slot);
      const record = ensurePersistenceStore().saves[slot];
      const result = !declaration
        ? { accepted: false, record: null, slot, status: "missing-slot" }
        : (!record ? { accepted: false, record: null, slot, status: "missing-save" } : { accepted: true, record: clone(record), slot, status: "loaded" });
      effects.services.push({ service: "persistence.load", payload: { request, result: clone(result) } });
      return clone(result);
    };
    const persistenceDelete = (slot) => {
      const request = { slot };
      const store = ensurePersistenceStore();
      const existed = store.saves[slot] !== undefined;
      delete store.saves[slot];
      const result = { accepted: existed, slot, status: existed ? "deleted" : "missing-save" };
      effects.services.push({ service: "persistence.delete", payload: { request, result: clone(result) } });
      return clone(result);
    };
    const settingsGet = (key) => {
      const request = { key };
      const result = clone(ensureSettings()[key]);
      effects.services.push({ service: "settings.get", payload: { request, result } });
      return result;
    };
    const settingsSet = (key, value) => {
      const request = { key, value: clone(value) };
      const setting = settingByKey(key);
      const accepted = validateSetting(setting, value);
      if (accepted) ensureSettings()[key] = clone(value);
      const result = accepted;
      effects.services.push({ service: "settings.set", payload: { request, result } });
      return result;
    };
    const settingsExport = () => {
      const request = {};
      const result = clone(ensureSettings());
      effects.services.push({ service: "settings.export", payload: { request, result } });
      return result;
    };
    const settingsImport = (values) => {
      const request = { values: clone(values || {}) };
      const settings = ensureSettings();
      for (const [key, value] of Object.entries(values || {})) {
        const setting = settingByKey(key);
        if (validateSetting(setting, value)) settings[key] = clone(value);
      }
      const result = clone(settings);
      effects.services.push({ service: "settings.import", payload: { request, result } });
      return result;
    };
    const uiActions = () => {
      const request = {};
      const result = Object.entries((data.input && data.input.actions) || {})
        .filter((entry) => entry[1] === true)
        .map((entry) => ({ action: entry[0], node: entry[0] }));
      effects.services.push({ service: "ui.actions", payload: { request, result: clone(result) } });
      return clone(result);
    };
    const ensureUiState = () => {
      const ui = data.ui || { nodes: [], focusOrder: undefined };
      const nodeIds = ui.nodes.map((node) => node.id).join("|");
      if (!globalThis.__tnUiState || globalThis.__tnUiState.nodeIds !== nodeIds) {
        const disabled = {};
        const values = {};
        const nodes = {};
        for (const node of ui.nodes) {
          nodes[node.id] = node;
          disabled[node.id] = node.disabled === true;
          if (node.value !== undefined) values[node.id] = node.value;
          else if (node.text !== undefined) values[node.id] = node.text;
          else if (node.label !== undefined) values[node.id] = node.label;
        }
        const fallbackOrder = ui.nodes.filter((node) => node.focusable).map((node) => node.id);
        const focusOrder = Array.isArray(ui.focusOrder) ? ui.focusOrder.filter((id) => nodes[id] && nodes[id].focusable) : fallbackOrder;
        const current = focusOrder.find((id) => disabled[id] !== true) || null;
        globalThis.__tnUiState = { currentFocus: current, disabled, focusOrder, nodeIds, nodes, values };
      }
      return globalThis.__tnUiState;
    };
    const uiFocus = (nodeId) => {
      const state = ensureUiState();
      const previous = state.currentFocus || null;
      const node = state.nodes[nodeId];
      let result;
      if (!node) result = { accepted: false, current: previous, previous, status: "missing" };
      else if (!node.focusable || state.disabled[nodeId] === true) result = { accepted: false, current: previous, previous, status: "not-focusable" };
      else {
        state.currentFocus = nodeId;
        result = { accepted: true, current: nodeId, previous, status: "focused" };
      }
      effects.services.push({ service: "ui.focus", payload: { request: { node: nodeId }, result: clone(result) } });
      return clone(result);
    };
    const uiActivate = (nodeId) => {
      const state = ensureUiState();
      const node = state.nodes[nodeId];
      const result = !node
        ? { accepted: false, node: nodeId, status: "missing" }
        : (state.disabled[nodeId] === true
          ? { accepted: false, node: nodeId, status: "disabled" }
          : (typeof node.action === "string"
            ? { accepted: true, action: node.action, node: nodeId, status: "activated" }
            : { accepted: false, node: nodeId, status: "no-action" }));
      effects.services.push({ service: "ui.activate", payload: { request: { node: nodeId }, result: clone(result) } });
      return clone(result);
    };
    const uiRead = (nodeId) => {
      const state = ensureUiState();
      const node = state.nodes[nodeId];
      const result = !node
        ? { accepted: false, node: nodeId, status: "missing", value: undefined }
        : { accepted: true, disabled: state.disabled[nodeId] === true, focused: state.currentFocus === nodeId, node: nodeId, status: "read", value: clone(state.values[nodeId]) };
      effects.services.push({ service: "ui.read", payload: { request: { node: nodeId }, result: clone(result) } });
      return clone(result);
    };
    const uiSetDisabled = (nodeId, disabled) => {
      const state = ensureUiState();
      const node = state.nodes[nodeId];
      const result = !node
        ? { accepted: false, disabled: !!disabled, node: nodeId, status: "missing" }
        : { accepted: true, disabled: !!disabled, node: nodeId, status: "updated" };
      if (node) {
        state.disabled[nodeId] = !!disabled;
        if (disabled && state.currentFocus === nodeId) state.currentFocus = null;
      }
      effects.services.push({ service: "ui.setDisabled", payload: { request: { disabled: !!disabled, node: nodeId }, result: clone(result) } });
      return clone(result);
    };
    const uiSetValue = (nodeId, value) => {
      const state = ensureUiState();
      const node = state.nodes[nodeId];
      const result = !node
        ? { accepted: false, node: nodeId, status: "missing", value: clone(value) }
        : { accepted: true, node: nodeId, status: "updated", value: clone(value) };
      if (node) state.values[nodeId] = clone(value);
      effects.services.push({ service: "ui.setValue", payload: { request: { node: nodeId, value: clone(value) }, result: clone(result) } });
      return clone(result);
    };
  const pendingComponentsByEntity = new Map();
  const pendingComponents = (source) => {
    if (!pendingComponentsByEntity.has(source.id)) pendingComponentsByEntity.set(source.id, clone(source.components));
    return pendingComponentsByEntity.get(source.id);
  };
  const transformFacade = (source) => ({
    get position() {
      const components = pendingComponents(source);
      return readVec3(components.Transform && components.Transform.position, [0, 0, 0]);
    },
    set position(position) {
      const value = { position: readVec3(position, [0, 0, 0]) };
      const components = pendingComponents(source);
      components.Transform = { ...(components.Transform || {}), ...clone(value) };
      effects.patches.push({ entity: source.id, component: "Transform", operation: "patch", value });
    },
    positionOr(fallback) {
      const components = pendingComponents(source);
      return readVec3(components.Transform && components.Transform.position, fallback);
    },
    yawOr(fallback) {
      const components = pendingComponents(source);
      return yawFromQuat(components.Transform && components.Transform.rotation, fallback);
    },
    setPosition(position) {
      this.position = position;
    },
    setRotation(rotation) {
      const value = { rotation: readQuat(rotation, [0, 0, 0, 1]) };
      const components = pendingComponents(source);
      components.Transform = { ...(components.Transform || {}), ...clone(value) };
      effects.patches.push({ entity: source.id, component: "Transform", operation: "patch", value });
    },
    setPose(position, rotation) {
      const value = { position: readVec3(position, [0, 0, 0]), rotation: readQuat(rotation, [0, 0, 0, 1]) };
      const components = pendingComponents(source);
      components.Transform = { ...(components.Transform || {}), ...clone(value) };
      effects.patches.push({ entity: source.id, component: "Transform", operation: "patch", value });
    }
  });
  const entityViews = new Map();
  const createEntityView = (source) => {
    if (entityViews.has(source.id)) return entityViews.get(source.id);
    const view = ({
    id: source.id,
    get components() { return clone(pendingComponents(source)); },
    get(component, defaults) {
      const value = pendingComponents(source)[normalize(component)];
      if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
        return { ...clone(defaults), ...(value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {}) };
      }
      return clone(value);
    },
    has(component) {
      return pendingComponents(source)[normalize(component)] !== undefined;
    },
    patch(component, value) {
      const name = normalize(component);
      const components = pendingComponents(source);
      const current = components[name];
      components[name] = { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...clone(value) };
      effects.patches.push({ entity: source.id, component: name, operation: "patch", value: clone(value) });
    },
    set(component, value) {
      const name = normalize(component);
      pendingComponents(source)[name] = clone(value);
      effects.patches.push({ entity: source.id, component: name, operation: "set", value: clone(value) });
    },
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
    transform() {
      return transformFacade(source);
    }
    });
    entityViews.set(source.id, view);
    return view;
  };
  const entities = data.entities.map(createEntityView);
  const tagEntities = (Array.isArray(data.tagEntities) ? data.tagEntities : data.entities).map(createEntityView);
  const context = {
    time: {
      ...data.time,
      deltaTime: finiteNumber(data.time.deltaTime, finiteNumber(data.time.delta, finiteNumber(data.time.dt, 0.016))),
      fixedDelta: finiteNumber(data.time.fixedDelta, finiteNumber(data.time.fixedDt, finiteNumber(data.time.dt, 0.016))),
      fixedDeltaTime: finiteNumber(data.time.fixedDeltaTime, finiteNumber(data.time.fixedDelta, finiteNumber(data.time.fixedDt, 0.016))),
      time: finiteNumber(data.time.time, finiteNumber(data.time.elapsed, 0))
    },
    random: createRandom(randomSeed),
    scenes: {
      change(scene, options = {}) {
        const request = { options: clone(options), scene: normalize(scene) };
        const result = { accepted: true, operation: "change", scene: request.scene };
        effects.services.push({ service: "scene.change", payload: { request, result: clone(result) } });
        return clone(result);
      },
      current() {
        const request = {};
        const result = typeof data.currentScene === "string" ? data.currentScene : null;
        effects.services.push({ service: "scene.current", payload: { request, result } });
        return result;
      },
      loadAdditive(scene, options = {}) {
        const request = { options: clone(options), scene: normalize(scene) };
        const result = { accepted: true, operation: "loadAdditive", scene: request.scene };
        effects.services.push({ service: "scene.loadAdditive", payload: { request, result: clone(result) } });
        return clone(result);
      },
      pop(options = {}) {
        const request = { options: clone(options) };
        const result = { accepted: true, operation: "pop" };
        effects.services.push({ service: "scene.pop", payload: { request, result: clone(result) } });
        return clone(result);
      },
      push(scene, options = {}) {
        const request = { options: clone(options), scene: normalize(scene) };
        const result = { accepted: true, operation: "push", scene: request.scene };
        effects.services.push({ service: "scene.push", payload: { request, result: clone(result) } });
        return clone(result);
      },
      unload(scene, options = {}) {
        const request = { options: clone(options), scene: normalize(scene) };
        const result = { accepted: true, operation: "unload", scene: request.scene };
        effects.services.push({ service: "scene.unload", payload: { request, result: clone(result) } });
        return clone(result);
      }
    },
    timers: createTimers(data.time.elapsed),
    assets: {
      get(id) {
        return clone(assetById(normalize(id)) || null);
      },
      list() {
        return clone(data.assets);
      },
      load(id) {
        const request = { id: normalize(id) };
        const result = loadAsset(request.id);
        effects.services.push({ service: "assets.load", payload: { request, result } });
        return clone(result);
      }
    },
    cameras: {
      shake(options = {}) {
        const request = {
          amplitude: clamp(Number(options.amplitude ?? 0.08), 0, 2),
          ...(options.camera === undefined ? {} : { camera: normalize(options.camera) }),
          duration: clamp(Number(options.duration ?? 0.15), 0, 5),
          frequency: clamp(Number(options.frequency ?? 24), 0, 120),
          ...(options.seed === undefined ? {} : { seed: options.seed })
        };
        const accepted = request.amplitude > 0 && request.duration > 0 && request.frequency > 0;
        const result = { accepted, id: `shake:${data.time.elapsed}:${effects.services.length}`, status: accepted ? "enqueued" : "rejected" };
        effects.services.push({ service: "camera.shake", payload: { request, result } });
        return result;
      }
    },
    particles: {
      burst(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("burst", asset, emitter, options);
        effects.services.push({ service: "particles.burst", payload: { request, result: clone(result) } });
        return clone(result);
      },
      clear(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("clear", asset, emitter, options);
        effects.services.push({ service: "particles.clear", payload: { request, result: clone(result) } });
        return clone(result);
      },
      emit(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("emit", asset, emitter, options);
        effects.services.push({ service: "particles.emit", payload: { request, result: clone(result) } });
        return clone(result);
      },
      play(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("play", asset, emitter, options);
        effects.services.push({ service: "particles.play", payload: { request, result: clone(result) } });
        return clone(result);
      },
      reset(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("reset", asset, emitter, options);
        effects.services.push({ service: "particles.reset", payload: { request, result: clone(result) } });
        return clone(result);
      },
      start(asset, emitter, options = {}) {
        const request = { asset, emitter, options: clone(options) };
        const result = particleCommand("start", asset, emitter, options);
        effects.services.push({ service: "particles.start", payload: { request, result: clone(result) } });
        return clone(result);
      },
      stop(asset, emitter) {
        const request = { asset, emitter };
        const result = particleCommand("stop", asset, emitter);
        effects.services.push({ service: "particles.stop", payload: { request, result: clone(result) } });
        return clone(result);
      }
    },
    schedule: {
      afterTicks(options = {}) {
        const id = normalize(options.id);
        const delayTicks = Math.floor(Number(options.delayTicks));
        const declaration = (data.delayedCommands || []).find((entry) => entry.id === id);
        if (!declaration || !Number.isInteger(delayTicks) || delayTicks < 1 || delayTicks > Number(declaration.maxDelayTicks || 0)) {
          return { accepted: false, delayTicks, id, status: "rejected" };
        }
        effects.schedules.push({ delayTicks, id });
        return { accepted: true, delayTicks, id, status: "enqueued" };
      }
    },
    sequences: {
      play(sequence, options = {}) {
        const request = { sequence: normalize(sequence), options: clone(options) };
        const result = { accepted: true, operation: "play", sequence: request.sequence };
        effects.services.push({ service: "sequences.play", payload: { request, result: clone(result) } });
        return clone(result);
      },
      query(sequence) {
        const request = { sequence: sequence === undefined ? null : normalize(sequence) };
        const result = { active: false, sequence: request.sequence };
        effects.services.push({ service: "sequences.query", payload: { request, result: clone(result) } });
        return clone(result);
      },
      stop(sequence) {
        const request = { sequence: normalize(sequence) };
        const result = { accepted: true, operation: "stop", sequence: request.sequence };
        effects.services.push({ service: "sequences.stop", payload: { request, result: clone(result) } });
        return clone(result);
      }
    },
    character: {
      move(entity, options = {}) {
        const entityId = typeof entity === "string" ? entity : entity.id;
        const request = { entity: entityId, options: clone(options) };
        const result = characterMove(entityId, options);
        effects.services.push({ service: "character.move", payload: { request, result } });
        return clone(result);
      }
    },
    input: {
      action(name) { return !!data.input.actions[name]; },
      axis1(name, buttons = {}) {
        const axis = Number(data.input.axes[name] ?? 0);
        const negative = buttons.negative === undefined ? 0 : (data.input.actions[buttons.negative] ? -1 : 0);
        const positive = buttons.positive === undefined ? 0 : (data.input.actions[buttons.positive] ? 1 : 0);
        return clamp(axis + negative + positive, -1, 1);
      },
      axis(name) { return Number(data.input.axes[name] ?? 0); },
      getAxis(name) { return Number(data.input.axes[name] ?? 0); },
      getAxis2(xAxis, yAxis, options = {}) {
        const value = [Number(data.input.axes[xAxis] ?? 0), Number(data.input.axes[yAxis] ?? 0)];
        const deadzone = Math.max(0, Number(options.deadzone ?? 0));
        const length = Math.hypot(value[0], value[1]);
        if (length <= deadzone) return [0, 0];
        return options.normalize === true && length > 1 ? [value[0] / length, value[1] / length] : value;
      },
      getButton(name) { return !!data.input.actions[name]; },
      getButtonDown(name) { return !!data.input.pressed[name]; },
      getButtonUp(name) { return !!data.input.released[name]; },
      pressed(name) { return !!data.input.pressed[name]; },
      released(name) { return !!data.input.released[name]; }
    },
    entity(id) {
      return entities.find((entity) => entity.id === id);
    },
    entities: {
      byId(ids) {
        const result = {};
        for (const key of Object.keys(ids || {})) {
          result[key] = entities.find((entity) => entity.id === ids[key]);
        }
        return result;
      },
      withTag(tag) {
        return tagEntities.filter((entity) => entity.tags.includes(String(tag))).sort((left, right) => left.id.localeCompare(right.id));
      },
      countTag(tag) {
        return this.withTag(tag).length;
      },
      spawned(options = {}) {
        const tag = options && options.tag;
        return (data.lifecycle && Array.isArray(data.lifecycle.spawned) ? data.lifecycle.spawned : []).filter((id) => tag === undefined || (data.lifecycle.tags && Array.isArray(data.lifecycle.tags[id]) && data.lifecycle.tags[id].includes(tag))).sort();
      },
      despawned(options = {}) {
        const tag = options && options.tag;
        return (data.lifecycle && Array.isArray(data.lifecycle.despawned) ? data.lifecycle.despawned : []).filter((id) => tag === undefined || (data.lifecycle.tags && Array.isArray(data.lifecycle.tags[id]) && data.lifecycle.tags[id].includes(tag))).sort();
      }
    },
    ui: {
      actions() { return uiActions(); },
      activate(nodeId) { return uiActivate(String(nodeId)); },
      focus(nodeId) { return uiFocus(String(nodeId)); },
      read(nodeId) { return uiRead(String(nodeId)); },
      setDisabled(nodeId, disabled) { return uiSetDisabled(String(nodeId), !!disabled); },
      setValue(nodeId, value) { return uiSetValue(String(nodeId), value); }
    },
    persistence: {
      delete(slot) { return persistenceDelete(String(slot)); },
      listSlots() { return persistenceListSlots(); },
      load(slot) { return persistenceLoad(String(slot)); },
      save(slot) { return persistenceSave(String(slot)); }
    },
    settings: {
      export() { return settingsExport(); },
      get(key) { return settingsGet(String(key)); },
      import(values) { return settingsImport(values || {}); },
      set(key, value) { return settingsSet(String(key), value); }
    },
    observers: {
      propagate(event, target) {
        return clone((data.observerRoutes[normalize(event)] || {})[target] || []);
      }
    },
    components: {
      hooks(component) {
        return clone(data.componentHooks[normalize(component)] || []);
      },
      type(component) {
        return clone(data.componentTypes.components.find((type) => type.id === normalize(component)) || null);
      },
      types() {
        return clone(data.componentTypes);
      }
    },
    channels: {
      read(channel) {
        const event = data.channelEvents[normalize(channel)];
        return event ? clone(data.events[event] || []) : [];
      },
      send(channel, payload) {
        const event = data.channelEvents[normalize(channel)];
        if (event) effects.events.push({ event, payload: clone(payload) });
      }
    },
    resources: {
      get(name, defaults) {
        const key = normalize(name);
        observeResource("read", key);
        const value = data.resources[key];
        if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
          return { ...clone(defaults), ...(value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {}) };
        }
        return clone(value);
      },
      patch(name, value) {
        const key = normalize(name);
        const existing = data.resources[key];
        observeResource("write", key);
        effects.resources.push({ resource: key, value: { ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}), ...clone(value) } });
      },
      set(name, value) {
        const key = normalize(name);
        observeResource("write", key);
        effects.resources.push({ resource: key, value: clone(value) });
      }
    },
    state(name, defaults = {}) {
      const key = normalize(name);
      observeResource("read", key);
      const target = { ...clone(defaults), ...(data.resources[key] && typeof data.resources[key] === "object" ? clone(data.resources[key]) : {}) };
      return new Proxy(target, {
        set(object, property, value) {
          if (typeof property !== "string") return false;
          object[property] = clone(value);
          observeResource("write", key);
          effects.resources.push({ resource: key, value: clone(object) });
          return true;
        }
      });
    },
    states: {
      get(id) {
        return data.states[normalize(id)] === undefined ? null : data.states[normalize(id)];
      }
    },
    tasks: {
      channel(id) {
        const task = data.tasks.find((entry) => entry.id === normalize(id));
        return task && typeof task.channel === "string" ? task.channel : null;
      },
      has(id) {
        return data.tasks.some((entry) => entry.id === normalize(id));
      },
      list() {
        return clone(data.tasks);
      }
    },
    plugins: {
      group(id) {
        return clone(data.pluginGroups.find((entry) => entry.id === normalize(id)) || null);
      },
      has(id) {
        return data.plugins.some((entry) => entry.id === normalize(id));
      },
      list() {
        return clone(data.plugins);
      }
    },
    query(query) {
      assertDeclaredQuery(query);
      return applyQuery(entities, query === undefined ? (data.defaultQuery || { with: [], without: [] }) : query);
    },
    events: {
      emit(event, payload) {
        effects.events.push({ event: normalize(event), payload: clone(payload) });
      },
      read(event) {
        return clone(data.events[normalize(event)] || []);
      }
    },
    commands: {
      spawn(entity, components = {}, tags = []) {
        const normalizedTags = Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [];
        effects.commands.push({ command: "spawn", entity, components: clone(components), ...(normalizedTags.length === 0 ? {} : { tags: normalizedTags }) });
      },
      despawn(entity) {
        effects.commands.push({ command: "despawn", entity });
      },
      addComponent(entity, component, value = {}) {
        effects.commands.push({ command: "addComponent", entity, component: normalize(component), value: clone(value) });
      },
      clearParent(child) {
        effects.commands.push({ child, command: "clearParent", entity: child });
      },
      removeComponent(entity, component) {
        effects.commands.push({ command: "removeComponent", entity, component: normalize(component) });
      },
      setComponent(entity, component, value) {
        effects.commands.push({ command: "setComponent", entity, component: normalize(component), value: clone(value) });
      },
      instantiate(prefab, prefix) {
        effects.commands.push({ command: "instantiate", entity: `${prefix}`, prefab, prefix });
        return { accepted: true, entities: [], prefab, root: null, status: "enqueued" };
      },
      setParent(child, parent) {
        effects.commands.push({ child, command: "setParent", entity: child, parent });
      },
      emitEvent(event, payload) {
        effects.commands.push({ command: "emitEvent", event: normalize(event), payload: clone(payload) });
      },
      tween(entity, options = {}) {
        const property = normalize(options.property);
        const expected = property === "rotation" ? 4 : (property === "position" || property === "scale" ? 3 : 1);
        const to = typeof options.to === "number" ? [options.to] : Array.isArray(options.to) ? options.to.map(Number) : [];
        const accepted = ["emissiveIntensity", "opacity", "position", "rotation", "scale"].includes(property)
          && to.length === expected
          && to.every(Number.isFinite)
          && Number.isFinite(Number(options.duration))
          && Number(options.duration) >= 0
          && Number(options.duration) <= 10
          && (!Number.isInteger(Number(options.loops)) || Number(options.loops) >= 0 && Number(options.loops) <= 8);
        const id = `tween:${entity}:${property}:${data.time.elapsed}:${effects.commands.length}`;
        if (accepted) effects.commands.push({ command: "tween", entity, property, value: { ...clone(options), id } });
        return { accepted, id, status: accepted ? "enqueued" : "rejected" };
      },
      worldText(entity, options = {}) {
        const accepted = typeof options.text === "string" && options.text.length > 0 && options.text.length <= 128;
        if (accepted) effects.commands.push({ command: "worldText", entity, value: clone(options) });
        return { accepted, entity, status: accepted ? "enqueued" : "rejected" };
      }
      },
      physics: {
        addForce(entity, force) {
          return physicsBodyCommand("physics.addForce", entity, force);
        },
        addTorque(entity, torque) {
          return physicsBodyCommand("physics.addTorque", entity, torque);
        },
        applyAngularImpulse(entity, impulse) {
          return physicsBodyCommand("physics.applyAngularImpulse", entity, impulse);
        },
        applyImpulse(entity, impulse) {
          return physicsBodyCommand("physics.applyImpulse", entity, impulse);
        },
        overlap(payload) {
          const request = clone(payload);
          const result = overlap(request);
          effects.services.push({ service: "physics.overlap", payload: { request, result } });
          return result;
        },
        raycast(payload) {
          const request = clone(payload);
          const result = raycast(request);
          effects.services.push({ service: "physics.raycast", payload: { request, result } });
          return result;
        },
        shapeCast(payload) {
          const request = clone(payload);
          const result = shapeCast(request);
          effects.services.push({ service: "physics.shapeCast", payload: { request, result } });
          return result;
        },
        sensor(payload = {}) {
          const request = clone(payload);
          const result = sensorSnapshot(request);
          effects.services.push({ service: "physics.sensor", payload: { request, result } });
          return result;
        },
        setAngularVelocity(entity, velocity) {
          return physicsBodyCommand("physics.setAngularVelocity", entity, velocity);
        },
        setLinearVelocity(entity, velocity) {
          return physicsBodyCommand("physics.setLinearVelocity", entity, velocity);
        }
      },
    navigation: {
      path(payload) {
        const request = clone(payload);
        const result = navigationPath(request);
        effects.services.push({ service: "navigation.path", payload: { request, result } });
        return result;
      }
    },
    picking: {
      mesh(payload) {
        const request = clone(payload);
        const result = pickMesh(request);
        effects.services.push({ service: "picking.mesh", payload: { request, result } });
        return result;
      },
      pointerRay(payload) {
        const request = clone(payload);
        const result = pointerRay(request);
        effects.services.push({ service: "picking.pointerRay", payload: { request, result } });
        return result;
      }
    },
    animation: {
      play(entity, clip, options = {}) {
        const entityId = normalizeEntityRef(entity);
        const result = { ...animationPlay(entityId, clip, options), accepted: true };
        effects.services.push({ service: "animation.play", payload: { request: { entity: entityId, clip, options: clone(options) }, result } });
        return clone(result);
      },
      query(entity, clip) {
        const entityId = normalizeEntityRef(entity);
        const request = clip === undefined ? { entity: entityId } : { entity: entityId, clip };
        const result = animationQuery(entityId, clip);
        effects.services.push({ service: "animation.query", payload: { request, result } });
        return clone(result);
      },
      stop(entity, clip) {
        const entityId = normalizeEntityRef(entity);
        const request = clip === undefined ? { entity: entityId } : { entity: entityId, clip };
        const result = { ...animationStop(entityId, clip), accepted: true };
        effects.services.push({ service: "animation.stop", payload: { request, result } });
        return clone(result);
      }
    },
    audio: {
      play(soundId, options = {}) {
        const request = { options: clone(options), soundId };
        const result = audioPlay(soundId, options);
        effects.services.push({ service: "audio.play", payload: { request, result: clone(result) } });
        return clone(result);
      },
      query(playbackId) {
        const request = { playbackId };
        const result = audioQuery(playbackId);
        effects.services.push({ service: "audio.query", payload: { request, result: clone(result) } });
        return clone(result);
      },
      stop(playbackId) {
        const request = { playbackId };
        const result = audioStop(playbackId);
        effects.services.push({ service: "audio.stop", payload: { request, result: clone(result) } });
        return clone(result);
      }
    },
    effects: {
      play(presetId, options = {}) {
        const id = normalize(presetId);
        const preset = feedbackPresetById(id);
        if (!preset) return { accepted: false, preset: id, status: "missing" };
        const seed = options.seed ?? random.float();
        const audio = preset.audio && typeof preset.audio.soundId === "string"
          ? audioPlay(preset.audio.soundId, {
              ...(options.entity === undefined ? {} : { entity: normalize(options.entity) }),
              ...(preset.audio.volume === undefined ? {} : { volume: preset.audio.volume }),
              pitch: Number(preset.audio.pitch ?? 1) + deterministicVariance(seed, preset.audio.pitchVariance ?? 0)
            })
          : undefined;
        const particles = Array.isArray(preset.particles)
          ? preset.particles.map((particle) => ({
              command: particle.command,
              emitter: particle.emitter,
              result: particleCommand(particle.command, particle.asset, particle.emitter, { count: particle.count, seed })
            }))
          : [];
        const camera = preset.camera === undefined ? undefined : { ...clone(preset.camera), ...(options.camera === undefined ? {} : { camera: normalize(options.camera) }), seed };
        const result = { accepted: true, preset: id, status: "enqueued" };
        effects.services.push({ service: "effects.play", payload: { audio, camera, particles, request: { ...clone(options), preset: id, seed }, result, resolvedPitch: audio && audio.pitch } });
        return result;
      }
    }
  };
  const fn = globalThis.__tnExports && globalThis.__tnExports.systems && globalThis.__tnExports.systems[options.exportName];
  if (typeof fn !== "function") {
    throw new Error(`System export '${options.exportName}' was not found in scripts bundle.`);
  }
  fn(context);
  return JSON.stringify(effects);
}
