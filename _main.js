// ═══════════════════════════════════════════
// 物理常数 (长度=fm, 能量=MeV, 时间=zs=1e-21s)
// ═══════════════════════════════════════════
const P = {
  ke2: 1.44,          // MeV·fm
  m_alpha: 3727.379,  // MeV/c²
  c: 299.792,         // fm/zs
  Z1: 2
};
function v0_from_E(E) { return P.c * Math.sqrt(2 * E / P.m_alpha); }
// 卢瑟福特征长度 a₀ = kZ₁Z₂e²/(2E)（b=a₀ 时散射角恰为 90°）
function a0val() { return P.ke2 * P.Z1 * S.Z2 / (2 * S.energy); }

// ═══════════════════════════════════════════
// 模拟参数
// ═══════════════════════════════════════════
const S = {
  energy: 5, count: 200, bMax: 150, speed: 1, Z2: 79,
  dt: 0.004,
  startX: -400, endR: 500,
  running: true,
  showTrails: true, showVColor: true, showGrid: true, showField: false,
  hideIncident: false,
  srcMode: 'plane', sphereR: 340,
  trackedId: -1
};

// 可视化缩放: 1 fm → VIS 个 three.js 单位
const VIS = 0.6;

// ═══ 元素数据库 (Z, 符号, 中文名, 近似质量数A) ═══
const ELEMENTS = [
  [1,'H','氢',1],[2,'He','氦',4],[3,'Li','锂',7],[4,'Be','铍',9],[5,'B','硼',11],
  [6,'C','碳',12],[7,'N','氮',14],[8,'O','氧',16],[9,'F','氟',19],[10,'Ne','氖',20],
  [11,'Na','钠',23],[12,'Mg','镁',24],[13,'Al','铝',27],[14,'Si','硅',28],[15,'P','磷',31],
  [16,'S','硫',32],[17,'Cl','氯',35],[18,'Ar','氩',40],[19,'K','钾',39],[20,'Ca','钙',40],
  [21,'Sc','钪',45],[22,'Ti','钛',48],[23,'V','钒',51],[24,'Cr','铬',52],[25,'Mn','锰',55],
  [26,'Fe','铁',56],[27,'Co','钴',59],[28,'Ni','镍',58],[29,'Cu','铜',63],[30,'Zn','锌',65],
  [31,'Ga','镓',70],[32,'Ge','锗',73],[33,'As','砷',75],[34,'Se','硒',79],[35,'Br','溴',80],
  [36,'Kr','氪',84],[37,'Rb','铷',85],[38,'Sr','锶',88],[39,'Y','钇',89],[40,'Zr','锆',91],
  [41,'Nb','铌',93],[42,'Mo','钼',96],[43,'Tc','锝',98],[44,'Ru','钌',102],[45,'Rh','铑',103],
  [46,'Pd','钯',106],[47,'Ag','银',108],[48,'Cd','镉',112],[49,'In','铟',115],[50,'Sn','锡',119],
  [51,'Sb','锑',122],[52,'Te','碲',128],[53,'I','碘',127],[54,'Xe','氙',131],[55,'Cs','铯',133],
  [56,'Ba','钡',137],[57,'La','镧',139],[58,'Ce','铈',140],[59,'Pr','镨',141],[60,'Nd','钕',144],
  [61,'Pm','钷',145],[62,'Sm','钐',150],[63,'Eu','铕',152],[64,'Gd','钆',157],[65,'Tb','铽',159],
  [66,'Dy','镝',163],[67,'Ho','钬',165],[68,'Er','铒',167],[69,'Tm','铥',169],[70,'Yb','镱',173],
  [71,'Lu','镥',175],[72,'Hf','铪',178],[73,'Ta','钽',181],[74,'W','钨',184],[75,'Re','铼',187],
  [76,'Os','锇',192],[77,'Ir','铱',193],[78,'Pt','铂',195],[79,'Au','金',197],[80,'Hg','汞',201],
  [81,'Tl','铊',204],[82,'Pb','铅',207],[83,'Bi','铋',209],[84,'Po','钋',209],[85,'At','砹',210],
  [86,'Rn','氡',222],[87,'Fr','钫',223],[88,'Ra','镭',226],[89,'Ac','锕',227],[90,'Th','钍',232],
  [91,'Pa','镤',231],[92,'U','铀',238],[93,'Np','镎',237],[94,'Pu','钚',244],[95,'Am','镅',243],
  [96,'Cm','锔',247],[97,'Bk','锫',247],[98,'Cf','锎',251],[99,'Es','锿',252],[100,'Fm','镄',257],
  [101,'Md','钔',258],[102,'No','锘',259],[103,'Lr','铹',262]
];

