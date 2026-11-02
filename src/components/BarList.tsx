export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Shown in the tooltip, e.g. "24% of aging stock". */
  detail: string;
  emphasis?: boolean;
  href?: string;
}

/**
 * Ranked horizontal bars. Every value is printed at the bar's tip, so the
 * tooltip adds detail but nothing depends on hovering.
 */
export function BarList({ items, label, muted }: { items: BarItem[]; label: string; muted?: boolean }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bars" aria-label={label}>
      {items.map((item) => {
        const content = (
          <>
            <span className="bar-label">{item.label}</span>
            <span className="bar-track">
              {item.value > 0 && (
                <span
                  className={`bar ${muted && !item.emphasis ? 'bar-muted' : ''}`}
                  style={{ width: `calc((100% - 3.5rem) * ${item.value / max})` }}
                />
              )}
              <span className="bar-value">{item.value.toLocaleString()}</span>
            </span>
            <span className="tip" role="presentation">
              <strong>{item.value.toLocaleString()}</strong> {item.label}
              <span className="tip-detail">{item.detail}</span>
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <a className="bar-row" href={item.href}>{content}</a>
            ) : (
              <div className="bar-row" tabIndex={0}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
