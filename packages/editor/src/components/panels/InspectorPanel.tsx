import { Grip, Plus, RotateCcw, Settings, type LucideIcon } from "lucide-react";

import type { EditorInspectorFieldKind, IEditorPropertyRow } from "../../adapters/editorModel.js";

export interface IInspectorPanelProps {
  onAddComponent?: () => void;
  onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void;
  rows: readonly IEditorPropertyRow[];
}

export function InspectorPanel({ onAddComponent, onEditProperty, rows }: IInspectorPanelProps) {
  if (rows.length === 0) {
    return <p className="tn-editor-empty">Select a source document or inspected row to view properties.</p>;
  }
  if (isObjectInspectorRows(rows)) {
    return <ObjectInspector onAddComponent={onAddComponent} onEditProperty={onEditProperty} rows={rows} />;
  }
  return (
    <div className="tn-editor-fields">
      {rows.map((row) => <InspectorField key={row.id} onEditProperty={onEditProperty} row={row} />)}
    </div>
  );
}

function isObjectInspectorRows(rows: readonly IEditorPropertyRow[]): boolean {
  return rows.some((row) => row.label === "ID") && rows.some((row) => row.label === "Name") && rows.some((row) => row.label === "Source");
}

function ObjectInspector({ onAddComponent, onEditProperty, rows }: { onAddComponent?: () => void; onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void; rows: readonly IEditorPropertyRow[] }) {
  const id = readRow(rows, "ID")?.value ?? "-";
  const name = readRow(rows, "Name")?.value ?? id;
  const componentNames = [...new Set(rows.map((row) => row.component).filter((component): component is string => component !== undefined))];
  return (
    <div className="tn-editor-object-inspector">
      <div className="tn-editor-inspector-identity">
        <span>ID:</span>
        <strong>{id.split("-").pop() ?? id}</strong>
        <span>Name:</span>
        <input aria-label="Name" readOnly value={name} />
        <button onClick={onAddComponent} type="button"><Plus size={13} /> Add Component</button>
      </div>
      {componentNames.map((component) => (
        <ComponentSection component={component} key={component} onEditProperty={onEditProperty} rows={rows.filter((row) => row.component === component)} />
      ))}
    </div>
  );
}

function ComponentSection({ component, onEditProperty, rows }: { component: string; onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void; rows: readonly IEditorPropertyRow[] }) {
  return (
    <section className="tn-editor-component">
      <header>
        <span><Plus size={12} /> {component}</span>
        <button aria-label={`Collapse ${component}`} type="button">v</button>
      </header>
      {component === "Transform" ? (
        <>
          <TransformGroup label="Position" onEditProperty={onEditProperty} row={readRow(rows, "Position")} />
          <TransformGroup label="Rotation" onEditProperty={onEditProperty} row={readRow(rows, "Rotation")} />
          <TransformGroup label="Scale" onEditProperty={onEditProperty} row={readRow(rows, "Scale")} />
        </>
      ) : (
        <div className="tn-editor-fields">
          {rows.map((row) => <InspectorField key={row.id} onEditProperty={onEditProperty} row={row} />)}
        </div>
      )}
    </section>
  );
}

function TransformGroup({ label, onEditProperty, row }: { label: string; onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void; row: IEditorPropertyRow | undefined }) {
  const values = readVector(row?.value, label === "Scale" ? ["1", "1", "1"] : ["0", "0", "0"]);
  const disabled = row === undefined || row.readOnly;
  return (
    <div className="tn-editor-transform-group">
      <div className="tn-editor-transform-group__header">
        <strong>{label}</strong>
        <button type="button">Reset</button>
      </div>
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <label className="tn-editor-axis-row" data-axis={axis.toLowerCase()} key={axis}>
          <span>{axis}</span>
          <input
            aria-label={`${label} ${axis}`}
            disabled={disabled}
            onChange={(event) => {
              if (row === undefined) {
                return;
              }
              const next = [...values] as [string, string, string];
              next[index] = event.currentTarget.value;
              onEditProperty?.(row, next.map((value) => Number(value)));
            }}
            type="number"
            value={values[index]}
          />
          <button aria-label={`${label} ${axis} drag`} type="button"><Grip size={12} /></button>
          <button aria-label={`${label} ${axis} reset`} type="button"><RotateCcw size={11} /></button>
        </label>
      ))}
    </div>
  );
}

