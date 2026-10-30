#!/usr/bin/env node
/**
 * 目录栏适配探针：在无头 Chrome 里按若干视口加载推导页，量左侧目录的宽度、
 * 高度、目录项换行数、是否需要内部滚动，以及它是否与报头左边缘对齐。
 *
 *   node _tools/probe-toc.mjs [页面文件]
 *
 * 判定标准：
 *   · 双栏（视口 ≥1080px）时目录项应全部单行，且目录高度不超过可视高度；
 *   · 目录左边缘应与报头左边缘对齐（同一套 max-width + padding）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = process.argv[2] || 'derivation.html';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('未找到 Chrome / Edge');
  process.exit(1);
}

const VIEWPORTS = [
  [1680, 1050],
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [1120, 700],
  [1082, 700],
  [1062, 700],
  [900, 700],
  [504, 700],
];

const probe = `
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var toc = document.querySelector('.toc');
    var content = document.querySelector('.content');
    var mast = document.querySelector('.masthead');
    var layout = document.querySelector('.layout');
    var links = [].slice.call(document.querySelectorAll('.toc li a'));
    var lines = links.map(function (a) {
      return Math.max(1, Math.round(a.getBoundingClientRect().height / parseFloat(getComputedStyle(a).lineHeight)));
    });
    var tr = toc.getBoundingClientRect(), cr = content.getBoundingClientRect();
    var lr = layout.getBoundingClientRect(), mr = mast.getBoundingClientRect();
    var out = {
      vw: window.innerWidth, vh: window.innerHeight,
      twoCol: Math.abs(cr.left - lr.left) > 40,
      tocW: Math.round(tr.width), tocH: Math.round(tr.height),
      tocScrollH: toc.scrollHeight, tocClientH: toc.clientHeight,
      innerScroll: toc.scrollHeight > toc.clientHeight + 1,
      contentW: Math.round(cr.width),
      maxLines: Math.max.apply(null, lines),
      wrapped: lines.filter(function (n) { return n > 1; }).length,
      tocLeftMinusMastLeft: Math.round(tr.left - (mr.left + parseFloat(getComputedStyle(mast).paddingLeft))),
      tocTopMinusMastTop: Math.round(tr.top - mr.top)
    };
    var pre = document.createElement('pre'); pre.id = 'probe-out';
    pre.textContent = JSON.stringify(out);
    document.body.textContent = ''; document.body.appendChild(pre);
  }, 700);
});
</script>`;

const tmp = path.join(ROOT, '_probe.tmp.html');
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, file), 'utf8').replace('</body>', probe + '</body>'), 'utf8');
const url = 'file:///' + tmp.replace(/\\/g, '/');

let problems = 0;
console.log('视口        版式   目录尺寸        换行   内部滚动   与报头对齐');
for (const [w, h] of VIEWPORTS) {
  const dom = execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--virtual-time-budget=7000', '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const m = dom.match(/<pre id="probe-out">([\s\S]*?)<\/pre>/);
  if (!m) { console.log(`${w}x${h}: 无输出`); problems++; continue; }
  const d = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  // 双栏时：目录项必须单行；窗口高度 ≥700px 时目录不应需要内部滚动；左边缘与报头文字左边缘对齐。
  // （窗口很矮时 sticky 目录内部滚动是正常取舍，不算缺陷。）
  const bad =
    d.tocLeftMinusMastLeft !== 0 ||
    (d.twoCol && d.wrapped > 0) ||
    (d.twoCol && d.innerScroll && d.vh >= 700);
  if (bad) problems++;
  console.log(
    `${String(d.vw).padStart(4)}x${String(d.vh).padEnd(4)} ${d.twoCol ? '双栏' : '单栏'}  ` +
    `${String(d.tocW + 'x' + d.tocH).padEnd(10)} ${String(d.wrapped + '/' + d.maxLines + '行').padEnd(7)} ` +
    `${(d.innerScroll ? '★是' : '否').padEnd(9)} 左偏 ${d.tocLeftMinusMastLeft}px  正文 ${d.contentW}px  ${bad ? '← 注意' : ''}`
  );
}
fs.rmSync(tmp, { force: true });

console.log(problems === 0 ? '\n✓ 目录适配检查通过' : `\n✗ ${problems} 个视口需要关注`);
process.exit(problems === 0 ? 0 : 1);
