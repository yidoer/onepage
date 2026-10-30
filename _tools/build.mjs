#!/usr/bin/env node
/**
 * 构建脚本：把源码分片拼成可直接部署的两个页面。
 *
 *   node _tools/build.mjs          生成 index.html 与 derivation.html
 *   node _tools/build.mjs --check  只检查产物是否与分片一致（CI / 提交前用）
 *
 * 分片之间没有任何模板语法，纯拼接，因此产物是确定性的：
 * 同样的分片永远得到同样的字节。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

/** 模拟器：_head.html（含 vendor 外链）+ 内联 _main.js */
function buildIndex() {
  return (
    read('_head.html') +
    '<script>\n' +
    read('_main.js').replace(/\s*$/, '\n') +
    '</script>\n</body>\n</html>\n'
  );
}

/** 推导页：_deriv_head + 正文四片 + _deriv_tail */
function buildDerivation() {
  return ['_deriv_head.html', '_deriv_body1.html', '_deriv_body2.html', '_deriv_body3.html', '_deriv_body4.html', '_deriv_tail.html']
    .map(read)
    .join('');
}

const TARGETS = [
  ['index.html', buildIndex],
  ['derivation.html', buildDerivation],
];

const check = process.argv.includes('--check');
let ok = true;

for (const [file, build] of TARGETS) {
  const next = build();
  const prev = exists(file) ? read(file) : null;
  if (check) {
    if (prev === next) {
      console.log(`  ✓ ${file} 与分片一致（${Buffer.byteLength(next)} 字节）`);
    } else {
      ok = false;
      console.error(`  ✗ ${file} 与分片不一致，请运行 node _tools/build.mjs`);
      if (prev !== null) {
        const a = prev.split('\n');
        const b = next.split('\n');
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        console.error(`    首个差异在第 ${i + 1} 行：`);
        console.error(`      产物：${JSON.stringify((a[i] ?? '<EOF>').slice(0, 120))}`);
        console.error(`      分片：${JSON.stringify((b[i] ?? '<EOF>').slice(0, 120))}`);
      }
    }
  } else {
    fs.writeFileSync(path.join(ROOT, file), next, 'utf8');
    const delta = prev === null ? '新建' : prev === next ? '无变化' : '已更新';
    console.log(`  ${file}: ${delta}（${Buffer.byteLength(next)} 字节）`);
  }
}

if (check) {
  // 附带检查：页面里引用的本地资源是否都存在
  for (const file of ['index.html', 'derivation.html']) {
    if (!exists(file)) continue;
    const html = read(file);
    const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
    for (const ref of new Set(refs)) {
      if (!exists(ref)) {
        ok = false;
        console.error(`  ✗ ${file} 引用了不存在的文件：${ref}`);
      }
    }
  }
  process.exit(ok ? 0 : 1);
}
