// Local dev default assumes `wrangler dev` running on the same machine as
// the Metro bundler (works for iOS Simulator / Android Emulator via
// localhost forwarding). For a physical device on the same network, or a
// deployed Worker, override via EXPO_PUBLIC_EXTRACTION_ENDPOINT in a
// client/.env file — Expo inlines EXPO_PUBLIC_* vars at build time.
export const EXTRACTION_ENDPOINT: string =
  process.env.EXPO_PUBLIC_EXTRACTION_ENDPOINT ?? 'http://localhost:8787';

// Same Worker, same env var — the household API (auth/households/expenses)
// lives at paths under this same base rather than a separate endpoint.
export const WORKER_BASE_URL: string = EXTRACTION_ENDPOINT;
