import type { WeekResult } from "../frontend/src/types";

export interface ChartHandle {
  render(weeks: WeekResult[]): void;
  redraw(): void;
  setMode(mode: "full" | "bare"): void;
  setHighlightLast(highlight: boolean): void;
  destroy(): void;
}

export function createChart(canvas: HTMLCanvasElement, options?: { onSelect?: (index: number) => void }): ChartHandle;