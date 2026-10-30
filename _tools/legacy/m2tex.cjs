/* ============================================================
   m2tex.cjs —— 把推导页里手写的 HTML/CSS 数学标记转换为 LaTeX（KaTeX 源）
   并调用本地 KaTeX 逐条校验。

   用法： node _tools/m2tex.cjs            仅报告（dry run）
          node _tools/m2tex.cjs --apply    写回文件（自动生成 *.texbak 备份）
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['_deriv_head.html','_deriv_body1.html','_deriv_body2.html','_deriv_body3.html','_deriv_body4.html','_deriv_tail.html'];
const APPLY = process.argv.includes('--apply');
const katex = (() => {
  const kp = path.join(ROOT, 'vendor', 'katex', 'katex.min.js');
  const mod = { exports: {} };
  const src = fs.readFileSync(kp, 'utf8');
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', src);
  fn(mod, mod.exports, require, kp, path.dirname(kp));
  if (!mod.exports || !mod.exports.renderToString) throw new Error('KaTeX UMD load failed');
  return mod.exports;
})();

/* ---------- 1. 实体解码 ---------- */
const NAMED = { amp:'&', lt:'<', gt:'>', nbsp:'\u00A0', middot:'\u00B7', mdash:'\u2014',
                ndash:'\u2013', ge:'\u2265', le:'\u2264', phi:'\u03C6', hellip:'\u2026',
                deg:'\u00B0', times:'\u00D7', minus:'\u2212', prime:'\u2032', infin:'\u221E' };
function decode(s){
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&([a-zA-Z]+);/g, (m, n) => (n in NAMED ? NAMED[n] : m));
}

/* ---------- 2. 受限 HTML 解析 ---------- */
function parseFragment(html){
  const root = { t:'el', tag:'#root', cls:'', children: [] };
  const stack = [root];
  const push = n => { if (n.t === 'text' ? n.v !== '' : true) stack[stack.length-1].children.push(n); };
  let i = 0;
  while (i < html.length){
    const lt = html.indexOf('<', i);
    if (lt < 0){ push({ t:'text', v: decode(html.slice(i)) }); break; }
    if (lt > i) push({ t:'text', v: decode(html.slice(i, lt)) });
    const gt = html.indexOf('>', lt);
    if (gt < 0){ push({ t:'text', v: decode(html.slice(lt)) }); break; }
    const raw = html.slice(lt + 1, gt).trim();
    if (raw.startsWith('/')){
      const tag = raw.slice(1).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--){ if (stack[k].tag === tag){ stack.length = k; break; } }
    } else {
      const m = /^([a-zA-Z][a-zA-Z0-9]*)([\s\S]*)$/.exec(raw);
      if (m){
        const cm = /class\s*=\s*"([^"]*)"/.exec(m[2]);
        const node = { t:'el', tag: m[1].toLowerCase(), cls: cm ? cm[1] : '', children: [] };
        stack[stack.length-1].children.push(node);
        stack.push(node);
      } else push({ t:'text', v: decode(html.slice(lt, gt + 1)) });
    }
    i = gt + 1;
  }
  return root.children;
}
const plainText = n => n.t === 'text' ? n.v : (n.children || []).map(plainText).join('');

/* ---------- 3. 字符 / 词 → LaTeX ---------- */
const CH = {
  '\u00A7':'\\S ', '\u00B0':'^\\circ ', '\u00B3':'^3', '\u00BD':'\\tfrac{1}{2}', '\u00D7':'\\times ',
  '\u0302':'\\hat{}', '\u0307':'\\dot{}', '\u0308':'\\ddot{}',
  '\u0394':'\\Delta ', '\u03A9':'\\Omega ', '\u03B1':'\\alpha ', '\u03B5':'\\varepsilon ',
  '\u03B8':'\\theta ', '\u03BB':'\\lambda ', '\u03BC':'\\mu ', '\u03C0':'\\pi ',
  '\u03C1':'\\rho ', '\u03C3':'\\sigma ', '\u03C4':'\\tau ', '\u03C6':'\\varphi ',
  '\u210F':'\\hbar ',
  '\u2009':'\\,', '\u200A':'\\!', '\u2013':'-', '\u2014':'\\text{—}',
  '\u2032':"'", '\u2033':"''",
  '\u2070':'^0', '\u2074':'^4', '\u2075':'^5', '\u2079':'^9', '\u207B':'^-',
  '\u2192':'\\to ', '\u21D2':'\\Rightarrow ', '\u21D4':'\\Leftrightarrow ',
  '\u2212':'-', '\u2218':'\\circ ', '\u221D':'\\propto ', '\u221E':'\\infty ',
  '\u2248':'\\approx ', '\u2261':'\\equiv ', '\u2264':'\\le ', '\u2265':'\\ge ',
  '\u226A':'\\ll ', '\u226B':'\\gg ', '\u2272':'\\lesssim ', '\u2273':'\\gtrsim ',
  '\u22A5':'\\perp ', '\u00B7':'\\cdot ', '\u222B':'\\int ', '\u2026':'\\dots ',
  '\u00A0':'\\ ',
};
const FUNCS = { cos:'\\cos', sin:'\\sin', tan:'\\tan', cot:'\\cot', sec:'\\sec', csc:'\\csc',
                cosh:'\\cosh', sinh:'\\sinh', tanh:'\\tanh',
                arccos:'\\arccos', arcsin:'\\arcsin', arctan:'\\arctan',
                exp:'\\exp', ln:'\\ln', log:'\\log' };
