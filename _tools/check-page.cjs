#!/usr/bin/env node
/**
 * 页面自检：不打开浏览器，只对 derivation.html 做静态检查。
 *
 *   1. 每条独立公式的 LaTeX 都能被 KaTeX 解析（用仓库内的 katex.min.js）；
 *   2. 正文里每一处“式 (x.y)”“图 n”“表 n”都能对应到真实存在的编号；
 *   3. 所有 id 唯一，所有页内链接都能落地；
 *   4. 每条独立公式都有可深链接的 id。
 *
 *   node _tools/check-page.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const katex = require(path.join(ROOT, 'vendor/katex/katex.min.js'));
const html = fs.readFileSync(path.join(ROOT, 'derivation.html'), 'utf8');

const dec = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&nbsp;/g, ' ');

let problems = 0;
const fail = (msg) => { problems++; console.log('  ✗ ' + msg); };

/* ---------- 1. 公式解析 ---------- */
const spans = [...html.matchAll(/<span class="(m|body m)">([\s\S]*?)<\/span>/g)];
let errs = 0;
for (const m of spans) {
  try {
    katex.renderToString(dec(m[2]), { displayMode: m[1] === 'body m', throwOnError: true, strict: false });
  } catch (e) {
    errs++;
    console.log(`  ✗ KaTeX 解析失败 [${m[1]}] ${dec(m[2]).slice(0, 70)}`);
    console.log(`      ${String(e.message).split('\n')[0]}`);
  }
}
const display = spans.filter((m) => m[1] === 'body m').length;
console.log(`公式：${spans.length} 条（独立 ${display} + 行内 ${spans.length - display}），解析失败 ${errs}`);
if (errs) problems += errs;

/* ---------- 2. 编号与交叉引用 ---------- */
const eqTags = new Set([...html.matchAll(/<a class="tag"[^>]*>\(([^)]+)\)<\/a>/g)].map((m) => m[1]));
const figs = new Set([...html.matchAll(/<b>图\s*(\d+)\.<\/b>/g)].map((m) => m[1]));
const tabs = new Set([...html.matchAll(/<caption>表\s*([0-9A-Z.]+)/g)].map((m) => m[1]));

// 去掉公式内部，只看叙述文字里的引用
const prose = html.replace(/<span class="(?:m|body m)">[\s\S]*?<\/span>/g, ' ');

let refs = 0;
// 公式编号一律带小数点（3.4、A.1），这样不会把"交互式 3D"之类的词误当成引用
for (const m of prose.matchAll(/式\s*\(?([A-D]?\.?\d+\.\d+)\)?/g)) {
  const id = m[1].replace(/^\./, '');
  refs++;
  if (!eqTags.has(id)) fail(`引用了不存在的公式编号：${m[0].trim()} → 已存在的编号里没有 ${id}`);
}
for (const m of prose.matchAll(/图\s*(\d+)/g)) {
  if (!figs.has(m[1])) fail(`引用了不存在的图：图 ${m[1]}（实际有 ${[...figs].join('、')}）`);
}
for (const m of prose.matchAll(/表\s*(\d+)(?![\d.])/g)) {
  if (!tabs.has(m[1])) fail(`引用了不存在的表：表 ${m[1]}（实际有 ${[...tabs].join('、')}）`);
}
console.log(`交叉引用：${refs} 处公式引用，图 ${figs.size} 幅，表 ${tabs.size} 张`);

/* ---------- 3. id 与链接 ---------- */
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dup.length) fail('id 重复：' + [...new Set(dup)].join(', '));
const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const broken = hrefs.filter((h) => !ids.includes(h));
if (broken.length) fail('页内链接指向不存在的 id：' + [...new Set(broken)].join(', '));
console.log(`锚点：${ids.length} 个 id，${hrefs.length} 个页内链接`);

/* ---------- 4. 公式深链接 ---------- */
const eqDivs = [...html.matchAll(/<div class="eq[^"]*"([^>]*)>/g)];
const noId = eqDivs.filter((m) => !/id="eq-/.test(m[1]));
if (noId.length) fail(`${noId.length} 条独立公式没有 id，无法深链接`);

/* ---------- 5. 其它容易漏掉的小事 ---------- */
if (/人射|幅射|库伦/.test(prose)) fail('正文里仍有错别字（人射/幅射/库伦）');
if (!/lang="zh-CN"/.test(html)) fail('html 缺少 lang 属性');
if (!/<h1>/.test(html)) fail('缺少 h1');

console.log(problems === 0 ? '\n✓ 页面自检全部通过' : `\n✗ 共 ${problems} 处问题`);
process.exit(problems === 0 ? 0 : 1);
