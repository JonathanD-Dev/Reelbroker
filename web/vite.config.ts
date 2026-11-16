/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal typing for Node's process (avoids adding @types/node).
declare const process: { env: Record<string, string | undefined> };

const DEV_PORT = 5173;
const PROXY_HOST = 'd354khjfji7lcp.cloudfront.net';

// Behind the code-server proxy (VSCODE_PROXY_URI is set), the dev server is
// reached at https://<host>/absproxy/<port>/. "absproxy" keeps the path prefix,
// so Vite must serve under that base for asset URLs to resolve.
const behindCodeServer = Boolean(process.env.VSCODE_PROXY_URI);

const API_TARGET = 'http://127.0.0.1:8000';

export default defineConfig(({ command }) => {
  const base = command === 'serve' && behindCodeServer ? `/absproxy/${DEV_PORT}/` : '/';
  // The app calls `${base}api/...` (src/lib/api.ts). Behind code-server that is
  // /absproxy/5173/api/..., rewritten to the /api/... the Python backend expects.
  const apiPrefix = `${base}api`;
  const apiProxy = {
    [apiPrefix]: {
      target: API_TARGET,
      changeOrigin: true,
      rewrite: (path: string) => '/api' + path.slice(apiPrefix.length),
    },
  };
  return {
  base,
  plugins: [react()],
  server: {
    port: DEV_PORT,
    allowedHosts: [PROXY_HOST],
    hmr: behindCodeServer ? { clientPort: 443, protocol: 'wss' } : undefined,
    // The Python backend (scripts/serve_api.py) answers on 127.0.0.1:8000.
    proxy: apiProxy,
  },
  preview: {
    allowedHosts: [PROXY_HOST],
    proxy: apiProxy,
  },
  test: {
    // Only the app's tests: reference copies kept elsewhere (e.g. "nouveau dossier/") are ignored.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // Tests never hit the network: the app starts on its built-in mock data unless a test opts in.
    // The demo account "Alex Tremblay" is removed from the app but stays the tests' logged-in fixture.
    env: { VITE_USE_API: 'false', VITE_DEMO_ACCOUNT: 'true' },
    // /snapshot.json and /api are mocked per test.
    globals: false,
  },
};
});
