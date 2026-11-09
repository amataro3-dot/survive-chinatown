/* SURVIVE CHINATOWN 本体(街・車・人・警察・ひとり用ミッション・配達競争の画面側)
   オンラインの通信は online.js がやる。ここは window.SC で、通信係とやりとりする。
   - ひとり用: SC.startSolo()
   - 配達競争: SC.startRace(slot, color) → SC.setRace(state) / SC.setRemotes(pos) → SC.stopRace() */
(function () {
'use strict';
window.addEventListener('error', e => { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent = 'エラー: ' + e.message; });
if (typeof THREE === 'undefined') { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent = '3Dの道具(Three.js)を読みこめませんでした。ページを開き直してね'; return; }

/* ===== 調整用の数字 ===== */
const TUNE = {
  walk: 5, dash: 9.5,              // 歩く・走る速さ
  carMax: 35, carAccel: 19,        // 車の最高速度(35 = 約126km/h)と加速
  carBrake: 45, carReverse: 10,    // ブレーキ・バックの最高速度
  steer: 1.9,                      // ハンドルの効き
  enterDist: 4.8,                  // 車に乗れる距離
  trafficCars: 12, parkedCars: 10, peds: 22,
  police: { maxCars: 4, speed: 28, evadeDist: 55, evadeTime: 10, bustTime: 1.6, fine: 1000 },
  posRate: 0.125,                  // 配達競争: 自分の位置を送る間隔(秒)
};

let seed = 20261109;
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const N = 6, CELL = 52, HALF = N * CELL / 2, ROADW = 12;
const roadC = k => k * CELL - HALF;
const P = (ix, iz) => ({ x: roadC(ix), z: roadC(iz) });
const BX0 = -168, BX1 = 172, BZ0 = -168, BZ1 = 168;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===== 3Dの準備 ===== */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1028);
scene.fog = new THREE.Fog(0x0b1028, 90, 290);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 700);
let baseFov = 62;
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; baseFov = w < h ? 78 : 62; camera.fov = baseFov; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0x8a98d0, 0x3a2c26, 0.85));
const sun = new THREE.DirectionalLight(0x9fb0e0, 0.35); sun.position.set(-80, 150, -40); scene.add(sun);

const matCache = {};
function M(color) { if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color }); return matCache[color]; }
const geoCache = {};
function BG(w, h, d) { const k = w + '_' + h + '_' + d; if (!geoCache[k]) geoCache[k] = new THREE.BoxGeometry(w, h, d); return geoCache[k]; }
function addBox(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(BG(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; }

/* ===== 街 ===== */
const grass = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), M(0x3f6b34)); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; scene.add(grass);
const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + ROADW, HALF * 2 + ROADW), M(0x3c3c44)); asphalt.rotation.x = -Math.PI / 2; scene.add(asphalt);
const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 1400), M(0x1d3f6e)); water.rotation.x = -Math.PI / 2; water.position.set(175 + 300, 0.03, 0); scene.add(water);
addBox(13, 0.4, 340, 168.5, 0.2, 0, M(0xa8a8a0));
const colliders = [];
// ぶつかり判定を速くするため、かべを 20×20 のマスに分けて覚える(近くのマスだけ調べる)
const COLG = 20, colGrid = new Map(), gk = (gx, gz) => gx * 1000 + gz, gc = v => Math.floor((v + 500) / COLG);
function addCol(x0, x1, z0, z1) {
  const c = { x0, x1, z0, z1 }; colliders.push(c);
  for (let gx = gc(x0); gx <= gc(x1); gx++) for (let gz = gc(z0); gz <= gc(z1); gz++) { const k = gk(gx, gz); if (!colGrid.has(k)) colGrid.set(k, []); colGrid.get(k).push(c); }
}
addCol(175, 400, -400, 400);
const crateCols = [0xc0763a, 0x3a7cc0, 0x4caf50, 0xd0b040];
for (let i = 0; i < 10; i++) { const z = -150 + i * 30 + (rnd() * 8 - 4); if (Math.abs(z - 60) < 10 || Math.abs(z + 60) < 10) continue; addBox(5, 2.6, 2.6, 171, 1.7, z, M(crateCols[i % 4])); addCol(168.5, 173.5, z - 1.3, z + 1.3); }
function boat(z) { addBox(8, 2.4, 22, 181, 1.2, z, M(0xeeeeee)); addBox(6, 2.5, 7, 181, 3.6, z - 4, M(0x2f5f9f)); }
boat(60); boat(-60);

