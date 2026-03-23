/**
 * Returns the base URL for all API requests.
 *
 * Priority:
 *  1. VITE_BACKEND_URL — set this on Vercel (e.g. https://your-app.up.railway.app)
 *  2. Empty string — falls back to relative paths, which work with the Vite
 *     dev-server proxy during local development.
 */
export function getApiBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || '';
}
