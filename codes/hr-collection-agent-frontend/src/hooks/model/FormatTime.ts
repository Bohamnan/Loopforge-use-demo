/** Readable local time for an ISO timestamp, or null when it cannot be read (the api layer already rejects such values). */
export function formatDateTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('zh-CN', { hour12: false });
}