const FNRE = /\b(sinh|cosh|tanh|arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|exp|ln|log)\b/g;

function texOfText(s){
  let t = s.replace(FNRE, m => FUNCS[m] + ' ');
  t = t.replace(/\b([A-Z]{2,})\b/g, m => '\\mathrm{' + m + '}');
  let out = '';
  for (const ch of t) out += (ch in CH) ? CH[ch] : ch;
  return out;
}

/* ---------- 4. 节点 → LaTeX ---------- */
const WARN = [];
const warn = m => { if (!WARN.includes(m)) WARN.push(m); };
const MTFN = { cos:'\\cos', sin:'\\sin', tan:'\\tan', cot:'\\cot', csc:'\\csc',
               arccos:'\\arccos', arcsin:'\\arcsin', arctan:'\\arctan', exp:'\\exp', ln:'\\ln', log:'\\log' };
const MTSYM = { '\u00B7':'\\cdot ', '\u00D7':'\\times ', '\u2212':'-', '\u00B0':'^\\circ ', '\u00A0':' ' };

const tex = nodes => nodes.map(texNode).join('');

function texNode(n){
  if (n.t === 'text'){
    if (/[A-Za-z]{2,}/.test(n.v)) warn('bare alpha run: "' + n.v.trim() + '"');
    return texOfText(n.v);
  }
  const cls = n.cls.split(/\s+/).filter(Boolean);
  const inner = () => tex(n.children);

  if (n.tag === 'i') return inner();
  if (n.tag === 'sub' || n.tag === 'sup') return (n.tag === 'sub' ? '_' : '^') + '{' + script(n) + '}';
  if (n.tag === 'span'){
    if (cls.includes('frac')){
      const fn = n.children.find(c => c.t === 'el' && c.cls.includes('fn'));
      const fd = n.children.find(c => c.t === 'el' && c.cls.includes('fd'));
      if (!fn || !fd) warn('frac missing fn/fd');
      return '\\frac{' + (fn ? tex(fn.children) : '') + '}{' + (fd ? tex(fd.children) : '') + '}';
    }
    if (cls.includes('sq')){
      const sb = n.children.find(c => c.t === 'el' && c.cls.includes('sb'));
      return '\\sqrt{' + (sb ? tex(sb.children) : inner()) + '}';
    }
    if (cls.includes('mtext')) return texMtext(n);
    if (cls.includes('vec')){
      const flat = plainText(n);
      if (flat.includes('\u0302')){
        const kids = n.children.map(c => c.t === 'text' ? { t:'text', v: c.v.replace(/\u0302/g, '') } : c);
        return '\\hat{' + tex(kids) + '}';
      }
      if (flat.includes('\u0307')) return '\\dot{' + tex(n.children) + '}';
      if (flat.includes('\u0308')) return '\\ddot{' + tex(n.children) + '}';
      return '\\vec{' + inner() + '}';
    }
    return inner();
  }
  return inner();
}
function script(node){
  const flat = plainText(node).trim();
  if (/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF]/.test(flat)) return '\\text{' + flat + '}';
  if (/^[A-Za-z][A-Za-z ]*$/.test(flat) && flat.length >= 2) return '\\text{' + flat + '}';
  return tex(node.children);
}
function texMtext(node){
  const flat = plainText(node).trim();
  if (MTFN[flat]) return MTFN[flat] + ' ';
  let out = '';
  for (const c of node.children){
    if (c.t === 'text'){
      let buf = '';
      for (const ch of c.v){
        if (ch in MTSYM){
          if (buf.trim()) out += '\\text{' + buf.trim() + '}';
          buf = '';
          out += MTSYM[ch];
        } else buf += ch;
      }
      if (buf.trim()) out += '\\text{' + buf.trim() + '}';
    }
    else if (c.tag === 'sup') out += '^{' + tex(c.children) + '}';
    else if (c.tag === 'sub') out += '_{' + tex(c.children) + '}';
    else if (c.tag === 'i') out += '\\text{' + plainText(c).trim() + '}';
    else out += texMtext(c);
  }
  return out;
}