const texCache = {};
function nightWin(cols, rows, base, lit, ct) {
  const key = 'n' + cols + '_' + rows + '_' + base + '_' + lit + '_' + ct; if (texCache[key]) return texCache[key];
  const W = cols * 8, H = rows * 8, c1 = document.createElement('canvas'), c2 = document.createElement('canvas');
  c1.width = c2.width = W; c1.height = c2.height = H; const g1 = c1.getContext('2d'), g2 = c2.getContext('2d');
  g1.fillStyle = base; g1.fillRect(0, 0, W, H); g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const on = rnd() < lit, warm = rnd() < 0.35 ? '#ffb46a' : '#ffe6a8';
    g1.fillStyle = on ? warm : '#1a2232'; g1.fillRect(k * 8 + 2, r * 8 + 2, 4, 5);
    if (on) { g2.fillStyle = warm; g2.fillRect(k * 8 + 2, r * 8 + 2, 4, 5); }
    if (ct) { g1.fillStyle = 'rgba(0,0,0,.45)'; g1.fillRect(k * 8, r * 8 + 7, 8, 1); }
  }
  const t1 = new THREE.CanvasTexture(c1), t2 = new THREE.CanvasTexture(c2); t1.magFilter = t2.magFilter = THREE.NearestFilter;
  return (texCache[key] = { map: t1, em: t2 });
}
function nightMat(cols, rows, base, lit, ct) { const t = nightWin(cols, rows, base, lit, ct); return new THREE.MeshLambertMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.em }); }
function winTex(cols, rows, base) {
  const key = cols + '_' + rows + '_' + base; if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = cols * 8; c.height = rows * 8; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { g.fillStyle = rnd() < 0.12 ? '#ffe7a0' : (rnd() < 0.5 ? '#9fc3e6' : '#86aed6'); g.fillRect(k * 8 + 2, r * 8 + 2, 4, 4); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, c.height - 8, c.width, 8);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; texCache[key] = t; return t;
}
const palette = ['#c98a5b', '#b0b8c4', '#6f84a3', '#d9b26a', '#9c7a6b', '#8aa39b', '#c4b49a', '#7d6f8f', '#a35d5d'];
const roofMat = M(0x55585e);
const buildings = [];
function makeBuilding(x, z, w, d, h) {
  const base = palette[Math.floor(rnd() * palette.length)];
  const rows = Math.max(2, Math.round(h / 4)), cw = Math.max(2, Math.round(w / 4)), cd = Math.max(2, Math.round(d / 4));
  const mz = nightMat(cw, rows, base, 0.28, false), mx = nightMat(cd, rows, base, 0.28, false);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, roofMat, roofMat, mz, mz]); m.position.set(x, h / 2 + 0.3, z); scene.add(m);
  addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2); buildings.push({ x, z, w, d });
}
/* チャイナタウン: 西寄りの 3×3 区画。その中の2区画(横につなげる)が、歩いてしか入れない市場 */
const CT = { i0: 1, i1: 3, j0: 2, j1: 4 };
const isCT = (i, j) => i >= CT.i0 && i <= CT.i1 && j >= CT.j0 && j <= CT.j1;
const isMarketBlock = (i, j) => j === 3 && (i === 1 || i === 2);
// 2つの区画をつなげて1つにする所(間の道はなくなる)
const MERGES = [
  { a: [1, 3], b: [2, 3], kind: 'market' },  // チャイナタウンの市場(歩いてしか入れない)
  { a: [5, 2], b: [5, 3], kind: 'park' },    // 港の前の大きな公園
  { a: [3, 0], b: [4, 0], kind: 'tower' },   // 大きなビル
  { a: [0, 4], b: [0, 5], kind: 'parking' }, // 駐車場
];
const mergeOf = (i, j) => MERGES.find(m => (m.a[0] === i && m.a[1] === j) || (m.b[0] === i && m.b[1] === j));
const mergeRect = m => ({ x0: roadC(m.a[0]) + 6, x1: roadC(m.b[0] + 1) - 6, z0: roadC(m.a[1]) + 6, z1: roadC(m.b[1] + 1) - 6 });
const mergeEdge = m => m.a[1] === m.b[1] ? [[m.b[0], m.a[1]], [m.b[0], m.a[1] + 1]] : [[m.a[0], m.b[1]], [m.a[0] + 1, m.b[1]]];
const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const inMerged = (x, z) => MERGES.some(m => inRect(mergeRect(m), x, z));
const MK = mergeRect(MERGES[0]);
const inMarket = (x, z) => inRect(MK, x, z);
const blocks = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const x0 = roadC(i) + 6, x1 = roadC(i + 1) - 6, z0 = roadC(j) + 6, z1 = roadC(j + 1) - 6, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mg = mergeOf(i, j);
  if (mg && mg.kind !== 'market') { blocks.push({ x0, x1, z0, z1, park: mg.kind === 'park', merged: true }); continue; }
  if (isCT(i, j)) { blocks.push({ x0, x1, z0, z1, park: false, ct: true, market: isMarketBlock(i, j), i, j }); if (!isMarketBlock(i, j)) addBox(40, 0.3, 40, cx, 0.15, cz, M(0x8f857c)); continue; }
  const center = 1 - Math.hypot(cx, cz) / (HALF * 1.3);
  const park = (i === 3 && j === 3) ? false : rnd() < 0.12;
  blocks.push({ x0, x1, z0, z1, park });
  addBox(40, 0.3, 40, cx, 0.15, cz, park ? M(0x5c9e45) : M(0xb8b8b8));
  if (park) { for (let t = 0; t < 6; t++) { const tx = x0 + 6 + rnd() * 28, tz = z0 + 6 + rnd() * 28; addBox(0.6, 2.2, 0.6, tx, 1.4, tz, M(0x7a5230)); addBox(3, 3, 3, tx, 3.8, tz, M(0x2f7d32)); addCol(tx - 0.5, tx + 0.5, tz - 0.5, tz + 0.5); } continue; }
  if (rnd() < 0.25) { const w = 30 + rnd() * 4, d = 30 + rnd() * 4; makeBuilding(cx, cz, w, d, (18 + rnd() * 40) * (0.6 + center)); }
  else { for (const ox of [-10, 10]) for (const oz of [-10, 10]) { if (rnd() < 0.15) continue; const w = 11 + rnd() * 5, d = 11 + rnd() * 5; makeBuilding(cx + ox, cz + oz, w, d, (8 + rnd() * 30) * (0.6 + center)); } }
}
/* ===== チャイナタウン(夜) ===== */
const pick = a => a[Math.floor(rnd() * a.length)];
const basicCache = {};
function MB(color) { if (!basicCache[color]) basicCache[color] = new THREE.MeshBasicMaterial({ color }); return basicCache[color]; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
const FONT = '"Noto Sans CJK JP","Hiragino Sans","Yu Gothic",sans-serif';
const LANTERNS = [], GLOWS = [], WIRES = [];
const EXTRA_SPOTS = []; // 配達競争: 道路のほかに荷物・届け先が出る場所(市場・公園・ビルの前・駐車場)
const SIGN_WORDS = ['龍', '福', '飯店', '麺', '茶', '酒', '点心', '金', '薬', '宝', '楼', '餃子', '粥', '華'];
const SHOP_NAMES = ['金龍', '福満楼', '茶館', '点心', '麺家', '漢方', '雑貨', '飯店', '包子', '酒家', '宝石', '海鮮'];
const NEON = ['#ff3b6b', '#3bf0ff', '#ffd23f', '#ff5a2a', '#7dff6a', '#ff7ae0'];
const signCache = {};
function vSignMat(word, col) {
  const k = 'v' + word + col; if (signCache[k]) return signCache[k];
  const n = word.length, t = canvasTex(64, n * 60 + 16, (g, w, h) => {
    g.fillStyle = '#1a0c12'; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 5; g.shadowColor = col; g.shadowBlur = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.font = 'bold 44px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) g.fillText(word[i], w / 2, 8 + 30 + i * 60);
  });
  return (signCache[k] = new THREE.MeshBasicMaterial({ map: t }));
}
function hSignMat(word, bg, fg) {
  const k = 'h' + word + bg + fg; if (signCache[k]) return signCache[k];
  const n = word.length, t = canvasTex(n * 60 + 28, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.shadowColor = fg; g.shadowBlur = 6; g.font = 'bold 42px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, w / 2, h / 2 + 2);
  });
  return (signCache[k] = new THREE.MeshBasicMaterial({ map: t }));
}
const shopMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = '#2a1a12'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe7b0'); gr.addColorStop(1, '#d9873a'); g.fillStyle = gr;
  for (let k = 0; k < 3; k++) g.fillRect(3 + k * 20, 4, 18, h - 6);
  g.fillStyle = 'rgba(90,35,10,.65)'; for (let k = 0; k < 3; k++) { g.fillRect(6 + k * 20, 15, 5, 13); g.fillRect(13 + k * 20, 19, 4, 9); }
}) });
const stripeTex = c => canvasTex(32, 32, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f4efe4' : c; g.fillRect(k * 4, 0, 4, 32); } });
const tentMats = ['#c8261e', '#d9a020', '#2f8a55'].map(c => new THREE.MeshLambertMaterial({ map: stripeTex(c), side: THREE.DoubleSide, emissive: 0x3a2010 }));
const ctRoofs = {};
function ctRoof(c) { if (!ctRoofs[c]) ctRoofs[c] = new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }); return ctRoofs[c]; }
// 反った屋根(まん中が高く、すそが平ら、四すみが反りあがる)
const roofCache = {};
function roofGeo(w, d, H, lift) {
  const k = [w, d, H, lift].join('_'); if (roofCache[k]) return roofCache[k];
  const g = new THREE.PlaneGeometry(w, d, 14, 14); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, m = Math.min(w, d) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z)) / m;
    const u = Math.abs(x) / (w / 2), v = Math.abs(z) / (d / 2);
    p.setY(i, H * Math.pow(Math.max(0, t), 1.6) + lift * Math.pow(u * v, 6));
  }
  g.computeVertexNormals(); return (roofCache[k] = g);
}
// ローカル座標 → 世界の座標(rotation.y の向き)
function toW(x, z, r, lx, lz) { return [x + lx * Math.cos(r) + lz * Math.sin(r), z - lx * Math.sin(r) + lz * Math.cos(r)]; }
function colRot(x, z, w, d, r) { const ex = Math.abs(Math.cos(r)) * w / 2 + Math.abs(Math.sin(r)) * d / 2, ez = Math.abs(Math.sin(r)) * w / 2 + Math.abs(Math.cos(r)) * d / 2; addCol(x - ex, x + ex, z - ez, z + ez); buildings.push({ x, z, w: ex * 2, d: ez * 2 }); }
function lanternString(ax, ay, az, bx, by, bz, n, sag) {
  let prev = null; const at = t => [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
  for (let k = 0; k <= 8; k++) { const p = at(k / 8); if (prev) WIRES.push(...prev, ...p); prev = p; }
  for (let k = 1; k <= n; k++) { const p = at(k / (n + 1)); LANTERNS.push([p[0], p[1] - 0.5, p[2], 0.75, k % 2]); }
}
// 店(1階が光る店、上は窓。前に看板・ネオン・ちょうちん)
const CT_WALLS = ['#a8392f', '#d8c6a0', '#7a2a26', '#c79a45', '#3f6b5a', '#e2d8c4', '#8c4a3a'];
const ROOF_COLS = [0x2f7a55, 0x9a3324, 0x2f7a55, 0x40464f];
function shophouse(x, z, w, d, h, r) {
  const g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = r;
  const base = pick(CT_WALLS), rows = Math.max(1, Math.round((h - 3.2) / 3.2));
  const front = nightMat(Math.max(2, Math.round(w / 2.6)), rows, base, 0.45, true), side = nightMat(Math.max(2, Math.round(d / 2.6)), rows, base, 0.2, true);
  const up = new THREE.Mesh(new THREE.BoxGeometry(w, h - 3.2, d), [side, side, M(0x2a2a2e), M(0x2a2a2e), front, front]); up.position.y = 3.2 + (h - 3.2) / 2; g.add(up);
  const gf = new THREE.Mesh(BG(w, 3.2, d - 0.8), M(0x2a1e1a)); gf.position.set(0, 1.6, -0.4); g.add(gf);
  const sf = new THREE.Mesh(BG(w - 0.6, 2.7, 0.1), shopMat); sf.position.set(0, 1.45, d / 2 - 0.75); g.add(sf);
  const aw = new THREE.Mesh(BG(w - 0.3, 0.15, 1.5), M(rnd() < 0.5 ? 0xa8241c : 0x2a6a48)); aw.position.set(0, 3.05, d / 2 + 0.35); aw.rotation.x = 0.28; g.add(aw);
  if (rnd() < 0.8) { const wd = pick(SHOP_NAMES); const s = new THREE.Mesh(BG(Math.min(w - 0.8, wd.length * 1.25 + 0.7), 1.1, 0.15), hSignMat(wd, rnd() < 0.5 ? '#7a0e0e' : '#101010', '#ffd75a')); s.position.set(0, 3.95, d / 2 + 0.1); g.add(s); }
  if (rnd() < 0.75 && h > 7) {
    const wd = pick(SIGN_WORDS), col = pick(NEON), sh = wd.length * 1.35 + 0.5;
    const s = new THREE.Mesh(BG(0.2, sh, 1.2), vSignMat(wd, col)); s.position.set((rnd() < 0.5 ? -1 : 1) * (w / 2 - 0.5), Math.min(h - sh / 2 - 0.3, 4.7 + sh / 2), d / 2 + 0.75); g.add(s);
  }
  if (rnd() < 0.6) { const rh = 1.5 + w * 0.12; const m = new THREE.Mesh(roofGeo(w + 1.4, d + 1.4, rh, 0.9), ctRoof(pick(ROOF_COLS))); m.position.y = h; g.add(m); }
  else { const m = new THREE.Mesh(BG(w, 0.6, d), M(0x3a3236)); m.position.y = h + 0.3; g.add(m); }
  for (const sx of [-w / 2 + 1.1, w / 2 - 1.1]) { const q = toW(x, z, r, sx, d / 2 + 0.6); LANTERNS.push([q[0], 3.0, q[1], 0.7, rnd() < 0.5 ? 1 : 0]); }
  const q = toW(x, z, r, 0, d / 2 + 1.6); GLOWS.push([q[0], q[1], 4.5, 1]);
  scene.add(g); colRot(x, z, w, d, r);
}
// [a,b] を、gaps をよけて、同じくらいの幅の店で埋める
function shopRow(a, b, gaps, place) {
  const ivs = []; let p = a;
  for (const [g0, g1] of gaps.slice().sort((u, v) => u[0] - v[0])) { if (g0 > p) ivs.push([p, g0]); p = Math.max(p, g1); }
  if (b > p) ivs.push([p, b]);
  for (const [s, e] of ivs) { const n = Math.max(1, Math.round((e - s) / 8)), w = (e - s) / n; for (let k = 0; k < n; k++) place(s + w * (k + 0.5), w - 0.05); }
}
function shopsAround(x0, x1, z0, z1, D, set, gaps) {
  gaps = gaps || {}; const hgt = () => 6.5 + rnd() * 9;
  shopRow(x0 + set, x1 - set, gaps.n || [], (c, w) => shophouse(c, z0 + set + D / 2, w, D, hgt(), Math.PI));
  shopRow(x0 + set, x1 - set, gaps.s || [], (c, w) => shophouse(c, z1 - set - D / 2, w, D, hgt(), 0));
  shopRow(z0 + set + D, z1 - set - D, gaps.w || [], (c, w) => shophouse(x0 + set + D / 2, c, w, D, hgt(), -Math.PI / 2));
  shopRow(z0 + set + D, z1 - set - D, gaps.e || [], (c, w) => shophouse(x1 - set - D / 2, c, w, D, hgt(), Math.PI / 2));
}
// 赤い門(牌楼)。道をまたぐ。r=0 なら南北の道、PI/2 なら東西の道
const plaqueMat = hSignMat('中華街', '#5a0a0a', '#ffd75a');
function gate(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
  const red = M(0xb3221a), gold = M(0xd8a83a), stone = M(0x8a8580);
  for (const sx of [-6.6, 6.6]) { add(BG(1.0, 9.6, 1.0), red, sx, 4.8, 0); add(BG(1.7, 1.0, 1.7), stone, sx, 0.5, 0); const q = toW(x, z, r, sx, 0); addCol(q[0] - 0.85, q[0] + 0.85, q[1] - 0.85, q[1] + 0.85); }
  add(BG(15.8, 0.9, 0.9), red, 0, 7.5, 0); add(BG(14.8, 0.45, 0.7), gold, 0, 8.2, 0); add(BG(15.4, 0.7, 0.9), red, 0, 9.0, 0);
  add(BG(4.6, 1.9, 1.1), plaqueMat, 0, 8.25, 0);
  add(roofGeo(18, 3.4, 1.9, 1.5), ctRoof(0x2f7a55), 0, 9.35, 0); add(BG(15, 0.3, 0.3), gold, 0, 11.25, 0);
  for (const sx of [-4, 0, 4]) { const q = toW(x, z, r, sx, 0); LANTERNS.push([q[0], 6.4, q[1], 1.3, 0]); }
  GLOWS.push([x, z, 10, 0]); scene.add(g);
}
// 塔(パゴダ)と広場
function pagoda(x, z) {
  addBox(40, 0.34, 40, x, 0.17, z, M(0x6e6660));
  addBox(14, 1.2, 14, x, 0.9, z, M(0x9a948c)); addCol(x - 7, x + 7, z - 7, z + 7); buildings.push({ x, z, w: 14, d: 14 });
  let y = 1.5, s = 9;
  for (let t = 0; t < 5; t++) {
    const hh = t === 0 ? 4.2 : 3.2;
    addBox(s, hh, s, x, y + hh / 2, z, M(0xa8281e)); addBox(s + 0.3, 0.3, s + 0.3, x, y + hh - 0.15, z, M(0xd8a83a));
    for (const [dx, dz, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]]) { const m = addBox(s * 0.34, hh * 0.45, 0.12, x + dx * (s / 2 + 0.05), y + hh * 0.45, z + dz * (s / 2 + 0.05), MB(0xffc070)); m.rotation.y = ry * Math.PI / 2; }
    const rf = new THREE.Mesh(roofGeo(s + 3.6, s + 3.6, 1.7, 1.3), ctRoof(0x2f7a55)); rf.position.set(x, y + hh, z); scene.add(rf);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) LANTERNS.push([x + sx * (s / 2 + 1.5), y + hh + 0.4, z + sz * (s / 2 + 1.5), 0.6, 0]);
    y += hh + 1.1; s *= 0.8;
  }
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 4.5, 8), M(0xd8a83a)); sp.position.set(x, y + 1.8, z); scene.add(sp);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lanternString(x, y - 1, z, x + sx * 18, 3.5, z + sz * 18, 9, 1.5);
  GLOWS.push([x, z, 16, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const tx = x + sx * 14, tz = z + sz * 14; addBox(0.6, 2.2, 0.6, tx, 1.4, tz, M(0x5a3a22)); addBox(3, 3, 3, tx, 3.8, tz, M(0x24502a)); addCol(tx - 0.5, tx + 0.5, tz - 0.5, tz + 0.5); }
}
// 市場の屋台(背中あわせの2つ)。r=0 なら東西にのびる
function stallPair(x, z, r, len) {
  const g = new THREE.Group(); g.position.set(x, 0.34, z); g.rotation.y = r;
  for (const side of [1, -1]) {
    const s = new THREE.Group(); s.position.z = side * 0.6; s.rotation.y = side > 0 ? 0 : Math.PI; g.add(s);
    const ct = new THREE.Mesh(BG(len - 0.2, 1.0, 1.1), M(0x6b4428)); ct.position.set(0, 0.5, 0); s.add(ct);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(BG(0.7, 0.28, 0.55), MB(pick([0xff6a3a, 0xffd23f, 0x7ac943, 0xe23a3a, 0xf0e0c0]))); b.position.set(-len / 2 + 0.7 + k * (len - 1.4) / 2, 1.14, 0.15); s.add(b); }
    if (rnd() < 0.18) { const hd = new THREE.Mesh(BG(0.6, 0.55, 0.6), M(0xf2a6a6)); hd.position.set(len * 0.2, 1.28, 0.2); s.add(hd); const sn = new THREE.Mesh(BG(0.3, 0.22, 0.12), M(0xe07b84)); sn.position.set(len * 0.2, 1.22, 0.55); s.add(sn); for (const ex of [-0.2, 0.2]) { const e = new THREE.Mesh(BG(0.15, 0.2, 0.08), M(0xe89090)); e.position.set(len * 0.2 + ex, 1.62, 0.2); s.add(e); } }
    for (const px of [-len / 2 + 0.15, len / 2 - 0.15]) { const p = new THREE.Mesh(BG(0.1, 2.5, 0.1), M(0x222222)); p.position.set(px, 1.25, -0.45); s.add(p); }
    const tent = new THREE.Mesh(roofGeo(len + 0.3, 2.0, 0.6, 0.25), pick(tentMats)); tent.position.set(0, 2.45, 0.2); s.add(tent);
    const q = toW(x, z, r, 0, side * 1.9); LANTERNS.push([q[0], 2.5, q[1], 0.55, rnd() < 0.5 ? 1 : 0]);
  }
  scene.add(g); colRot(x, z, len, 2.3, r);
}
// 路地の入口の小さな門(柱のあいだは 1.5m: 人は通れて、車は通れない)
function alleyGate(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, 0.34, z); g.rotation.y = r;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
  for (const sx of [-1.125, 1.125]) { add(BG(0.75, 3.6, 0.6), M(0xb3221a), sx, 1.8, 0); const q = toW(x, z, r, sx, 0); addCol(q[0] - 0.4, q[0] + 0.4, q[1] - 0.4, q[1] + 0.4); }
  add(BG(3.6, 0.5, 0.7), M(0xb3221a), 0, 3.85, 0); add(BG(2.2, 0.7, 0.15), hSignMat('市場', '#7a0e0e', '#ffd75a'), 0, 3.85, 0.43);
  add(roofGeo(4.4, 1.5, 0.6, 0.5), ctRoof(0x2f7a55), 0, 4.1, 0);
  for (const sx of [-1.125, 1.125]) { const q = toW(x, z, r, sx, 0.7); LANTERNS.push([q[0], 3.2, q[1], 0.7, 0]); }
  const q = toW(x, z, r, 0, 2); GLOWS.push([q[0], q[1], 4, 1]);
  scene.add(g);
}
// つなげた区画: 公園・大きなビル・駐車場
function buildMerged(m) {
  const r = mergeRect(m), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, W = r.x1 - r.x0, D = r.z1 - r.z0;
  if (m.kind === 'park') {
    addBox(W, 0.3, D, cx, 0.15, cz, M(0x3f7a34));
    addBox(3, 0.32, D, cx, 0.17, cz, M(0x9a948c)); addBox(W, 0.32, 3, cx, 0.17, cz, M(0x9a948c));
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.2, 28), M(0x1d4f8e)); pond.position.set(cx, 0.36, cz); scene.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.35, 6, 28), M(0x9a948c)); rim.rotation.x = Math.PI / 2; rim.position.set(cx, 0.45, cz); scene.add(rim); addCol(cx - 7, cx + 7, cz - 7, cz + 7);
    for (let t = 0; t < 34; t++) { const tx = r.x0 + 3 + rnd() * (W - 6), tz = r.z0 + 3 + rnd() * (D - 6); if (Math.abs(tx - cx) < 3.5 || Math.abs(tz - cz) < 3.5 || Math.hypot(tx - cx, tz - cz) < 11) continue; addBox(0.6, 2.2, 0.6, tx, 1.4, tz, M(0x5a3a22)); addBox(3, 3, 3, tx, 3.8, tz, M(0x24502a)); addCol(tx - 0.5, tx + 0.5, tz - 0.5, tz + 0.5); }
    EXTRA_SPOTS.push({ x: cx, z: cz - 30 }, { x: cx, z: cz + 30 }, { x: cx - 14, z: cz }, { x: cx + 14, z: cz });
    for (const [lx, lz] of [[-4, -20], [4, 20], [-4, 30], [4, -30], [12, -3], [-12, 3]]) { addBox(0.2, 4, 0.2, cx + lx, 2.3, cz + lz, M(0x333333)); addBox(0.6, 0.3, 0.6, cx + lx, 4.3, cz + lz, MB(0xfff0c8)); GLOWS.push([cx + lx, cz + lz, 6, 2]); }
  } else if (m.kind === 'tower') {
    addBox(W, 0.3, D, cx, 0.15, cz, M(0xb8b8b8));
    makeBuilding(cx, cz, W - 6, D - 6, 14); EXTRA_SPOTS.push({ x: cx - 25, z: r.z1 - 1.3 }, { x: cx + 25, z: r.z1 - 1.3 }); // ビルの前 makeBuilding(cx + 10, cz, 34, 24, 78);
  } else if (m.kind === 'parking') {
    addBox(W, 0.3, D, cx, 0.15, cz, M(0x34343a));
    const pos = []; for (const row of [0, 1, 2]) for (let k = 0; k <= 14; k++) pos.push([r.x0 + 8 + row * 12, r.z0 + 3 + k * 6]);
    const lg = new THREE.PlaneGeometry(5, 0.15); lg.rotateX(-Math.PI / 2); const im = new THREE.InstancedMesh(lg, M(0xdddddd), pos.length), o = new THREE.Object3D();
    pos.forEach((q, i) => { o.position.set(q[0], 0.32, q[1]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); scene.add(im);
    EXTRA_SPOTS.push({ x: r.x0 + 14, z: cz - 25 }, { x: r.x0 + 26, z: cz }, { x: r.x0 + 14, z: cz + 25 }); // 車のならびの間
    for (let k = 0; k < 4; k++) { const lz = r.z0 + 12 + k * 23; addBox(0.25, 6, 0.25, cx, 3.3, lz, M(0x333333)); addBox(0.9, 0.3, 0.9, cx, 6.3, lz, MB(0xfff0c8)); GLOWS.push([cx, lz, 10, 2]); }
  }
}
function crates(x, z) { const h = 1.2 + rnd() * 1.2; addBox(1.6, h, 1.6, x, 0.34 + h / 2, z, M(pick([0x7a5230, 0x8a6a40, 0x5a4a3a]))); addCol(x - 0.8, x + 0.8, z - 0.8, z + 0.8); }
function market() {
  addBox(MK.x1 - MK.x0, 0.34, MK.z1 - MK.z0, (MK.x0 + MK.x1) / 2, 0.17, (MK.z0 + MK.z1) / 2, M(0x5e3a30));
  const D = 6, AL = 1.5; // 店の奥行き、路地の幅の半分(路地は3m: 人が2〜3人ならんで通れる)
  const ent = { n: [roadC(2) - 6, roadC(2) + 6], w: [26 - AL, 26 + AL], s: [-80 - AL, -80 + AL] };
  shopsAround(MK.x0, MK.x1, MK.z0, MK.z1, D, 0.5, { n: [ent.n], w: [ent.w], s: [ent.s] });
  // 入り口1: 車止め(柱)
  for (let k = 0; k < 6; k++) { const bx = roadC(2) - 5 + k * 2, bz = MK.z0 + 0.8; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.1, 10), M(0xf2c230)); p.position.set(bx, 0.85, bz); scene.add(p); const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10), M(0x111111)); bd.position.set(bx, 1.05, bz); scene.add(bd); addCol(bx - 0.25, bx + 0.25, bz - 0.25, bz + 0.25); }
  for (const sx of [-6.2, 6.2]) addBox(0.3, 6, 0.3, roadC(2) + sx, 3.3, MK.z0 + 0.4, M(0x222222));
  const bn = new THREE.Mesh(BG(8, 1.6, 0.2), hSignMat('夜市', '#7a0e0e', '#ffd75a')); bn.position.set(roadC(2), 5.6, MK.z0 + 0.4); scene.add(bn);
  lanternString(roadC(2) - 6.2, 6.2, MK.z0 + 0.4, roadC(2) + 6.2, 6.2, MK.z0 + 0.4, 5, 0.6);
  // 入り口2・3: 狭い路地。入口は 1.5m(車の幅の 2/3)にしぼって、小さな門にする
  alleyGate(MK.x0 + 0.3, 26, -Math.PI / 2); alleyGate(-80, MK.z1 - 0.3, 0);
  lanternString(MK.x0 + 0.5, 4.8, 26, MK.x0 + 0.5 + D, 4.8, 26, 3, 0.3);
  lanternString(-80, 4.8, MK.z1 - 0.5, -80, 4.8, MK.z1 - 0.5 - D, 3, 0.3);
  GLOWS.push([MK.x0 + 3, 26, 3, 1], [-80, MK.z1 - 3, 3, 1]);
  // 中は迷路(屋台の列でかべを作る。ところどころ、かべを外して道をつなげる)
  const ix0 = MK.x0 + 0.5 + D, ix1 = MK.x1 - 0.5 - D, iz0 = MK.z0 + 0.5 + D, iz1 = MK.z1 - 0.5 - D;
  const C = 12, Rw = 4, cw = (ix1 - ix0) / C, ch = (iz1 - iz0) / Rw;
  const vis = [], vW = [], hW = []; // vW[r][c]: c と c+1 の間のかべ。hW[r][c]: r と r+1 の間のかべ
  for (let r = 0; r < Rw; r++) { vis.push(Array(C).fill(false)); vW.push(Array(C - 1).fill(true)); if (r < Rw - 1) hW.push(Array(C).fill(true)); }
  const st = [[0, 0]]; vis[0][0] = true;
  while (st.length) {
    const [r, c] = st[st.length - 1], nb = [];
    if (c > 0 && !vis[r][c - 1]) nb.push([r, c - 1, 'v', r, c - 1]); if (c < C - 1 && !vis[r][c + 1]) nb.push([r, c + 1, 'v', r, c]);
    if (r > 0 && !vis[r - 1][c]) nb.push([r - 1, c, 'h', r - 1, c]); if (r < Rw - 1 && !vis[r + 1][c]) nb.push([r + 1, c, 'h', r, c]);
    if (!nb.length) { st.pop(); continue; }
    const n = nb[Math.floor(rnd() * nb.length)]; if (n[2] === 'v') vW[n[3]][n[4]] = false; else hW[n[3]][n[4]] = false; vis[n[0]][n[1]] = true; st.push([n[0], n[1]]);
  }
  const vx = new Set();
  for (let r = 0; r < Rw; r++) for (let c = 0; c < C - 1; c++) if (vW[r][c] && rnd() > 0.2) { const x = ix0 + (c + 1) * cw, z = iz0 + (r + 0.5) * ch; stallPair(x, z, Math.PI / 2, 3.4); vx.add((c + 1) + '_' + r); vx.add((c + 1) + '_' + (r + 1)); }
  for (let r = 0; r < Rw - 1; r++) for (let c = 0; c < C; c++) if (hW[r][c] && rnd() > 0.2) { const x = ix0 + (c + 0.5) * cw, z = iz0 + (r + 1) * ch; stallPair(x, z, 0, 3.4); vx.add(c + '_' + (r + 1)); vx.add((c + 1) + '_' + (r + 1)); }
  for (const k of vx) { const [c, r] = k.split('_').map(Number); if (r === 0 || r === Rw || c === 0 || c === C) continue; crates(ix0 + c * cw, iz0 + r * ch); }
  for (let r = 0; r < Rw; r++) for (const c of [1, 5, 9]) EXTRA_SPOTS.push({ x: ix0 + (c + 0.5 + (r % 2)) * cw, z: iz0 + (r + 0.5) * ch }); // 迷路の通路のまん中
  for (let r = 0; r < Rw; r++) { lanternString(ix0, 4.8, iz0 + (r + 0.5) * ch, ix1, 4.8, iz0 + (r + 0.5) * ch, 22, 0.8); for (let c = 0; c < C; c += 2) GLOWS.push([ix0 + (c + 0.5) * cw, iz0 + (r + 0.5) * ch, 4, 0]); }
}
(function buildChinatown() {
  for (const b of blocks) {
    if (!b.ct || b.market) continue;
    if (b.i === 3 && b.j === 2) { pagoda((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); continue; }
    shopsAround(b.x0, b.x1, b.z0, b.z1, 9, 2);
  }
  market();
  for (const m of MERGES) if (m.kind !== 'market') buildMerged(m);
  gate(roadC(1) + 8, roadC(4), Math.PI / 2); gate(roadC(4) - 8, roadC(3), Math.PI / 2); gate(roadC(2), roadC(2) + 8, 0); gate(roadC(3), roadC(5) - 8, 0);
  // 道の上のちょうちん(道を横切るように吊るす)
  const nearX = t => { for (let m = 0; m <= N; m++) if (Math.abs(t - roadC(m)) < 8) return true; return false; };
  for (const k of [2, 3]) for (let t = roadC(CT.j0) + 4; t < roadC(CT.j1 + 1); t += 9) { if (nearX(t) || inMarket(roadC(k), t)) continue; lanternString(roadC(k) - 6.3, 6.6, t, roadC(k) + 6.3, 6.6, t, 6, 0.9); if (Math.round(t) % 2) GLOWS.push([roadC(k), t, 5.5, 0]); }
  for (const k of [3, 4]) for (let t = roadC(CT.i0) + 4; t < roadC(CT.i1 + 1); t += 9) { if (nearX(t)) continue; lanternString(t, 6.6, roadC(k) - 6.3, t, 6.6, roadC(k) + 6.3, 6, 0.9); if (Math.round(t) % 2) GLOWS.push([t, roadC(k), 5.5, 0]); }
  // ふつうの街の交差点に、街灯のあかり
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = roadC(i), z = roadC(j); if (x > roadC(CT.i0) - 1 && x < roadC(CT.i1 + 1) + 1 && z > roadC(CT.j0) - 1 && z < roadC(CT.j1 + 1) + 1) continue; GLOWS.push([x, z, 9, 2]); addBox(0.25, 6, 0.25, x + 6.5, 3, z + 6.5, M(0x333333)); addBox(0.8, 0.3, 0.8, x + 6.2, 6, z + 6.2, MB(0xfff0c8)); }
  // ちょうちん(まとめて1回で描く)
  const lg = new THREE.SphereGeometry(0.45, 10, 8); lg.scale(1, 1.25, 1);
  for (const ci of [0, 1]) {
    const L = LANTERNS.filter(l => l[4] === ci), im = new THREE.InstancedMesh(lg, MB(ci ? 0xff8a2a : 0xff3322), L.length), o = new THREE.Object3D();
    L.forEach((l, i) => { o.position.set(l[0], l[1], l[2]); o.scale.setScalar(l[3]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); scene.add(im);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(WIRES, 3)); scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1414 })));
  // 地面にうつる光
  const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const gg = new THREE.PlaneGeometry(2, 2); gg.rotateX(-Math.PI / 2);
  [0xff5a2a, 0xffb060, 0xbfc8ff].forEach((col, ci) => {
    const L = GLOWS.filter(l => l[3] === ci); if (!L.length) return;
    const mat = new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, opacity: ci === 2 ? 0.25 : 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const im = new THREE.InstancedMesh(gg, mat, L.length), o = new THREE.Object3D();
    L.forEach((l, i) => { o.position.set(l[0], inMarket(l[0], l[1]) ? 0.37 : 0.33, l[1]); o.scale.setScalar(l[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); scene.add(im);
  });
  // 星と月
  const sv = []; for (let k = 0; k < 500; k++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3; sv.push(Math.cos(a) * Math.cos(e) * 600, Math.sin(e) * 600, Math.sin(a) * Math.cos(e) * 600); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false })); moon.position.set(-320, 230, -420); scene.add(moon);
})();

