import { Grip, Plus, RotateCcw, Settings, type LucideIcon } from "lucide-react";

import type { IEditorPropertyRow } from "../../adapters/editorModel.js";

export interface IInspectorPanelProps {
  rows: readonly IEditorPropertyRow[];
}

export function InspectorPanel({ rows }: IInspectorPanelProps) {
  if (rows.length === 0) {
    return <p className="tn-editor-empty">Select a source document or inspected row to view properties.</p>;
  }
  if (rows.some((row) => row.label === "Position") && rows.some((row) => row.label === "Rotation") && rows.some((row) => row.label === "Scale")) {
    return <ObjectInspector rows={rows} />;
  }
  return (
    <div className="tn-editor-fields">
      {rows.map((row) => <InspectorField key={row.id} row={row} />)}
    </div>
  );
}

function ObjectInspector({ rows }: { rows: readonly IEditorPropertyRow[] }) {
  const id = readRow(rows, "ID")?.value ?? "-";
  return (
    <div className="tn-editor-object-inspector">
      <div className="tn-editor-inspector-identity">
        <span>ID:</span>
        <strong>{id.split("-").pop() ?? id}</strong>
        <span>Name:</span>
        <input aria-label="Name" readOnly value={id} />
        <button type="button"><Plus size={13} /> Add Component</button>
      </div>
      <section className="tn-editor-component">
        <header>
          <span><Plus size={12} /> Transform</span>
          <button aria-label="Collapse Transform" type="button">v</button>
        </header>
        <TransformGroup label="Position" row={readRow(rows, "Position")} />
        <TransformGroup label="Rotation" row={readRow(rows, "Rotation")} />
        <TransformGroup label="Scale" row={readRow(rows, "Scale")} />
      </section>
    </div>
  );
}

function TransformGroup({ label, row }: { label: string; row: IEditorPropertyRow | undefined }) {
  const values = readVector(row?.value, label === "Scale" ? ["1", "1", "1"] : ["0", "0", "0"]);
  return (
    <div className="tn-editor-transform-group">
      <div className="tn-editor-transform-group__header">
        <strong>{label}</strong>
        <button type="button">Reset</button>
      </div>
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <label className="tn-editor-axis-row" data-axis={axis.toLowerCase()} key={axis}>
          <span>{axis}</span>
          <input aria-label={`${label} ${axis}`} readOnly value={values[index]} />
          <button aria-label={`${label} ${axis} drag`} type="button"><Grip size={12} /></button>
          <button aria-label={`${label} ${axis} reset`} type="button"><RotateCcw size={11} /></button>
        </label>
      ))}
    </div>
  );
}

function InspectorField({ row }: { row: IEditorPropertyRow }) {
  const label = row.label.toLowerCase();
  if (label === "position" || label === "rotation" || label === "scale") {
    return <VectorField icon={Settings} row={row} />;
  }
  if (label === "primitive") {
    return (
      <label className="tn-editor-field tn-editor-field--inline" data-readonly={row.readOnly ? "true" : "false"}>
        <FieldLabel icon={Settings} label={row.label} />
        <select aria-label={row.label} disabled value={row.value ?? "box"}>
          {["box", "sphere", "capsule", "cylinder", "plane", "camera"].map((primitive) => (
            <option key={primitive} value={primitive}>{primitive}</option>
          ))}
        </select>
      </label>
    );
  }
  if (label === "color") {
    const value = isHexColor(row.value) ? row.value : "#2f80ed";
    return (
      <label className="tn-editor-field tn-editor-field--inline" data-readonly={row.readOnly ? "true" : "false"}>
        <FieldLabel icon={Settings} label={row.label} />
        <input aria-label={row.label} disabled type="color" value={value} />
        <input aria-label={`${row.label} value`} readOnly value={row.value ?? "default"} />
      </label>
    );
  }
  return (
    <label className="tn-editor-field" data-readonly={row.readOnly ? "true" : "false"}>
      <FieldLabel icon={Settings} label={row.label} />
      <input aria-label={row.label} readOnly value={row.value ?? row.path ?? ""} />
    </label>
  );
}

function VectorField({ icon, row }: { icon: LucideIcon; row: IEditorPropertyRow }) {
  const values = readVector(row.value);
  return (
    <fieldset className="tn-editor-field tn-editor-field--vector" data-readonly={row.readOnly ? "true" : "false"}>
      <legend><FieldLabel icon={icon} label={row.label} /></legend>
      <div className="tn-editor-vector-inputs">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input aria-label={`${row.label} ${axis}`} readOnly type="number" value={values[index]} />
          </label>
        ))}
      </div>
    </fieldset>
  );
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
