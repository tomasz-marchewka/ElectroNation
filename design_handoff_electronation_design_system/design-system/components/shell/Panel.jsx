import React from "react";

/** Panel dyspozytora dokowany przy prawej krawędzi mapy. Stale widoczny. */
export function Panel({ meta, title, hours, width, children }) {
  return (
    <aside className="en-panel" style={width ? { width } : undefined}>
      {(meta || title) && (
        <div className="en-panel__head">
          {meta && <div className="en-panel__meta">{meta}</div>}
          {title && (
            <div className="en-panel__title">
              {title} {hours && <span>{hours}</span>}
            </div>
          )}
        </div>
      )}
      {children}
    </aside>
  );
}
