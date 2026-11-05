export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 1.5
export const UI_SCALE_STEP = 0.1

export function clampUiScale(value: number): number {
  const numeric = Number.isFinite(value) ? value : 1
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(numeric * 10) / 10))
}