// 核半径: R = r0·A^(1/3) (r0≈1.2 fm), 换算为 three 单位并保证可见
function nucleusRadius(A) {
  const r = 1.2 * Math.pow(A, 1 / 3) * VIS;
  return Math.max(2.2, Math.min(7.5, r));
}
// 元素配色: 轻元素偏蓝银, 重元素偏金铜
function elColor(z) {
  const t = (z - 1) / 102;
  const h = 0.60 - 0.50 * t;
  const s = 0.45 + 0.35 * t;
  const l = 0.52 - 0.02 * t;
  return new THREE.Color().setHSL(h, s, l);
}

// ═══════════════════════════════════════════
// Particle class (Velocity-Verlet)
// ═══════════════════════════════════════════
class Alpha {
  // (x0,y0,z0)=初始位置(fm); (ux,uy,uz)=入射方向(任意非零向量, 内部归一化)
  constructor(id, x0, y0, z0, ux, uy, uz) {
    this.id = id;
    this.x = x0; this.y = y0; this.z = z0;
    // 入射动能 = 总能量 E − 初始势能 PE(r₀)，使总能量严格等于 E（与理论公式一致）
    const r0 = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
    const pe0 = (r0 > 1) ? P.ke2 * P.Z1 * S.Z2 / r0 : 0;
    const ke0 = Math.max(0.05, S.energy - pe0);
    const sp = P.c * Math.sqrt(2 * ke0 / P.m_alpha);
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    this.vx = sp * ux / ul; this.vy = sp * uy / ul; this.vz = sp * uz / ul;
    // 真实瞄准距 b = |r₀ × v̂|（靶核到入射直线的垂直距离）
    const vx = this.vx / sp, vy = this.vy / sp, vz = this.vz / sp;
    const cx = y0 * vz - z0 * vy, cy = z0 * vx - x0 * vz, cz = x0 * vy - y0 * vx;
    this.b = Math.sqrt(cx * cx + cy * cy + cz * cz);
    this.ax = 0; this.ay = 0; this.az = 0;
    this.trail = [{ x: x0, y: y0, z: z0 }];
    this.trailFrom = -1;   // "隐藏入射段"时的绘制起点索引, -1 = 尚未进入显示区
    this.rMin = 1e9; this.done = false; this.angle = 0;
    this.KE = ke0; this.PE = pe0; this.E0 = ke0 + pe0;
    this.eDrift = 0; this.spd = sp;
    this._accel();
  }
  _accel() {
    const r2 = this.x * this.x + this.y * this.y + this.z * this.z;
    const r = Math.sqrt(r2);
    if (r < 1) { this.ax = this.ay = this.az = 0; return; }
    const k = P.ke2 * P.Z1 * S.Z2 * P.c * P.c / (P.m_alpha * r2 * r);
    this.ax = k * this.x; this.ay = k * this.y; this.az = k * this.z;
  }
  step(dt) {
    if (this.done) return;
    const h = 0.5 * dt;
    this.vx += this.ax * h; this.vy += this.ay * h; this.vz += this.az * h;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this._accel();
    this.vx += this.ax * h; this.vy += this.ay * h; this.vz += this.az * h;

    const r = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    if (r < this.rMin) this.rMin = r;

    const last = this.trail[this.trail.length - 1];
    const dd = (this.x - last.x) ** 2 + (this.y - last.y) ** 2 + (this.z - last.z) ** 2;
    if (dd > 9) {
      this.trail.push({ x: this.x, y: this.y, z: this.z });
      if (this.trail.length > 4000) { this.trail.shift(); if (this.trailFrom > 0) this.trailFrom--; }
    }

    // "隐藏入射段": 进入显示半径后才锁定轨迹起点, 只保留靠近靶核的弯曲段
    if (S.hideIncident && this.trailFrom < 0) {
      const rShow = Math.max(3 * a0val(), 1.6 * Math.abs(this.b));
      if (r <= rShow) {
        this.trail.push({ x: this.x, y: this.y, z: this.z });
        this.trailFrom = this.trail.length - 1;
      }
    }

    const v2 = this.vx ** 2 + this.vy ** 2 + this.vz ** 2;
    this.spd = Math.sqrt(v2);
    this.KE = 0.5 * P.m_alpha * v2 / (P.c * P.c);
    this.PE = (r > 1) ? P.ke2 * P.Z1 * S.Z2 / r : 0;
    this.eDrift = Math.abs(this.KE + this.PE - this.E0) / this.E0;

    if ((r > S.endR && this.trail.length > 20) || this.trail.length > 3900) {
      this.done = true;
      const vm = Math.sqrt(v2);
      this.angle = (vm > 0) ? Math.acos(Math.max(-1, Math.min(1, this.vx / vm))) * 180 / Math.PI : 0;
    }
  }
  theoAngle() {
    const a = P.ke2 * P.Z1 * S.Z2 / (2 * this.E0);
    return (Math.abs(this.b) < 0.01) ? 180 : 2 * Math.atan(a / Math.abs(this.b)) * 180 / Math.PI;
  }
}