(function laneDashes() {
  const pos = [];
  for (let k = 0; k <= N; k++) for (let t = -HALF; t <= HALF; t += 6) { let near = false; for (let m = 0; m <= N; m++) if (Math.abs(t - roadC(m)) < 7) near = true; if (near) continue; if (!inMerged(roadC(k), t)) pos.push([roadC(k), t, 0]); if (!inMerged(t, roadC(k))) pos.push([t, roadC(k), 1]); }
  const g = new THREE.PlaneGeometry(0.35, 3); g.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(g, M(0xf2d24b), pos.length); const o = new THREE.Object3D();
  pos.forEach((p, i) => { o.position.set(p[0], 0.03, p[1]); o.rotation.set(0, p[2] ? Math.PI / 2 : 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  scene.add(im);
})();
function onWalk(x, z) { if (x > 162 && x < 175) return true; if (inMerged(x, z)) return true; for (const b of blocks) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true; return false; }

/* ===== ぶつかり判定 ===== */
function resolve(o, r) {
  let hit = false;
  for (let gx = gc(o.x - r); gx <= gc(o.x + r); gx++) for (let gz = gc(o.z - r); gz <= gc(o.z + r); gz++) for (const c of colGrid.get(gk(gx, gz)) || []) {
    if (o.x + r < c.x0 || o.x - r > c.x1 || o.z + r < c.z0 || o.z - r > c.z1) continue;
    const px = clamp(o.x, c.x0, c.x1), pz = clamp(o.z, c.z0, c.z1); const dx = o.x - px, dz = o.z - pz; const d = Math.hypot(dx, dz);
    if (d < r) {
      hit = true;
      if (d > 0.0001) { o.x = px + dx / d * r; o.z = pz + dz / d * r; }
      else { const l = o.x - c.x0, rr = c.x1 - o.x, t = o.z - c.z0, b = c.z1 - o.z, mn = Math.min(l, rr, t, b); if (mn === l) o.x = c.x0 - r; else if (mn === rr) o.x = c.x1 + r; else if (mn === t) o.z = c.z0 - r; else o.z = c.z1 + r; }
    }
  }
  if (o.x < BX0) { o.x = BX0; hit = true; } if (o.x > BX1) { o.x = BX1; hit = true; } if (o.z < BZ0) { o.z = BZ0; hit = true; } if (o.z > BZ1) { o.z = BZ1; hit = true; }
  return hit;
}
function resolveCar(c) {
  let hit = false; const fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (const off of [1.5, -1.5, 0]) { const p = { x: c.x + fx * off, z: c.z + fz * off }; if (resolve(p, 1.15)) { hit = true; c.x += p.x - (c.x + fx * off); c.z += p.z - (c.z + fz * off); } }
  return hit;
}

/* ===== 車と人の形 ===== */
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12); wheelGeo.rotateZ(Math.PI / 2);
function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BG(2.2, 0.9, 4.4), M(police ? 0x1a1a1a : color)); body.position.y = 0.8; g.add(body);
  if (police) { const s = new THREE.Mesh(BG(2.24, 0.4, 2.6), M(0xffffff)); s.position.set(0, 0.95, 0.1); g.add(s); }
  const cab = new THREE.Mesh(BG(1.9, 0.7, 2.2), M(0x2b3a4a)); cab.position.set(0, 1.6, -0.2); g.add(cab);
  const roof = new THREE.Mesh(BG(1.95, 0.12, 2.0), M(police ? 0xffffff : color)); roof.position.set(0, 2.0, -0.2); g.add(roof);
  for (const sx of [-1.05, 1.05]) for (const sz of [-1.4, 1.4]) { const w = new THREE.Mesh(wheelGeo, M(0x151515)); w.position.set(sx, 0.45, sz); g.add(w); }
  for (const sx of [-0.7, 0.7]) { const hl = new THREE.Mesh(BG(0.45, 0.25, 0.06), M(0xfff6cc)); hl.position.set(sx, 0.9, 2.21); g.add(hl); const tl = new THREE.Mesh(BG(0.45, 0.25, 0.06), M(0xd02020)); tl.position.set(sx, 0.9, -2.21); g.add(tl); }
  let lights = null;
  if (police) { const r = new THREE.Mesh(BG(0.6, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); r.position.set(-0.35, 2.18, -0.2); const b = new THREE.Mesh(BG(0.6, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0x2050ff })); b.position.set(0.35, 2.18, -0.2); g.add(r); g.add(b); lights = [r, b]; }
  scene.add(g); return { g, lights };
}
function makePerson(shirt, pants, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BG(0.8, 1.0, 0.45), M(shirt)); body.position.y = 1.35; g.add(body);
  const head = new THREE.Mesh(BG(0.55, 0.55, 0.55), M(skin)); head.position.y = 2.15; g.add(head);
  const hair = new THREE.Mesh(BG(0.58, 0.18, 0.58), M(0x2a1d14)); hair.position.y = 2.45; g.add(hair);
  function limb(x, y, w, h, col) { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(BG(w, h, w + 0.03), M(col)); m.position.y = -h / 2; p.add(m); g.add(p); return p; }
  const legL = limb(-0.2, 0.85, 0.32, 0.85, pants), legR = limb(0.2, 0.85, 0.32, 0.85, pants), armL = limb(-0.53, 1.82, 0.24, 0.85, shirt), armR = limb(0.53, 1.82, 0.24, 0.85, shirt);
  scene.add(g); return { g, legL, legR, armL, armR, phase: 0 };
}
function animPerson(p, speed, dt) { p.phase += dt * (2 + speed * 1.6); const s = Math.sin(p.phase) * Math.min(speed / 4, 1) * 0.9; p.legL.rotation.x = s; p.legR.rotation.x = -s; p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8; }