function InspectorField({ onEditProperty, row }: { onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void; row: IEditorPropertyRow }) {
  const kind = row.fieldKind ?? fieldKindFromLabel(row.label);
  if (kind === "vector3") {
    return <VectorField icon={Settings} onEditProperty={onEditProperty} row={row} />;
  }
  if (kind === "enum") {
    return (
      <label className="tn-editor-field tn-editor-field--inline" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <FieldLabel icon={Settings} label={row.label} />
        <select aria-label={row.label} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, event.currentTarget.value)} value={row.value ?? String(row.defaultValue ?? "")}>
          {(row.options ?? ["box", "sphere", "capsule", "cone", "cylinder", "plane", "camera"]).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }
  if (kind === "color") {
    const value = isHexColor(row.value) ? row.value : "#2f80ed";
    return (
      <label className="tn-editor-field tn-editor-field--inline" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <FieldLabel icon={Settings} label={row.label} />
        <input aria-label={row.label} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, event.currentTarget.value)} type="color" value={value} />
        <input aria-label={`${row.label} value`} readOnly value={row.value ?? "default"} />
      </label>
    );
  }
  if (kind === "boolean") {
    return (
      <label className="tn-editor-field tn-editor-field--inline" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <FieldLabel icon={Settings} label={row.label} />
        <input aria-label={row.label} checked={row.value === "true"} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, event.currentTarget.checked)} type="checkbox" />
      </label>
    );
  }
  if (kind === "number") {
    return (
      <label className="tn-editor-field" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <FieldLabel icon={Settings} label={row.label} />
        <input aria-label={row.label} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, Number(event.currentTarget.value))} type="number" value={row.value ?? ""} />
      </label>
    );
  }
  if (kind === "script") {
    const [modulePath = "", exportName = ""] = (row.value ?? "").split("#");
    return (
      <fieldset className="tn-editor-field tn-editor-field--vector" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <legend><FieldLabel icon={Settings} label={row.label} /></legend>
        <div className="tn-editor-vector-inputs">
          <label><span>Module</span><input aria-label={`${row.label} module`} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, { exportName, modulePath: event.currentTarget.value })} value={modulePath} /></label>
          <label><span>Export</span><input aria-label={`${row.label} export`} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, { exportName: event.currentTarget.value, modulePath })} value={exportName} /></label>
        </div>
      </fieldset>
    );
  }
  if (kind === "stringList") {
    return (
      <label className="tn-editor-field" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
        <FieldLabel icon={Settings} label={row.label} />
        <input aria-label={row.label} disabled={row.readOnly} onChange={(event) => onEditProperty?.(row, event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean))} value={row.value ?? ""} />
      </label>
    );
  }
  return (
    <label className="tn-editor-field" data-readonly={row.readOnly ? "true" : "false"} title={row.readOnlyReason}>
      <FieldLabel icon={Settings} label={row.label} />
      <input aria-label={row.label} disabled={row.readOnly && kind !== "generated" && kind !== "json" && kind !== "asset"} onChange={(event) => onEditProperty?.(row, event.currentTarget.value)} readOnly={row.readOnly} value={row.value ?? row.path ?? ""} />
    </label>
  );
}

function VectorField({ icon, onEditProperty, row }: { icon: LucideIcon; onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void; row: IEditorPropertyRow }) {
  const values = readVector(row.value);
  return (
    <fieldset className="tn-editor-field tn-editor-field--vector" data-readonly={row.readOnly ? "true" : "false"}>
      <legend><FieldLabel icon={icon} label={row.label} /></legend>
      <div className="tn-editor-vector-inputs">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              aria-label={`${row.label} ${axis}`}
              disabled={row.readOnly}
              onChange={(event) => {
                const next = [...values] as [string, string, string];
                next[index] = event.currentTarget.value;
                onEditProperty?.(row, next.map((value) => Number(value)));
              }}
              type="number"
              value={values[index]}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function fieldKindFromLabel(label: string): EditorInspectorFieldKind {
  const lower = label.toLowerCase();
  if (lower === "position" || lower === "rotation" || lower === "scale" || lower === "transform") {
    return "vector3";
  }
  if (lower === "primitive" || lower === "mode" || lower === "kind") {
    return "enum";
  }
  if (lower === "color") {
    return "color";
  }
  return "string";
}

function FieldLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="tn-editor-field__label">
      <Icon aria-hidden="true" size={13} />
      {label}
    </span>
  );
}

function readVector(value: string | undefined, fallback: [string, string, string] = ["0", "0", "0"]): [string, string, string] {
  const match = value?.match(/\[([^,]+),\s*([^,]+),\s*([^\]]+)\]/);
  return match === undefined || match === null ? fallback : [match[1] ?? fallback[0], match[2] ?? fallback[1], match[3] ?? fallback[2]];
}

function isHexColor(value: string | undefined): value is string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value);
}

function readRow(rows: readonly IEditorPropertyRow[], label: string): IEditorPropertyRow | undefined {
  return rows.find((row) => row.label === label);
}