// ═══════════════════════════════════════════
// Three.js setup — 关键修复: 显式 lookAt/target + 防NaN aspect + 更亮更大
// ═══════════════════════════════════════════
let scene, camera, renderer, controls;
let nucleusMesh, glowMesh, fieldRings = [], gridObj;
let nucleusBaseScale = 1;   // 由靶核元素半径决定的基础缩放（脉动在其上叠加，不覆盖）
let pMeshes = [], pTrails = [];
let particles = [];
let simTime = 0, frameN = 0, fpsT = 0, fps = 0;

function initThree() {
  const c = document.getElementById('main-canvas');
  if (!c) { console.error('canvas not found'); return; }
  try {
    renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true });
  } catch (e) {
    console.error('WebGL not supported:', e);
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;background:rgba(0,0,0,0.85);padding:20px 28px;border-radius:12px;font-size:14px;z-index:999;text-align:center;';
    msg.innerHTML = '<svg class="ic ic-in" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 21.4 19.6H2.6z"/><path d="M12 9.6v4.4M12 17h.01"/></svg>当前浏览器不支持 WebGL，无法显示 3D 仿真。<br>请启用硬件加速或更换现代浏览器。';
    document.body.appendChild(msg);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0B1220);  // 深空蓝, 非纯黑

  // ★ 防 NaN aspect
  const aspect = (window.innerHeight > 0) ? window.innerWidth / window.innerHeight : 1.6;
  camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 6000);
  camera.position.set(0, 120, 280);
  camera.lookAt(0, 0, 0);   // ★ 显式看向原点

  controls = new THREE.OrbitControls(camera, c);
  controls.target.set(0, 0, 0);   // ★ 显式设置目标
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 40; controls.maxDistance = 1800;
  controls.update();

  // 光照 — 更亮
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const pl = new THREE.PointLight(0xffd700, 1.5, 1200); pl.position.set(0, 0, 0); scene.add(pl);
  const pl2 = new THREE.PointLight(0xffffff, 0.8, 2000); pl2.position.set(0, 250, 350); scene.add(pl2);
  const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(180, 300, 180); scene.add(dl);

  // 金核 — 大而亮 (低金属度+高自发光, 保证可见)
  nucleusMesh = new THREE.Mesh(
    new THREE.SphereGeometry(6, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.1,
      metalness: 0.15, roughness: 0.3
    })
  );
  scene.add(nucleusMesh);
  glowMesh = new THREE.Mesh(
    new THREE.SphereGeometry(14, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.16 })
  );
  scene.add(glowMesh);

  // 力场环 (可开关)
  for (let r = 50; r <= 300; r += 50) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.5, r + 0.5, 96),
      new THREE.MeshBasicMaterial({ color: 0xc9b8a0, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = S.showField;
    scene.add(ring); fieldRings.push(ring);
  }

  // 网格
  gridObj = new THREE.GridHelper(800, 40, 0x2A3A55, 0x1E293B);
  gridObj.position.y = -55;
  scene.add(gridObj);

  // 束流虚线 (按 VIS 缩放)
  const bLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(S.startX * VIS, 0, 0),
      new THREE.Vector3(-30 * VIS, 0, 0)
    ]),
    new THREE.LineDashedMaterial({ color: 0xF59E0B, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.6 })
  );
  bLine.computeLineDistances(); scene.add(bLine);

  // 星空
  const sv = [];
  for (let i = 0; i < 1200; i++) sv.push((Math.random() - .5) * 2400, (Math.random() - .5) * 2400, (Math.random() - .5) * 2400);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0x99a0b8, size: 1.6, sizeAttenuation: true })));

  // 坐标轴
  const mkAxis = (dir, col) => new THREE.ArrowHelper(dir, new THREE.Vector3(-260, -55, -260), 60, col, 6, 3);
  scene.add(mkAxis(new THREE.Vector3(1, 0, 0), 0x3B82F6));
  scene.add(mkAxis(new THREE.Vector3(0, 1, 0), 0xF59E0B));
  scene.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x94A3B8));

  // 自适应 (防NaN)
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = (h > 0) ? w / h : 1.6;
    camera.updateProjectionMatrix();
  });
}

// ═══════════════════════════════════════════
// 粒子池 & 发射
// ═══════════════════════════════════════════
const MAXP = 400;
const pGeo = new THREE.SphereGeometry(3.0, 16, 16);
const TMAX = 4000;

function makeMeshes() {
  for (let i = 0; i < MAXP; i++) {
    const mat = new THREE.MeshPhongMaterial({
      color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.95
    });
    const m = new THREE.Mesh(pGeo, mat);
    m.visible = false; scene.add(m); pMeshes.push(m);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TMAX * 3), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TMAX * 3), 3));
    tg.setDrawRange(0, 0);
    const tl = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    tl.visible = false; tl.frustumCulled = false; scene.add(tl); pTrails.push(tl);
  }
}

