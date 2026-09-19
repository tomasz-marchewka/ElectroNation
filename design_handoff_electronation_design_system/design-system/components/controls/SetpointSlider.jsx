import React from "react";

/** Nastawa jednostki: nazwa, technologia, wartość / moc maks., pasek i kreskowy uchwyt. */
export function SetpointSlider({ name, tech, value, max, unit = "MW", note, color, onChange }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const off = !value;
  return (
    <div className={"en-setpoint" + (off ? " is-off" : "")}>
      <div className="en-setpoint__head">
        <span>
          {name} {tech && <small>{tech}</small>}
        </span>
        <span className={off ? "is-muted" : undefined}>
          {value} / {max} {unit === "MW" ? "" : unit}
        </span>
      </div>
      <label className="en-setpoint__track">
        <span className="en-setpoint__fill" style={{ width: pct + "%", background: color || "var(--en-gas-ico)" }} />
        <span className="en-setpoint__thumb" style={{ left: pct + "%" }} />
        <input
          type="range"
          min="0"
          max={max}
          value={value}
          onChange={onChange ? (e) => onChange(Number(e.target.value)) : undefined}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "ew-resize", margin: 0 }}
        />
      </label>
      {note && <div className="en-setpoint__note">{note}</div>}
    </div>
  );
}
