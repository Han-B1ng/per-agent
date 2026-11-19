const pointFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPoints(value: number): string {
  return pointFormatter.format(value);
}

export function formatPct(value: number, signed = true): string {
  const pct = value * 100;
  const sign = signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function pctClass(value: number): "pos" | "neg" | "zero" {
  if (value > 0.0000001) return "pos";
  if (value < -0.0000001) return "neg";
  return "zero";
}