let angleHist = new Float64Array(37);
let rminHist = new Float64Array(30);
let energyLog = [];

function clearAll() {
  particles = [];
  pMeshes.forEach(m => m.visible = false);
  pTrails.forEach(t => t.visible = false);
  simTime = 0; S.trackedId = -1;
  const tr = document.getElementById('tracker'); if (tr) tr.classList.remove('show');
  angleHist.fill(0); rminHist.fill(0); energyLog.length = 0;
  updateStats();
}

function fireParticles() {
  clearAll();
  const n = Math.min(S.count, MAXP);
  for (let i = 0; i < n; i++) {
    if (S.srcMode === 'sphere') {
      // ── 球面会聚源 ──
      // 起点在半径 R 的球面上均匀取点; 瞄准距 b 按圆盘面积均匀分布 (b=bMax√u)
      // ⇒ P(b)∝b, 与"无限大均匀入射束"一致, 散射角统计与理论公式相符。
      // 若强行沿半径射向球心, 则所有粒子 b≡0 (全部正碰反弹), 无法体现散射分布。
      const R = Math.max(S.sphereR, S.bMax * 1.02);
      const u = Math.random() * 2 - 1;
      const th = Math.acos(Math.max(-1, Math.min(1, u)));
      const ps = Math.random() * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ps), ny = Math.sin(th) * Math.sin(ps), nz = Math.cos(th);
      const x0 = R * nx, y0 = R * ny, z0 = R * nz;
      const b = S.bMax * Math.sqrt(Math.random());
      const ph = Math.random() * Math.PI * 2;
      // 构造与 n̂ 垂直的单位向量 p̂
      let px = 0, py = 1, pz = 0;
      if (Math.abs(ny) > 0.9) { px = 1; py = 0; pz = 0; }
      const d0 = px * nx + py * ny + pz * nz;
      px -= d0 * nx; py -= d0 * ny; pz -= d0 * nz;
      const pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
      px /= pl; py /= pl; pz /= pl;
      // 绕 n̂ 旋转 ph (Rodrigues, n̂·p̂=0)
      const cs = Math.cos(ph), sn = Math.sin(ph);
      const rx = ny * pz - nz * py, ry = nz * px - nx * pz, rz = nx * py - ny * px;
      const qx = px * cs + rx * sn, qy = py * cs + ry * sn, qz = pz * cs + rz * sn;
      // 入射方向与 -n̂ 成 α 角, sinα = b/R ⇒ |r₀ × v̂| = b
      const alpha = Math.asin(Math.min(1, b / R));
      const ca = Math.cos(alpha), sa = Math.sin(alpha);
      const dx = -nx * ca + qx * sa, dy = -ny * ca + qy * sa, dz = -nz * ca + qz * sa;
      particles.push(new Alpha(i, x0, y0, z0, dx, dy, dz));
    } else {
      // ── 平面源: 无限大均匀发射平面（平行束）──
      // 按圆盘面积均匀采样 b=bMax√u ⇒ P(b)∝b, 统计正确
      const b = S.bMax * Math.sqrt(Math.random());
      const ph = Math.random() * Math.PI * 2;
      const y0 = b * Math.cos(ph), z0 = b * Math.sin(ph);
      particles.push(new Alpha(i, S.startX, y0, z0, 1, 0, 0));
    }
    pMeshes[i].visible = true;
    pMeshes[i].material.emissive.setHex(0xd97706);
    pMeshes[i].material.opacity = 0.95;
  }
  updateStats();
}

