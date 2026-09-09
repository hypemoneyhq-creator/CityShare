// Mirrors mobile/src/api/config.ts — same backend, different client.
// Vite exposes env vars prefixed VITE_; falls back to localhost for local dev.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
