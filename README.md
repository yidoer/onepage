# 卢瑟福 α 粒子散射 · 3D 模拟器 + 完整推导

一个**纯静态、零依赖、可离线**的物理教学项目，包含两个页面：

| 页面 | 文件 | 内容 |
|---|---|---|
| 交互式 3D 模拟器 | `index.html` | 实时库仑散射仿真：平面源 / 球面源、可调核电荷与能量、轨迹追踪、散射角分布与最近逼近距离直方图 |
| 完整推导（和纸风） | `derivation.html` | 从库仑力与守恒律出发严格推导卢瑟福公式及其推论，约 1.6 万字、17 节、4 个附录 |

两个页面通过顶栏与页脚互相链接。

---

## 部署到 GitHub Pages

不需要任何构建步骤——**直接把本仓库推上去就能用**。

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

根目录的 `index.html` 会被自动加载，即 3D 模拟器；顶栏的「散射推导」按钮进入推导页。

> **本仓库的线上地址**：<https://yidoer.github.io/onepage.github.io/>
> 注意仓库名是 onepage.github.io 而不是 yidoer.github.io，所以它属于**项目站点**，网址带仓库名后缀，不是域名根 https://yidoer.github.io/。

> `.nojekyll` 已包含在仓库中，用于关闭 Jekyll 处理，避免以下划线开头的源文件被特殊对待。

### 为什么部署这么简单

- **没有构建步骤**：`index.html` 与 `derivation.html` 都是自包含的最终产物，直接打开即可运行。
- **没有 CDN 依赖**：three.js 与 OrbitControls 已内联进 `index.html`；推导页的 KaTeX（js + css + 字体）已完整放进仓库内的 `vendor/katex/`，以相对路径引用。因此不访问 jsDelivr / Google Fonts 等境外服务，离线或内网环境下同样正常。若希望改用 CDN，删掉 `_deriv_tail.html` 里的本地 `<script src>` 即可，文件内已内置 CDN 回退逻辑。
- **没有路径问题**：两个页面之间使用同目录相对链接，放在仓库根目录、子目录或任意静态服务器上都能工作。

---

## 本地使用

直接双击 `index.html` 即可（`file://` 协议下全部功能正常，包括跳转到推导页）。也可以起一个本地服务器：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000/
```

---

## 文件说明

### 部署产物（需要提交）

| 文件 | 说明 |
|---|---|
| `index.html` | 3D 模拟器，自包含（含内联 three.js） |
| `derivation.html` | 和纸风推导长文（公式由 KaTeX 排版） |
| `vendor/katex/` | 本地内置的 KaTeX 0.16.11：js + css + 20 个 woff2 字体，共 545 KB |
| `README.md` | 本文件 |
| `.nojekyll` | 关闭 Jekyll |

### 源码分片（构建用，可不提交）

模拟器与推导页都由分片拼接而成，便于单独维护每部分：

| 文件 | 说明 |
|---|---|
| `_head.html` | 模拟器的 `<head>` + CSS + 页面骨架 |
| `_main.js` | 模拟器的全部逻辑 |
| `_deriv_head.html` | 推导页的 `<head>` + 和纸设计系统 CSS + 骨架 |
| `_deriv_body1..4.html` | 推导页正文（§1–§3 / §4–§6 / §7–§9 / §10–§13 + 附录 A–D） |
| `_deriv_tail.html` | 推导页页脚、KaTeX 引入与公式渲染脚本 |
| `_tools/m2tex.cjs` | 一次性转换脚本：把原先手写的 HTML/CSS 数学标记批量转成 LaTeX，并调用本地 KaTeX 对每条公式做校验 |
| `_deriv_*.html.texbak` | 转成 LaTeX 之前的分片备份 |
| `_katex_report.txt` | KaTeX 渲染实测记录（475 条公式的渲染数、错误数、内部结构计数、两主题对比度） |
| `_final_report.txt` | 无头浏览器布局实测记录（两种主题的对比度、图标尺寸、溢出与重叠检测） |

非下划线文件之外的内容不会被页面引用，删除它们不影响运行。

### 备份

| 文件 | 说明 |
|---|---|
| `rutherford_scattering.html` | 与 `index.html` 内容相同（旧文件名，保持向后兼容的链接） |
| `rutherford_scattering.backup.html` | 改造前的原始版本 |
| `_head.html.bak` / `_main.js.bak` | 图标改造前的源码分片 |

---

## 技术要点

**模拟器**
- 平面源按**面积均匀**采样瞄准距 `b = b_max·√u`（而非线均匀 `b = b_max·u`），保证散射统计与理论一致
- 球面源：粒子自可调半径球面均匀出发并向靶核会聚，`b = |r₀ × v̂|`
- 理论曲线使用正确的相空间因子 `N(θ) ∝ sinθ / sin⁴(θ/2)`
- 总能量以 `KE + PE(r₀)` 为基准，保证远近场一致
- 支持 `prefers-reduced-motion`、键盘焦点可见、触摸目标 ≥ 44px、窄屏自动折叠面板

**推导页**
- 公式由 **KaTeX 0.16.11** 排版（本地内置，不走 CDN）：全文 475 条公式（64 条独立公式 + 411 条行内公式）在构建期已用 KaTeX 逐条校验通过
- 公式颜色通过 `currentColor` 继承，浅色/深色两套主题下自动适配
- 和纸质感由 SVG `feTurbulence` 噪声 + `repeating-linear-gradient` 抄纸帘纹叠加生成
- 深浅两套主题通过 `prefers-color-scheme` 切换，正文对比度均 ≥ 4.5:1
- 含 `@media print` 样式，可直接打印或导出 PDF

---

## 许可

物理内容基于卢瑟福 1911 年论文的经典推导，属公有领域知识；代码部分可自由使用、修改与分发。