// ═══════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════
function updateStats() {
  let done = 0, small = 0, large = 0, back = 0, sum = 0, maxDrift = 0;
  for (const p of particles) {
    if (p.done) {
      done++; sum += p.angle;
      if (p.angle < 10) small++;
      if (p.angle > 90) large++;
      if (p.angle > 150) back++;
    }
    if (p.eDrift > maxDrift) maxDrift = p.eDrift;
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('st-total', particles.length);
  set('st-done', done);
  set('st-small', small);
  set('st-large', large);
  set('st-back', back);
  set('st-avg', done ? (sum / done).toFixed(1) + '°' : '—');
  set('st-edrift', (maxDrift * 100).toFixed(3) + '%');
}

// ═══════════════════════════════════════════
// 图表 (原生 canvas 2D)
// ═══════════════════════════════════════════
function fitChart(cv) {
  if (!cv) return null;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}

function drawAngleChart() {
  const cv = document.getElementById('ch-angle');
  const ctx = fitChart(cv); if (!ctx) return;
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  let mx = 1; for (let i = 0; i < 36; i++) if (angleHist[i] > mx) mx = angleHist[i];
  const bw = W / 36;
  for (let i = 0; i < 36; i++) {
    const h = angleHist[i] / mx * (H - 24);
    ctx.fillStyle = 'rgba(59,130,246,0.6)';
    ctx.fillRect(i * bw + 1, H - 14 - h, bw - 2, h);
  }

  // 理论期望计数: 每个 bin i 的期望 = N · ∫_{5i°}^{5(i+1)°} f dθ / ∫_{θmin}^{180°} f dθ
  // 其中 f(θ) = sinθ/sin⁴(θ/2), ∫f dθ = 2/sin²(θ/2)
  // b ≤ b_max 的截断 ⇒ θ ≥ θmin = 2·arctan(a₀/b_max)
  const a0 = a0val();
  const b0 = Math.max(1e-6, S.bMax);
  const thMin = 2 * Math.atan(a0 / b0);
  const sMin = Math.sin(thMin / 2);
  const Ftot = (sMin > 1e-6) ? (2 / (sMin * sMin) - 2) : 1;   // ∫_{θmin}^{π} f dθ
  const Np = Math.max(1, particles.length);
  const C = Np / Math.max(1e-9, Ftot);
  const Fint = (t) => { const s = Math.sin(t / 2); return (s > 1e-6) ? 2 / (s * s) : 1e9; };
  const dth = Math.PI / 36;
  const yScale = (H - 24) / mx;
  ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1.6; ctx.beginPath();
  let started = false;
  for (let i = 0; i < 36; i++) {
    const t1 = Math.max(thMin, i * dth), t2 = (i + 1) * dth;
    if (t2 <= thMin) continue;                      // 该 bin 完全落在截断区
    const cnt = C * Math.max(0, Fint(t1) - Fint(t2));
    const x = (i + 0.5) * bw;
    const y = H - 14 - Math.min(H - 16, cnt * yScale);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#94A3B8'; ctx.font = '9px monospace';
  for (let d = 0; d <= 180; d += 45) {
    const x = d / 180 * W;
    ctx.fillText(d + '°', Math.min(x, W - 22), H - 3);
  }
}

function drawEnergyChart() {
  const cv = document.getElementById('ch-energy');
  const ctx = fitChart(cv); if (!ctx) return;
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  if (energyLog.length < 2) {
    ctx.fillStyle = '#9a958a'; ctx.font = '10px monospace';
    ctx.fillText('追踪粒子 #0 的能量演化…', 10, H / 2);
    return;
  }
  let mxE = 1e-9;
  for (const e of energyLog) mxE = Math.max(mxE, e.ke, e.pe, e.tot);
  const draw = (key, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    energyLog.forEach((e, i) => {
      const x = i / (energyLog.length - 1) * W;
      const y = H - 6 - e[key] / mxE * (H - 14);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  draw('pe', '#b08968');
  draw('ke', '#e0704a');
  draw('tot', '#2a2a2a');
  ctx.fillStyle = '#9a958a'; ctx.font = '9px monospace';
  ctx.fillText('E0=' + S.energy + ' MeV', 6, 10);
}

function drawRminChart() {
  const cv = document.getElementById('ch-rmin');
  const ctx = fitChart(cv); if (!ctx) return;
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  let mx = 1; for (let i = 0; i < 30; i++) if (rminHist[i] > mx) mx = rminHist[i];
  const bw = W / 30;
  for (let i = 0; i < 30; i++) {
    const h = rminHist[i] / mx * (H - 20);
    const hue = 30 - i / 30 * 25;
    ctx.fillStyle = 'hsla(' + hue + ',80%,60%,0.8)';
    ctx.fillRect(i * bw + 1, H - 12 - h, bw - 2, h);
  }
  ctx.fillStyle = '#9a958a'; ctx.font = '9px monospace';
  ctx.fillText('0', 2, H - 2);
  ctx.fillText('最近逼近距离 r_min (fm) →', W - 130, H - 2);
}

// ═══════════════════════════════════════════
// UI 绑定
// ═══════════════════════════════════════════
function bindUI() {
  const slider = (id, vid, key, fmt) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      S[key] = parseFloat(el.value);
      const vEl = document.getElementById(vid); if (vEl) vEl.textContent = fmt(S[key]);
    });
  };
  slider('sl-energy', 've', 'energy', v => v.toFixed(1) + ' MeV');
  slider('sl-count', 'vc', 'count', v => v.toFixed(0));
  slider('sl-bmax', 'vb', 'bMax', v => v.toFixed(0) + ' fm');
  slider('sl-speed', 'vs', 'speed', v => v.toFixed(1) + 'x');
  // 靶核元素: 下拉选择 + Z 滑块联动 (支持任意元素)
  const elSel = document.getElementById('el-select');
  const zEl = document.getElementById('sl-Z');
  const applyElement = (z) => {
    z = Math.max(1, Math.min(103, parseInt(z) || 1));
    S.Z2 = z;
    const el = ELEMENTS[z - 1];
    const sym = el[1], name = el[2], A = el[3];
    if (elSel) elSel.value = String(z);
    if (zEl) zEl.value = String(z);
    const vz = document.getElementById('vz'); if (vz) vz.textContent = z + ' ' + sym + ' (' + name + ')';
    const lt = document.getElementById('legend-core-text'); if (lt) lt.textContent = sym + ' ' + name + '原子核';
    const lc = document.getElementById('legend-core-color'); if (lc) lc.style.background = '#' + elColor(z).getHexString();
    const tn = document.getElementById('target-note'); if (tn) tn.textContent = sym + ' (Z₂=' + z + ', A=' + A + ')';
    if (nucleusMesh) {
      nucleusMesh.material.color.copy(elColor(z));
      const t = Math.max(0, Math.min(1, (z - 1) / 102));
      nucleusMesh.material.emissive.copy(new THREE.Color(0xffaa00)).lerp(new THREE.Color(0x2a4477), 1 - t);
      const r = nucleusRadius(A);
      nucleusBaseScale = r / 6;
      nucleusMesh.scale.setScalar(nucleusBaseScale);
      if (glowMesh) glowMesh.scale.setScalar(r / 14);
    }
  };
  if (elSel) {
    ELEMENTS.forEach(e => {
      const o = document.createElement('option');
      o.value = String(e[0]);
      o.textContent = e[0] + ' ' + e[1] + ' ' + e[2];
      elSel.appendChild(o);
    });
    elSel.addEventListener('change', e => applyElement(parseInt(e.target.value)));
  }
  if (zEl) zEl.addEventListener('input', e => applyElement(parseInt(e.target.value)));
  applyElement(S.Z2);  // 初始化默认 Au(79)

  // ── 左右面板收缩 ──
  const bindCollapse = (pid, bid) => {
    const p = document.getElementById(pid), b = document.getElementById(bid);
    if (!p || !b) return;
    b.addEventListener('click', () => {
      const c = p.classList.toggle('collapsed');
      b.setAttribute('aria-expanded', String(!c));
      b.title = c ? '展开面板' : '收起面板';
    });
  };
  bindCollapse('panel', 'toggle-panel');
  bindCollapse('stats', 'toggle-stats');

  // ── 窄屏自适应：默认收起两侧面板（按钮始终可达），同一时刻只展开一个，避免遮挡 3D 视图 ──
  const NARROW = 980;
  let wasNarrow = window.innerWidth < NARROW;
  const setCollapsed = (pid, on) => {
    const p = document.getElementById(pid);
    if (!p) return;
    p.classList.toggle('collapsed', on);
    const b = p.querySelector('.ph-btn');
    if (b) { b.setAttribute('aria-expanded', String(!on)); b.title = on ? '展开面板' : '收起面板'; }
  };
  const syncNarrow = () => {
    const narrow = window.innerWidth < NARROW;
    if (narrow && !wasNarrow) { setCollapsed('panel', true); setCollapsed('stats', true); }
    if (!narrow && wasNarrow) { setCollapsed('panel', false); setCollapsed('stats', false); }
    wasNarrow = narrow;
  };
  ['panel', 'stats'].forEach(pid => {
    const p = document.getElementById(pid);
    if (!p) return;
    const b = p.querySelector('.ph-btn');
    if (!b) return;
    b.addEventListener('click', () => {
      if (window.innerWidth < NARROW && !p.classList.contains('collapsed')) {
        setCollapsed(pid === 'panel' ? 'stats' : 'panel', true);
      }
    });
  });
  if (window.innerWidth < NARROW) { setCollapsed('panel', true); setCollapsed('stats', true); }
  window.addEventListener('resize', syncNarrow);

  // ── 粒子源类型（平面 / 球面）──
  const srcSel = document.getElementById('src-mode');
  const rowR = document.getElementById('row-sphereR');
  const srcHint = document.getElementById('src-hint');
  const srcNote = document.getElementById('src-note');
  const chkTrails = document.getElementById('chk-trails');
  const trailsRow = chkTrails ? chkTrails.parentElement : null;
  let trailsBackup = null;
  const applySrcMode = (mode) => {
    S.srcMode = (mode === 'sphere') ? 'sphere' : 'plane';
    if (rowR) rowR.style.display = (S.srcMode === 'sphere') ? '' : 'none';
    if (srcHint) srcHint.innerHTML = (S.srcMode === 'sphere')
      ? '<p>球面源：粒子从可调半径球面均匀出发、向靶核会聚；瞄准距 b 按面积均匀分布，散射统计与理论一致。</p><p class="warn"><svg class="ic ic-in" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 21.4 19.6H2.6z"/><path d="M12 9.6v4.4M12 17h.01"/></svg>球面模式下不显示粒子轨迹（来自四面八方，轨迹会糊成一片）。</p>'
      : '<p>平面源：无限大均匀发射平面（平行束），按面积均匀采样 b=b<sub>max</sub>√u，散射统计与理论一致。</p>';
    if (srcNote) srcNote.textContent = (S.srcMode === 'sphere') ? '可调半径球面会聚源' : '无限大均匀平面（平行束）';
    if (S.srcMode === 'sphere') {
      // 记住用户原本的轨迹开关，切回平面源时原样恢复
      if (trailsBackup === null) trailsBackup = S.showTrails;
      S.showTrails = false;
      if (chkTrails) { chkTrails.checked = false; chkTrails.disabled = true; chkTrails.title = '球面源模式下不显示粒子轨迹'; }
      if (trailsRow) trailsRow.classList.add('off');
    } else {
      if (trailsBackup !== null) { S.showTrails = trailsBackup; trailsBackup = null; }
      if (chkTrails) { chkTrails.checked = S.showTrails; chkTrails.disabled = false; chkTrails.title = ''; }
      if (trailsRow) trailsRow.classList.remove('off');
    }
  };
  if (srcSel) srcSel.addEventListener('change', e => { applySrcMode(e.target.value); fireParticles(); });
  slider('sl-sphereR', 'vr', 'sphereR', v => v.toFixed(0) + ' fm');
  applySrcMode(S.srcMode);

  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('btn-play', () => { S.running = true; markPlay(true); });
  on('btn-pause', () => { S.running = false; markPlay(false); });
  on('btn-step', () => { S.running = false; markPlay(false); stepSim(1); });
  on('btn-reset', () => fireParticles());
  on('btn-fire', () => fireParticles());
  on('btn-clear', () => clearAll());

  document.querySelectorAll('.vb').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.vb').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    const v = b.dataset.v;
    if (v === 'top') { camera.position.set(0, 420, 1); controls.target.set(0, 0, 0); }
    else if (v === 'side') { camera.position.set(0, 0, 440); controls.target.set(0, 0, 0); }
    else if (v === 'beam') { camera.position.set(-320, 70, 140); controls.target.set(0, 0, 0); }
    else camera.position.set(0, 120, 280);
    controls.update();
  }));

  const chk = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => {
    S[key] = e.target.checked;
    if (key === 'showGrid' && gridObj) gridObj.visible = S.showGrid;
    if (key === 'showField') fieldRings.forEach(r => r.visible = S.showField);
  }); };
  chk('chk-trails', 'showTrails');
  chk('chk-vc', 'showVColor');
  chk('chk-grid', 'showGrid');
  chk('chk-field', 'showField');

  // "隐藏入射段": 切换时重算每颗粒子的轨迹绘制起点
  const chkInc = document.getElementById('chk-hideIncident');
  if (chkInc) chkInc.addEventListener('change', e => {
    S.hideIncident = e.target.checked;
    const av = a0val();
    for (const p of particles) {
      if (!S.hideIncident) { p.trailFrom = 0; continue; }
      p.trailFrom = -1;
      const rShow = Math.max(3 * av, 1.6 * Math.abs(p.b));
      const R2 = rShow * rShow;
      for (let k = 0; k < p.trail.length; k++) {
        const q = p.trail[k];
        if (q.x * q.x + q.y * q.y + q.z * q.z <= R2) { p.trailFrom = k; break; }
      }
    }
  });

  // 点击粒子追踪
  const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
  const cv = document.getElementById('main-canvas');
  if (cv) cv.addEventListener('click', e => {
    mv.x = e.clientX / innerWidth * 2 - 1;
    mv.y = -(e.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera(mv, camera);
    const hits = ray.intersectObjects(pMeshes.filter(m => m.visible));
    if (hits.length) {
      S.trackedId = pMeshes.indexOf(hits[0].object);
      const tr = document.getElementById('tracker'); if (tr) tr.classList.add('show');
    } else {
      S.trackedId = -1;
      const tr = document.getElementById('tracker'); if (tr) tr.classList.remove('show');
    }
  });
}

