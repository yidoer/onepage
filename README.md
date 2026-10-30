# 卢瑟福 α 粒子散射 · 3D 模拟器 + 完整推导

一个**纯静态、零构建、可离线**的物理教学项目，包含两个页面：

| 页面 | 文件 | 内容 |
|---|---|---|
| 交互式 3D 模拟器 | `index.html` | 实时库仑散射仿真：平面源 / 球面源、可调核电荷与能量、轨迹追踪、散射角分布与最近逼近距离直方图 |
| 完整推导（和纸风） | `derivation.html` | 从库仑力与守恒律出发严格推导卢瑟福公式及其推论，约 1.6 万字、13 节、4 个附录 |

两个页面通过报头与页脚互相链接。

---

## 部署到 GitHub Pages

不需要任何构建步骤——**把仓库推上去就能用**。

```bash
git init
git add .
git commit -m "Rutherford scattering simulator + derivation"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在仓库页面：

1. 进入 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，目录选择 `/ (root)`
4. 保存，等待约一分钟

访问地址：

```
https://<你的用户名>.github.io/<仓库名>/
```

根目录的 `index.html` 会被自动加载，即 3D 模拟器；报头右上的「3D 模拟器 / 散射推导」按钮在两个页面之间切换。

> **本仓库的线上地址**：<https://yidoer.github.io/onepage/>
> 仓库名是 `onepage`，所以它属于**项目站点**，网址带仓库名后缀，不是域名根 https://yidoer.github.io/。
> 仓库曾叫 `onepage.github.io`（旧地址 `https://yidoer.github.io/onepage.github.io/` 已随改名失效），改名后站点路径就是 `/onepage/`。

> `.nojekyll` 已包含在仓库中，用于关闭 Jekyll 处理，避免以下划线开头的源文件被特殊对待。

### 为什么部署这么简单

- **产物是纯 HTML**：`index.html` 与 `derivation.html` 都是自包含的最终页面，直接打开即可运行，没有打包、没有框架、没有运行时依赖。
- **不访问境外服务**：three.js、OrbitControls、KaTeX（js + css + 20 个 woff2 字体）全部放在仓库内的 `vendor/`，以相对路径引用。离线、内网环境同样正常。
- **没有路径问题**：两个页面之间使用同目录相对链接，放在仓库根目录、子目录或任意静态服务器上都能工作。

---

## 本地使用

直接双击 `index.html` 即可（`file://` 协议下全部功能正常，包括跳转到推导页）。也可以起一个本地服务器：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000/
```

---

## 目录结构

```
index.html                  ← 部署产物：3D 模拟器
derivation.html             ← 部署产物：推导长文
rutherford_scattering.html  ← 旧地址的跳转页（保留外部链接可用）
.nojekyll
vendor/
  three/three.min.js        three.js r128（MIT）
  three/OrbitControls.js    OrbitControls（随 three.js examples 发布）
  katex/                    KaTeX 0.16.11：katex.min.js + katex.min.css + 20 个 woff2
_head.html                  ← 源码分片：模拟器的 <head> + CSS + 页面骨架
_main.js                    ← 源码分片：模拟器的全部逻辑
_deriv_head.html            ← 源码分片：推导页 <head> + 和纸设计系统 + 报头 + 目录
_deriv_body1..4.html        ← 源码分片：推导页正文（§1–§3 / §4–§6 / §7–§9 / §10–§13 + 附录 A–D）
_deriv_tail.html            ← 源码分片：推导页页脚、KaTeX 引入、目录高亮与回到顶部脚本
_tools/build.mjs            ← 构建：由分片生成两个页面，--check 只校验不写盘
_tools/check-page.cjs       ← 自检：公式解析、交叉引用、锚点、深链接
_tools/probe-layout.mjs     ← 用无头 Chrome 实测公式是否溢出/裁切/压住编号
_tools/probe-toc.mjs        ← 用无头 Chrome 实测左侧目录在 9 种视口下是否折行/溢出/错位
_tools/legacy/              ← 历史一次性脚本（LaTeX 迁移、three.js 抽出）
docs/verification.md        ← 本次整理与修订的记录
docs/katex-report.txt       ← 公式自检的实测输出
docs/layout-report.txt      ← 布局实测输出（窄屏 + 桌面）
```

部署产物与 `vendor/` 需要提交；`_*.html`、`_tools/`、`docs/` 只用于维护，不影响线上页面。

### 构建与自检

```bash
node _tools/build.mjs            # 由分片重新生成 index.html 与 derivation.html
node _tools/build.mjs --check    # 只校验产物是否落后于分片（CI / 提交前用）
node _tools/check-page.cjs       # 491 条公式解析 + 139 处公式引用 + 锚点完整性
node _tools/probe-layout.mjs derivation.html 504   # 窄屏布局实测（无头 Chrome）
node _tools/probe-toc.mjs        # 目录栏在 9 种视口下的适配实测
```

> 改了 `_*` 分片后必须重新运行 `build.mjs`，否则线上页面不会变化。
> `rutherford_scattering.html` 是手写的跳转页，不参与构建。

---

## 技术要点

**模拟器**
- 平面源按**面积均匀**采样瞄准距 `b = b_max·√u`（而非线均匀 `b = b_max·u`），保证散射统计与理论一致
- 球面源：粒子自可调半径球面均匀出发并向靶核会聚，`b = |r₀ × v̂|`
- 理论曲线使用正确的相空间因子 `N(θ) ∝ sinθ / sin⁴(θ/2)`
- 总能量以 `KE + PE(r₀)` 为基准，保证远近场一致
- 支持 `prefers-reduced-motion`、键盘焦点可见、触摸目标 ≥ 44px、窄屏自动折叠面板

**推导页**
- 公式由 **KaTeX 0.16.11** 排版（本地内置，不走 CDN）：全文 491 条公式（68 条独立 + 423 条行内）在构建期已逐条校验通过
- 每条独立公式都有 `id="eq-x-y"`，编号本身是深链接（如 `derivation.html#eq-7-8`），可直接引用某一条公式
- 公式颜色通过 `currentColor` 继承，浅色/深色两套主题下自动适配；KaTeX 未加载时降级为等宽字体的源码显示
- 长公式在窄屏下只让公式本体横向滚动，编号固定在原位，不会出现"左半截永远看不到"的居中溢出
- 目录跟随阅读位置高亮（`aria-current`），页尾有回到顶部；两者都是渐进增强，禁用脚本时页面功能不减
- 版式按目录列定宽：目录 17rem（序号列 + 标题列，17 条全部单行）+ 间距 3rem + 正文 45rem；宽屏下目录退成无边卡的页边栏、sticky 且不需要内部滚动，单栏时排两列并限高
- 字号只有八级（11.5 / 12.5 / 13.5 / 15 / 17 / 19 / 23 / 28–34）且写成 token：正文 17 · 小标题 19 · 节标题 23 · 大标题 34，正文行高 1.85，触控设备上目录项 ≥44px
- 和纸质感由 SVG `feTurbulence` 噪声 + `repeating-linear-gradient` 抄纸帘纹叠加生成
- 深浅两套主题通过 `prefers-color-scheme` 切换，正文对比度均 ≥ 4.5:1；含 `@media print` 样式，可直接打印或导出 PDF

---

## 许可

物理内容基于卢瑟福 1911 年论文的经典推导，属公有领域知识。
`vendor/` 中的 three.js 与 KaTeX 分别遵循 MIT 与 MIT 许可，版权归各自作者。
其余代码可自由使用、修改与分发。