/* ===== 車・歩行者・自分 ===== */
const carColors = [0xd33c3c, 0x3c6fd3, 0xf0f0f0, 0x222222, 0xe0a020, 0x2f9e5a, 0x9a4fc4, 0x808890, 0xff7a30];
const cars = [];
function newCar(kind, x, z, h, color) { const m = makeCarMesh(color, kind === 'police'); const c = { kind, x, z, h, v: 0, mesh: m.g, lights: m.lights, stuck: 0, rev: 0, color }; cars.push(c); return c; }
function removeCar(c) { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.mesh); }
// つなげた区画の間の道は、なくなる(車は通れない)
const blockedEdge = (a, b) => MERGES.some(m => { const [p, q] = mergeEdge(m); return (a[0] === p[0] && a[1] === p[1] && b[0] === q[0] && b[1] === q[1]) || (a[0] === q[0] && a[1] === q[1] && b[0] === p[0] && b[1] === p[1]); });
function neighbors(n) { const r = []; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = n[0] + a, z = n[1] + b; if (x >= 0 && x <= N && z >= 0 && z <= N && !blockedEdge(n, [x, z])) r.push([x, z]); } return r; }
const nodePos = n => P(n[0], n[1]);
const sameNode = (a, b) => a[0] === b[0] && a[1] === b[1];
function nearestNode(x, z) { return [clamp(Math.round((x + HALF) / CELL), 0, N), clamp(Math.round((z + HALF) / CELL), 0, N)]; }
const startX = roadC(3) + 20, startZ = roadC(3) + 2.5, startH = Math.PI / 2; // 道路の上から、東を向いて始まる(歩道ぞいはチャイナタウンの店)
const firstCar = newCar('parked', startX + 3.5, roadC(3) + 4.3, Math.PI / 2, 0xd33c3c);
for (let i = 0; i < TUNE.parkedCars; i++) {
  const along = Math.floor(rnd() * N), k = Math.floor(rnd() * (N + 1)), side = rnd() < 0.5 ? -1 : 1, col = carColors[Math.floor(rnd() * carColors.length)];
  if (rnd() < 0.5) { if (!inMerged(roadC(along) + 26, roadC(k) + side * 4.3)) newCar('parked', roadC(along) + 26, roadC(k) + side * 4.3, side > 0 ? Math.PI / 2 : -Math.PI / 2, col); }
  else if (!inMerged(roadC(k) + side * 4.3, roadC(along) + 26)) newCar('parked', roadC(k) + side * 4.3, roadC(along) + 26, side > 0 ? Math.PI : 0, col);
}
(function parkingCars() { const m = MERGES.find(q => q.kind === 'parking'); if (!m) return; const r = mergeRect(m); for (const row of [0, 1, 2]) for (let k = 0; k < 14; k++) { if (rnd() < 0.45) continue; const x = r.x0 + 8 + row * 12, z = r.z0 + 6 + k * 6; newCar('parked', x, z, row === 1 ? -Math.PI / 2 : Math.PI / 2, carColors[Math.floor(rnd() * carColors.length)]); } })();
for (let i = 0; i < TUNE.trafficCars; i++) {
  const a = [Math.floor(rnd() * (N + 1)), Math.floor(rnd() * (N + 1))]; const nb = neighbors(a); const b = nb[Math.floor(rnd() * nb.length)];
  const c = newCar('traffic', 0, 0, 0, carColors[Math.floor(rnd() * carColors.length)]); c.a = a; c.b = b; c.p = rnd(); c.v = 10;
  const A = nodePos(a), B = nodePos(b); const dx = (B.x - A.x) / CELL, dz = (B.z - A.z) / CELL; c.x = A.x + (B.x - A.x) * c.p + dz * 3.2; c.z = A.z + (B.z - A.z) * c.p - dx * 3.2; c.h = Math.atan2(dx, dz);
}
function pedBlock() { let b; do { b = Math.floor(Math.random() * blocks.length); } while (blocks[b].market || (blocks[b].merged && !blocks[b].park)); return b; }
const peds = []; const shirts = [0x3f7fd0, 0xd04040, 0x40a060, 0xe0c040, 0x9050c0, 0xffffff, 0x303030, 0xff8040];
function pedPos(p) {
  const b = blocks[p.bi], o = 1.3, x0 = b.x0 + o, z0 = b.z0 + o, L = 40 - 2 * o; const t = ((p.t % (4 * L)) + 4 * L) % (4 * L); const s = Math.floor(t / L), f = t - s * L;
  if (s === 0) return [x0 + f, z0, Math.PI / 2 * p.dir]; if (s === 1) return [x0 + L, z0 + f, p.dir > 0 ? 0 : Math.PI]; if (s === 2) return [x0 + L - f, z0 + L, p.dir > 0 ? -Math.PI / 2 : Math.PI / 2]; return [x0, z0 + L - f, p.dir > 0 ? Math.PI : 0];
}
for (let i = 0; i < TUNE.peds; i++) {
  const per = makePerson(shirts[i % shirts.length], [0x2a3550, 0x333333, 0x5a4030][i % 3], [0xf0c9a0, 0xc89870, 0x8a5a3a][i % 3]);
  peds.push({ per, bi: pedBlock(), t: rnd() * 160, dir: rnd() < 0.5 ? 1 : -1, speed: 1.2 + rnd() * 0.8, down: 0, x: 0, z: 0, h: 0, push: { x: 0, z: 0 } });
}
const player = { mode: 'foot', x: startX, z: startZ, h: startH, car: null, per: makePerson(0xffd23f, 0x23324f, 0xf0c9a0) };