function markPlay(on) {
  const bp = document.getElementById('btn-play'), bpa = document.getElementById('btn-pause');
  if (bp) bp.classList.toggle('on', on);
  if (bpa) bpa.classList.toggle('on', !on);
  // 顶部状态胶囊必须反映真实运行状态，不能永远显示"实时模拟中"
  const st = document.getElementById('hdr-status'), stx = document.getElementById('hdr-status-text');
  if (st) st.classList.toggle('paused', !on);
  if (stx) stx.textContent = on ? '实时模拟中' : '已暂停';
}

// ═══════════════════════════════════════════
// 模拟推进
// ═══════════════════════════════════════════
function stepSim(nSteps) {
  for (let s = 0; s < nSteps; s++) {
    simTime += S.dt;
    for (const p of particles) {
      const wasDone = p.done;
      p.step(S.dt);
      if (!wasDone && p.done) {
        const bin = Math.min(35, Math.floor(p.angle / 5));   // bin i = [5i°, 5(i+1)°)
        angleHist[bin]++;
        const rb = Math.min(29, Math.floor(p.rMin / 20));
        rminHist[rb]++;
      }
    }
  }
  if (particles.length) {
    const p0 = particles[0];
    energyLog.push({ ke: p0.KE, pe: p0.PE, tot: p0.KE + p0.PE });
    if (energyLog.length > 240) energyLog.shift();
  }
}

