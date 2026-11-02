#!/usr/bin/env node
// FULLSTACK_PRECOMMIT_V1
'use strict';

const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const SEP = '  ' + '─'.repeat(36);

// @darraghor/eslint-plugin-nestjs-typed（fullstack-presets 的 eslint 预设依赖）
// 6.x/7.x 全系列都是纯 ESM 包（package.json "type":"module"，无 require 导出）。
// Node < 22.12 左右没有稳定的"require() 加载 ESM"能力，遇到这个包会直接抛
// ERR_REQUIRE_ESM——不是这个项目配置错了，是脚手架依赖和低版本 Node 的组合
// 天生不兼容。真正驱动 pre-commit 钩子的是"此刻 PATH 上的 node"，不受我们
// 交互式 shell 里手动 `nvm use 22` 的影响，所以钩子必须自己兜底切到 Node 22+，
// 而不是指望调用方每次都记得先切版本。
function findNvmNode22BinDir() {
  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  let entries;
  try {
    entries = fs.readdirSync(nvmDir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((v) => /^v(2[2-9]|[3-9]\d)\./.test(v)) // v22+
    .sort((a, b) => {
      const pa = a.slice(1).split('.').map(Number);
      const pb = b.slice(1).split('.').map(Number);
      for (let i = 0; i < 3; i += 1) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i];
      }
      return 0;
    });
  for (const v of candidates) {
    const binDir = path.join(nvmDir, v, 'bin');
    if (fs.existsSync(path.join(binDir, 'node'))) return binDir;
  }
  return null;
}

// package-lock.json 锁内网镜像源 → 线上构建无法访问,改用公共镜像源。
// 后续如有其它内网域名需要拦截,在这里加 pattern 即可。
const INTERNAL_REGISTRY_PATTERNS = [/bnpm\.byted\.org/];

function failAndExit(step, body) {
  process.stderr.write('\n✗ pre-commit failed: ' + step + '\n');
  process.stderr.write(SEP + '\n');
  if (body && body.length > 0) {
    process.stderr.write(body.replace(/\s+$/, '') + '\n');
  }
  process.stderr.write(SEP + '\n');
  process.stderr.write('  bypass: git commit --no-verify\n');
  process.exit(1);
}

function checkLockfileRegistry() {
  const res = spawnSync(
    'git',
    ['diff', '--cached', '--diff-filter=ACMR', '--', 'package-lock.json'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );
  // git 不可用 / 不在 git 仓库 → 静默放行,交给 lint 步骤报错
  if (res.error || res.status !== 0) return;
  const diff = res.stdout ? res.stdout.toString() : '';
  // 只看本次新增行(`+` 开头但排除 `+++` 文件头)
  const hit = diff
    .split('\n')
    .some(
      (line) =>
        line.startsWith('+') &&
        !line.startsWith('+++') &&
        INTERNAL_REGISTRY_PATTERNS.some((p) => p.test(line)),
    );
  if (!hit) return;
  failAndExit(
    'package-lock.json 使用了内网镜像源',
    [
      '线上构建环境无法访问内网镜像源，将导致部署阶段 npm install 失败。',
      '请使用公共镜像源重新生成 lockfile：',
      '',
      '  rm -rf node_modules package-lock.json',
      '  npm install --registry=https://registry.npmmirror.com',
    ].join('\n'),
  );
}

function runLint() {
  const cwd = process.cwd();
  const majorVersion = Number(process.versions.node.split('.')[0]);
  let env = process.env;
  if (majorVersion < 22) {
    const binDir = findNvmNode22BinDir();
    if (binDir) {
      env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` };
    } else {
      failAndExit(
        'lint',
        [
          `当前 Node 版本 ${process.versions.node} 低于 22。`,
          'eslint 预设依赖的 @darraghor/eslint-plugin-nestjs-typed 是纯 ESM 包，',
          'Node < 22 下用 require() 加载会直接抛 ERR_REQUIRE_ESM，不是项目配置错了。',
          '请先安装并切到 Node 22+ 再提交：',
          '',
          '  nvm install 22 && nvm use 22',
        ].join('\n'),
      );
      return;
    }
  }
  const res = spawnSync('npm', ['run', 'lint'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  if (res.error) {
    failAndExit('lint', String(res.error.message || res.error));
  }
  if (res.status !== 0) {
    const stdout = res.stdout ? res.stdout.toString() : '';
    const stderr = res.stderr ? res.stderr.toString() : '';
    failAndExit('lint', stdout + '\n' + stderr);
  }
}

checkLockfileRegistry();
runLint();
