export interface IReadOnlyFieldProps {
  label: string;
  value: string;
}

export function ReadOnlyField({ label, value }: IReadOnlyFieldProps) {
  return (
    <label className="tn-editor-field" data-readonly="true">
      <span>{label}</span>
      <input readOnly value={value} />
    </label>
  );
}
