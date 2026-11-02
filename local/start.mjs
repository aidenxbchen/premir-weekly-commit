import { spawn, execFileSync } from 'node:child_process';
process.chdir(new URL('..', import.meta.url).pathname);
execFileSync(process.execPath, ['scripts/build-sketchbook.mjs'], { stdio: 'inherit' });
// Node 22 会优先用内置的 TypeScript strip-types 解析入口文件，而它不支持 Nest 的
// decorator 语法。直接走 ts-node CLI，确保本地预览每次都按 local/tsconfig.json 编译。
const tsNodeBin = process.platform === 'win32' ? 'node_modules/.bin/ts-node.cmd' : 'node_modules/.bin/ts-node';
const children = [spawn(tsNodeBin, ['--transpile-only', 'local/server.ts'], { stdio: 'inherit', env: { ...process.env, TS_NODE_PROJECT: 'local/tsconfig.json' } }), spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'local/vite.config.mts'], { stdio: 'inherit' })];
const stop = () => children.forEach(p => p.kill('SIGTERM'));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(p => p.on('exit', () => stop()));
