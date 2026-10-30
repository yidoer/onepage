#!/usr/bin/env node
/**
 * 布局探针：在无头 Chrome 里加载页面，量出每条独立公式的容器/内容尺寸，
 * 报告横向溢出、编号遮挡、纵向裁切。结果直接打印，不产生截图。
 *
 *   node _tools/probe-layout.mjs [页面文件] [视口宽]
 *
 * 说明：Chromium 无头窗口的最小宽度约 500px，因此小于 500 的宽度会被抬到 ~504，
 * 报出来的“视口宽”以实际值为准。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = process.argv[2] || 'derivation.html';
const width = Number(process.argv[3] || 504);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('未找到 Chrome / Edge');
  process.exit(1);
}

const probe = `
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = { width: window.innerWidth, docScrollW: document.documentElement.scrollWidth, eqs: [], wide: [] };
    var eqs = document.querySelectorAll('.eq');
    for (var i = 0; i < eqs.length; i++) {
      var eq = eqs[i], body = eq.querySelector('.body'), tag = eq.querySelector('.tag');
      if (!body) continue;
      var br = body.getBoundingClientRect();
      var kx = body.querySelector('.katex');
      var kr = kx ? kx.getBoundingClientRect() : null;
      var tr = tag ? tag.getBoundingClientRect() : null;
      var overlap = 0;
      if (tr && kr) overlap = Math.max(0, Math.round(Math.min(kr.right, tr.right) - Math.max(kr.left, tr.left)));
      out.eqs.push({
        tag: tag ? tag.textContent : '(无编号)',
        clientW: Math.round(br.width),
        scrollW: body.scrollWidth,
        clientH: Math.round(br.height),
        innerH: kr ? Math.round(kr.height) : 0,
        overlap: overlap
      });
    }
    // 整页横向溢出（表格等）
    document.querySelectorAll('body *').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && typeof el.className === 'string' && el.className) {
        out.wide.push(el.tagName.toLowerCase() + '.' + el.className.split(' ')[0]);
      }
    });
    var pre = document.createElement('pre');
    pre.id = 'probe-out';
    pre.textContent = JSON.stringify(out);
    document.body.textContent = '';
    document.body.appendChild(pre);
  }, 900);
});
</script>`;

const tmp = path.join(ROOT, '_probe.tmp.html');
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, file), 'utf8').replace('</body>', probe + '</body>'), 'utf8');

const dom = execFileSync(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=9000',
    `--window-size=${width},900`, '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
);
fs.rmSync(tmp, { force: true });

const m = dom.match(/<pre id="probe-out">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('未取得探针输出');
  process.exit(1);
}
const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

console.log(`视口宽 ${data.width}px，文档 scrollWidth ${data.docScrollW}px，公式 ${data.eqs.length} 条`);

const hOver = data.eqs.filter((e) => e.scrollW > e.clientW + 1);
const vClip = data.eqs.filter((e) => e.innerH > e.clientH + 1);
const covered = data.eqs.filter((e) => e.overlap > 1);

const show = (label, list) => {
  console.log(`${label}：${list.length}`);
  for (const e of list) {
    console.log(`   ${e.tag}  容器 ${e.clientW}px / 内容 ${e.scrollW}px / 高 ${e.clientH}→${e.innerH}px / 与编号重叠 ${e.overlap}px`);
  }
};
show('横向溢出的公式（可横向滚动）', hOver);
show('纵向被裁切的公式', vClip);
show('压住编号的公式', covered);

if (data.wide.length) console.log('越出视口的元素（多为可横向滚动的表格）：', [...new Set(data.wide)].slice(0, 8).join(', '));

const ok = hOver.length === 0 && vClip.length === 0 && covered.length === 0 && data.docScrollW <= data.width;
console.log(ok ? '✓ 布局检查通过' : '· 存在需要关注的项（横向滚动属于设计内行为，见上方说明）');
