/**
 * Where a key moves focus in a row of `count` tabs from `index` (WAI-ARIA tabs pattern):
 * ArrowLeft/ArrowRight step and wrap around, Home/End jump to the ends. Null for any other key.
 */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (count < 1) return null;
  switch (key) {
    case "ArrowRight": return (index + 1) % count;
    case "ArrowLeft": return (index - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}
