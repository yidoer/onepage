/**
 * 一次性迁移脚本：把 index.html 里内联的两段第三方脚本抽成 vendor 文件。
 * 运行后即可删除。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const blocks = [...html.matchAll(/<script>\n?([\s\S]*?)<\/script>/g)];
if (blocks.length !== 3) throw new Error('预期 3 段脚本，实际 ' + blocks.length);

const three = blocks[0][1].replace(/^\n/, '');
const orbit = blocks[1][1].replace(/^\n/, '');
const main = blocks[2][1].replace(/^\n/, '');
const headEnd = html.indexOf('<script>');

fs.mkdirSync(path.join(ROOT, 'vendor/three'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'vendor/three/three.min.js'), three, 'utf8');
fs.writeFileSync(path.join(ROOT, 'vendor/three/OrbitControls.js'), orbit, 'utf8');

// _head.html 追加两个外链脚本
const head = html.slice(0, headEnd).replace(/\s*$/, '\n');
const tags =
  '<script src="vendor/three/three.min.js"></script>\n' +
  '<script src="vendor/three/OrbitControls.js"></script>\n';
fs.writeFileSync(path.join(ROOT, '_head.html'), head + tags, 'utf8');

// _main.js 校验：与原先第三段一致
const oldMain = fs.readFileSync(path.join(ROOT, '_main.js'), 'utf8');
if (oldMain.trim() !== main.trim()) throw new Error('_main.js 与内联脚本不一致');

console.log('three.min.js', three.length, 'OrbitControls.js', orbit.length, '_head.html', head.length + tags.length);
