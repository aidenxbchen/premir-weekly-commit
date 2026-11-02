// 把伙伴手记的书页图转成「带透明通道」的 WebP、上传到应用文件存储，并把 HTML 里
// PAGES[].url 改写成线上地址。
//
// 为什么必须带透明通道：书页是从 SVG 渲染出来的，四周本来就是透明的——书本是"抠"
// 出来的形状，靠透明区域让页面背景的网格／渐变／装饰圆透出来。一旦按 JPEG 导出
// （JPEG 没有 alpha），四周会被压成不透明底色，整张 1760×1240 的图就变成一个大方块，
// 把背景全部挡住，视觉上非常割裂。线上曾经踩过这个坑，所以这里固定用 WebP。
//
// 顺带一提，带 alpha 的 WebP 比原来的 JPEG 还小（实测单页 ~86KB vs ~103KB）。
//
// 用法：
//   node scripts/build-sketchbook.mjs                       # 先生成 local/public/sketchbook
//   node scripts/upload-sketchbook-pages.mjs --app-id app_xxx
//
// 依赖：sharp（png→webp）、lark-cli（上传）、网络。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const appId = arg('app-id');
const srcDir = arg('dir', 'local/public/sketchbook');
const outDir = arg('out', 'client/public/sketchbook');
const quality = Number(arg('quality', '85'));

if (!appId) {
  console.error('缺少 --app-id（妙搭应用 id，形如 app_xxx）');
  process.exit(1);
}
if (!existsSync(`${srcDir}/index.html`)) {
  console.error(`找不到 ${srcDir}/index.html，请先运行 node scripts/build-sketchbook.mjs`);
  process.exit(1);
}

const html = readFileSync(`${srcDir}/index.html`, 'utf8');
const matched = html.match(/const PAGES=(\[.*?\]);\n/s);
if (!matched) throw new Error('在 HTML 里找不到 PAGES 数据');
const pages = JSON.parse(matched[1]);

let uploaded = 0;
const failures = [];
for (const [i, page] of pages.entries()) {
  const name = String(i + 1).padStart(2, '0');
  const png = `${srcDir}/quotes/${name}.png`;
  const webp = `${srcDir}/quotes/${name}.webp`;
  try {
    if (!existsSync(png)) throw new Error(`缺少源图 ${png}`);
    // alphaQuality 拉满：书页边缘是柔和渐变，压缩过头会出锯齿／黑边。
    await sharp(png).webp({ quality, alphaQuality: 100 }).toFile(webp);
    // lark-cli 的 --file 只接受 cwd 下的相对路径。
    const raw = execFileSync(
      'lark-cli',
      ['apps', '+file-upload', '--app-id', appId, '--file', `./${webp}`, '--as', 'user'],
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(raw);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error ?? parsed));
    page.url = parsed.data.download_url;
    uploaded += 1;
    if (uploaded % 20 === 0) console.log(`  已上传 ${uploaded}/${pages.length}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

if (failures.length > 0) {
  console.error(`有 ${failures.length} 页失败，已中止（不会写出半成品 HTML）：`);
  for (const f of failures.slice(0, 10)) console.error('  ' + f);
  process.exit(1);
}

const payload = JSON.stringify(pages).replaceAll('<', '\\u003c');
const next = html.replace(/const PAGES=\[.*?\];\n/s, `const PAGES=${payload};\n`);
if (next === html) throw new Error('PAGES 替换失败');

writeFileSync(`${srcDir}/index.html`, next);
writeFileSync(`${outDir}/index.html`, next);
console.log(`完成：${uploaded} 页已上传为 WebP，HTML 已写入 ${srcDir} 与 ${outDir}`);
if (existsSync(`${srcDir}/.build-stamp`)) copyFileSync(`${srcDir}/.build-stamp`, `${outDir}/.build-stamp`);