// ═══════════════════════════════════════════
// 可视化同步 — 关键: 位置按 VIS 缩放, 保证在相机视场内
// ═══════════════════════════════════════════
function syncVisuals() {
  const sphereMode = (S.srcMode === 'sphere');
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i], m = pMeshes[i];
    if (!m) continue;
    m.position.set(p.x * VIS, p.y * VIS, p.z * VIS);
    m.visible = true;
    if (p.done) {
      if (p.angle > 90) m.material.emissive.setHex(0xef4444);
      else if (p.angle < 10) m.material.emissive.setHex(0x34d399);
      else m.material.emissive.setHex(0xd9a857);
      m.material.opacity = 0.7;
    }
    const tl = pTrails[i];
    if (tl) {
      const tg = tl.geometry, pos = tg.attributes.position, col = tg.attributes.color;
      const tr = p.trail;
      // 球面源不显示轨迹; "隐藏入射段"时从进入显示区的点开始绘制
      let from = 0;
      if (S.hideIncident && S.showTrails && !sphereMode) {
        from = (p.trailFrom < 0) ? tr.length : p.trailFrom;
      }
      const avail = Math.max(0, tr.length - from);
      const n = Math.min(avail, TMAX);
      for (let j = 0; j < n; j++) {
        const q = tr[from + j];
        pos.array[j * 3] = q.x * VIS; pos.array[j * 3 + 1] = q.y * VIS; pos.array[j * 3 + 2] = q.z * VIS;
        const t = j / Math.max(1, n - 1);
        if (S.showVColor) {
          col.array[j * 3] = 1.0 - t * 0.15;
          col.array[j * 3 + 1] = 0.95 - t * 0.55;
          col.array[j * 3 + 2] = 0.90 - t * 0.65;
        } else {
          col.array[j * 3] = 0.96; col.array[j * 3 + 1] = 0.62; col.array[j * 3 + 2] = 0.04;
        }
      }
      pos.needsUpdate = true; col.needsUpdate = true;
      tg.setDrawRange(0, n);
      tl.visible = S.showTrails && !sphereMode && n > 1;
    }
  }
  if (nucleusMesh) {
    const pulse = 1 + 0.08 * Math.sin(frameN * 0.04);
    nucleusMesh.scale.setScalar(nucleusBaseScale * pulse);   // ★ 在元素半径基础上脉动
  }
}