// 目印(光の柱)
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 40, 20, 1, true), beamMat); beam.position.y = 20;
const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.3, 8, 32), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
const marker = new THREE.Group(); marker.add(beam); marker.add(ring); scene.add(marker); marker.visible = false;
function markerColor(hex) { beamMat.color.setHex(hex); ringMat.color.setHex(hex); }
// 配達競争の荷物(段ボール)
const pkgMesh = new THREE.Group();
(function () { const b = new THREE.Mesh(BG(1.4, 1.1, 1.4), M(0xb07a3c)); pkgMesh.add(b); const t = new THREE.Mesh(BG(1.42, 0.2, 0.3), M(0xe8d7a0)); t.position.y = 0.46; pkgMesh.add(t); })();
scene.add(pkgMesh); pkgMesh.visible = false;

/* ===== ゲームの状態 ===== */
const MISSIONS = [
  { title: '車に乗ろう', reward: 300, steps: [{ type: 'car', text: '近くの赤い車に近づいて「乗る」(Eキー)で乗ろう' }] },
  { title: 'はじめての配達', reward: 1500, steps: [{ type: 'go', pos: P(2, 5), text: '荷物を受け取りに行こう(黄色い光)', done: '荷物ゲット！' }, { type: 'go', pos: P(5, 1), text: '荷物を届けよう' }] },
  { title: '急ぎの配達', reward: 2500, steps: [{ type: 'go', pos: P(1, 1), text: '急ぎの荷物を受け取ろう', done: '荷物ゲット！' }, { type: 'go', pos: P(5, 5), text: '50秒以内に届けろ！', time: 50 }] },
  { title: 'あやしい荷物', reward: 4000, steps: [{ type: 'go', pos: P(0, 3), text: 'あやしい荷物を受け取れ', done: '荷物ゲット！' }, { type: 'go', pos: { x: 168, z: 60 }, text: '警察をかわして港の船へ運べ！', wanted: 2 }] },
  { title: '最後の大仕事', reward: 10000, steps: [{ type: 'go', pos: P(3, 0), text: 'チェックポイント 1/4', time: 140, wanted: 3 }, { type: 'go', pos: P(6, 2), text: 'チェックポイント 2/4' }, { type: 'go', pos: P(4, 5), text: 'チェックポイント 3/4' }, { type: 'go', pos: P(1, 6), text: 'チェックポイント 4/4' }, { type: 'go', pos: { x: 168, z: -60 }, text: '港の船へ急げ！' }] },
];
// mode: 'menu'(画面の後ろで街が動いている) / 'solo'(ひとり用) / 'race'(配達競争)
const G = { mode: 'menu', started: false, over: false, money: 0, wanted: 0, mi: 0, si: 0, timeLeft: -1, play: 0, evade: 0, bust: 0, hitCd: 0, spawnCd: 0, failWait: 0, waitMsg: '', camYaw: Math.PI, camDrag: 0 };
// 配達競争の状態(online.js から setRace でもらう)
const R = { me: null, state: null, remotes: {}, avatars: {}, sendT: 0 };
let toastT = 0;
function toast(s, t) { const e = $('toast'); e.textContent = s; e.style.opacity = 1; toastT = t || 2.2; }
function addWanted(n) { if (G.mode !== 'solo') return; const before = G.wanted; G.wanted = Math.min(5, G.wanted + n); G.evade = 0; if (G.wanted > before && before === 0) toast('警察に追われている！'); }
function beginStep() { const st = MISSIONS[G.mi].steps[G.si]; if (st.time) G.timeLeft = st.time; if (st.wanted) G.wanted = Math.max(G.wanted, st.wanted); marker.visible = st.type === 'go'; if (st.pos) marker.position.set(st.pos.x, 0, st.pos.z); }
function beginMission() { G.si = 0; G.timeLeft = -1; toast('ミッション' + (G.mi + 1) + '：' + MISSIONS[G.mi].title, 2.6); beginStep(); }
function stepDone() {
  const m = MISSIONS[G.mi]; G.si++;
  if (G.si >= m.steps.length) {
    G.money += m.reward; G.timeLeft = -1; toast('ミッション完了！ +$' + m.reward.toLocaleString(), 2.6); G.mi++; marker.visible = false;
    if (G.mi >= MISSIONS.length) { setTimeout(gameClear, 1800); G.over = true; } else { G.failWait = 2.6; G.waitMsg = '次のミッションへ…'; }
  } else { toast(m.steps[G.si - 1].done || 'チェックポイント通過！', 1.2); beginStep(); }
}
function failMission(msg) { toast(msg, 2.6); G.timeLeft = -1; marker.visible = false; G.failWait = 2.8; G.waitMsg = 'もう一度挑戦…'; }
function gameClear() {
  const t = Math.floor(G.play);
  $('clearPanel').innerHTML = '<h1>ゲームクリア！</h1><p>街いちばんの配達屋になった！</p><p>所持金：<b>$' + G.money.toLocaleString() + '</b><br>プレイ時間：<b>' + Math.floor(t / 60) + '分' + (t % 60) + '秒</b></p><p class="sub">このあと街は自由に走り回れます。</p><button class="btn-big" id="again">もう一度遊ぶ</button><button class="btn-big ghost" id="free">街を自由に走る</button>';
  $('clear').classList.remove('hidden'); $('again').onclick = () => location.reload(); $('free').onclick = () => $('clear').classList.add('hidden');
}
function busted() {
  G.money = Math.max(0, G.money - TUNE.police.fine); G.wanted = 0; G.bust = 0; removeAllPolice(); if (player.mode === 'car') exitCar(); player.x = startX; player.z = startZ;
  if (G.mi < MISSIONS.length && !G.over && (G.si > 0 || MISSIONS[G.mi].steps[0].wanted)) failMission('逮捕された！ -$1000　ミッション失敗'); else toast('逮捕された！ -$1000', 2.6);
}
function removeAllPolice() { for (let i = cars.length - 1; i >= 0; i--) if (cars[i].kind === 'police') removeCar(cars[i]); }

