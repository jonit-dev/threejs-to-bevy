import {
  PHYSICS_DEBUG_CATEGORIES,
  type IPhysicsDebugSnapshot,
  type PhysicsDebugCategory,
} from "@threenative/ir/physicsDebug";

export interface IPhysicsDebugPanelProps {
  enabledCategories: readonly PhysicsDebugCategory[];
  onEnabledCategoriesChange: (categories: readonly PhysicsDebugCategory[]) => void;
  snapshot?: IPhysicsDebugSnapshot;
}

export function PhysicsDebugPanel({ enabledCategories, onEnabledCategoriesChange, snapshot }: IPhysicsDebugPanelProps) {
  if (snapshot === undefined) {
    return <p className="tn-editor-empty">Build and run a preview to inspect live physics telemetry.</p>;
  }
  const enabled = new Set(enabledCategories);
  const counts = new Map<PhysicsDebugCategory, number>();
  for (const primitive of snapshot.summary.primitives) {
    counts.set(primitive.category, (counts.get(primitive.category) ?? 0) + 1);
  }
  const telemetry = snapshot.summary.telemetry;
  return (
    <div aria-label="Physics debug inspector" className="tn-editor-physics-debug">
      <dl>
        <Telemetry label="Tick" value={telemetry.tick} />
        <Telemetry label="Bodies" value={`${telemetry.bodies.active} active / ${telemetry.bodies.sleeping} sleeping`} />
        <Telemetry label="Contacts" value={telemetry.contacts} />
        <Telemetry label="Queries" value={telemetry.queries} />
        <Telemetry label="Solver iterations" value={telemetry.solverIterations} />
        <Telemetry label="Rebuilds" value={telemetry.rebuilds} />
        <Telemetry label="Allocated pieces" value={telemetry.allocatedPieces} />
      </dl>
      <fieldset>
        <legend>Debug views</legend>
        {PHYSICS_DEBUG_CATEGORIES.map((category) => (
          <label key={category}>
            <input
              checked={enabled.has(category)}
              data-physics-debug-toggle={category}
              onChange={() => onEnabledCategoriesChange(nextPhysicsDebugCategories(enabledCategories, category))}
              type="checkbox"
            />
            {category}
          </label>
        ))}
      </fieldset>
      <ul className="tn-editor-list">
        {PHYSICS_DEBUG_CATEGORIES.map((category) => (
          <li data-enabled={enabled.has(category)} data-physics-debug-category={category} key={category}>
            <span>{category}</span>
            <small>{counts.get(category) ?? 0}</small>
          </li>
        ))}
      </ul>
      <ul aria-label="Enabled physics debug primitives" className="tn-editor-list">
        {snapshot.summary.primitives.filter((primitive) => enabled.has(primitive.category)).map((primitive) => (
          <li data-physics-debug-primitive={primitive.id} key={primitive.id}>
            <span>{primitive.id}</span>
            <small>{primitive.kind}</small>
          </li>
        ))}
      </ul>
      {snapshot.summary.truncated ? (
        <small>{snapshot.summary.omittedPrimitives} additional primitives are retained in the artifact.</small>
      ) : null}
    </div>
  );
}

export function nextPhysicsDebugCategories(
  enabledCategories: readonly PhysicsDebugCategory[],
  toggled: PhysicsDebugCategory,
): PhysicsDebugCategory[] {
  const enabled = new Set(enabledCategories);
  if (enabled.has(toggled)) enabled.delete(toggled);
  else enabled.add(toggled);
  return PHYSICS_DEBUG_CATEGORIES.filter((category) => enabled.has(category));
}

function Telemetry({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