function updateTracker() {
  if (S.trackedId < 0 || S.trackedId >= particles.length) return;
  const p = particles[S.trackedId];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('tk-id', p.id);
  set('tk-r', p.rMin > 1e8 ? '—' : p.rMin.toFixed(1) + ' fm');
  set('tk-v', (p.spd / P.c).toFixed(4) + ' c');
  set('tk-a', p.done ? p.angle.toFixed(1) + '°' : '…');
  set('tk-ke', p.KE.toFixed(3) + ' MeV');
  set('tk-pe', p.PE.toFixed(3) + ' MeV');
}

// ═══════════════════════════════════════════
// 主循环
// ═══════════════════════════════════════════
const clock = new THREE.Clock();
let statTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  frameN++;
  fpsT += dt;
  if (fpsT > 0.5) {
    const fd = document.getElementById('fps-d'); if (fd) fd.textContent = 'FPS: ' + Math.round(1 / Math.max(dt, 1e-4));
    fpsT = 0;
  }
  if (S.running) {
    // 提高基础步数, 让粒子快速可见地运动
    const steps = Math.max(1, Math.round(20 * S.speed));
    stepSim(steps);
  }
  syncVisuals();
  controls.update();
  updateTracker();
  statTimer += dt;
  if (statTimer > 0.25) {
    statTimer = 0;
    updateStats();
    drawAngleChart(); drawEnergyChart(); drawRminChart();
    const td = document.getElementById('time-d'); if (td) td.textContent = 't = ' + simTime.toFixed(2) + ' zs';
  }
  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════
// 启动
// ═══════════════════════════════════════════
initThree();
makeMeshes();
bindUI();
fireParticles();
markPlay(true);
animate();

// 滑块动态填充
document.querySelectorAll('input[type=range]').forEach(el => {
  const upd = () => {
    const min = parseFloat(el.min), max = parseFloat(el.max), val = parseFloat(el.value);
    const p = (max > min) ? ((val - min) / (max - min) * 100) : 50;
    el.style.setProperty('--fill', p + '%');
  };
  el.addEventListener('input', upd); upd();
});