/* ===== 操作 ===== */
const input = { jx: 0, jy: 0, dash: false, brake: false }; const keys = {};
addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; keys[e.code] = true; if (e.code === 'KeyE' || e.code === 'KeyF') toggleCar(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let joy = null, camTouch = null, dashHeld = false;
const touchEl = $('touch'), jk = $('joyKnob');
const JX = 80, JB = 80;
function setKnob(dx, dy) { jk.style.left = (JX + dx) + 'px'; jk.style.bottom = (JB - dy) + 'px'; }
function moveJoy(e) { let dx = e.clientX - joy.sx, dy = e.clientY - joy.sy; const l = Math.hypot(dx, dy); if (l > 50) { dx *= 50 / l; dy *= 50 / l; } joy.dx = dx; joy.dy = dy; setKnob(dx, dy); }
touchEl.addEventListener('pointerdown', e => {
  if (!G.started) return; const cx = JX, cy = innerHeight - JB;
  if (!joy && Math.hypot(e.clientX - cx, e.clientY - cy) < 130) { joy = { id: e.pointerId, sx: cx, sy: cy, dx: 0, dy: 0 }; moveJoy(e); }
  else if (!camTouch) { camTouch = { id: e.pointerId, x: e.clientX }; }
  try { touchEl.setPointerCapture(e.pointerId); } catch (_) { /* なくてもよい */ }
});
touchEl.addEventListener('pointermove', e => { if (joy && e.pointerId === joy.id) moveJoy(e); else if (camTouch && e.pointerId === camTouch.id) { G.camDrag -= (e.clientX - camTouch.x) * 0.008; camTouch.x = e.clientX; } });
function endPtr(e) { if (joy && e.pointerId === joy.id) { joy = null; setKnob(0, 0); } if (camTouch && e.pointerId === camTouch.id) camTouch = null; }
touchEl.addEventListener('pointerup', endPtr); touchEl.addEventListener('pointercancel', endPtr);
$('enterBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleCar(); });
const db = $('dashBtn');
db.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dashHeld = true; db.classList.add('on'); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => db.addEventListener(t, () => { dashHeld = false; db.classList.remove('on'); }));
function readInput() {
  let jx = 0, jy = 0;
  if (keys.KeyA || keys.ArrowLeft) jx -= 1; if (keys.KeyD || keys.ArrowRight) jx += 1; if (keys.KeyW || keys.ArrowUp) jy += 1; if (keys.KeyS || keys.ArrowDown) jy -= 1;
  if (joy) { jx += joy.dx / 50; jy -= joy.dy / 50; }
  input.jx = clamp(jx, -1, 1); input.jy = clamp(jy, -1, 1);
  input.dash = dashHeld || keys.ShiftLeft || keys.ShiftRight; input.brake = (dashHeld && player.mode === 'car') || keys.Space;
}

/* ===== 車の乗り降り ===== */
function nearestEnterable() { let best = null, bd = TUNE.enterDist; for (const c of cars) { if (c.kind === 'police') continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } } return best; }
function toggleCar() {
  if (!G.started) return; if (player.mode === 'car') { exitCar(); return; }
  const c = nearestEnterable(); if (!c) return;
  if (c.kind === 'traffic' && Math.abs(c.v) > 1) { addWanted(1); if (G.mode === 'solo') toast('車を奪った！', 1.4); }
  enterCar(c);
}
function enterCar(c) { c.kind = 'player'; player.car = c; player.mode = 'car'; player.per.g.visible = false; }
function exitCar() {
  const c = player.car; if (!c) return; c.kind = 'parked';
  const rx = -Math.cos(c.h), rz = Math.sin(c.h); player.x = c.x - rx * 2.4; player.z = c.z - rz * 2.4; player.h = c.h; resolve(player, 0.5);
  player.mode = 'foot'; player.car = null; player.per.g.visible = true;
}

/* ===== 毎フレームの動き ===== */
function updatePlayer(dt) {
  if (player.mode === 'foot') {
    const a = G.camYaw; const fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    let mx = fx * input.jy + rx * input.jx, mz = fz * input.jy + rz * input.jx; const l = Math.hypot(mx, mz); let sp = 0;
    if (l > 0.08) { mx /= l; mz /= l; sp = (input.dash ? TUNE.dash : TUNE.walk) * Math.min(1, l); player.x += mx * sp * dt; player.z += mz * sp * dt; player.h += angDiff(player.h, Math.atan2(mx, mz)) * Math.min(1, 12 * dt); }
    resolve(player, 0.5);
    for (const c of cars) { const dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz); if (d < 2.1 && d > 0.001) { player.x = c.x + dx / d * 2.1; player.z = c.z + dz / d * 2.1; } }
    player.v = sp;
    const per = player.per; per.g.position.set(player.x, onWalk(player.x, player.z) ? 0.3 : 0, player.z); per.g.rotation.y = player.h; animPerson(per, sp, dt);
    $('enterBtn').textContent = '乗る'; $('enterBtn').classList.toggle('near', !!nearestEnterable()); $('dashBtn').textContent = 'ダッシュ';
  } else {
    const c = player.car; const th = input.jy, st = input.jx;
    if (input.brake) { const b = Math.min(Math.abs(c.v), TUNE.carBrake * dt); c.v -= Math.sign(c.v) * b; }
    else if (th > 0.05) { if (c.v < 0) c.v += 40 * dt * th; else c.v += TUNE.carAccel * th * dt * (1 - c.v / TUNE.carMax); }
    else if (th < -0.05) { if (c.v > 0) c.v += 38 * th * dt; else c.v = Math.max(-TUNE.carReverse, c.v + 12 * th * dt); }
    else { c.v *= 1 - 0.7 * dt; if (Math.abs(c.v) < 0.3) c.v = 0; }
    const tf = clamp(c.v / 7, -1, 1) * (Math.abs(c.v) > 22 ? 0.75 : 1); c.h -= st * TUNE.steer * dt * tf;
    c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
    if (resolveCar(c)) c.v *= Math.abs(c.v) > 3 ? -0.25 : 0.5;
    player.x = c.x; player.z = c.z; player.h = c.h; player.v = c.v;
    $('enterBtn').textContent = '降りる'; $('enterBtn').classList.remove('near'); $('dashBtn').textContent = 'ブレーキ';
  }
}
function updateTraffic(c, dt) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h); let blocked = false;
  const others = [{ x: player.x, z: player.z, same: true }];
  for (const o of cars) if (o !== c && o.kind !== 'player') others.push({ x: o.x, z: o.z, same: o.kind !== 'traffic' || (Math.sin(o.h) * fx + Math.cos(o.h) * fz) > 0.5 });
  for (const id in R.avatars) { const a = R.avatars[id]; if (a.seen) others.push({ x: a.x, z: a.z, same: true }); }
  for (const o of others) { const rx = o.x - c.x, rz = o.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 7.5 && sd < 2.4 && o.same) { blocked = true; break; } }
  if (!blocked) for (const p of peds) { if (p.down > 0) continue; const rx = p.x - c.x, rz = p.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 && sd < 2) { blocked = true; break; } }
  const tv = blocked ? 0 : 11; c.v += clamp(tv - c.v, -30 * dt, 8 * dt); c.p += c.v * dt / CELL;
  if (c.p >= 1) { c.p -= 1; const nb = neighbors(c.b).filter(n => !sameNode(n, c.a)); const nx = nb.length ? nb[Math.floor(Math.random() * nb.length)] : c.a; c.a = c.b; c.b = nx; }
  const A = nodePos(c.a), B = nodePos(c.b); const ex = (B.x - A.x) / CELL, ez = (B.z - A.z) / CELL;
  const tx = A.x + (B.x - A.x) * c.p + ez * 3.2, tz = A.z + (B.z - A.z) * c.p - ex * 3.2; const k = 1 - Math.exp(-6 * dt); c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
  c.h += angDiff(c.h, Math.atan2(ex, ez)) * Math.min(1, 5 * dt);
}
function updatePolice(c, dt, t) {
  const tx = player.x, tz = player.z, d = Math.hypot(tx - c.x, tz - c.z);
  if (c.lights) { const on = Math.floor(t * 6) % 2 === 0; c.lights[0].material.color.setHex(on ? 0xff2020 : 0x400000); c.lights[1].material.color.setHex(on ? 0x001040 : 0x2050ff); }
  if (c.rev > 0) { c.rev -= dt; c.v = -7; c.h += 1.6 * dt; }
  else {
    let gx, gz;
    if (d < 30) { gx = tx; gz = tz; c.node = null; }
    else {
      if (!c.node) c.node = nearestNode(c.x, c.z);
      let np = nodePos(c.node);
      if (Math.hypot(np.x - c.x, np.z - c.z) < 6) { let best = null, bd = 1e9; for (const n of neighbors(c.node)) { const q = nodePos(n); const dd = Math.hypot(q.x - tx, q.z - tz); if (dd < bd) { bd = dd; best = n; } } c.node = best; np = nodePos(best); }
      gx = np.x; gz = np.z;
    }
    const dh = angDiff(c.h, Math.atan2(gx - c.x, gz - c.z)); c.h += clamp(dh, -2.6 * dt, 2.6 * dt);
    const want = Math.abs(dh) > 1.2 ? 11 : (d < 8 ? Math.max(4, d * 2) : TUNE.police.speed); c.v += clamp(want - c.v, -35 * dt, 15 * dt);
  }
  c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
  if (resolveCar(c)) { c.v *= 0.3; c.stuck += dt; } else c.stuck = Math.max(0, c.stuck - dt * 0.5);
  if (c.stuck > 1.2 && c.rev <= 0) { c.rev = 1.1; c.stuck = 0; c.node = null; }
}
function updateParked(c, dt) { if (Math.abs(c.v) > 0.05) { c.v *= 1 - 2.5 * dt; c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt; if (resolveCar(c)) c.v = 0; } else c.v = 0; }
function carPairs() {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (!(a.kind === 'player' || b.kind === 'player' || a.kind === 'police' || b.kind === 'police')) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d > 3.6 || d < 0.001) continue;
    const push = (3.6 - d) / 2, nx = dx / d, nz = dz / d;
    const pl = a.kind === 'player' ? a : b.kind === 'player' ? b : null;
    if (pl) { const o = pl === a ? b : a; if (Math.abs(pl.v) > 9 && G.hitCd <= 0 && (o.kind === 'traffic' || o.kind === 'police')) { addWanted(1); G.hitCd = 3; } if (Math.abs(pl.v) > 4) { if (o.kind === 'parked') { o.v = pl.v * 0.5; o.h = pl.h; } pl.v *= -0.3; } }
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  }
  // 配達競争: ほかの人(の車)に重ならないように、自分だけ押し返す
  for (const id in R.avatars) {
    const av = R.avatars[id]; if (!av.seen) continue; const r = (av.car ? 2 : 0.6) + (player.mode === 'car' ? 2 : 0.6);
    const dx = player.x - av.x, dz = player.z - av.z, d = Math.hypot(dx, dz); if (d > r || d < 0.001) continue;
    const o = player.mode === 'car' ? player.car : player; o.x = av.x + dx / d * r; o.z = av.z + dz / d * r; player.x = o.x; player.z = o.z;
    if (player.mode === 'car' && Math.abs(player.car.v) > 4) player.car.v *= -0.3;
  }
}
function updatePeds(dt) {
  for (const p of peds) {
    if (p.down > 0) {
      p.down -= dt; p.x += p.push.x * dt; p.z += p.push.z * dt; p.push.x *= 1 - 3 * dt; p.push.z *= 1 - 3 * dt; p.per.g.position.set(p.x, 0.3, p.z);
      if (p.down <= 0) { p.per.g.rotation.x = 0; p.bi = pedBlock(); p.t = Math.random() * 160; }
      continue;
    }
    const fleeing = G.wanted >= 2; p.t += p.dir * p.speed * (fleeing ? 2.2 : 1) * dt; const q = pedPos(p); p.x = q[0]; p.z = q[1]; p.h = q[2];
    if (player.mode === 'car') { const c = player.car; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 2.4 && Math.abs(c.v) > 5) { p.down = 7; p.per.g.rotation.x = -Math.PI / 2; p.push.x = Math.sin(c.h) * c.v * 0.6; p.push.z = Math.cos(c.h) * c.v * 0.6; addWanted(1); continue; } }
    p.per.g.position.set(p.x, 0.3, p.z); p.per.g.rotation.y = p.h; animPerson(p.per, p.speed * (fleeing ? 2.2 : 1), dt);
  }
}
function managePolice(dt) {
  const want = G.wanted === 0 ? 0 : Math.min(TUNE.police.maxCars, G.wanted); const pol = cars.filter(c => c.kind === 'police');
  if (G.wanted === 0 && pol.length) { removeAllPolice(); return; }
  G.spawnCd -= dt;
  if (pol.length < want && G.spawnCd <= 0) {
    G.spawnCd = 2.5; const cand = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const q = P(i, j); const d = Math.hypot(q.x - player.x, q.z - player.z); if (d > 60 && d < 130) cand.push(q); }
    if (cand.length) { const q = cand[Math.floor(Math.random() * cand.length)]; const c = newCar('police', q.x, q.z, Math.atan2(player.x - q.x, player.z - q.z), 0); c.v = 10; }
  }
  let nd = 1e9; for (const c of pol) nd = Math.min(nd, Math.hypot(c.x - player.x, c.z - player.z));
  if (G.wanted > 0) { if (nd > TUNE.police.evadeDist) G.evade += dt; else G.evade = Math.max(0, G.evade - dt * 0.5); if (G.evade > TUNE.police.evadeTime) { G.wanted--; G.evade = 0; toast(G.wanted ? '手配度ダウン' : '逃げ切った！', 1.6); } }
  const slow = player.mode === 'foot' || Math.abs(player.car.v) < 3; const near = player.mode === 'foot' ? nd < 4.5 : nd < 6.5;
  if (G.wanted > 0 && slow && near) G.bust += dt; else G.bust = Math.max(0, G.bust - dt);
  $('warn').textContent = G.bust > 0.2 ? '逃げろ！ 捕まるぞ！' : ''; if (G.bust > TUNE.police.bustTime) busted();
}
function updateMission(dt) {
  if (G.over || G.mi >= MISSIONS.length) return;
  if (G.failWait > 0) { G.failWait -= dt; if (G.failWait <= 0) beginMission(); return; }
  const st = MISSIONS[G.mi].steps[G.si];
  if (G.timeLeft > 0) { G.timeLeft -= dt; if (G.timeLeft <= 0) { failMission('時間切れ… ミッション失敗'); return; } }
  if (st.type === 'car' && player.mode === 'car') stepDone();
  else if (st.type === 'go' && Math.hypot(st.pos.x - player.x, st.pos.z - player.z) < 5.5) stepDone();
}