/* ---------- 5. 根号后置处理（√ 的操作数可能跨节点） ---------- */
function fixSqrt(s){
  let out = '', i = 0;
  while (i < s.length){
    if (s[i] === '\u221A'){
      const j = i + 1;
      if (s[j] === '('){
        let depth = 0, k = j;
        for (; k < s.length; k++){
          if (s[k] === '(') depth++;
          else if (s[k] === ')'){ depth--; if (depth === 0) break; }
        }
        out += '\\sqrt{' + s.slice(j + 1, k) + '}';
        i = k + 1;
      } else {
        let k = j;
        while (k < s.length && /[0-9A-Za-z]/.test(s[k])) k++;
        out += '\\sqrt{' + s.slice(j, k) + '}';
        i = k;
      }
    } else { out += s[i]; i++; }
  }
  return out;
}

/* ---------- 6. 定位并替换数学区 ---------- */
function findClose(html, start){
  let depth = 1, i = start;
  while (i < html.length){
    const o = html.indexOf('<span', i), c = html.indexOf('</span>', i);
    if (c < 0) return -1;
    if (o >= 0 && o < c){ depth++; i = o + 5; } else { depth--; if (depth === 0) return c; i = c + 7; }
  }
  return -1;
}
const escTex = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const OPEN = [ { pat:'<span class="body m">', display:true }, { pat:'<span class="m">', display:false } ];

const ERRORS = [], NONASCII = new Map();
const stat = { count:0, display:0, inline:0, samples:[] };

function convert(html, file){
  let out = '', i = 0;
  while (true){
    let best = null;
    for (const o of OPEN){
      const p = html.indexOf(o.pat, i);
      if (p >= 0 && (best === null || p < best.p)) best = { p, o };
    }
    if (!best){ out += html.slice(i); break; }
    const inner = best.p + best.o.pat.length;
    const close = findClose(html, inner);
    if (close < 0){ warn('unbalanced math span near: ' + html.substr(best.p, 60)); out += html.slice(i); break; }
    const frag = html.slice(inner, close);

    let texSrc;
    try { texSrc = fixSqrt(tex(parseFragment(frag))); }
    catch (e){ ERRORS.push({ file, msg:'convert: ' + e.message, tex: frag.slice(0, 120) }); texSrc = frag; }
    texSrc = texSrc.replace(/\s+/g, ' ').trim();

    try { katex.renderToString(texSrc, { displayMode: best.o.display, throwOnError: true, strict: false }); }
    catch (e){ ERRORS.push({ file, msg: String(e.message).split('\n')[0], tex: texSrc.slice(0, 160) }); }

    for (const ch of texSrc.replace(/\\text\{[^}]*\}/g, '')){
      if (ch.charCodeAt(0) > 127) NONASCII.set(ch, (NONASCII.get(ch) || 0) + 1);
    }

    out += html.slice(i, inner) + escTex(texSrc);
    i = close;
    stat.count++;
    if (best.o.display) stat.display++; else stat.inline++;
    if (stat.samples.length < 10) stat.samples.push(
      (best.o.display ? '[D] ' : '[I] ') + frag.replace(/\s+/g, ' ').slice(0, 100) + '  ==>  ' + texSrc.slice(0, 130));
  }
  return out;
}

/* ---------- 7. 主流程 ---------- */
const report = [];
const log = s => { console.log(s); report.push(s); };

for (const f of FILES){
  const p = path.join(ROOT, f);
  const src = fs.readFileSync(p, 'utf8');
  const before = stat.count;
  const out = convert(src, f);
  log(`${f.padEnd(20)} math=${String(stat.count - before).padStart(4)}  chars ${src.length} -> ${out.length}`);
  if (APPLY){
    const bak = p + '.texbak';
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, src, 'utf8');
    fs.writeFileSync(p, out, 'utf8');
  }
}

log('');
log(`TOTAL math regions = ${stat.count}  (display=${stat.display}, inline=${stat.inline})`);
log('');
log('--- samples (before ==> after) ---');
stat.samples.forEach(s => log('  ' + s));
log('');
log(`--- KaTeX validation: ${ERRORS.length} error(s) ---`);
ERRORS.forEach((e, i) => log(`  ${i + 1}. [${e.file}] ${e.msg}\n     TEX: ${e.tex}`));
if (!ERRORS.length) log('  ALL PASS');
log('');
log('--- non-ASCII outside \\text{} ---');
if (!NONASCII.size) log('  (none)');
else [...NONASCII.entries()].sort((a, b) => b[1] - a[1]).forEach(([ch, n]) =>
  log(`  '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()} x${n}`));
log('');
log('--- warnings ---');
if (!WARN.length) log('  (none)'); else WARN.forEach(w => log('  ! ' + w));
log('');
log(APPLY ? 'APPLIED (backups: *.texbak)' : 'DRY RUN (no files written)');

fs.writeFileSync(path.join(ROOT, '_math2tex_report.txt'), report.join('\n'), 'utf8');
