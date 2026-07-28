export function formatTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTimeRange(startMs?: number, endMs?: number): string {
  return [formatTime(startMs), formatTime(endMs)].filter(Boolean).join(" – ");
}