/* ===== 配達競争(画面側) ===== */
const RACE_SPAWN = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10]]; // 真ん中の交差点から4方向に並ぶ
function raceHolder() { const s = R.state; return s && s.pkg && s.pkg.state === 'held' ? s.pkg.holder : null; }
function updateAvatars(dt) {
  const k = 1 - Math.exp(-10 * dt);
  for (const id in R.avatars) {
    const a = R.avatars[id], r = R.remotes[id];
    if (!r) { a.seen = false; a.carM.g.visible = false; a.per.g.visible = false; continue; }
    if (!a.seen) { a.x = r.x; a.z = r.z; a.h = r.h; a.seen = true; }
    a.x += (r.x - a.x) * k; a.z += (r.z - a.z) * k; a.h += angDiff(a.h, r.h) * k; a.car = !!r.c;
    a.carM.g.visible = a.car; a.per.g.visible = !a.car;
    if (a.car) { a.carM.g.position.set(a.x, 0, a.z); a.carM.g.rotation.y = a.h; }
    else { a.per.g.position.set(a.x, onWalk(a.x, a.z) ? 0.3 : 0, a.z); a.per.g.rotation.y = a.h; animPerson(a.per, Math.abs(r.v || 0), dt); }
  }
}
function updateRaceMarks(t) {
  const s = R.state; if (!s) { marker.visible = false; pkgMesh.visible = false; return; }
  const holder = raceHolder();
  pkgMesh.visible = true; pkgMesh.rotation.y = t * 1.5;
  if (!holder) { marker.visible = true; markerColor(0xffd23f); marker.position.set(s.pkg.x, 0, s.pkg.z); pkgMesh.position.set(s.pkg.x, 1.3 + Math.sin(t * 3) * 0.3, s.pkg.z); return; }
  let hx, hz, car;
  if (holder === R.me) { hx = player.x; hz = player.z; car = player.mode === 'car'; }
  else { const a = R.avatars[holder]; if (!a || !a.seen) { pkgMesh.visible = false; marker.visible = false; return; } hx = a.x; hz = a.z; car = a.car; }
  pkgMesh.position.set(hx, (car ? 3.0 : 3.2) + Math.sin(t * 4) * 0.15, hz);
  if (holder === R.me && s.dest) { marker.visible = true; markerColor(0x4cff6a); marker.position.set(s.dest.x, 0, s.dest.z); }
  else { marker.visible = true; markerColor(0xff4a4a); marker.position.set(hx, 0, hz); }
}
function raceName(id) { const p = R.state && R.state.players && R.state.players[id]; return p ? p.name : '?'; }
function raceColor(id) { const p = R.state && R.state.players && R.state.players[id]; return p ? '#' + (p.color >>> 0).toString(16).padStart(6, '0') : '#fff'; }

/* ===== カメラ ===== */
const camPos = new THREE.Vector3(startX, 8, startZ + 10), lookT = new THREE.Vector3();
function updateCamera(dt) {
  let dist, hgt; const target = player.mode === 'car' ? player.car.h : player.h;
  if (player.mode === 'car') { G.camYaw += angDiff(G.camYaw, target) * Math.min(1, 4 * dt); dist = 11 + Math.abs(player.car.v) * 0.08; hgt = 5; G.camDrag *= 1 - 2 * dt; }
  else { if (input.jy > -0.3 && (Math.abs(input.jx) + Math.abs(input.jy)) > 0.1) G.camYaw += angDiff(G.camYaw, target) * Math.min(1, 1.2 * dt); dist = 7.5; hgt = 3.8; if (G.camDrag) { G.camYaw += G.camDrag; G.camDrag = 0; } }
  const yaw = G.camYaw + (player.mode === 'car' ? G.camDrag : 0);
  const want = new THREE.Vector3(player.x - Math.sin(yaw) * dist, hgt, player.z - Math.cos(yaw) * dist);
  camPos.lerp(want, 1 - Math.exp(-6 * dt)); camera.position.copy(camPos); lookT.set(player.x + Math.sin(yaw) * 3, 1.6, player.z + Math.cos(yaw) * 3); camera.lookAt(lookT);
  const f = baseFov + (player.mode === 'car' ? Math.abs(player.car.v) * 0.25 : 0); if (Math.abs(camera.fov - f) > 0.1) { camera.fov += (f - camera.fov) * Math.min(1, 3 * dt); camera.updateProjectionMatrix(); }
}

