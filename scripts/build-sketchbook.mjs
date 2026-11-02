import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// 启动页的分片改动，见文件末尾那一段 replace 的说明。三份片段与线上产物
// client/public/sketchbook/index.html 里的内容保持一致。
const WARM_JS = `
/* ---------------------------------------------------- page warming
   PAGES 一共 161 页、合计约 14MB，每张解码成 1760×1240 的位图又要 8MB 上下。
   过去 boot() 会 await 全部 161 页的 download+decode，等于启动页先扛下
   1.4GB 的位图才肯动起来——这就是"书页加载特别漫长"的根因。
   现在只预热当前页左右各两页、以及开头那段翻页动画会用到的几页，
   其余等浏览器空闲时再一页页补上：手感立刻回来，内存也降下来。 */
const warmed=new Set();
function warmPage(n){
  const k=((n%M)+M)%M;
  if(warmed.has(k))return null;
  warmed.add(k);
  const im=new Image();
  im.decoding='async';
  im.src=PAGES[k].url;
  return im;
}
/* 以 center 为中心、半径 radius 预热一段，返回"解码完成"的 promise。 */
function warmAround(center,radius){
  const jobs=[];
  for(let d=0;d<=radius;d++){
    const list=d===0?[center]:[center+d,center-d];
    for(const k of list){
      const im=warmPage(k);
      if(im&&im.decode)jobs.push(im.decode().catch(()=>undefined));
    }
  }
  return jobs.length?Promise.all(jobs):Promise.resolve();
}
/* ready 之后趁空闲把当前页附近的图慢慢补上：用户真正开始翻的时候，
   下一张往往已经在缓存里了。进入工作台或页面切到后台就停下。 */
let warmDepth=2;
function idleWarm(){
  const idle=window.requestIdleCallback||((fn)=>setTimeout(()=>fn({timeRemaining:()=>8}),900));
  const step=()=>{
    if(document.visibilityState==='hidden'||document.body.dataset.entered==='1')return;
    warmDepth++;
    if(warmDepth>10)return;
    for(const k of [idx+warmDepth,idx-warmDepth]){
      const im=warmPage(k);
      if(im&&im.decode)im.decode().catch(()=>undefined);
    }
    idle(step,{timeout:4000});
  };
  idle(step,{timeout:4000});
}
`;

const GUIDE_CSS = `/* 翻页引导：书页下面一枚会呼吸的小提示。以前这里只写"拖动书页翻阅"，
   没人知道轻点书页本身就能翻页；左右两枚箭头按钮又点了没反应，索性删掉，
   换成一句话 + 一对缓慢呼吸的指示箭头。真正翻过一次页后整体淡出。 */
.sb-guide{
  margin:0;display:inline-flex;align-items:center;gap:9px;
  padding:6px 15px 6px 12px;border:1px solid rgba(38,112,167,.16);border-radius:999px;
  background:rgba(244,250,255,.66);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5b86ab;
  transition:opacity .45s ease,transform .45s ease;
}
.sb-guide.gone{opacity:0;transform:translateY(5px)}
.sb-guide-keys{display:inline-flex;gap:1px;color:#2d93d4;filter:drop-shadow(0 0 7px rgba(45,147,212,.5))}
.sb-guide-keys svg{display:block;animation:sb-key-l 3.6s ease-in-out infinite}
.sb-guide-keys svg:last-child{animation-name:sb-key-r}
@keyframes sb-key-l{0%,100%{opacity:.28;transform:translateX(1.5px)}50%{opacity:1;transform:translateX(-1.5px)}}
@keyframes sb-key-r{0%,100%{opacity:1;transform:translateX(-1.5px)}50%{opacity:.28;transform:translateX(1.5px)}}`;

const GUIDE_HTML = `<p class="sb-guide" id="sbHint" role="note">
        <span class="sb-guide-keys" aria-hidden="true">
          <svg viewBox="0 0 6 10" width="6" height="11" fill="none" aria-hidden="true"><polyline points="4.4,1 1.6,5 4.4,9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg viewBox="0 0 6 10" width="6" height="11" fill="none" aria-hidden="true"><polyline points="1.6,1 4.4,5 1.6,9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span>轻点书页即可翻页 · 拖动或 ← → 亦可</span>
      </p>`;

