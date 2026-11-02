import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root = process.cwd();
export default defineConfig({
  root: path.join(root, 'local/web'), publicDir: path.join(root, 'local/public'), plugins: [react()],
  resolve: { alias: [
    { find: '@client/src/components/business-ui/user-profile/user-profile', replacement: path.join(root, 'local/profile.tsx') },
    { find: '@lark-apaas/client-toolkit/lib/index.css', replacement: path.join(root, 'node_modules/@lark-apaas/client-toolkit/lib/index.css') },
    { find: '@/inspector.dev.css', replacement: path.join(root, 'node_modules/@lark-apaas/client-toolkit/lib/inspector.dev.css') },
    ...['auth','hooks/useCurrentUserProfile','components/AppContainer','components/ErrorRender','components/NotFoundRender','tools/services','logger','utils/getAxiosForBackend','utils/getEnv'].map(name => ({ find: '@lark-apaas/client-toolkit/' + name, replacement: path.join(root, 'local/toolkit.tsx') })),
    { find: '@client', replacement: path.join(root, 'client') }, { find: '@shared', replacement: path.join(root, 'shared') }, { find: '@', replacement: path.join(root, 'client/src') },
  ] },
  define: { 'process.env.CLIENT_BASE_PATH': JSON.stringify('/'), 'process.env.NODE_ENV': JSON.stringify('development') },
  server: { host: '127.0.0.1', port: 8787, strictPort: true, fs: { allow: [root], deny: ['**/local-data/**','**/.git/**','**/.env*'] }, proxy: { '/api': 'http://127.0.0.1:8788', '/ops': 'http://127.0.0.1:8788', '/oauth': 'http://127.0.0.1:8788' } },
});