/* ===== ミニマップ ===== */
const mapC = document.createElement('canvas'); mapC.width = mapC.height = 720;
(function () {
  const g = mapC.getContext('2d'), s = 2, o = 180; const X = x => (x + o) * s;
  g.fillStyle = '#4f7f3e'; g.fillRect(0, 0, 720, 720); g.fillStyle = '#3b7fc4'; g.fillRect(X(175), 0, 720, 720);
  g.fillStyle = '#a8a8a0'; g.fillRect(X(162), X(-170), 13 * s, 340 * s); g.fillStyle = '#555'; g.fillRect(X(-HALF - 6), X(-HALF - 6), (HALF * 2 + 12) * s, (HALF * 2 + 12) * s);
  for (const b of blocks) { g.fillStyle = b.park ? '#4f8f3a' : '#8d8d8d'; g.fillRect(X(b.x0), X(b.z0), 40 * s, 40 * s); }
  for (const m of MERGES) { const r = mergeRect(m); g.fillStyle = m.kind === 'park' ? '#4f8f3a' : m.kind === 'market' ? '#7a4a3a' : '#8d8d8d'; g.fillRect(X(r.x0), X(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); }
  g.fillStyle = '#d6d6d6'; for (const b of buildings) g.fillRect(X(b.x - b.w / 2), X(b.z - b.d / 2), b.w * s, b.d * s);
})();
const mm = $('mm'), mg = mm.getContext('2d');
function drawMinimap() {
  const W = 260, Rr = 130, sc = 1.3; mg.clearRect(0, 0, W, W); mg.save(); mg.beginPath(); mg.arc(Rr, Rr, Rr, 0, Math.PI * 2); mg.clip(); mg.fillStyle = '#222'; mg.fillRect(0, 0, W, W);
  const a = G.camYaw, th = -Math.PI / 2 - Math.atan2(Math.cos(a), Math.sin(a));
  mg.translate(Rr, Rr); mg.rotate(th); mg.scale(sc, sc); mg.drawImage(mapC, -180 - player.x, -180 - player.z, 360, 360);
  mg.rotate(Math.atan2(Math.cos(player.h), Math.sin(player.h)) + Math.PI / 2); mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(0, 2); mg.lineTo(-5, 5); mg.closePath(); mg.fill(); mg.restore();
  const ct = Math.cos(th), stn = Math.sin(th);
  function dot(x, z, col, r, clampIt) { const dx = (x - player.x) * sc, dz = (z - player.z) * sc; let sx = dx * ct - dz * stn, sy = dx * stn + dz * ct; const l = Math.hypot(sx, sy); if (l > Rr - 10) { if (!clampIt) return; sx *= (Rr - 10) / l; sy *= (Rr - 10) / l; } mg.fillStyle = col; mg.beginPath(); mg.arc(Rr + sx, Rr + sy, r, 0, Math.PI * 2); mg.fill(); mg.strokeStyle = '#000'; mg.lineWidth = 1.5; mg.stroke(); }
  for (const c of cars) if (c.kind === 'police') dot(c.x, c.z, (Math.floor(performance.now() / 250) % 2) ? '#ff3030' : '#3060ff', 6, false);
  for (const id in R.avatars) { const av = R.avatars[id]; if (av.seen) dot(av.x, av.z, raceColor(id), 7, true); }
  if (marker.visible) dot(marker.position.x, marker.position.z, '#' + ringMat.color.getHexString(), 9, true);
}

/* ===== 画面の文字 ===== */
function updateHUD() {
  if (G.mode === 'race') { updateRaceHUD(); return; }
  const m = MISSIONS[G.mi]; let html = '';
  if (G.over || !m) html = '<div class="t">フリー走行</div>街を自由に走り回ろう';
  else if (G.failWait > 0) html = '<div class="t">ミッション' + (G.mi + 1) + '</div>' + G.waitMsg;
  else { const st = m.steps[G.si]; html = '<div class="t">ミッション' + (G.mi + 1) + '/' + MISSIONS.length + '：' + m.title + '</div>' + st.text; if (st.type === 'go') { const d = Math.hypot(st.pos.x - player.x, st.pos.z - player.z); html += '<div class="d">あと ' + Math.round(d) + ' m</div>'; } }
  $('mission').innerHTML = html; $('money').textContent = '$' + G.money.toLocaleString();
  let s = ''; for (let i = 0; i < 5; i++) s += '<span style="color:' + (i < G.wanted ? '#ffd23f' : 'rgba(255,255,255,.35)') + '">★</span>'; $('stars').innerHTML = s;
  $('timer').textContent = G.timeLeft > 0 ? '残り ' + Math.ceil(G.timeLeft) + ' 秒' : ''; $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : '';
}
function updateRaceHUD() {
  const s = R.state; let html = '<div class="t">配達競争：' + ((s && s.target) || 3) + '点先取</div>';
  if (!s) html += '準備中…';
  else if (s.phase === 'end') html += 'おわり！';
  else {
    const holder = raceHolder();
    if (!holder) { html += '荷物(黄色い光)を取りに行け！'; html += '<div class="d">あと ' + Math.round(Math.hypot(s.pkg.x - player.x, s.pkg.z - player.z)) + ' m</div>'; }
    else if (holder === R.me) { html += '届け先(緑の光)へ急げ！<div class="d">ぶつかられると取られるぞ'; if (s.dest) html += '・あと ' + Math.round(Math.hypot(s.dest.x - player.x, s.dest.z - player.z)) + ' m'; html += '</div>'; }
    else html += '<b style="color:' + raceColor(holder) + '">' + esc(raceName(holder)) + '</b> から荷物を奪え！<div class="d">赤い光の人にぶつかろう</div>';
  }
  $('mission').innerHTML = html;
  let sc = '';
  if (s && s.players) for (const id of Object.keys(s.players).sort((a, b) => (s.players[a].slot || 0) - (s.players[b].slot || 0))) sc += '<div' + (id === R.me ? ' class="me"' : '') + '><span class="dot" style="background:' + raceColor(id) + '"></span>' + esc(s.players[id].name) + '　' + ((s.scores && s.scores[id]) || 0) + '点</div>';
  $('scores').innerHTML = sc; $('money').textContent = ''; $('stars').innerHTML = ''; $('timer').textContent = '';
  $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : '';
}

/* ===== ループ ===== */
let last = performance.now(), T = 0, hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (G.started) {
    readInput(); updatePlayer(dt);
    for (const c of cars) { if (c.kind === 'traffic') updateTraffic(c, dt); else if (c.kind === 'police') updatePolice(c, dt, T); else if (c.kind === 'parked') updateParked(c, dt); }
    if (G.mode === 'race') updateAvatars(dt);
    carPairs(); updatePeds(dt);
    if (G.mode === 'solo') { managePolice(dt); updateMission(dt); }
    else { $('warn').textContent = ''; updateRaceMarks(T); R.sendT -= dt; if (R.sendT <= 0 && SC.onSend) { R.sendT = TUNE.posRate; SC.onSend(SC.getMe()); } }
    G.hitCd -= dt; G.play += dt;
    for (const c of cars) { c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h; }
    updateCamera(dt); marker.rotation.y += dt; ring.position.y = 0.4 + Math.sin(T * 3) * 0.2;
    hudT -= dt; if (hudT <= 0) { updateHUD(); hudT = 0.1; } drawMinimap();
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  } else {
    for (const c of cars) { if (c.kind === 'traffic') updateTraffic(c, dt); c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h; }
    updatePeds(dt);
    const a = T * 0.08; camera.position.set(Math.sin(a) * 150, 70, Math.cos(a) * 150); camera.lookAt(0, 0, 0); player.per.g.position.set(player.x, 0.3, player.z);
  }
  renderer.render(scene, camera); requestAnimationFrame(frame);
}

/* ===== 画面の切りかえ ===== */
function showOnly(id) { for (const s of ['start', 'lobby', 'result', 'clear']) $(s).classList.toggle('hidden', s !== id); }
function setPlaying(on) { document.body.classList.toggle('playing', on); G.started = on; }
function resetPlayerToFoot(x, z, h) { if (player.mode === 'car') exitCar(); player.x = x; player.z = z; player.h = h; player.per.g.visible = true; G.camYaw = h; camPos.set(x - Math.sin(h) * 8, 6, z - Math.cos(h) * 8); }
// Android: スタートを押したら全画面にして横に固定する(iPhone はできないので、縦のときは「横にしてね」の警告だけ)
function lockLandscape() {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)) return;
  const d = document.documentElement; if (!d.requestFullscreen || document.fullscreenElement) return;
  d.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => { /* できなくてもよい */ });
}
$('goOnline').addEventListener('click', lockLandscape);
function startSolo() {
  lockLandscape();
  G.mode = 'solo'; showOnly(null); setPlaying(true); resetPlayerToFoot(startX, startZ, startH); beginMission();
  if (window.BackGuard) BackGuard.set('game', () => location.reload());
}
$('goSolo').addEventListener('click', startSolo);
$('quitBtn').addEventListener('click', () => { if (G.mode === 'solo') location.reload(); else if (SC.onQuit) SC.onQuit(); });
if (window.BackGuard) BackGuard.set('home');

const SC = window.SC = {
  G, R, player, cars, peds, TUNE, MISSIONS, P,
  onSend: null, onQuit: null,
  startSolo,
  showOnly, setPlaying,
  onRoad: (x, z) => !inMerged(x, z), // 道路の上か(つなげた区画の中は道路ではない)
  extraSpots: EXTRA_SPOTS,
  // 配達競争を始める。slot は 0〜3(並ぶ場所)
  startRace(meId, slot, color) {
    G.mode = 'race'; G.wanted = 0; removeAllPolice(); R.me = meId; R.state = null; R.remotes = {};
    const sp = RACE_SPAWN[slot % 4], c0 = P(3, 3); const x = c0.x + sp[0] * sp[2] + sp[1] * 3.2, z = c0.z + sp[1] * sp[2] - sp[0] * 3.2, h = Math.atan2(sp[0], sp[1]);
    resetPlayerToFoot(x, z, h);
    if (R.myCar) removeCar(R.myCar);
    const car = R.myCar = newCar('parked', x, z, h, color || 0xffffff);
    enterCar(car);
    showOnly(null); setPlaying(true); toast('配達競争スタート！', 2.2);
  },
  stopRace() {
    if (G.mode !== 'race') return;
    for (const id in R.avatars) { scene.remove(R.avatars[id].carM.g); scene.remove(R.avatars[id].per.g); }
    R.avatars = {}; R.remotes = {}; R.state = null; marker.visible = false; pkgMesh.visible = false;
    $('scores').innerHTML = ''; setPlaying(false); G.mode = 'menu'; resetPlayerToFoot(startX, startZ, startH);
  },
  // ほかの人の位置 { id: { x, z, h, c(車なら1), v } }
  setRemotes(pos) {
    const s = R.state; R.remotes = {};
    for (const id in pos || {}) {
      if (id === R.me || !s || !s.players || !s.players[id]) continue;
      R.remotes[id] = pos[id];
      if (!R.avatars[id]) { const col = s.players[id].color; R.avatars[id] = { carM: makeCarMesh(col, false), per: makePerson(col, 0x23324f, 0xf0c9a0), x: 0, z: 0, h: 0, seen: false, car: false }; }
    }
  },
  // 試合の状態(ホストが決めたもの)
  setRace(s) {
    const prev = R.state; R.state = s;
    if (!s || !prev) return;
    const ph = prev.pkg && prev.pkg.state === 'held' ? prev.pkg.holder : null, nh = s.pkg && s.pkg.state === 'held' ? s.pkg.holder : null;
    let scored = null; for (const id in s.scores || {}) if ((s.scores[id] || 0) > ((prev.scores && prev.scores[id]) || 0)) scored = id;
    if (scored) toast((scored === R.me ? 'あなた' : raceName(scored)) + 'が配達成功！ ' + s.scores[scored] + '点', 2.4);
    else if (nh && nh !== ph) {
      if (nh === R.me) toast(ph ? '荷物を奪った！' : '荷物ゲット！ 届け先へ急げ', 2);
      else if (ph === R.me) toast(raceName(nh) + 'に荷物を奪われた！', 2);
      else toast(raceName(nh) + 'が荷物を' + (ph ? '奪った' : '取った'), 2);
    }
  },
  getMe() { return { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10, h: Math.round(player.h * 100) / 100, c: player.mode === 'car' ? 1 : 0, v: Math.round((player.v || 0) * 10) / 10 }; },
  toast,
};
requestAnimationFrame(frame);
})();
