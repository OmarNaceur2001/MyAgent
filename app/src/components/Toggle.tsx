// A small on/off switch (a real checkbox underneath, so it works with keyboard and screen readers).
export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle" data-disabled={disabled}>
      <span className="toggle-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden>
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}
