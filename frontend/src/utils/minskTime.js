/**
 * Returns a Date object adjusted to Minsk time (UTC+3),
 * regardless of the client's local timezone.
 */
export function getMinskNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3 * 3600000);
}