const source = 'vendor/threeui/public/landing-pages/meng-to-sketchbook.html';
let html = readFileSync(source, 'utf8');
if (createHash('sha256').update(html).digest('hex') !== 'e0330548b1ac905cf1b81698163ffa29f8a3a8c39b8d39f9b71ba5b9255b6dd1') throw Error('ThreeUI source changed');
const markdown = readFileSync('content/周报每周分享_自我表达摘录_2026-01-05至2026-08-26.md', 'utf8');
const output = 'local/public/sketchbook';
const buildStampPath = output + '/.build-stamp';
const buildStamp = createHash('sha256').update('anever-sketchbook-v4\0').update(html).update('\0').update(markdown).digest('hex');
try {
  if (readFileSync(buildStampPath, 'utf8') === buildStamp) {
    console.log('Sketchbook unchanged, using cached assets');
    process.exit(0);
  }
} catch {
  // 首次构建或素材变更，继续生成。
}
const quotes = [];
let date = '', author = '';
for (const line of markdown.split(/\r?\n/)) {
  if (/^### \d{4}-\d{2}-\d{2}$/.test(line)) { date = line.slice(4); author = ''; }
  else if (line.startsWith('#### ')) author = line.slice(5).trim();
  else if (date && author && line.startsWith('> ')) quotes.push({ date, author, text: line.slice(2), title: author + ' · ' + date, place: date });
}
// 只提示不中断：这条原本是"内容被误改"的哨兵，但摘录本来就会持续增补，
// 把某个具体数字写死会让正常的编辑直接导致本地服务起不来。
const EXPECTED_QUOTES = 161;
if (quotes.length !== EXPECTED_QUOTES) {
  console.warn(`Sketchbook 摘录条数变了：${EXPECTED_QUOTES} → ${quotes.length}（如果是有意增补，请同步这个基准值）`);
}
mkdirSync(output + '/quotes', { recursive: true });
const xml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function wrap(text, size) {
  const lines = []; let line = '', width = 0;
  for (const c of text) { const w = /[\x00-\xff]/.test(c) ? size * .53 : size;
    if (width + w > 588 && !/[，。！？；：、）”」]/.test(c)) { lines.push(line); line = ''; width = 0; }
    line += c; width += w;
  }
  if (line) lines.push(line); return lines;
}
for (const [i, q] of quotes.entries()) {
  let size = 41, lines = wrap(q.text, size);
  while (lines.length * size * 1.72 > 465 && size > 23) { size--; lines = wrap(q.text, size); }
  const y = 595 - (lines.length - 1) * size * 1.72 / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1760" height="1240" viewBox="0 0 1760 1240">
  <defs><linearGradient id="left"><stop stop-color="#d8e6f5"/><stop offset=".05" stop-color="#fbfdff"/><stop offset=".85" stop-color="#f1f7fd"/><stop offset="1" stop-color="#c7d8e9"/></linearGradient><linearGradient id="right"><stop stop-color="#b7c9dc"/><stop offset=".06" stop-color="#e9f2fb"/><stop offset=".14" stop-color="#ffffff"/><stop offset=".94" stop-color="#eff6fc"/><stop offset="1" stop-color="#d6e3ef"/></linearGradient><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="3" seed="8" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".028"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
  <path d="M88 293 Q480 250 880 286 Q1290 250 1672 293 L1670 966 Q1260 933 880 977 Q470 933 90 966Z" fill="#496783" opacity=".28"/>
  <path d="M90 286 Q480 251 880 280 Q1300 252 1670 286 L1670 960 Q1240 935 880 970 Q470 935 90 960Z" fill="#d9e6f2" stroke="#afc3d6"/>
  <path d="M94 277 Q486 245 880 275 L880 964 Q480 930 94 951Z" fill="url(#left)" stroke="#cfc5b0"/>
  <path d="M880 275 Q1290 246 1666 277 L1666 951 Q1260 930 880 964Z" fill="url(#right)" stroke="#d4c9b3"/>
  <path d="M105 281 Q480 253 871 279 L871 952 Q480 924 105 941Z M891 279 Q1280 253 1654 281 L1654 941 Q1250 924 891 952Z" fill="#f7f0de" opacity=".28" filter="url(#grain)"/>
  <path d="M881 282 Q870 610 881 958" fill="none" stroke="#9c8e72" stroke-opacity=".35" stroke-width="3"/>
  <g fill="#182b42" font-family="Songti SC, STSong, Noto Serif CJK SC, serif">
    <text x="210" y="378" font-family="Outfit,Arial,sans-serif" font-size="19" font-weight="600" letter-spacing="5" fill="#4c79a4">ANEVER / FIELD NOTES</text>
    <text x="208" y="602" font-size="66" letter-spacing="8">${xml(q.author)}</text>
    <path d="M213 650 Q355 647 480 651" stroke="#ab9573" stroke-width="1.3" fill="none"/>
    <text x="213" y="705" font-size="24" letter-spacing="3" fill="#867a66">写于 ${q.date.replaceAll('-', ' . ')}</text>
    <text x="213" y="857" font-size="21" letter-spacing="4" fill="#9c907b">我们一起走过的日子</text>
    <text x="992" y="358" font-family="Georgia,serif" font-size="66" fill="#a38a63">“</text>
    ${lines.map((line, n) => `<text x="992" y="${y + n * size * 1.72}" font-size="${size}" letter-spacing=".2">${xml(line)}</text>`).join('')}
    <text x="1570" y="895" font-family="Georgia,serif" font-size="20" fill="#aa9c84" text-anchor="end">${String(i + 1).padStart(2, '0')} / ${quotes.length}</text>
  </g></svg>`;
  // 必须出「带 alpha 的 PNG」：书页四周本来就是透明的，靠它让页面背景的网格／渐变透
  // 出来。scripts/upload-sketchbook-pages.mjs 会把它转成同样带 alpha 的 WebP 再上传。
  // 千万别改成 JPEG——JPEG 没有透明通道，四周会被压成不透明底色，整张 1760×1240 的图
  // 就变成一个大方块挡住背景（线上真实踩过这个坑）。
  q.url = `quotes/${String(i + 1).padStart(2, '0')}.png`;
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: false })
    .toFile(output + '/' + q.url);
}
html = html.replace('<html lang="en">', '<html lang="zh-CN">').replace('<title>Meng To</title>', '<title>ANEVER · 伙伴手记</title>');
html = html.replace(/<meta name="description"[^>]+>/, '<meta name="description" content="伙伴周报里的真实表达">');
html = html.replace(/<header class="top">[\s\S]*?<\/header>/, '<header class="top"><a class="name" href="#">ANEVER</a><nav><span>Never stop becoming</span></nav></header>');
html = html.replace('<p class="hero-kicker">Designer / Creator / AI Educator / Founder @ Singapore</p>', '');
html = html.replace('Drag the page to turn · Drag the glass across it', '拖动书页翻阅 · 也可使用左右方向键');
html = html.replace(/<div class="rule"[\s\S]*?<\/main>/, '</main>');
html = html.replace(/\s*<button class="hero-down"[\s\S]*?<\/button>/, '');
html = html.replace(/const PAGES=\[[\s\S]*?const M=PAGES.length, LAND=6;/, `const PAGES=${JSON.stringify(quotes).replaceAll('<', '\\u003c')};\nconst M=PAGES.length, LAND=Math.floor(Math.random()*M);`);
html = html.replace('const steps=M+LAND;', 'const steps=3;\n  idx=(LAND-steps+M)%M;');
html = html.replace('im.alt=PAGES[idx].title;', 'im.alt=PAGES[idx].text + " —— " + PAGES[idx].author;');
html = html.replace("const cur=turn?turn.to:idx;", "const cur=turn?turn.to:idx;\n  const q=PAGES[cur]; document.getElementById('quoteAccessible').textContent=q.text+' —— '+q.author+'，'+q.date;");
html = html.replace('PAGES.forEach((p,i)=>{', 'if(plateList) PAGES.forEach((p,i)=>{');
html = html.replace("plateList.querySelectorAll('.plate').forEach", "plateList?.querySelectorAll('.plate').forEach");
html = html.replace('<div class="sb-captions"', '<div id="quoteAccessible" class="sr-only" role="status" aria-live="polite"></div><div class="sb-captions"');
html = html.replace('</section>\n\n  </main>', '<div class="entry"><button id="enterWorkspace" disabled>正在准备工作台…</button><p>把心里所想，变成这一周的行动。</p></div></section>\n\n  </main>');
html = html.replace('</style>', `
@font-face{font-family:'Outfit';font-style:normal;font-weight:300 800;font-display:swap;src:url(meng-to-sketchbook/outfit.ttf) format('truetype')}
:root{--paper:#eaf4ff;--ink:#13283f;--ink-soft:rgba(19,40,63,.62);--ink-faint:rgba(19,40,63,.39);--hairline:rgba(31,96,151,.17);--earth:#287cc0;--display:'Outfit',Arial,sans-serif;--font:'Newsreader','Songti SC',STSong,serif}
html,body{max-width:100%;overflow-x:hidden}body{background:var(--paper)}.wash{background:linear-gradient(135deg,rgba(87,171,239,.12),transparent 44%),radial-gradient(circle at 78% 18%,rgba(65,190,255,.18),transparent 25%),#eaf4ff;opacity:1}.wash:after{background-image:linear-gradient(rgba(31,105,163,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(31,105,163,.045) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:linear-gradient(#000,transparent 85%);mask-image:linear-gradient(#000,transparent 85%)}
.top{padding-top:clamp(30px,5svh,48px)}.top:before{background:linear-gradient(180deg,rgba(234,244,255,.96),rgba(234,244,255,.72) 55%,transparent)}.top .name{font-family:'Outfit',sans-serif;font-size:30px;font-weight:650;letter-spacing:.2em}.top nav{font-family:'Outfit',sans-serif;font-size:12px;letter-spacing:.18em;color:#477395}.top nav span:before{content:'●';font-size:7px;color:#2aa9ff;margin-right:11px;vertical-align:2px;box-shadow:0 0 12px #2aa9ff}
.hero{height:100svh;min-height:0;padding:clamp(104px,14svh,136px) 0 clamp(18px,3svh,28px);overflow:hidden}.hero:before,.hero:after{content:'';position:absolute;border:1px solid rgba(34,133,203,.22);border-radius:50%;pointer-events:none;z-index:0}.hero:before{width:300px;height:300px;left:-165px;top:18%;box-shadow:0 0 0 28px rgba(45,147,219,.04),0 0 0 72px rgba(45,147,219,.025)}.hero:after{width:210px;height:210px;right:-92px;bottom:14%;box-shadow:0 0 36px rgba(36,157,235,.12),inset 0 0 28px rgba(36,157,235,.06)}.botany{display:none!important}
.sb-wrap{gap:8px;transform:translateY(-2svh)}.sb-3d{max-width:min(960px,82vw,calc((100svh - 310px)*1.42))}.sb-caption{font-family:'Outfit',sans-serif;font-size:11px;letter-spacing:.12em;color:#477395}.sb-arrow{color:rgba(30,92,139,.42)}.sb-arrow:hover{color:#176aa9}.sb-tools{border-color:rgba(38,112,167,.18);background:rgba(244,250,255,.74);box-shadow:0 8px 30px rgba(57,111,153,.09)}.loupe,#loupeBtn,.tool-sep{display:none!important}.tool{color:#477395}
.sb-book,.sb-half,.sb-full,.curl,.strip{-webkit-transform-style:preserve-3d;transform-style:preserve-3d}.sb-half-img,.sb-full img{-webkit-backface-visibility:hidden;backface-visibility:hidden;image-rendering:auto}.curl,.strip{will-change:transform}.face{right:-2px;-webkit-backface-visibility:hidden;backface-visibility:hidden;background-repeat:no-repeat;image-rendering:auto}.face.front{transform:translateZ(.02px)}.face.back{transform:rotateY(180deg) translateZ(.02px)}
.entry{position:relative;z-index:90;text-align:center;margin-top:6px}.entry button{font-family:'Outfit',sans-serif;border:1px solid #186da9;border-radius:7px;background:linear-gradient(135deg,#176fae,#2d93d4);color:#fff;padding:13px 34px;font-size:14px;font-weight:500;letter-spacing:.1em;cursor:pointer;box-shadow:0 10px 26px rgba(33,117,177,.22)}.entry button:hover{background:linear-gradient(135deg,#125f99,#2586c6);transform:translateY(-1px)}.entry button:disabled{opacity:.45;cursor:wait}.entry p{font-size:12px;color:var(--ink-faint);letter-spacing:.12em;margin-top:8px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
button:focus-visible,a:focus-visible{outline:2px solid #2089cf;outline-offset:5px}
@media(min-width:641px) and (max-height:950px){.top{padding-top:clamp(24px,4svh,38px)}.hero{padding-top:92px;padding-bottom:16px}.sb-3d{max-width:min(860px,76vw,calc((100svh - 292px)*1.42))}.entry{margin-top:3px}.entry p{margin-top:5px}}
@media(max-width:640px){.top{padding-top:26px}.top .name{font-size:24px}.hero{height:100svh;padding:102px 0 16px}.sb-wrap{gap:9px;transform:translateY(-3svh)}.sb-3d{max-width:min(100vw,calc((100svh - 330px)*1.42))}.sb-captions{display:none}.sb-tools{margin-top:0}.entry{margin-top:5px}.entry p{margin-top:7px}.sb-hint{font-size:10px}}
@media(max-height:720px){.sb-hint{display:none}.entry p{display:none}.entry button{padding-block:11px}.sb-wrap{gap:6px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style>`);
html = html.replace("const TILT_X=4.5, TILT_Y=7;", "const TILT_X=REDUCED?0:4.5, TILT_Y=REDUCED?0:7;");
html = html.replace("let loupeOn=true,", "let loupeOn=false,");
html = html.replace('.sb-wrap{width:100vw;margin-inline:calc(50% - 50vw)}', '.sb-wrap{width:100%;margin-inline:0}');
html = html.replace("document.getElementById('heroDown').onclick=()=>{\n  document.getElementById('about').scrollIntoView({behavior:'smooth',block:'start'});\n};", '');
const translations = { 'previous page': '上一页', 'next page': '下一页', 'view controls': '阅读工具', 'zoom out': '缩小书本', 'zoom in': '放大书本', 'magnifier': '放大镜', 'scroll to about': '关于手记' };
for (const [a,b] of Object.entries(translations)) html = html.replaceAll(`'${a}'`, `'${b}'`).replaceAll(`"${a}"`, `"${b}"`);
/* =====================================================================
   启动页三处刻意改动，必须和线上产物 client/public/sketchbook/index.html
   保持一致——否则下次重建把生成结果拷过去，这些改动会整段静默回退。
   （注意：线上那份还带了若干手工微调过的 ANEVER 布局数值，生成器并不完整
   复现；重建后请 diff 一次再覆盖，别直接 cp。）
   1) 启动不再 await 全部 161 页：14MB 下载 + 约 1.4GB 位图解码，启动页要等
      十几秒才动。改成只预热当前页附近与开场动画经过的几页 + 空闲时补图。
   2) 删掉左右箭头按钮：它们只有样式、没接动作，点了没有任何反应。
   3) 翻页引导改成一句"轻点书页即可翻页"加一对会呼吸的指示箭头。
   ===================================================================== */
html = html.replace(`  await Promise.all(PAGES.map(p=>{
    const im=new Image();im.src=p.url;
    return im.decode?im.decode().catch(()=>{}):new Promise(r=>{im.onload=im.onerror=r});
  }));`, `  const introPages=warmAround(LAND,INTRO_STEPS+1);
  warmAround(idx,1);
  await Promise.all([
    introPages,
    document.fonts&&document.fonts.ready?document.fonts.ready.catch(()=>{}):Promise.resolve(),
  ]);
  idleWarm();`);
html = html.replace("const steps=3;\n  idx=(LAND-steps+M)%M;", "const steps=INTRO_STEPS;\n  idx=(LAND-steps+M)%M;");
html = html.replace('function el(t,c){', `${WARM_JS}
function el(t,c){`);
html = html.replace(`/* ------------------------------------------------------------- boot */`, `const INTRO_STEPS=3;
/* ------------------------------------------------------------- boot */`);
html = html.replace(/ *<button class="sb-arrow (?:left|right)"[\s\S]*?<\/button>\n/g, '');
html = html.replace(/document\.getElementById\('sb(?:Left|Right)'\)\.onclick=[^\n]*\n/g, '');
html = html.replace(/\.sb-arrow\{[\s\S]*?\.sb-arrow:hover\{[^}]*\}\n/, '');
html = html.replace(/ *\.sb-arrow[^\n]*\n/g, '');
html = html.replace('.sb-arrow{color:rgba(30,92,139,.42)}.sb-arrow:hover{color:#176aa9}', '.sb-guide{border-color:rgba(38,112,167,.15)}');
html = html.replace(/\.sb-hint\{[\s\S]*?\.sb-hint\.gone\{[^}]*\}\n/, `${GUIDE_CSS}\n`);
html = html.replaceAll('.sb-hint', '.sb-guide');
html = html.replace('拖动书页翻阅 · 也可使用左右方向键', '轻点书页即可翻页 · 拖动或 ← → 亦可');
html = html.replace('<p class="sb-guide" id="sbHint">轻点书页即可翻页 · 拖动或 ← → 亦可</p>', GUIDE_HTML);
html = html.replace('</body>', `<script>
const enterButton=document.getElementById('enterWorkspace');
addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='anever:status')return;enterButton.disabled=!e.data.ready;enterButton.textContent=e.data.ready?'这是伙伴间的约定 →':e.data.label||'正在准备工作台…';});
/* 进了工作台就不必再替这个 iframe 预热图片，把带宽交回应用本身 */
enterButton.onclick=()=>{document.body.dataset.entered='1';parent.postMessage({type:'anever:enter'},location.origin);};
parent.postMessage({type:'anever:sketchbook-ready'},location.origin);
</script></body>`);
writeFileSync(output + '/index.html', html);
writeFileSync(output + '/quotes.json', JSON.stringify(quotes, null, 2));
writeFileSync(buildStampPath, buildStamp);
console.log(`Sketchbook built: ${quotes.length} verbatim quotes`);
