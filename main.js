/* SURVIVE CHINATOWN 本体(街・車・人・警察・ひとり用ミッション・配達競争の画面側)
   オンラインの通信は online.js がやる。ここは window.SC で、通信係とやりとりする。
   - ひとり用: SC.startSolo()
   - 配達競争: SC.startRace(slot, color) → SC.setRace(state) / SC.setRemotes(pos) → SC.stopRace() */
(function () {
'use strict';
const tr = window.t || (k => k); // ことば(i18n.js)。日本語の文を入れると、えらんだ言語の文が返ってくる
window.addEventListener('error', e => { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent = tr('エラー: ') + e.message; });
if (typeof THREE === 'undefined') { const d = document.getElementById('err'); d.style.display = 'block'; d.textContent = tr('3Dの道具(Three.js)を読みこめませんでした。ページを開き直してね'); return; }

/* ===== 調整用の数字 ===== */
const TUNE = {
  walk: 5, dash: 9.5,              // 歩く・走る速さ
  carMax: 35, carAccel: 19,        // 車の最高速度(35 = 約126km/h)と加速
  copCarMax: 38,                   // 奪ったパトカーの最高速度(38 = 約137km/h。ふつうの車より少し速い)
  copCarWanted: 2,                 // パトカーを奪ったときに上がる手配度
  carBrake: 45, carReverse: 10,    // ブレーキ・バックの最高速度
  steer: 1.9,                      // ハンドルの効き
  enterDist: 4.8,                  // 車に乗れる距離
  trafficCars: 12, parkedCars: 10, peds: 22,
  // 警察: パトカーの数・速さ、逃げ切る距離と秒、逮捕までの秒、罰金
  //   警察官: 走る速さ・体力・つかまえる距離・車から引きずり出すまでの秒・パトカーが止まって警察官が降りる距離
  police: { maxCars: 4, speed: 28, evadeDist: 55, evadeTime: 10, bustTime: 2.0, fine: 1000, copSpeed: 6.5, copHp: 80, catchDist: 1.8, pullTime: 0.7, deployDist: 16 },
  driver: { hp: 60, angry: 1 / 3, speed: 4.4, flee: 6, dmg: 5 }, // 車を奪われた運転手: 体力・おそってくる割合・速さ・逃げる速さ・パンチ
  armor: 50, healItem: 50, maxHeal: 3, // 防弾チョッキ・持っておく回復(体力+50、3つまで)
  posRate: 0.125,                  // 配達競争: 自分の位置を送る間隔(秒)
  hp: 100, deathFine: 0.1,         // 主人公の体力、やられたときに減るお金(所持金の1割。最低$100)
  gang: { count: 16, hp: 100, speed: 4.2, turf: 15, giveUp: 32, respawn: 30 }, // ギャング: 数(街)・体力・走る速さ・なわばりの広さ・あきらめる距離・生きかえるまでの秒
  // 昼と夜(v=12): 1日の秒・夕方が始まる秒・夜が始まる秒・ひとり用が始まる秒・配達競争とスタート画面の時間(夜)・時間の速さ(0 で止まる)
  //   far = 人がふえたり減ったりするのは、主人公からこれだけはなれた所だけ(目の前で急に消えないように)
  //   gangNight = 夜のマフィアの倍(昼は街のマフィアが半分)、pedEve = 夕方の街の人の倍、dayEvade = 昼に★がへるまでの時間の倍
  day: { len: 720, eve: 300, night: 420, start: 40, race: 560, speed: 1, far: 60, gangNight: 1.5, pedEve: 1.5, dayEvade: 1.5 },
};
const DAY = TUNE.day;

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
const hemi = new THREE.HemisphereLight(0x8a98d0, 0x3a2c26, 0.85); scene.add(hemi);
const NIGHT_MATS = [], GLOW_MATS = []; let starPts = null, moonM = null, sunM = null; // 昼と夜で変えるもの(窓の明かり・地面の光・星・月・太陽)
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
function nightMat(cols, rows, base, lit, ct) { const t = nightWin(cols, rows, base, lit, ct), m = new THREE.MeshLambertMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.em }); NIGHT_MATS.push(m); return m; }
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
// 病院と、チャイナタウンの外の店(建物はあとで buildSpecial で作る)
const SPECIAL = { '5_4': 'hospital', '0_2': 'gun', '2_5': 'drug' };
const specialBlocks = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const x0 = roadC(i) + 6, x1 = roadC(i + 1) - 6, z0 = roadC(j) + 6, z1 = roadC(j + 1) - 6, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const sp = SPECIAL[i + '_' + j];
  if (sp) { blocks.push({ x0, x1, z0, z1, park: false }); addBox(40, 0.3, 40, cx, 0.15, cz, M(0xb8b8b8)); specialBlocks.push({ kind: sp, x0, x1, z0, z1, cx, cz }); continue; }
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
const MK_SPOTS = []; // 市場の武器(豚の頭・ヘビ・青龍刀)が出る場所
const STALLS = []; // 市場の屋台の場所(屋台の人を立たせるのに使う)
const SHOPS = []; // 店(武器屋・薬屋)の入口の光るマーク
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
  scene.add(g); colRot(x, z, len, 2.3, r); STALLS.push({ x, z, r });
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
  // 市場の武器: 豚の頭3か所・ヘビ2か所・青龍刀1か所(迷路のマスのまん中)
  for (const [kind, r, c] of [['pig', 0, 3], ['pig', 2, 6], ['pig', 3, 10], ['snake', 1, 1], ['snake', 3, 2], ['dao', 2, 11]]) MK_SPOTS.push({ kind, x: ix0 + (c + 0.5) * cw, z: iz0 + (r + 0.5) * ch });
  for (let r = 0; r < Rw; r++) { lanternString(ix0, 4.8, iz0 + (r + 0.5) * ch, ix1, 4.8, iz0 + (r + 0.5) * ch, 22, 0.8); for (let c = 0; c < C; c += 2) GLOWS.push([ix0 + (c + 0.5) * cw, iz0 + (r + 0.5) * ch, 4, 0]); }
}
/* ===== 病院・店 ===== */
// 店や病院の建物(正面がローカルの +z。r で向きを変える)。1階は光る店先、正面に看板
function specialBuilding(x, z, w, d, h, r, wall, word, bg, fg) {
  const g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = r;
  const m = nightMat(Math.max(2, Math.round(w / 3)), Math.max(1, Math.round(h / 3.5)), wall, 0.5, false);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, M(0x3a3a40), M(0x3a3a40), m, m]); body.position.y = h / 2; g.add(body);
  const sf = new THREE.Mesh(BG(Math.min(w - 1, 8), 2.6, 0.1), shopMat); sf.position.set(0, 1.4, d / 2 + 0.06); g.add(sf);
  const s = new THREE.Mesh(BG(word.length * 1.5 + 1, 1.5, 0.2), hSignMat(word, bg, fg)); s.position.set(0, 3.7, d / 2 + 0.15); g.add(s);
  scene.add(g); colRot(x, z, w, d, r); return g;
}
// 店の入口の光るマーク(緑=薬屋、赤=武器屋)。ここに立つと買い物の画面が出る
function shopMark(kind, name, x, z) {
  const col = kind === 'gun' ? 0xff5a3a : 0x4cff6a, g = new THREE.Group();
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 16, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })); bm.position.y = 2.8; g.add(bm);
  const rg = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.15, 6, 24), new THREE.MeshBasicMaterial({ color: col })); rg.rotation.x = Math.PI / 2; rg.position.y = 0.5; g.add(rg);
  g.position.set(x, 0, z); scene.add(g); GLOWS.push([x, z, 3, kind === 'gun' ? 0 : 1]);
  SHOPS.push({ kind, name, x, z, g, ring: rg });
}
const greenCrossMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#16a34a'; g.fillRect(24, 8, 16, 48); g.fillRect(8, 24, 48, 16); }) });
function buildSpecial(b) {
  if (b.kind === 'hospital') { // 白い建物と緑の十字。正面は北(道路)
    const z = b.z0 + 2 + 10;
    specialBuilding(b.cx, z, 32, 20, 13, Math.PI, '#e8ecef', '病院', '#ffffff', '#16a34a');
    for (const sx of [-11, 11]) { const c = addBox(3.2, 3.2, 0.2, b.cx + sx, 9, b.z0 + 1.9, greenCrossMat); c.rotation.y = Math.PI; }
    addBox(8, 0.3, 3, b.cx, 3.2, b.z0 + 0.6, M(0xdddddd)); // 入口のひさし
    GLOWS.push([b.cx, b.z0 + 1, 6, 2]);
  } else if (b.kind === 'gun') { // 武器屋。正面は東(チャイナタウンの方)
    const x = b.x1 - 2 - 5;
    specialBuilding(x, b.cz, 14, 10, 7, Math.PI / 2, '#5a5a62', '武器', '#1a1a1a', '#ff5a3a');
    makeBuilding(b.x0 + 12, b.cz, 18, 30, 16);
    shopMark('gun', '武器屋', b.x1 - 1.2, b.cz);
  } else if (b.kind === 'drug') { // 薬屋。正面は北
    const z = b.z0 + 2 + 5;
    specialBuilding(b.cx, z, 14, 10, 7, Math.PI, '#d8d2c4', '薬局', '#0e3a1e', '#9dffb0');
    makeBuilding(b.cx, b.z1 - 10, 30, 18, 14);
    shopMark('drug', '薬屋', b.cx, b.z0 + 0.8);
  }
}
(function buildChinatown() {
  for (const b of blocks) {
    if (!b.ct || b.market) continue;
    if (b.i === 3 && b.j === 2) { pagoda((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); continue; }
    if (b.i === 3 && b.j === 4) { // チャイナタウンの中の薬屋(漢方の店)。北の通りに面している
      const cx = (b.x0 + b.x1) / 2;
      shopsAround(b.x0, b.x1, b.z0, b.z1, 9, 2, { n: [[cx - 7, cx + 7]] });
      const g = specialBuilding(cx, b.z0 + 2 + 4.5, 14, 9, 9, Math.PI, '#3f6b5a', '漢方薬', '#0e3a1e', '#9dffb0');
      const rf = new THREE.Mesh(roofGeo(15.4, 10.4, 2.2, 0.9), ctRoof(0x9a3324)); rf.position.y = 9; g.add(rf);
      for (const sx of [-5.5, 5.5]) LANTERNS.push([cx + sx, 3.0, b.z0 + 1.4, 0.7, 1]);
      shopMark('drug', '漢方薬局', cx, b.z0 + 0.8);
      continue;
    }
    shopsAround(b.x0, b.x1, b.z0, b.z1, 9, 2);
  }
  for (const b of specialBlocks) buildSpecial(b);
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
    GLOW_MATS.push({ m: mat, o: mat.opacity });
    const im = new THREE.InstancedMesh(gg, mat, L.length), o = new THREE.Object3D();
    L.forEach((l, i) => { o.position.set(l[0], inMarket(l[0], l[1]) ? 0.37 : 0.33, l[1]); o.scale.setScalar(l[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); scene.add(im);
  });
  // 星と月
  const sv = []; for (let k = 0; k < 500; k++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3; sv.push(Math.cos(a) * Math.cos(e) * 600, Math.sin(e) * 600, Math.sin(a) * Math.cos(e) * 600); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); starPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true })); scene.add(starPts);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false })); moon.position.set(-320, 230, -420); scene.add(moon); moonM = moon;
  sunM = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false })); sunM.position.set(300, 300, 380); sunM.visible = false; scene.add(sunM);
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
  scene.add(g); return { g, body, head, hair, legL, legR, armL, armR, phase: 0 };
}
function animPerson(p, speed, dt) { p.phase += dt * (2 + speed * 1.6); const s = Math.sin(p.phase) * Math.min(speed / 4, 1) * 0.9; p.legL.rotation.x = s; p.legR.rotation.x = -s; p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8; }

/* ===== 車・歩行者・自分 ===== */
const carColors = [0xd33c3c, 0x3c6fd3, 0xf0f0f0, 0x222222, 0xe0a020, 0x2f9e5a, 0x9a4fc4, 0x808890, 0xff7a30];
const cars = [];
function newCar(kind, x, z, h, color) { const m = makeCarMesh(color, kind === 'police'); const c = { kind, x, z, h, v: 0, mesh: m.g, lights: m.lights, stuck: 0, rev: 0, color, cop: kind === 'police', crew: kind === 'police' ? 1 + Math.floor(Math.random() * 2) : 0 }; cars.push(c); return c; }
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
  const look = [shirts[i % shirts.length], [0x2a3550, 0x333333, 0x5a4030][i % 3], [0xf0c9a0, 0xc89870, 0x8a5a3a][i % 3]], per = makePerson(look[0], look[1], look[2]);
  peds.push({ per, look, bi: pedBlock(), t: rnd() * 160, dir: rnd() < 0.5 ? 1 : -1, speed: 1.2 + rnd() * 0.8, down: 0, x: 0, z: 0, h: 0, push: { x: 0, z: 0 } });
}
const player = { mode: 'foot', x: startX, z: startZ, h: startH, car: null, per: makePerson(0xffd23f, 0x23324f, 0xf0c9a0) };
/* ===== 体力・こうげき・ギャング(ひとり用) ===== */
// 主人公の武器(ダメージ・とどく距離・次に使えるまでの秒)
const WEAPONS = {
  fist: { name: '素手', dmg: 15, range: 1.9, cd: 0.45, melee: true },
  knife: { name: '刀', dmg: 30, range: 2.5, cd: 0.6, melee: true },
  katana: { name: '日本刀', dmg: 40, range: 2.8, cd: 0.6, melee: true }, // 武器屋で買う
  pistol: { name: 'ピストル', dmg: 25, range: 38, cd: 0.35, melee: false },
  mg: { name: 'マシンガン', dmg: 15, range: 34, cd: 0.125, melee: false, auto: true, spread: 0.06 }, // 押している間ずっと撃つ(1秒に8発)
  // 市場で拾う武器(v=11)。thrown = 投げる(ねらい方は銃と同じ。軌道が出る)
  dao: { name: '青龍刀', dmg: 55, range: 3.0, cd: 0.8, melee: true },
  pig: { name: '豚の頭', dmg: 40, range: 15, cd: 0.6, melee: false, thrown: true }, // 当たると頭にかぶさって、前が見えなくなる
  snake: { name: 'ヘビ', dmg: 0, range: 15, cd: 0.6, melee: false, thrown: true }, // 当たると、その場で止まる
};
// 市場の武器: 持てる数・また出てくるまでの秒・豚の頭で前が見えない秒・ヘビで止まる秒・投げる速さ・当たる近さ
const MKT = { max: 3, respawn: 60, blind: 4, freeze: 5, speed: 18, hitR: 1.0 };
// ねらい方(ピストル・マシンガン): こうげきボタンを倒すと照準線、離すと撃つ。軽くタップは向いている方へ
const AIM = { dead: 16, max: 18, assist: 0.12, tapAssist: 0.35, wait: 0.4 }; // 倒したと見なす距離(px)・ボタンが動く距離(px)・ねらった方への自動補正(ラジアン)・タップのときの補正・撃てるまで待つ秒
// ギャングの武器
const GANG_W = { fist: { dmg: 5, cd: 1.0, range: 1.8 }, knife: { dmg: 12, cd: 1.1, range: 2.2 }, pistol: { dmg: 8, cd: 1.5, range: 18 } };
// 病院(東側の白い建物)。やられたら、この前で目がさめる(道路の方を向いて)
const HOSPITAL = { x: roadC(5) + 26, z: roadC(4) + 6.8, h: Math.PI };
Object.assign(player, { hp: TUNE.hp, inv: ['fist'], wi: 0, ammo: 0, mg: 0, pigs: 0, snakes: 0, atkCd: 0, swing: 0, item: null, armor: 0, heals: 0 }); // ammo = ピストルの弾、mg = マシンガンの弾、pigs = 豚の頭の数、snakes = ヘビの数

// 豚の頭・ヘビ(まん中が原点)
function marketItem(type) {
  const g = new THREE.Group(), add = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), M(col)); m.position.set(x, y, z); g.add(m); };
  if (type === 'pig') { add(0.6, 0.55, 0.6, 0xf2a6a6, 0, 0, 0); add(0.3, 0.22, 0.12, 0xe07b84, 0, -0.06, 0.35); for (const ex of [-0.2, 0.2]) { add(0.15, 0.2, 0.08, 0xe89090, ex, 0.34, 0); add(0.07, 0.07, 0.04, 0x222222, ex * 0.7, 0.1, 0.31); } }
  else { for (let k = 0; k < 6; k++) add(0.14, 0.14, 0.3, k % 2 ? 0x3fae4a : 0x2a8a3a, k % 2 ? 0.1 : -0.1, 0, -0.6 + k * 0.26); add(0.2, 0.16, 0.24, 0x2a8a3a, 0, 0, 0.95); add(0.04, 0.03, 0.16, 0xe23a3a, 0, 0, 1.14); }
  return g;
}
function handItem(type) {
  const g = new THREE.Group();
  if (type === 'katana') { const b = new THREE.Mesh(BG(0.06, 0.1, 1.5), M(0xe8ecf2)); b.position.z = 0.8; g.add(b); const gd = new THREE.Mesh(BG(0.22, 0.05, 0.08), M(0xc8a040)); gd.position.z = 0.04; g.add(gd); const h = new THREE.Mesh(BG(0.09, 0.09, 0.4), M(0x1a1a2a)); h.position.z = -0.18; g.add(h); }
  else if (type === 'knife') { const b = new THREE.Mesh(BG(0.07, 0.07, 1.1), M(0xd8dce4)); b.position.z = 0.55; g.add(b); const h = new THREE.Mesh(BG(0.1, 0.1, 0.3), M(0x2a1a10)); h.position.z = -0.05; g.add(h); }
  else if (type === 'pistol') { const b = new THREE.Mesh(BG(0.12, 0.14, 0.45), M(0x111111)); b.position.z = 0.15; g.add(b); const h = new THREE.Mesh(BG(0.1, 0.25, 0.12), M(0x222222)); h.position.set(0, -0.15, -0.02); g.add(h); }
  else if (type === 'mg') { const b = new THREE.Mesh(BG(0.14, 0.18, 0.95), M(0x1c2024)); b.position.z = 0.35; g.add(b); const h = new THREE.Mesh(BG(0.1, 0.28, 0.12), M(0x2a2e33)); h.position.set(0, -0.18, 0.02); g.add(h); const mag = new THREE.Mesh(BG(0.08, 0.3, 0.14), M(0x3a3e44)); mag.position.set(0, -0.2, 0.32); g.add(mag); }
  else if (type === 'dao') { const b = new THREE.Mesh(BG(0.06, 0.26, 1.2), M(0xdfe4ea)); b.position.z = 0.85; g.add(b); const tip = new THREE.Mesh(BG(0.06, 0.36, 0.5), M(0xdfe4ea)); tip.position.set(0, 0.05, 1.25); g.add(tip); const gd = new THREE.Mesh(BG(0.3, 0.08, 0.08), M(0xc8a040)); gd.position.z = 0.22; g.add(gd); const h = new THREE.Mesh(BG(0.09, 0.09, 0.5), M(0x7a1a1a)); h.position.z = -0.05; g.add(h); const ts = new THREE.Mesh(BG(0.08, 0.3, 0.08), M(0xe23a3a)); ts.position.set(0, -0.2, -0.32); g.add(ts); }
  else if (type === 'pig' || type === 'snake') { const it = marketItem(type); if (type === 'pig') it.position.set(0, -0.15, 0.2); else { it.position.z = 0.3; it.scale.set(0.7, 0.7, 0.7); } g.add(it); }
  g.position.y = -0.85; return g;
}
function setHand(per, holder, type) { if (holder.item) { per.armR.remove(holder.item); holder.item = null; } if (type && type !== 'fist') { holder.item = handItem(type); per.armR.add(holder.item); } }

// 壁にじゃまされずに見えるか(弾が通るか)
function pointBlocked(x, z) { for (const c of colGrid.get(gk(gc(x), gc(z))) || []) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true; return false; }
function lineClear(x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 1.2); for (let i = 1; i < n; i++) if (pointBlocked(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n)) return false; return true; }

// 見た目だけのもの(弾のすじ・火花)
const fx = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a });
function tracer(x0, z0, x1, z1) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 1.6, z0, x1, 1.5, z1], 3)); const l = new THREE.Line(g, tracerMat); scene.add(l); fx.push({ m: l, t: 0.08, geo: g }); }
function spark(x, y, z) { const m = new THREE.Mesh(BG(0.35, 0.35, 0.35), MB(0xffd23f)); m.position.set(x, y, z); scene.add(m); fx.push({ m, t: 0.12 }); }
function updateFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt; if (f.t <= 0) { scene.remove(f.m); if (f.geo) f.geo.dispose(); fx.splice(i, 1); } } }

// 落ちている物(お金・武器)
const pickups = [];
function dropPickup(kind, x, z, val) {
  const g = new THREE.Group();
  if (kind === 'money') { const b = new THREE.Mesh(BG(0.7, 0.18, 0.4), MB(0x4fd16a)); g.add(b); const s = new THREE.Mesh(BG(0.72, 0.2, 0.1), MB(0xe8f5d0)); g.add(s); }
  else { const it = handItem(kind); it.position.y = 0; it.rotation.x = Math.PI / 2; g.add(it); }
  g.position.set(x, 0.9, z); scene.add(g); pickups.push({ kind, x, z, val, g, life: 60 });
}
function addWeapon(k, ammo) {
  if (!player.inv.includes(k)) player.inv.push(k);
  if (k === 'pistol') player.ammo += ammo || 0;
  if (k === 'mg') player.mg += ammo || 0;
  if (k === 'pig') player.pigs = Math.min(MKT.max, player.pigs + 1);
  if (k === 'snake') player.snakes = Math.min(MKT.max, player.snakes + 1);
  player.wi = player.inv.indexOf(k); setHand(player.per, player, k);
}
function updatePickups(dt, t) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.life -= dt; p.g.rotation.y = t * 2; p.g.position.y = 0.9 + Math.sin(t * 3 + i) * 0.15;
    let take = false;
    if (G.mode === 'solo' && player.hp > 0) { const d = Math.hypot(player.x - p.x, player.z - p.z); take = d < (player.mode === 'car' ? 2.6 : 1.6) && (p.kind === 'money' || player.mode === 'foot'); }
    if (take) {
      if (p.kind === 'money') { G.money += p.val; toast('+$' + p.val, 1); }
      else { addWeapon(p.kind, p.val); toast(tr('{w}をひろった！', { w: tr(WEAPONS[p.kind].name) }) + (p.kind === 'pistol' ? tr(' (弾+{n})', { n: p.val }) : ''), 1.4); }
    }
    if (take || p.life <= 0) { scene.remove(p.g); pickups.splice(i, 1); }
  }
}

// ギャング(黒い服とサングラス)
const gangs = [];
function gangSpot() {
  for (let k = 0; k < 50; k++) {
    const b = blocks[Math.floor(rnd() * blocks.length)]; if (b.market || (b.merged && !b.park)) continue;
    const o = 1.3, L = 40 - 2 * o, t = rnd() * 4 * L, s = Math.floor(t / L), f = t - s * L, x0 = b.x0 + o, z0 = b.z0 + o;
    const q = s === 0 ? [x0 + f, z0] : s === 1 ? [x0 + L, z0 + f] : s === 2 ? [x0 + L - f, z0 + L] : [x0, z0 + L - f];
    if (Math.hypot(q[0] - startX, q[1] - startZ) < 35 || Math.hypot(q[0] - HOSPITAL.x, q[1] - HOSPITAL.z) < 30) continue;
    return q;
  }
  return [roadC(1) + 26, roadC(1) + 8];
}
function newGang(x, z) {
  const per = makePerson(0x141414, 0x1a1a1a, [0xf0c9a0, 0xc89870, 0x8a5a3a][Math.floor(rnd() * 3)]);
  const gl = new THREE.Mesh(BG(0.5, 0.1, 0.05), M(0x050505)); gl.position.set(0, 2.2, 0.29); per.g.add(gl);
  const r = rnd(), weapon = r < 0.45 ? 'fist' : r < 0.75 ? 'knife' : 'pistol';
  const g = { per, x, z, h: rnd() * 6.28, home: { x, z }, hp: TUNE.gang.hp, weapon, state: 'idle', cd: 0, dead: -1, wt: 0, tx: x, tz: z, swing: 0, hitCd: 0, kx: 0, kz: 0, item: null };
  setHand(per, g, weapon); gangs.push(g); return g;
}
for (let i = 0; i < TUNE.gang.count; i++) { const q = gangSpot(); newGang(q[0], q[1]); }
for (const k of [0, 4, 10]) { const s = EXTRA_SPOTS[k]; if (s) newGang(s.x, s.z); } // 市場の中にも
// 昼と夜: tier 0 = いつもいる、1 = 夕方と夜(昼はいない)、2 = 夜だけ。off = いまは出ていない
gangs.forEach((g, i) => { g.tier = i < TUNE.gang.count ? i % 2 : 0; });
for (let i = 0; i < Math.round(TUNE.gang.count * (DAY.gangNight - 1)); i++) { const q = gangSpot(), g = newGang(q[0], q[1]); g.tier = 2; g.off = true; g.per.g.visible = false; }
// 街の人: tier 0 = いつもいる、1 = 夕方だけ
peds.forEach(p => { p.tier = 0; });
for (let i = 0; i < Math.round(TUNE.peds * (DAY.pedEve - 1)); i++) {
  const look = [shirts[(i + 3) % shirts.length], [0x2a3550, 0x333333, 0x5a4030][i % 3], [0xf0c9a0, 0xc89870, 0x8a5a3a][(i + 1) % 3]], per = makePerson(look[0], look[1], look[2]); per.g.visible = false;
  peds.push({ per, look, bi: pedBlock(), t: Math.random() * 160, dir: i % 2 ? 1 : -1, speed: 1.2 + Math.random() * 0.8, down: 0, x: 0, z: 0, h: 0, push: { x: 0, z: 0 }, tier: 1, off: true });
}
function respawnGang(g) { clearStatus(g); g.hp = TUNE.gang.hp; g.dead = -1; g.state = 'idle'; g.x = g.home.x; g.z = g.home.z; g.per.g.rotation.x = 0; g.per.g.visible = true; setHand(g.per, g, g.weapon); }
function damageGang(g, dmg, kx, kz) {
  if (g.hp <= 0) return;
  g.hp -= dmg; g.state = 'chase'; g.kx = kx || 0; g.kz = kz || 0; spark(g.x, 1.6, g.z);
  if (g.hp <= 0) {
    g.dead = 0; g.per.g.rotation.x = -Math.PI / 2; g.per.g.position.y = 0.4;
    dropPickup('money', g.x + 0.6, g.z, 20 + Math.floor(Math.random() * 7) * 10);
    if (g.weapon !== 'fist') { dropPickup(g.weapon, g.x - 0.6, g.z + 0.4, g.weapon === 'pistol' ? 12 : 0); setHand(g.per, g, null); }
    addWanted(1);
  }
}
function updateGangs(dt) {
  const fight = G.mode === 'solo' && G.started && player.hp > 0;
  for (const g of gangs) {
    if (G.mode === 'race' || g.off) { g.per.g.visible = false; continue; }
    if (g.hp <= 0) { g.dead += dt; g.x += g.kx * dt; g.z += g.kz * dt; g.kx *= 1 - 3 * dt; g.kz *= 1 - 3 * dt; resolve(g, 0.45); g.per.g.position.set(g.x, 0.4, g.z); if (g.dead > 6) g.per.g.visible = false; if (g.dead > TUNE.gang.respawn) respawnGang(g); continue; }
    g.per.g.visible = true; g.cd -= dt; g.hitCd -= dt; if (g.swing > 0) g.swing -= dt;
    const px = player.x, pz = player.z, dP = Math.hypot(px - g.x, pz - g.z), dHome = Math.hypot(px - g.home.x, pz - g.home.z);
    if (g.state === 'idle' && fight && dHome < TUNE.gang.turf) g.state = 'chase';
    if (g.state === 'chase' && (!fight || dHome > TUNE.gang.giveUp)) g.state = 'idle';
    let sp = 0, tx = g.tx, tz = g.tz;
    const dis = statusTick(g, dt); // 1 = 豚の頭で前が見えない、2 = ヘビで動けない
    if (dis) { if (dis === 1) { const q = blindWalk(g, dt); tx = q[0]; tz = q[1]; sp = 1.5; } }
    else if (g.state === 'chase') {
      const W = GANG_W[g.weapon]; tx = px; tz = pz;
      if (dP > (g.weapon === 'pistol' ? 9 : W.range * 0.8)) sp = TUNE.gang.speed;
      if (dP < W.range && g.cd <= 0) {
        g.cd = W.cd; g.swing = 0.25;
        if (g.weapon === 'pistol') { if (lineClear(g.x, g.z, px, pz)) { tracer(g.x, g.z, px + (Math.random() - 0.5), pz + (Math.random() - 0.5)); if (Math.random() < 0.6) hurtPlayer(W.dmg * (player.mode === 'car' ? 0.5 : 1)); } else g.cd = 0.3; }
        else if (player.mode === 'foot') hurtPlayer(W.dmg);
      }
    } else {
      g.wt -= dt; if (g.wt <= 0) { g.wt = 2 + Math.random() * 4; const a = Math.random() * 6.28, r = Math.random() * 6; g.tx = g.home.x + Math.cos(a) * r; g.tz = g.home.z + Math.sin(a) * r; tx = g.tx; tz = g.tz; }
      if (Math.hypot(tx - g.x, tz - g.z) > 0.6) sp = 1.4;
    }
    if (sp > 0) { g.h += angDiff(g.h, Math.atan2(tx - g.x, tz - g.z)) * Math.min(1, 8 * dt); g.x += Math.sin(g.h) * sp * dt; g.z += Math.cos(g.h) * sp * dt; }
    else if (g.state === 'chase' && !dis) g.h += angDiff(g.h, Math.atan2(px - g.x, pz - g.z)) * Math.min(1, 8 * dt);
    g.x += g.kx * dt; g.z += g.kz * dt; g.kx *= 1 - 6 * dt; g.kz *= 1 - 6 * dt;
    resolve(g, 0.45);
    if (player.mode === 'car' && g.hitCd <= 0) { const c = player.car, d = Math.hypot(c.x - g.x, c.z - g.z); if (d < 2.4 && Math.abs(c.v) > 5) { g.hitCd = 0.6; damageGang(g, Math.abs(c.v) * 4, Math.sin(c.h) * c.v * 0.5, Math.cos(c.h) * c.v * 0.5); } }
    if (g.hp > 0) { g.per.g.position.set(g.x, onWalk(g.x, g.z) ? 0.3 : 0, g.z); g.per.g.rotation.y = g.h; animPerson(g.per, sp, dt); if (g.swing > 0) g.per.armR.rotation.x = -1.5; }
  }
}

// 主人公の体力
let hurtT = 0;
function hurtPlayer(d) {
  if (G.mode !== 'solo' || player.hp <= 0 || G.downT > 0) return;
  if (player.armor > 0) { const a = Math.min(player.armor, d); player.armor -= a; d -= a; } // 防弾チョッキから先に減る
  player.hp = Math.max(0, player.hp - d); hurtT = 0.35;
  if (player.hp <= 0) playerDown();
}
function playerDown() {
  G.downT = 2.6; if (player.mode === 'car') exitCar();
  player.per.g.rotation.x = -Math.PI / 2; toast(tr('やられた…'), 2.4);
}
function wakeAtHospital() {
  const fine = Math.min(G.money, Math.max(100, Math.floor(G.money * TUNE.deathFine / 10) * 10));
  G.money -= fine; G.wanted = 0; G.bust = 0; removeAllPolice();
  confiscate();
  player.hp = TUNE.hp; player.per.g.rotation.x = 0; resetPlayerToFoot(HOSPITAL.x, HOSPITAL.z, HOSPITAL.h);
  const lost = tr('病院で目がさめた… -${fine}　武器を没収された', { fine: fine.toLocaleString() });
  if (G.mi < MISSIONS.length && !G.over && (G.si > 0 || MISSIONS[G.mi].steps[0].wanted)) failMission(lost + tr('　ミッション失敗')); else toast(lost, 3);
}

// 武器を没収(やられたとき・逮捕されたとき)。防弾チョッキもなくなる。持っておく回復は残る。豚の頭とヘビも残る
function confiscate() { player.inv = ['fist']; if (player.pigs > 0) player.inv.push('pig'); if (player.snakes > 0) player.inv.push('snake'); player.wi = 0; player.ammo = 0; player.mg = 0; player.armor = 0; setHand(player.per, player, null); }

/* ===== 車を奪われた運転手・パトカーから降りた警察官 ===== */
const npcs = [];
const SKINS = [0xf0c9a0, 0xc89870, 0x8a5a3a];
function newNpc(kind, x, z, h, look) { // look = [服, ズボン, はだ]。おこった街の人は、元と同じ見た目にする(屋台の人は { vip, shirt, apron, skin })
  const cop = kind === 'cop', skin = SKINS[Math.floor(Math.random() * 3)];
  const per = cop ? makePerson(0x2c56b8, 0x1a2a55, skin) : look ? (look.vip ? makeVip('vendor', look) : makePerson(look[0], look[1], look[2])) : makePerson(shirts[Math.floor(Math.random() * shirts.length)], [0x2a3550, 0x333333, 0x5a4030][Math.floor(Math.random() * 3)], skin);
  if (cop) { const cap = new THREE.Mesh(BG(0.64, 0.16, 0.72), M(0x14224a)); cap.position.set(0, 2.52, 0.05); per.g.add(cap); }
  const n = { npc: true, kind, per, x, z, h, hp: cop ? TUNE.police.copHp : TUNE.driver.hp, state: cop ? 'chase' : 'flee', cd: 0.6, down: 0, stagger: 0, kx: 0, kz: 0, life: 0, dead: -1, swing: 0, hitCd: 0, pull: 0, car: null };
  npcs.push(n); return n;
}
function removeNpc(n) { const i = npcs.indexOf(n); if (i >= 0) npcs.splice(i, 1); scene.remove(n.per.g); }
// 車を奪ったとき: 運転手が車から転がり出る。たいていは逃げるが、おそってくる人もいる
function ejectDriver(c) {
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  const n = newNpc('driver', c.x - rx * 1.8, c.z - rz * 1.8, c.h + Math.PI / 2);
  n.down = 0.9; n.kx = -rx * 5; n.kz = -rz * 5;
  if (G.mode === 'solo' && Math.random() < TUNE.driver.angry) n.state = 'angry';
}
// パトカーが止まって、警察官が降りる
function deployCops(c) {
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  for (let k = 0; k < c.crew; k++) { const s = k ? -1 : 1, n = newNpc('cop', c.x - rx * 1.8 * s, c.z - rz * 1.8 * s, c.h); n.car = c; resolve(n, 0.45); }
  c.crew = 0;
}
// 主人公を車から引きずり出す
function pullOut() {
  exitCar(); G.stunT = 1.0; player.per.g.rotation.x = -Math.PI / 2; toast(tr('車から引きずり出された！'), 1.6);
}
function damageNpc(n, dmg, kx, kz) {
  if (n.hp <= 0) return;
  n.hp -= dmg; n.kx = kx || 0; n.kz = kz || 0; n.stagger = 0.4; spark(n.x, 1.6, n.z);
  if (n.kind === 'cop' && n.state !== 'chase') n.state = 'chase';
  if (n.hp <= 0) {
    n.dead = 0; n.per.g.rotation.x = -Math.PI / 2; n.per.g.position.y = 0.4; n.per.armR.rotation.x = 0;
    if (n.kind === 'driver') dropPickup('money', n.x + 0.5, n.z, 10 + Math.floor(Math.random() * 3) * 10);
    addWanted(1); // 運転手でも警察官でも、たおすと★+1
  }
}
function updateNpcs(dt) {
  const alive = G.mode === 'solo' && player.hp > 0 && G.downT <= 0;
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    if (n.kind === 'cop' && G.mode !== 'solo') { removeNpc(n); continue; }
    if (n.hp <= 0) { n.dead += dt; n.x += n.kx * dt; n.z += n.kz * dt; n.kx *= 1 - 3 * dt; n.kz *= 1 - 3 * dt; resolve(n, 0.45); n.per.g.position.set(n.x, 0.4, n.z); if (n.dead > 6) removeNpc(n); continue; }
    n.cd -= dt; n.hitCd -= dt; n.life += dt; if (n.swing > 0) n.swing -= dt;
    if (n.down > 0) { // 車から転がり出ている
      n.down -= dt; n.x += n.kx * dt; n.z += n.kz * dt; n.kx *= 1 - 3 * dt; n.kz *= 1 - 3 * dt; resolve(n, 0.45);
      n.per.g.rotation.x = -Math.PI / 2; n.per.g.position.set(n.x, 0.4, n.z); if (n.down <= 0) n.per.g.rotation.x = 0; continue;
    }
    const px = player.x, pz = player.z, dP = Math.hypot(px - n.x, pz - n.z);
    let sp = 0, tx = px, tz = pz, faceP = false;
    const dis = statusTick(n, dt); // 1 = 豚の頭で前が見えない、2 = ヘビで動けない
    if (dis) { n.pull = 0; if (dis === 1) { const q = blindWalk(n, dt); tx = q[0]; tz = q[1]; sp = 1.5; } }
    else if (n.kind === 'driver') {
      if (n.state === 'angry' && (!alive || dP > 30)) n.state = 'flee';
      if (n.state === 'angry') {
        faceP = true; if (dP > 1.5) sp = TUNE.driver.speed;
        if (dP < 1.8 && n.cd <= 0 && player.mode === 'foot') { n.cd = 1.0; n.swing = 0.25; hurtPlayer(TUNE.driver.dmg); }
      } else {
        tx = n.x + (n.x - px); tz = n.z + (n.z - pz); sp = TUNE.driver.flee; // 主人公から逃げる
        if (n.life > 12 && dP > 25) { removeNpc(n); continue; }
      }
    } else { // 警察官
      const car = n.car, carOk = car && cars.indexOf(car) >= 0 && car.kind === 'police';
      if (n.state === 'chase' && (!alive || dP > 45)) n.state = 'back';
      if (n.state === 'back' && alive && dP < 25) n.state = 'chase';
      if (n.state === 'chase') {
        faceP = true; if (dP > (player.mode === 'car' ? 2.6 : 1.2)) sp = TUNE.police.copSpeed;
        if (player.mode === 'car' && dP < 3.4 && Math.abs(player.car.v) < 4 && G.stunT <= 0) { n.pull += dt; if (n.pull > TUNE.police.pullTime) { n.pull = 0; pullOut(); } }
        else n.pull = Math.max(0, n.pull - dt);
      } else { // パトカーにもどる
        if (!carOk) { if (dP > 40) { removeNpc(n); continue; } }
        else { tx = car.x; tz = car.z; sp = TUNE.police.copSpeed; if (Math.hypot(car.x - n.x, car.z - n.z) < 3) { car.crew++; removeNpc(n); continue; } }
      }
    }
    if (n.stagger > 0) { n.stagger -= dt; sp = 0; }
    if (sp > 0) { n.h += angDiff(n.h, Math.atan2(tx - n.x, tz - n.z)) * Math.min(1, 8 * dt); n.x += Math.sin(n.h) * sp * dt; n.z += Math.cos(n.h) * sp * dt; }
    else if (faceP) n.h += angDiff(n.h, Math.atan2(px - n.x, pz - n.z)) * Math.min(1, 8 * dt);
    n.x += n.kx * dt; n.z += n.kz * dt; n.kx *= 1 - 6 * dt; n.kz *= 1 - 6 * dt;
    resolve(n, 0.45);
    if (G.mode === 'solo' && player.mode === 'car' && n.hitCd <= 0) { const c = player.car, d = Math.hypot(c.x - n.x, c.z - n.z); if (d < 2.4 && Math.abs(c.v) > 5) { n.hitCd = 0.6; damageNpc(n, Math.abs(c.v) * 4, Math.sin(c.h) * c.v * 0.5, Math.cos(c.h) * c.v * 0.5); } }
    if (n.hp > 0) { n.per.g.position.set(n.x, onWalk(n.x, n.z) ? 0.3 : 0, n.z); n.per.g.rotation.y = n.h; animPerson(n.per, sp, dt); if (n.swing > 0 || n.pull > 0) n.per.armR.rotation.x = -1.5; }
  }
}

// こうげきの相手(ギャング・運転手・警察官)
function foes() { const a = []; for (const g of gangs) if (g.hp > 0 && g.per.g.visible) a.push(g); for (const n of npcs) if (n.hp > 0) a.push(n); return a; }
function hitFoe(f, dmg, kx, kz) { if (f.npc) damageNpc(f, dmg, kx, kz); else damageGang(f, dmg, kx, kz); }
// こうげきできるか(歩いていて、たおれていない)
function canAttack() { return G.started && G.mode === 'solo' && player.mode === 'foot' && player.hp > 0 && G.downT <= 0 && G.stunT <= 0 && !G.shop; }
const curWeapon = () => player.inv[player.wi];
const isGun = wk => !WEAPONS[wk].melee; // ねらって使う武器(銃・投げる物)
const isThrown = wk => !!WEAPONS[wk].thrown;
function ammoOf(wk) { return wk === 'pistol' ? player.ammo : wk === 'mg' ? player.mg : wk === 'pig' ? player.pigs : wk === 'snake' ? player.snakes : Infinity; }
let noAmmoT = 0;
// こうげき(素手・刀は近くの敵に。ピストル・マシンガンは向いている方へ。前の近くに敵がいたら、その敵をねらう)
function playerAttack() {
  if (!canAttack() || player.atkCd > 0) return;
  const wk = curWeapon(), W = WEAPONS[wk];
  if (isGun(wk)) { shoot(wk, player.h, AIM.tapAssist, true); return; }
  player.atkCd = W.cd; player.swing = 0.22;
  let best = null, bd = 1e9;
  for (const g of foes()) {
    const dx = g.x - player.x, dz = g.z - player.z, d = Math.hypot(dx, dz), a = Math.abs(angDiff(player.h, Math.atan2(dx, dz)));
    if (d > W.range + 0.4) continue; const score = d + a * 1.5; if (score < bd) { bd = score; best = g; }
  }
  if (best) { player.h = Math.atan2(best.x - player.x, best.z - player.z); hitFoe(best, W.dmg, Math.sin(player.h) * 4, Math.cos(player.h) * 4); }
}
// 銃を1発撃つ。dir = 撃つ向き、assist = その向きから、どれだけずれた敵までねらうか、turn = 敵の方を向くか
function gunTarget(W, dir, assist) {
  let best = null, bd = 1e9;
  for (const g of foes()) {
    const dx = g.x - player.x, dz = g.z - player.z, d = Math.hypot(dx, dz), a = Math.abs(angDiff(dir, Math.atan2(dx, dz)));
    if (d > W.range || a > assist || !lineClear(player.x, player.z, g.x, g.z)) continue;
    const score = d + a * (assist < 0.3 ? 30 : 0); // ねらったときは、線に近い敵を先に
    if (score < bd) { bd = score; best = g; }
  }
  return best;
}
function rayEnd(dir, range) { let ex = player.x, ez = player.z; for (let s = 0.5; s <= range; s += 0.5) { const nx = player.x + Math.sin(dir) * s, nz = player.z + Math.cos(dir) * s; if (pointBlocked(nx, nz)) break; ex = nx; ez = nz; } return [ex, ez]; }
function fireGun(wk, dir, assist, turn) {
  const W = WEAPONS[wk];
  if (ammoOf(wk) <= 0) { if (noAmmoT <= 0) { toast(tr('弾がない！'), 1); noAmmoT = 1; } return false; }
  if (wk === 'pistol') player.ammo--; else player.mg--;
  player.atkCd = W.cd; player.swing = 0.22;
  if (W.spread) dir += (Math.random() - 0.5) * W.spread;
  const best = gunTarget(W, dir, assist), push = wk === 'mg' ? 0.8 : 2;
  if (best) { const a = Math.atan2(best.x - player.x, best.z - player.z); if (turn) player.h = a; tracer(player.x, player.z, best.x, best.z); hitFoe(best, W.dmg, Math.sin(a) * push, Math.cos(a) * push); }
  else { const [ex, ez] = rayEnd(dir, W.range); tracer(player.x, player.z, ex, ez); }
  return true;
}

/* ===== 市場の武器(豚の頭・ヘビを投げる) ===== */
const shoot = (wk, dir, assist, turn) => isThrown(wk) ? throwItem(wk, dir, assist, turn) : fireGun(wk, dir, assist, turn);
// 投げた物の高さ(t = 0〜1、L = 飛ぶ距離、y1 = 落ちる高さ)
function arcY(t, L, y1) { return 1.7 + (y1 - 1.7) * t + 4 * Math.min(1.5, L * 0.12) * t * (1 - t); }
const shots = []; // 飛んでいる豚の頭・ヘビ
function throwItem(wk, dir, assist, turn) {
  const W = WEAPONS[wk]; if (ammoOf(wk) <= 0) return false;
  const tg = gunTarget(W, dir, assist); let ex, ez;
  if (tg) { ex = tg.x; ez = tg.z; if (turn) player.h = Math.atan2(ex - player.x, ez - player.z); } else [ex, ez] = rayEnd(dir, W.range);
  if (wk === 'pig') player.pigs--; else player.snakes--;
  player.atkCd = W.cd; player.swing = 0.22;
  const m = marketItem(wk), L = Math.max(0.5, Math.hypot(ex - player.x, ez - player.z));
  m.position.set(player.x, 1.7, player.z); m.rotation.y = Math.atan2(ex - player.x, ez - player.z); scene.add(m);
  shots.push({ kind: wk, m, x0: player.x, z0: player.z, x1: ex, z1: ez, L, y1: tg ? 1.6 : 0.5, t: 0, dur: Math.max(0.2, L / MKT.speed) });
  if (ammoOf(wk) <= 0) { player.inv.splice(player.inv.indexOf(wk), 1); player.wi = Math.max(0, player.wi - 1); setHand(player.per, player, curWeapon()); } // なくなったら、前の武器にもどる
  return true;
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt / s.dur; const t = Math.min(1, s.t), x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t;
    s.m.position.set(x, arcY(t, s.L, s.y1), z); s.m.rotation.x += dt * 9;
    let hit = null; if (G.mode === 'solo') for (const f of foes()) if (Math.hypot(f.x - x, f.z - z) < MKT.hitR) { hit = f; break; }
    if (hit) {
      const a = Math.atan2(s.x1 - s.x0, s.z1 - s.z0);
      if (s.kind === 'pig') { hitFoe(hit, WEAPONS.pig.dmg, Math.sin(a) * 3, Math.cos(a) * 3); if (hit.hp > 0) setStatus(hit, 'blind'); }
      else { hitFoe(hit, 0, 0, 0); setStatus(hit, 'frozen'); }
    } else if (s.t >= 1) spark(x, 0.5, z);
    if (hit || s.t >= 1) { scene.remove(s.m); shots.splice(i, 1); }
  }
}
// 豚の頭をかぶる(前が見えない)・ヘビが巻きつく(動けない)。ギャング・運転手・警察官に効く
function setStatus(f, kind) {
  if (kind === 'blind') { f.blind = MKT.blind; if (!f.pigM) { f.pigM = marketItem('pig'); f.pigM.scale.set(1.25, 1.25, 1.25); f.pigM.position.y = 2.25; f.per.g.add(f.pigM); } }
  else {
    f.frozen = MKT.freeze;
    if (!f.snakeM) { const g = f.snakeM = new THREE.Group(); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(BG(0.96, 0.13, 0.62), M(k % 2 ? 0x3fae4a : 0x2a8a3a)); r.position.y = 1.05 + k * 0.3; r.rotation.z = k % 2 ? 0.12 : -0.12; g.add(r); } const hd = new THREE.Mesh(BG(0.2, 0.16, 0.24), M(0x2a8a3a)); hd.position.set(0.3, 1.85, 0.34); g.add(hd); f.per.g.add(g); }
  }
}
function clearStatus(f) { f.blind = 0; f.frozen = 0; if (f.pigM) { f.per.g.remove(f.pigM); f.pigM = null; } if (f.snakeM) { f.per.g.remove(f.snakeM); f.snakeM = null; } }
// 毎フレーム: のこり時間を減らす。0 = ふつう、1 = 前が見えない、2 = 動けない
function statusTick(f, dt) {
  if (f.blind > 0) { f.blind -= dt; if (f.blind <= 0 && f.pigM) { f.per.g.remove(f.pigM); f.pigM = null; const m = marketItem('pig'); m.position.set(f.x + 0.7, 0.6, f.z); m.rotation.z = 0.6; scene.add(m); fx.push({ m, t: 1.5 }); } } // ポロッと落ちる(拾えない)
  if (f.frozen > 0) { f.frozen -= dt; if (f.frozen <= 0 && f.snakeM) { f.per.g.remove(f.snakeM); f.snakeM = null; } }
  return f.frozen > 0 ? 2 : f.blind > 0 ? 1 : 0;
}
// 前が見えなくて、ふらふら歩く(行き先を少しずつ変える)
function blindWalk(f, dt) { f.bt = (f.bt || 0) - dt; if (f.bt <= 0) { f.bt = 0.7; f.bh = Math.random() * 6.28; } return [f.x + Math.sin(f.bh) * 3, f.z + Math.cos(f.bh) * 3]; }
// 市場に置いてある武器。拾うと、60秒で同じ場所にまた出てくる
const MKW = MK_SPOTS.map(s => {
  const g = new THREE.Group(), it = s.kind === 'dao' ? handItem('dao') : marketItem(s.kind);
  if (s.kind === 'dao') { it.position.set(0, 0, -0.6); it.rotation.x = -0.5; } it.scale.set(1.3, 1.3, 1.3); g.add(it);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 20), MB(0xffd23f)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.8; g.add(ring);
  g.position.set(s.x, 1.3, s.z); scene.add(g);
  return { kind: s.kind, x: s.x, z: s.z, g, t: 0 };
});
function updateMkw(dt, t) {
  for (const w of MKW) {
    if (w.t > 0) w.t -= dt;
    const on = G.mode === 'solo' && w.t <= 0; w.g.visible = on; if (!on) continue;
    w.g.rotation.y = t * 1.5; w.g.position.y = 1.3 + Math.sin(t * 3 + w.x) * 0.12;
    if (player.mode !== 'foot' || player.hp <= 0 || Math.hypot(player.x - w.x, player.z - w.z) > 1.6) continue;
    if (w.kind === 'dao' ? player.inv.includes('dao') : ammoOf(w.kind) >= MKT.max) continue; // もう持てない
    addWeapon(w.kind); w.t = MKT.respawn;
    toast(tr('{w}をひろった！', { w: tr(WEAPONS[w.kind].name) }) + (w.kind === 'dao' ? '' : ' ' + ammoOf(w.kind) + '/' + MKT.max), 1.4);
  }
}

// こうげきボタンを倒して、ねらう(ピストル・マシンガン・豚の頭・ヘビ)
let atk = null; // { id, sx, sy, dx, dy, aim }
let pendShot = null; // ピストル: 離したけど、まだ撃てないとき(撃てるまで少し待つ)
const aimMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, depthWrite: false });
const aimLine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), aimMat); aimLine.visible = false; scene.add(aimLine);
const aimDot = new THREE.Mesh(BG(0.38, 0.38, 0.38), aimMat); aimDot.visible = false; scene.add(aimDot);
const arcDots = []; for (let k = 0; k < 9; k++) { const d = new THREE.Mesh(BG(0.22, 0.22, 0.22), aimMat); d.visible = false; scene.add(d); arcDots.push(d); } // 投げる軌道(点線)
function hideAim() { aimLine.visible = aimDot.visible = false; for (const d of arcDots) d.visible = false; }
function aimDir() { // ボタンを倒した向き → 街の向き(カメラから見て)
  const l = Math.hypot(atk.dx, atk.dy) || 1, jx = atk.dx / l, jy = -atk.dy / l, a = G.camYaw;
  return Math.atan2(Math.sin(a) * jy - Math.cos(a) * jx, Math.cos(a) * jy + Math.sin(a) * jx);
}
function setAtkKnob(dx, dy) { $('atkBtn').style.transform = dx || dy ? 'translate(' + dx + 'px,' + dy + 'px)' : ''; }
function endAim() { atk = null; setAtkKnob(0, 0); hideAim(); }
function atkDown(e) {
  e.preventDefault(); e.stopPropagation();
  try { $('atkBtn').setPointerCapture(e.pointerId); } catch (_) { /* なくてもよい */ }
  if (!isGun(curWeapon())) { playerAttack(); return; } // 素手・刀は、押したらすぐ
  atk = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, aim: false };
}
function atkMove(e) {
  if (!atk || e.pointerId !== atk.id) return;
  let dx = e.clientX - atk.sx, dy = e.clientY - atk.sy; const l = Math.hypot(dx, dy);
  atk.dx = dx; atk.dy = dy; if (l > AIM.dead) atk.aim = true; else if (!atk.aim) return;
  if (l > AIM.max) { dx *= AIM.max / l; dy *= AIM.max / l; } setAtkKnob(dx, dy);
}
function atkUp(e) {
  if (!atk || e.pointerId !== atk.id) return;
  const wk = curWeapon();
  if ((wk === 'pistol' || isThrown(wk)) && e.type === 'pointerup') pendShot = atk.aim ? { dir: aimDir(), assist: AIM.assist, turn: false, t: AIM.wait } : { dir: null, assist: AIM.tapAssist, turn: true, t: AIM.wait };
  endAim();
}
// 毎フレーム: ねらっている間は、その向きを向いて照準線を出す。マシンガンは押している間ずっと撃つ
function updateAim(dt) {
  noAmmoT -= dt;
  const wk = curWeapon(), gun = isGun(wk), ok = canAttack();
  if (atk && (!gun || !ok)) { if (!ok) endAim(); else hideAim(); }
  if (atk && atk.aim && gun && ok) {
    const dir = aimDir(), W = WEAPONS[wk]; player.h = dir; player.per.g.rotation.y = dir; player.per.armR.rotation.x = -1.5;
    const tg = gunTarget(W, dir, AIM.assist); let ex, ez;
    if (tg) { ex = tg.x; ez = tg.z; } else [ex, ez] = rayEnd(dir, W.range);
    const L = Math.max(0.5, Math.hypot(ex - player.x, ez - player.z));
    if (W.thrown) { // 投げる物: 山なりの軌道を点線で出す
      const y1 = tg ? 1.6 : 0.5; aimLine.visible = false; aimDot.visible = true; aimDot.position.set(ex, y1, ez);
      arcDots.forEach((d, k) => { const t = (k + 1) / (arcDots.length + 1); d.visible = true; d.position.set(player.x + (ex - player.x) * t, arcY(t, L, y1), player.z + (ez - player.z) * t); });
    } else {
      for (const d of arcDots) d.visible = false;
      aimLine.visible = aimDot.visible = true; aimLine.scale.set(1, 1, L); aimLine.rotation.y = Math.atan2(ex - player.x, ez - player.z);
      aimLine.position.set((player.x + ex) / 2, 1.5, (player.z + ez) / 2); aimDot.position.set(ex, 1.5, ez);
    }
    aimMat.color.setHex(tg ? 0xff2a2a : 0xffb0a0); // 敵に当たる線は、こい赤
  }
  if (gun && ok && player.atkCd <= 0) {
    if (WEAPONS[wk].auto && (atk || keys.KeyJ)) { // マシンガン: 押している間
      if (atk && atk.aim) fireGun(wk, aimDir(), AIM.assist, false); else fireGun(wk, player.h, AIM.tapAssist, true);
    } else if (pendShot && (wk === 'pistol' || isThrown(wk))) { const ps = pendShot; pendShot = null; if (ps.dir !== null) player.h = ps.dir; shoot(wk, ps.dir === null ? player.h : ps.dir, ps.assist, ps.turn); }
  }
  if (pendShot) { pendShot.t -= dt; if (pendShot.t <= 0 || !gun) pendShot = null; }
}
function switchWeapon() { if (!G.started || G.mode !== 'solo' || player.hp <= 0) return; player.wi = (player.wi + 1) % player.inv.length; setHand(player.per, player, player.inv[player.wi]); pendShot = null; }
// 持っておく回復を使う(体力+50)
function useHeal() {
  if (!G.started || G.mode !== 'solo' || player.hp <= 0 || G.downT > 0 || player.heals <= 0) return;
  if (player.hp >= TUNE.hp) { toast(tr('体力は満タン'), 1); return; }
  player.heals--; player.hp = Math.min(TUNE.hp, player.hp + TUNE.healItem); toast(tr('回復した！ (のこり {n})', { n: player.heals }), 1.2);
}
function updateCombat(dt) {
  player.atkCd -= dt; updateAim(dt);
  if (G.downT > 0) { G.downT -= dt; if (G.downT <= 0) wakeAtHospital(); }
  if (hurtT > 0) hurtT -= dt;
  $('hurt').style.opacity = Math.max(0, hurtT / 0.35) * 0.9 + (player.hp > 0 && player.hp < 30 ? 0.25 : 0);
}


/* ===== 大事な人の見た目(v=13): 四角い人に、箱の部品を足して見分ける ===== */
function part(per, w, h, d, col, x, y, z) { const m = new THREE.Mesh(BG(w, h, d), M(col)); m.position.set(x, y, z); per.g.add(m); return m; }
// kind: 'vendor'(屋台の人) 'oyaji'(屋台のおやじ) 'info'(情報屋) 'bossB'(黒の幹部) 'white'(白の手下) 'bossW'(白の幹部)
//   o = { shirt, apron, skin }(屋台の人の服・エプロンの色、はだの色)。情報屋・幹部・白の手下が街に出てくるのは、あとの回(⑤⑥)
function makeVip(kind, o) {
  o = o || {}; const skin = o.skin || 0xc89870; let per;
  const hat = (col, band) => { part(per, 0.98, 0.07, 0.98, col, 0, 2.52, 0); part(per, 0.62, 0.32, 0.62, col, 0, 2.7, 0); if (band !== undefined) part(per, 0.64, 0.09, 0.64, band, 0, 2.6, 0); };
  const beard = col => { part(per, 0.48, 0.14, 0.1, col, 0, 1.92, 0.3); part(per, 0.32, 0.06, 0.06, col, 0, 2.05, 0.29); }; // あごひげ・口ひげ
  const glasses = () => part(per, 0.5, 0.1, 0.05, 0x050505, 0, 2.2, 0.29);
  const tie = () => part(per, 0.12, 0.55, 0.04, 0x111111, 0, 1.52, 0.24);
  if (kind === 'vendor' || kind === 'oyaji') {
    const ap = kind === 'oyaji' ? 0xf4f2ea : (o.apron || 0xc8261e);
    per = makePerson(kind === 'oyaji' ? 0x4a4f5a : (o.shirt || 0x3f7fd0), 0x2a2a30, skin);
    part(per, 0.66, 0.98, 0.06, ap, 0, 1.18, 0.26); part(per, 0.84, 0.1, 0.5, ap, 0, 1.3, 0); // エプロンと、こしのひも
    if (kind === 'oyaji') { part(per, 0.52, 0.24, 0.52, 0xf4f2ea, 0, 2.62, 0); part(per, 0.72, 0.34, 0.72, 0xffffff, 0, 2.9, 0); per.hair.material = M(0x9a9a9a); } // コック帽
    else part(per, 0.62, 0.14, 0.62, ap, 0, 2.5, 0); // エプロンと同じ色の頭巾
  } else if (kind === 'info') { // 情報屋: 大きな黄色い帽子・茶色の長いコート・赤いスカーフ
    per = makePerson(0xa8733a, 0x3a3028, skin);
    part(per, 0.86, 0.7, 0.5, 0xa8733a, 0, 0.72, 0);
    part(per, 0.64, 0.16, 0.52, 0xd42a2a, 0, 1.86, 0); part(per, 0.16, 0.5, 0.06, 0xd42a2a, 0.2, 1.58, 0.27);
    hat(0xf2c230);
  } else if (kind === 'bossB') { // 黒の幹部: 1.3倍・はげ頭・ひげ・赤い帯・青龍刀
    per = makePerson(0x141414, 0x1a1a1a, skin); per.hair.visible = false; beard(0x1a1410);
    part(per, 0.84, 0.16, 0.5, 0xc8261e, 0, 0.93, 0); part(per, 0.16, 0.42, 0.06, 0xc8261e, -0.25, 0.7, 0.27);
    per.g.scale.setScalar(1.3); setHand(per, per, 'dao');
  } else if (kind === 'white') { // 白の手下: 白いスーツ・黒いネクタイ・サングラス
    per = makePerson(0xf2f2f2, 0xf2f2f2, skin); tie(); glasses();
  } else { // 白の幹部: 1.15倍・白い帽子・ひげ・マシンガン
    per = makePerson(0xf2f2f2, 0xf2f2f2, skin); tie(); beard(0x55504a); hat(0xf7f7f7, 0x111111);
    per.g.scale.setScalar(1.15); setHand(per, per, 'mg');
  }
  per.kind = kind; return per;
}

/* ===== 街の人との会話(v=13) ===== */
// 話せる距離・ふきだしが出ている秒・Q&A になる割合(街の人)・おやじが2回目からQ&Aになる割合・ヒントがまざる割合・こたえを待つ秒・はなれると終わる距離・屋台の人の数
//   later = まだ出てこない物(幹部・白いスーツ・ボス・港の倉庫)の話もするか。それを作る回(⑤⑥)で true にする
const TALK = { dist: 2.8, show: 3.2, qa: 0.3, oyajiQa: 0.5, hint: 0.3, wait: 12, leave: 7, vendors: 6, later: false };
// ひとこと。hint = ヒント・うわさ、self = 屋台のおやじの話(おやじ本人は言わない)
const LINES = [
  { text: 'この街の家賃、ギャングよりこわいよ' },
  { text: '夜市の小籠包、やけどするほどうまい。本当にやけどした' },
  { text: 'パトカー、今日だけで3回見た。全部同じ人を追ってた' },
  { text: '車を盗まれた。3回目だ。もう歩くことにした' },
  { text: '病院の先生、腕はいいんだ。請求書がこわいだけで' },
  { text: 'あの漢方、何にでも効くらしい。財布以外には' },
  { text: 'あんた、どこかで見た顔だな…手配書かな' },
  { text: '市場で迷って2時間出られなかった。屋台が増えてる気がする' },
  { text: '武器屋のおやじ、おつりをまちがえないらしい。こわくて、だれも確かめないけど' },
  { text: '豚の頭を投げる人を見た。世も末だ' },
  { text: '港の船、いつ出るんだろう。ずっと止まってる' },
  { text: '市場の奥に、黒い服のえらい人がいるらしい。でっかい刀を持ってるって', hint: 1, later: 1 },
  { text: '北の大きなビルの前の白いスーツ、近づかないほうがいい', hint: 1, later: 1 },
  { text: '黒と白、また道でケンカしてたよ。近くにいると巻きこまれる', hint: 1, later: 1 },
  { text: '幹部がいなくなったチームは、おとなしくなるらしい', hint: 1, later: 1 },
  { text: '幹部が2人ともやられたら、ボスが塔に出てくるってうわさだ', hint: 1, later: 1 },
  { text: 'この街を出たいなら港へ。残りたいなら…てっぺんを取るしかないね', hint: 1, later: 1 },
  { text: '市場の屋台にヘビがいる。投げつけると、相手がかたまるんだって', hint: 1 },
  { text: '豚の頭は、警察に取られないらしい。証拠品にしたくないんだろう', hint: 1 },
  { text: 'あの屋台だけは、黒も白も手を出さないんだ。なんでだろうね', hint: 1, self: 1, later: 1 },
  { text: '屋台のおやじ、30年あそこにいるらしい。街が変わっても、あの鍋だけは同じだ', hint: 1, self: 1 },
  { text: '港の奥の倉庫、夜も明かりがついてる。何を積んでるんだか', hint: 1, later: 1 },
  { text: '前にもいたよ、あんたみたいな運び屋。若い女の子だった。急に見なくなったけど', hint: 1 },
];
// Q&A。ok = ふつうのこたえ、ng = 相手がおこるこたえ(おそってくる)。who: 'shop' = 屋台の人がよく聞く、'oyaji' = 屋台のおやじだけ
const QAS = [
  { text: 'うちの小籠包、街でいちばんだろ？', ok: 'いちばんだ', ng: 'となりの店のほうがうまい', who: 'shop' },
  { text: 'この新しい帽子、似合ってる？', ok: '似合ってる', ng: '前が見えなくなる豚の頭のほうがまし' },
  { text: 'あんた、うちの車を盗んだ人に似てるな？', ok: '人ちがいです', ng: 'いい車だったよ' },
  { text: 'わしの歌、聞いていくか？', ok: '聞かせて', ng: '耳がこわれるからいい' },
  { text: 'この筋肉、どう思う？', ok: 'すごい', ng: 'ゆでたもやしみたい' },
  { text: '道にまよった。港はどっち？', ok: '東だよ', ng: '自分でさがせ' },
  { text: 'わたしの占い、当たるのよ。見てあげようか？', ok: 'おねがいします', ng: 'インチキでしょ' },
  { text: 'きのう、ふられたんだ…聞いてくれる？', ok: '聞くよ', ng: 'ふられて当然の顔だ' },
  { text: 'この街、いい街だろ？', ok: 'いい街だ', ng: '早く出たい' },
  { text: 'うちの息子、天才なんだ。そう思うだろ？', ok: '天才だ', ng: '会ったことないけど、ちがうと思う' },
  { text: '30年つぎ足してる秘伝のタレだ。味見するか？', ok: 'いただきます', ng: '30年洗ってないってこと？', who: 'oyaji' },
];
// 屋台の人(市場の屋台の前に立っている。話せる)。1人は屋台のおやじ(コック帽)で、夜市の入口にいちばん近い屋台にいる
const vendors = [];
(function placeVendors() {
  const cand = [], dd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (const s of STALLS) for (const side of [1, -1]) for (const lx of [-0.9, 0.9]) {
    const q = toW(s.x, s.z, s.r, lx, side * 2.2), o = { x: q[0], z: q[1] };
    if (!inMarket(o.x, o.z)) continue; resolve(o, 0.5); if (Math.hypot(o.x - q[0], o.z - q[1]) > 0.01) continue; // かべや箱に近すぎる所には立たせない
    if (MK_SPOTS.some(m => dd(m, o) < 2)) continue; // 市場の武器の置き場所もよける
    cand.push({ x: q[0], z: q[1], h: s.r + (side > 0 ? 0 : Math.PI) });
  }
  if (!cand.length) return;
  const gateN = { x: roadC(2), z: MK.z0 }, sel = [cand.reduce((a, b) => dd(a, gateN) <= dd(b, gateN) ? a : b)];
  while (sel.length < TALK.vendors && sel.length < cand.length) { // のこりは、なるべくばらばらに
    let best = null, bd = -1; for (const c of cand) { if (sel.includes(c)) continue; const d = Math.min(...sel.map(p => dd(p, c))); if (d > bd) { bd = d; best = c; } } sel.push(best);
  }
  const APRONS = [0xc8261e, 0x2f8a55, 0x2a4a8a, 0xd9a020, 0x7a4a9a];
  sel.forEach((c, i) => {
    const o = { shirt: shirts[(i * 3 + 1) % shirts.length], apron: APRONS[i % APRONS.length], skin: SKINS[i % 3] }, per = makeVip(i ? 'vendor' : 'oyaji', o);
    o.vip = true; vendors.push({ vendor: true, oyaji: i === 0, per, look: o, x: c.x, z: c.z, h: c.h, h0: c.h, talkT: 0, angry: null });
  });
})();
function updateVendors(dt) {
  for (const v of vendors) {
    if (v.angry) { if (npcs.indexOf(v.angry) >= 0) { v.per.g.visible = false; continue; } v.angry = null; v.h = v.h0; v.per.g.visible = true; } // おこって追いかけたあとは、屋台にもどる
    if (v.talkT > 0) v.talkT -= dt; else v.h += angDiff(v.h, v.h0) * Math.min(1, 4 * dt);
    v.per.g.position.set(v.x, 0.34, v.z); v.per.g.rotation.y = v.h; animPerson(v.per, 0, dt);
  }
}
// いまの会話: { who(話している相手), t(のこり秒), qa(こたえを待っているQ&A), opts(えらぶこたえ2つ) }
let talk = null, lastLine = null, lastQA = null, talkShown = null;
const bubV = new THREE.Vector3();
// 話しかけられる相手(いちばん近い人)。歩いているとき・手配されていないときだけ
function talkTarget() {
  if (!G.started || G.mode !== 'solo' || player.mode !== 'foot' || player.hp <= 0 || G.downT > 0 || G.stunT > 0 || G.shop || G.wanted > 0 || (talk && talk.qa)) return null;
  let best = null, bd = TALK.dist;
  const see = e => { if (e.off || e.down > 0 || e.angry || (talk && talk.who === e)) return; const d = Math.hypot(e.x - player.x, e.z - player.z); if (d < bd) { bd = d; best = e; } };
  peds.forEach(see); vendors.forEach(see); return best;
}
function setBubble(s) { const e = $('bubble'); e.textContent = s; e.style.display = 'block'; }
function endTalk() { if (talk && talk.qa && !talk.who.npc) talk.who.talkT = 0; talk = null; $('bubble').style.display = 'none'; $('qa').classList.add('hidden'); }
function pickLine(who) {
  const ok = LINES.filter(l => (TALK.later || !l.later) && !(who.oyaji && l.self) && l !== who.lastLine && l !== lastLine);
  const hints = ok.filter(l => l.hint), jokes = ok.filter(l => !l.hint), pool = hints.length && (Math.random() < TALK.hint || !jokes.length) ? hints : jokes;
  return pool[Math.floor(Math.random() * pool.length)];
}
// 「話す」ボタン: 近くの人が立ち止まって、ひとこと言う。ときどき質問(Q&A)される
function startTalk() {
  const who = talkTarget(); if (!who) return;
  endTalk(); who.talkT = TALK.show; let qa = null;
  if (who.oyaji) { if (!who.met || Math.random() < TALK.oyajiQa) qa = QAS.find(q => q.who === 'oyaji'); who.met = true; }
  else if (Math.random() < TALK.qa) { const pool = QAS.filter(q => q.who !== 'oyaji' && q !== lastQA); qa = who.vendor && Math.random() < 0.5 ? QAS[0] : pool[Math.floor(Math.random() * pool.length)]; }
  if (qa) {
    lastQA = qa; const opts = [{ text: qa.ok, ng: false }, { text: qa.ng, ng: true }]; if (Math.random() < 0.5) opts.reverse();
    talk = { who, qa, opts, t: TALK.wait }; setBubble(tr(qa.text));
    opts.forEach((o, i) => { $('qa' + i).textContent = tr(o.text); }); $('qa').classList.remove('hidden');
  } else { const l = pickLine(who); who.lastLine = lastLine = l; talk = { who, t: TALK.show }; setBubble(tr(l.text)); }
}
// 街の人・屋台の人がおこって、おそってくる(車を奪われておこった運転手と同じ動き。元の人は、いなくなるまで消しておく)
function makeAngry(who) { const n = newNpc('driver', who.x, who.z, who.h, who.look); n.state = 'angry'; n.cd = 0.8; who.angry = n; who.talkT = 0; who.per.g.visible = false; return n; }
// Q&A のこたえをえらぶ(i = 0 か 1)
function answerTalk(i) {
  if (!talk || !talk.qa || !talk.opts[i]) return;
  const who = talk.who, bad = talk.opts[i].ng; $('qa').classList.add('hidden'); talk.qa = null; talk.t = who.talkT = 1.8;
  if (!bad) setBubble('😊'); // いいこたえ(ごほうびは、なし)
  else if (who.oyaji) { setBubble('…'); talk.t = who.talkT = 2.6; } // 屋台のおやじは、おこらない(だまって見るだけ)
  else { talk.who = makeAngry(who); setBubble('💢'); talk.t = 2.4; } // おこって、おそってくる
}
// 毎フレーム: 「話す」ボタンを出す・消す、ふきだしを相手の頭の上に動かす
function updateTalk(dt) {
  const tg = talkTarget(); if (!!tg !== talkShown) { talkShown = !!tg; $('talkBtn').style.display = tg ? 'flex' : 'none'; }
  if (!talk) return;
  const w = talk.who, d = Math.hypot(w.x - player.x, w.z - player.z); talk.t -= dt;
  const gone = w.npc ? (w.hp <= 0 || npcs.indexOf(w) < 0) : (w.off || w.down > 0 || !!w.angry || G.wanted > 0); // 手配されたら、こわがって話をやめる
  if (talk.t <= 0 || gone || G.mode !== 'solo' || player.hp <= 0 || d > (talk.qa ? TALK.leave : 16) || (talk.qa && player.mode !== 'foot')) { endTalk(); return; }
  if (!w.npc) { if (talk.qa) w.talkT = Math.max(w.talkT, 0.3); w.h += angDiff(w.h, Math.atan2(player.x - w.x, player.z - w.z)) * Math.min(1, 8 * dt); } // こっちを向く
  const e = $('bubble'); bubV.set(w.x, 3.25 + (w.oyaji ? 0.55 : 0), w.z); bubV.project(camera);
  if (bubV.z > 1) { e.style.visibility = 'hidden'; return; } // カメラのうしろ
  e.style.visibility = 'visible'; e.style.left = clamp((bubV.x * 0.5 + 0.5) * innerWidth, 125, innerWidth - 125) + 'px'; e.style.top = Math.max(64, (-bubV.y * 0.5 + 0.5) * innerHeight) + 'px';
}


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
const G = { mode: 'menu', started: false, over: false, money: 0, wanted: 0, mi: 0, si: 0, timeLeft: -1, play: 0, evade: 0, bust: 0, downT: 0, stunT: 0, shop: null, shopLock: null, hitCd: 0, spawnCd: 0, failWait: 0, waitMsg: '', camYaw: Math.PI, camDrag: 0, clock: DAY.race, phase: 'night' };
// 配達競争の状態(online.js から setRace でもらう)
const R = { me: null, state: null, remotes: {}, avatars: {}, sendT: 0 };
let toastT = 0;
function toast(s, t) { const e = $('toast'); e.textContent = s; e.style.opacity = 1; toastT = t || 2.2; }
function addWanted(n) { if (G.mode !== 'solo') return; const before = G.wanted; G.wanted = Math.min(5, G.wanted + n); G.evade = 0; if (G.wanted > before && before === 0) toast(tr('警察に追われている！')); }
function beginStep() { const st = MISSIONS[G.mi].steps[G.si]; if (st.time) G.timeLeft = st.time; if (st.wanted) G.wanted = Math.max(G.wanted, st.wanted); marker.visible = st.type === 'go'; if (st.pos) marker.position.set(st.pos.x, 0, st.pos.z); }
function beginMission() { G.si = 0; G.timeLeft = -1; toast(tr('ミッション{n}：{title}', { n: G.mi + 1, title: tr(MISSIONS[G.mi].title) }), 2.6); beginStep(); }
function stepDone() {
  const m = MISSIONS[G.mi]; G.si++;
  if (G.si >= m.steps.length) {
    G.money += m.reward; G.timeLeft = -1; toast(tr('ミッション完了！ +${r}', { r: m.reward.toLocaleString() }), 2.6); G.mi++; marker.visible = false;
    if (G.mi >= MISSIONS.length) { setTimeout(gameClear, 1800); G.over = true; } else { G.failWait = 2.6; G.waitMsg = tr('次のミッションへ…'); }
  } else { toast(tr(m.steps[G.si - 1].done || 'チェックポイント通過！'), 1.2); beginStep(); }
}
function failMission(msg) { toast(msg, 2.6); G.timeLeft = -1; marker.visible = false; G.failWait = 2.8; G.waitMsg = tr('もう一度挑戦…'); }
function gameClear() {
  const t = Math.floor(G.play);
  $('clearPanel').innerHTML = '<h1>' + tr('ゲームクリア！') + '</h1><p>' + tr('街いちばんの配達屋になった！') + '</p><p>' + tr('所持金：') + '<b>$' + G.money.toLocaleString() + '</b><br>' + tr('プレイ時間：') + '<b>' + tr('{m}分{s}秒', { m: Math.floor(t / 60), s: t % 60 }) + '</b></p><p class="sub">' + tr('このあと街は自由に走り回れます。') + '</p><button class="btn-big" id="again">' + tr('もう一度遊ぶ') + '</button><button class="btn-big ghost" id="free">' + tr('街を自由に走る') + '</button>';
  $('clear').classList.remove('hidden'); $('again').onclick = () => location.reload(); $('free').onclick = () => $('clear').classList.add('hidden');
}
function busted() {
  G.money = Math.max(0, G.money - TUNE.police.fine); G.wanted = 0; G.bust = 0; removeAllPolice(); if (player.mode === 'car') exitCar(); player.x = startX; player.z = startZ;
  confiscate(); G.stunT = 0; player.per.g.rotation.x = 0; // 逮捕されても武器は没収
  if (G.mi < MISSIONS.length && !G.over && (G.si > 0 || MISSIONS[G.mi].steps[0].wanted)) failMission(tr('逮捕された！ -$1000　武器を没収　ミッション失敗')); else toast(tr('逮捕された！ -$1000　武器を没収'), 2.6);
}
function removeAllPolice() {
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].kind === 'police') removeCar(cars[i]);
  for (let i = npcs.length - 1; i >= 0; i--) if (npcs[i].kind === 'cop') removeNpc(npcs[i]);
}

/* ===== 昼と夜 ===== */
// [秒, 空の色, 上からの光, 下からの光, 光の強さ, 太陽(月)の光の色, その強さ, 明かり(0=消える〜1=つく), 霧の近く, 霧の遠く]。間は、なめらかに変わる
const ENV_KEYS = [
  [0, 0xe8a98a, 0xffd9c0, 0x5a4a44, 0.9, 0xffc9a0, 0.45, 0.5, 100, 310],   // 朝やけ
  [40, 0x8fc4ec, 0xffffff, 0x8a8272, 0.95, 0xfff4dc, 0.7, 0, 120, 360],    // 昼
  [270, 0x8fc4ec, 0xffffff, 0x8a8272, 0.95, 0xfff4dc, 0.7, 0, 120, 360],
  [330, 0xf08a4a, 0xffc79a, 0x5a3c30, 0.9, 0xff9a5a, 0.5, 0.6, 105, 320],  // 夕やけ(明かりがつきはじめる)
  [395, 0x3a2a5a, 0x9a90cc, 0x3f2e2c, 0.85, 0xb0a0e0, 0.38, 1, 95, 300],   // 日がくれる
  [440, 0x0b1028, 0x8a98d0, 0x3a2c26, 0.85, 0x9fb0e0, 0.35, 1, 90, 290],   // 夜(v=11 までと同じ)
  [690, 0x0b1028, 0x8a98d0, 0x3a2c26, 0.85, 0x9fb0e0, 0.35, 1, 90, 290],
  [720, 0xe8a98a, 0xffd9c0, 0x5a4a44, 0.9, 0xffc9a0, 0.45, 0.5, 100, 310],
];
const phaseOf = t => t < DAY.eve ? 'day' : t < DAY.night ? 'eve' : 'night';
function applyEnv(t) {
  let i = 0; while (i < ENV_KEYS.length - 2 && t >= ENV_KEYS[i + 1][0]) i++;
  const a = ENV_KEYS[i], b = ENV_KEYS[i + 1], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1), L = k => a[k] + (b[k] - a[k]) * f;
  const C = (k, col) => { const ch = sh => { const p = a[k] >> sh & 255, q = b[k] >> sh & 255; return (p + (q - p) * f) / 255; }; col.setRGB(ch(16), ch(8), ch(0)); };
  C(1, scene.background); C(1, scene.fog.color); scene.fog.near = L(8); scene.fog.far = L(9);
  C(2, hemi.color); C(3, hemi.groundColor); hemi.intensity = L(4); C(5, sun.color); sun.intensity = L(6);
  const lit = L(7);
  for (const m of NIGHT_MATS) m.emissive.setScalar(lit); // 窓の明かり
  for (const g of GLOW_MATS) g.m.opacity = g.o * lit;    // 地面にうつる光
  if (starPts) { starPts.visible = lit > 0.05; starPts.material.opacity = lit; }
  if (moonM) moonM.visible = lit > 0.5; if (sunM) sunM.visible = lit < 0.5;
}
// 時間に合わせて、マフィアと街の人をふやす・減らす。force でなければ、主人公の近くでは変えない
function applyPop(force) {
  const ph = G.mode === 'solo' ? G.phase : 'eve', far = (x, z) => force || Math.hypot(x - player.x, z - player.z) > DAY.far;
  for (const g of gangs) {
    const on = g.tier === 0 || (g.tier === 1 ? ph !== 'day' : ph === 'night'); if (!!g.off === !on) continue;
    if (on) { if (!far(g.home.x, g.home.z)) continue; g.off = false; respawnGang(g); }
    else { if (g.hp > 0 && !far(g.x, g.z)) continue; g.off = true; g.per.g.visible = false; }
  }
  const eve = G.mode === 'solo' && ph === 'eve';
  for (const p of peds) {
    if (p.tier === 0 || !!p.off === !eve) continue;
    if (eve) { p.bi = pedBlock(); p.t = Math.random() * 160; const q = pedPos(p); if (!far(q[0], q[1])) continue; p.off = false; p.down = 0; p.per.g.rotation.x = 0; p.per.g.visible = true; }
    else { if (!far(p.x, p.z)) continue; p.off = true; p.per.g.visible = false; }
  }
}
function setClock(t) { G.clock = ((t % DAY.len) + DAY.len) % DAY.len; G.phase = phaseOf(G.clock); applyEnv(G.clock); applyPop(true); }
let envT = 0;
function updateClock(dt) {
  if (G.mode === 'solo') {
    G.clock = (G.clock + dt * DAY.speed) % DAY.len; const ph = phaseOf(G.clock);
    if (ph !== G.phase) { G.phase = ph; if (toastT <= 0) toast(tr(ph === 'day' ? '朝になった' : ph === 'eve' ? '夕方になった' : '夜になった'), 1.8); }
  }
  envT -= dt; if (envT <= 0) { envT = 0.25; applyEnv(G.clock); applyPop(false); }
}

/* ===== 操作 ===== */
const input = { jx: 0, jy: 0, dash: false, brake: false, acc: false, rev: false }; const keys = {};
addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; keys[e.code] = true; if (e.code === 'KeyE' || e.code === 'KeyF') toggleCar(); if (e.code === 'KeyJ') playerAttack(); if (e.code === 'KeyQ') switchWeapon(); if (e.code === 'Space') e.preventDefault(); });
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
$('atkBtn').addEventListener('pointerdown', atkDown);
$('atkBtn').addEventListener('pointermove', atkMove);
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => $('atkBtn').addEventListener(t, atkUp));
$('wpnBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); switchWeapon(); });
$('healBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useHeal(); });
$('talkBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); startTalk(); });
[0, 1].forEach(i => $('qa' + i).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); answerTalk(i); }));
// 押している間だけ効くボタン(ダッシュ・アクセル・ブレーキ・バック)
const held = { dash: false, acc: false, brk: false, rev: false };
function holdBtn(id, k) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); held[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* なくてもよい */ } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, () => { held[k] = false; b.classList.remove('on'); }));
}
holdBtn('dashBtn', 'dash'); holdBtn('accBtn', 'acc'); holdBtn('brkBtn', 'brk'); holdBtn('revBtn', 'rev');
function releaseHeld() { for (const k in held) held[k] = false; for (const id of ['dashBtn', 'accBtn', 'brkBtn', 'revBtn']) $(id).classList.remove('on'); }
function readInput() {
  let jx = 0, jy = 0;
  if (keys.KeyA || keys.ArrowLeft) jx -= 1; if (keys.KeyD || keys.ArrowRight) jx += 1; if (keys.KeyW || keys.ArrowUp) jy += 1; if (keys.KeyS || keys.ArrowDown) jy -= 1;
  if (joy) { jx += joy.dx / 50; jy -= joy.dy / 50; }
  input.jx = clamp(jx, -1, 1); input.jy = clamp(jy, -1, 1);
  input.dash = held.dash || keys.ShiftLeft || keys.ShiftRight;
  // 車: アクセル・ブレーキ・バックのボタン(スティックは左右のハンドルだけ)。パソコンのキーは今のまま(W・S・Space)
  input.acc = held.acc || keys.KeyW || keys.ArrowUp; input.rev = held.rev || keys.KeyS || keys.ArrowDown; input.brake = held.brk || keys.Space;
}

/* ===== 車の乗り降り ===== */
function nearestEnterable() { let best = null, bd = TUNE.enterDist; for (const c of cars) { if (c.kind === 'police' && G.mode !== 'solo') continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } } return best; }
function toggleCar() {
  if (!G.started || G.stunT > 0 || G.downT > 0 || G.shop) return; if (player.mode === 'car') { exitCar(); return; }
  const c = nearestEnterable(); if (!c) return;
  if (c.kind === 'traffic') { ejectDriver(c); if (Math.abs(c.v) > 1) { addWanted(1); if (G.mode === 'solo') toast(tr('車を奪った！'), 1.4); } }
  else if (c.kind === 'police') stealPolice(c);
  enterCar(c);
}
// パトカーを奪う: ★+2。中に残っていた警察官は転がり出て、おそってくる。降りていた警察官は、もうこのパトカーにはもどらない
function stealPolice(c) {
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  for (let k = 0; k < c.crew; k++) { const s = k ? -1 : 1, n = newNpc('cop', c.x - rx * 1.8 * s, c.z - rz * 1.8 * s, c.h + Math.PI / 2); n.down = 0.9; n.kx = -rx * 5 * s; n.kz = -rz * 5 * s; resolve(n, 0.45); }
  c.crew = 0; c.empty = 0; c.rev = 0; c.node = null;
  for (const n of npcs) if (n.car === c) n.car = null;
  addWanted(TUNE.copCarWanted); toast(tr('パトカーを奪った！'), 1.6);
}
function copLights(c, t) { if (!c.lights) return; const on = t >= 0 && Math.floor(t * 6) % 2 === 0, off = t < 0; c.lights[0].material.color.setHex(off ? 0x400000 : on ? 0xff2020 : 0x400000); c.lights[1].material.color.setHex(off ? 0x001040 : on ? 0x001040 : 0x2050ff); }
function enterCar(c) { c.kind = 'player'; player.car = c; player.mode = 'car'; player.per.g.visible = false; releaseHeld(); }
function exitCar() {
  const c = player.car; if (!c) return; c.kind = 'parked'; if (c.cop) copLights(c, -1); // 降りたパトカーは、ライトを消して置いておく
  const rx = -Math.cos(c.h), rz = Math.sin(c.h); player.x = c.x - rx * 2.4; player.z = c.z - rz * 2.4; player.h = c.h; resolve(player, 0.5);
  player.mode = 'foot'; player.car = null; player.per.g.visible = true; releaseHeld();
}

/* ===== 毎フレームの動き ===== */
let shownCar = null;
function updatePlayer(dt) {
  const inCar = player.mode === 'car'; if (inCar !== shownCar) { shownCar = inCar; document.body.classList.toggle('incar', inCar); } // 車のボタンに切りかえ
  if (G.downT > 0) { player.per.g.position.set(player.x, 0.4, player.z); return; } // やられて倒れている
  if (G.stunT > 0) { // 車から引きずり出されて、たおれている
    G.stunT -= dt; player.per.g.position.set(player.x, 0.4, player.z); player.v = 0;
    if (G.stunT <= 0) player.per.g.rotation.x = 0;
    return;
  }
  if (player.mode === 'foot') {
    const a = G.camYaw; const fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    let mx = fx * input.jy + rx * input.jx, mz = fz * input.jy + rz * input.jx; const l = Math.hypot(mx, mz); let sp = 0;
    if (l > 0.08) { mx /= l; mz /= l; sp = (input.dash ? TUNE.dash : TUNE.walk) * Math.min(1, l); player.x += mx * sp * dt; player.z += mz * sp * dt; player.h += angDiff(player.h, Math.atan2(mx, mz)) * Math.min(1, 12 * dt); }
    resolve(player, 0.5);
    for (const c of cars) { const dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz); if (d < 2.1 && d > 0.001) { player.x = c.x + dx / d * 2.1; player.z = c.z + dz / d * 2.1; } }
    player.v = sp;
    const per = player.per; per.g.position.set(player.x, onWalk(player.x, player.z) ? 0.3 : 0, player.z); per.g.rotation.y = player.h; animPerson(per, sp, dt);
    if (player.swing > 0) { player.swing -= dt; per.armR.rotation.x = -1.5; }
    $('enterBtn').textContent = tr('乗る'); $('enterBtn').classList.toggle('near', !!nearestEnterable());
  } else {
    const c = player.car; const th = (input.acc ? 1 : 0) - (input.rev ? 1 : 0), st = input.jx;
    if (input.brake) { const b = Math.min(Math.abs(c.v), TUNE.carBrake * dt); c.v -= Math.sign(c.v) * b; }
    else if (th > 0.05) { const vmax = c.cop ? TUNE.copCarMax : TUNE.carMax; if (c.v < 0) c.v += 40 * dt * th; else c.v += TUNE.carAccel * th * dt * (1 - c.v / vmax); }
    else if (th < -0.05) { if (c.v > 0) c.v += 38 * th * dt; else c.v = Math.max(-TUNE.carReverse, c.v + 12 * th * dt); }
    else { c.v *= 1 - 0.7 * dt; if (Math.abs(c.v) < 0.3) c.v = 0; }
    const tf = clamp(c.v / 7, -1, 1) * (Math.abs(c.v) > 22 ? 0.75 : 1); c.h -= st * TUNE.steer * dt * tf;
    c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
    if (resolveCar(c)) c.v *= Math.abs(c.v) > 3 ? -0.25 : 0.5;
    player.x = c.x; player.z = c.z; player.h = c.h; player.v = c.v;
    if (c.cop) copLights(c, performance.now() / 1000); // 奪ったパトカー: 屋根のライトが光る
    $('enterBtn').textContent = tr('降りる'); $('enterBtn').classList.remove('near');
  }
}
function updateTraffic(c, dt) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h); let blocked = false;
  const others = [{ x: player.x, z: player.z, same: true }];
  for (const o of cars) if (o !== c && o.kind !== 'player') others.push({ x: o.x, z: o.z, same: o.kind !== 'traffic' || (Math.sin(o.h) * fx + Math.cos(o.h) * fz) > 0.5 });
  for (const id in R.avatars) { const a = R.avatars[id]; if (a.seen) others.push({ x: a.x, z: a.z, same: true }); }
  for (const o of others) { const rx = o.x - c.x, rz = o.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 7.5 && sd < 2.4 && o.same) { blocked = true; break; } }
  if (!blocked) for (const g of gangs) { if (g.hp <= 0 || !g.per.g.visible) continue; const rx = g.x - c.x, rz = g.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 && sd < 2) { blocked = true; break; } }
  if (!blocked) for (const g of npcs) { if (g.hp <= 0) continue; const rx = g.x - c.x, rz = g.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 && sd < 2) { blocked = true; break; } }
  if (!blocked) for (const p of peds) { if (p.down > 0 || p.off || p.angry) continue; const rx = p.x - c.x, rz = p.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 && sd < 2) { blocked = true; break; } }
  const tv = blocked ? 0 : 11; c.v += clamp(tv - c.v, -30 * dt, 8 * dt); c.p += c.v * dt / CELL;
  if (c.p >= 1) { c.p -= 1; const nb = neighbors(c.b).filter(n => !sameNode(n, c.a)); const nx = nb.length ? nb[Math.floor(Math.random() * nb.length)] : c.a; c.a = c.b; c.b = nx; }
  const A = nodePos(c.a), B = nodePos(c.b); const ex = (B.x - A.x) / CELL, ez = (B.z - A.z) / CELL;
  const tx = A.x + (B.x - A.x) * c.p + ez * 3.2, tz = A.z + (B.z - A.z) * c.p - ex * 3.2; const k = 1 - Math.exp(-6 * dt); c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
  c.h += angDiff(c.h, Math.atan2(ex, ez)) * Math.min(1, 5 * dt);
}
function updatePolice(c, dt, t) {
  const tx = player.x, tz = player.z, d = Math.hypot(tx - c.x, tz - c.z);
  copLights(c, t);
  const out = npcs.some(n => n.car === c && n.hp > 0);
  if (out || c.crew <= 0) { // 警察官が降りている間は止まっている。全員たおされたら、しばらくして消える
    c.v *= 1 - 4 * dt; if (Math.abs(c.v) < 0.2) c.v = 0;
    c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt; resolveCar(c);
    if (!out && c.crew <= 0) { c.empty = (c.empty || 0) + dt; if (c.empty > 10) c.gone = true; }
    return;
  }
  const slowP = player.mode === 'foot' || Math.abs(player.car.v) < 6;
  if (c.rev > 0) { c.rev -= dt; c.v = -7; c.h += 1.6 * dt; }
  else if (d < TUNE.police.deployDist && slowP && G.stunT <= 0) { // 近くで止まって、警察官が降りる
    c.v += clamp(-c.v, -35 * dt, 35 * dt);
    if (Math.abs(c.v) < 1.5) { c.v = 0; deployCops(c); }
  }
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
    if (p.off) continue; // 夕方だけの人(いまは出ていない)
    if (p.down > 0) {
      p.down -= dt; p.x += p.push.x * dt; p.z += p.push.z * dt; p.push.x *= 1 - 3 * dt; p.push.z *= 1 - 3 * dt; p.per.g.position.set(p.x, 0.3, p.z);
      if (p.down <= 0) { p.per.g.rotation.x = 0; p.bi = pedBlock(); p.t = Math.random() * 160; }
      continue;
    }
    if (p.angry) { if (npcs.indexOf(p.angry) >= 0) { p.per.g.visible = false; continue; } p.angry = null; p.bi = pedBlock(); p.t = Math.random() * 160; p.per.g.visible = true; } // おこって追いかけている間は、別の人(npcs)として動く
    const fleeing = G.wanted >= 2, stop = p.talkT > 0; // 話している間は立ち止まる
    if (stop) p.talkT -= dt; else { p.t += p.dir * p.speed * (fleeing ? 2.2 : 1) * dt; const q = pedPos(p); p.x = q[0]; p.z = q[1]; p.h = q[2]; }
    if (player.mode === 'car') { const c = player.car; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 2.4 && Math.abs(c.v) > 5) { p.down = 7; p.per.g.rotation.x = -Math.PI / 2; p.push.x = Math.sin(c.h) * c.v * 0.6; p.push.z = Math.cos(c.h) * c.v * 0.6; addWanted(1); continue; } }
    p.per.g.position.set(p.x, 0.3, p.z); p.per.g.rotation.y = p.h; animPerson(p.per, stop ? 0 : p.speed * (fleeing ? 2.2 : 1), dt);
  }
}
function managePolice(dt) {
  const dayX = G.phase === 'day' ? 1 : G.phase === 'night' ? -1 : 0; // 昼はパトカーが1台多い、夜は1台少ない
  const want = G.wanted === 0 ? 0 : clamp(G.wanted + dayX, 1, TUNE.police.maxCars + (dayX > 0 ? 1 : 0)); const pol = cars.filter(c => c.kind === 'police');
  if (G.wanted === 0 && pol.length) { removeAllPolice(); return; }
  G.spawnCd -= dt;
  if (pol.length < want && G.spawnCd <= 0) {
    G.spawnCd = 2.5; const cand = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const q = P(i, j); const d = Math.hypot(q.x - player.x, q.z - player.z); if (d > 60 && d < 130) cand.push(q); }
    if (cand.length) { const q = cand[Math.floor(Math.random() * cand.length)]; const c = newCar('police', q.x, q.z, Math.atan2(player.x - q.x, player.z - q.z), 0); c.v = 10; }
  }
  let nd = 1e9, nearCop = false; for (const c of pol) if (c.crew > 0) nd = Math.min(nd, Math.hypot(c.x - player.x, c.z - player.z));
  for (const n of npcs) { if (n.kind !== 'cop' || n.hp <= 0 || n.state !== 'chase' || n.blind > 0 || n.frozen > 0) continue; const d = Math.hypot(n.x - player.x, n.z - player.z); nd = Math.min(nd, d); if (player.mode === 'foot' && d < TUNE.police.catchDist && n.stagger <= 0) nearCop = true; }
  if (G.wanted > 0) { if (nd > TUNE.police.evadeDist) G.evade += dt; else G.evade = Math.max(0, G.evade - dt * 0.5); if (G.evade > TUNE.police.evadeTime * (G.phase === 'day' ? DAY.dayEvade : 1)) { G.wanted--; G.evade = 0; toast(tr(G.wanted ? '手配度ダウン' : '逃げ切った！'), 1.6); } }
  // 逮捕: 歩いている主人公に、警察官がしばらくくっつく
  if (G.wanted > 0 && nearCop) G.bust += dt; else G.bust = Math.max(0, G.bust - dt);
  $('warn').textContent = G.bust > 0.2 ? tr('逃げろ！ 捕まるぞ！') : ''; if (G.bust > TUNE.police.bustTime) busted();
}
function updateMission(dt) {
  if (G.over || G.mi >= MISSIONS.length) return;
  if (G.failWait > 0) { G.failWait -= dt; if (G.failWait <= 0) beginMission(); return; }
  const st = MISSIONS[G.mi].steps[G.si];
  if (G.timeLeft > 0) { G.timeLeft -= dt; if (G.timeLeft <= 0) { failMission(tr('時間切れ… ミッション失敗')); return; } }
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
  // 店と病院のしるし
  const icon = (x, z, bg, ch) => { g.fillStyle = bg; g.beginPath(); g.arc(X(x), X(z), 11, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, X(x), X(z) + 1); };
  for (const sh of SHOPS) icon(sh.x, sh.z, sh.kind === 'gun' ? '#d6402a' : '#1f9a4a', tr(sh.kind === 'gun' ? '武' : '薬'));
  icon(HOSPITAL.x, HOSPITAL.z + 8, '#ffffff', '');
  g.fillStyle = '#16a34a'; g.fillRect(X(HOSPITAL.x) - 2.5, X(HOSPITAL.z + 8) - 7, 5, 14); g.fillRect(X(HOSPITAL.x) - 7, X(HOSPITAL.z + 8) - 2.5, 14, 5);
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
  if (G.over || !m) html = '<div class="t">' + tr('フリー走行') + '</div>' + tr('街を自由に走り回ろう');
  else if (G.failWait > 0) html = '<div class="t">' + tr('ミッション{n}', { n: G.mi + 1 }) + '</div>' + G.waitMsg;
  else { const st = m.steps[G.si]; html = '<div class="t">' + tr('ミッション{n}/{total}：{title}', { n: G.mi + 1, total: MISSIONS.length, title: tr(m.title) }) + '</div>' + tr(st.text); if (st.type === 'go') { const d = Math.hypot(st.pos.x - player.x, st.pos.z - player.z); html += '<div class="d">' + tr('あと {d} m', { d: Math.round(d) }) + '</div>'; } }
  $('mission').innerHTML = html; $('money').textContent = '$' + G.money.toLocaleString();
  let s = ''; for (let i = 0; i < 5; i++) s += '<span style="color:' + (i < G.wanted ? '#ffd23f' : 'rgba(255,255,255,.35)') + '">★</span>'; $('stars').innerHTML = s;
  $('clock').textContent = G.phase === 'day' ? '☀ ' + tr('昼') : G.phase === 'eve' ? '◐ ' + tr('夕方') : '☾ ' + tr('夜');
  const hp = Math.max(0, player.hp); $('hpFill').style.width = hp + '%'; $('hpFill').style.background = hp < 30 ? '#e8463c' : ''; $('hpText').textContent = tr('体力 {n}', { n: Math.ceil(hp) });
  $('armorBar').style.display = player.armor > 0 ? 'block' : 'none'; $('armorFill').style.width = (player.armor / TUNE.armor * 100) + '%';
  const hb = $('healBtn'); hb.style.display = player.heals > 0 ? 'flex' : 'none'; hb.textContent = tr('回復 ×{n}', { n: player.heals });
  const wk = player.inv[player.wi]; $('wpnBtn').textContent = tr(WEAPONS[wk].name) + (isGun(wk) ? ' ' + ammoOf(wk) : '') + (player.inv.length > 1 ? ' ⇄' : '');
  $('timer').textContent = G.timeLeft > 0 ? tr('残り {n} 秒', { n: Math.ceil(G.timeLeft) }) : ''; $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : '';
}
function updateRaceHUD() {
  const s = R.state; let html = '<div class="t">' + tr('配達競争：{n}点先取', { n: (s && s.target) || 3 }) + '</div>';
  if (!s) html += tr('準備中…');
  else if (s.phase === 'end') html += tr('おわり！');
  else {
    const holder = raceHolder();
    if (!holder) { html += tr('荷物(黄色い光)を取りに行け！'); html += '<div class="d">' + tr('あと {d} m', { d: Math.round(Math.hypot(s.pkg.x - player.x, s.pkg.z - player.z)) }) + '</div>'; }
    else if (holder === R.me) { html += tr('届け先(緑の光)へ急げ！') + '<div class="d">' + tr('ぶつかられると取られるぞ'); if (s.dest) html += tr('・あと {d} m', { d: Math.round(Math.hypot(s.dest.x - player.x, s.dest.z - player.z)) }); html += '</div>'; }
    else html += tr('{name} から荷物を奪え！', { name: '<b style="color:' + raceColor(holder) + '">' + esc(raceName(holder)) + '</b>' }) + '<div class="d">' + tr('赤い光の人にぶつかろう') + '</div>';
  }
  $('mission').innerHTML = html;
  let sc = '';
  if (s && s.players) for (const id of Object.keys(s.players).sort((a, b) => (s.players[a].slot || 0) - (s.players[b].slot || 0))) sc += '<div' + (id === R.me ? ' class="me"' : '') + '><span class="dot" style="background:' + raceColor(id) + '"></span>' + esc(s.players[id].name) + '　' + tr('{n}点', { n: (s.scores && s.scores[id]) || 0 }) + '</div>';
  $('scores').innerHTML = sc; $('money').textContent = ''; $('stars').innerHTML = ''; $('clock').textContent = ''; $('timer').textContent = '';
  $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : '';
}

/* ===== 店(武器屋・薬屋) ===== */
// 売っている物と値段(あとで遊びながら直す)。can: 買えるか、why: 買えないときの理由
const SHOP_ITEMS = {
  gun: [
    { name: () => tr('ピストル(弾12発つき)'), price: 500, can: () => !player.inv.includes('pistol'), why: () => tr('持っている'), buy: () => addWeapon('pistol', 12) },
    { name: () => tr('ピストルの弾 12発'), price: 100, can: () => player.inv.includes('pistol'), why: () => tr('ピストルがない'), buy: () => { player.ammo += 12; } },
    { name: () => tr('日本刀'), price: 300, can: () => !player.inv.includes('katana'), why: () => tr('持っている'), buy: () => addWeapon('katana') },
    { name: () => tr('マシンガン(弾50発つき)'), price: 1500, can: () => !player.inv.includes('mg'), why: () => tr('持っている'), buy: () => addWeapon('mg', 50) },
    { name: () => tr('マシンガンの弾 50発'), price: 250, can: () => player.inv.includes('mg'), why: () => tr('マシンガンがない'), buy: () => { player.mg += 50; } },
  ],
  drug: [
    { name: () => tr('その場で全回復'), price: 150, can: () => player.hp < TUNE.hp, why: () => tr('体力は満タン'), buy: () => { player.hp = TUNE.hp; } },
    { name: () => tr('回復薬(体力+{hp}。{max}つまで持てる)', { hp: TUNE.healItem, max: TUNE.maxHeal }), price: 200, can: () => player.heals < TUNE.maxHeal, why: () => tr('もう{max}つ持っている', { max: TUNE.maxHeal }), buy: () => { player.heals++; } },
    { name: () => tr('防弾チョッキ({n})', { n: TUNE.armor }), price: 400, can: () => player.armor < TUNE.armor, why: () => tr('もう着ている'), buy: () => { player.armor = TUNE.armor; } },
  ],
};
function renderShop() {
  const s = G.shop; if (!s) return;
  $('shopName').textContent = tr(s.name);
  $('shopInfo').innerHTML = tr('所持金 ${m}', { m: G.money.toLocaleString() }).replace(/\$([\d,]+)/, '<b>$$$1</b>') + '　' + tr('体力 {n}', { n: Math.ceil(player.hp) }) + (player.armor > 0 ? '　' + tr('チョッキ {n}', { n: player.armor }) : '') + (player.heals ? '　' + tr('回復薬 {n}', { n: player.heals }) : '') + (player.inv.includes('pistol') ? '　' + tr('弾 {n}', { n: player.ammo }) : '') + (player.inv.includes('mg') ? '　' + tr('マシンガンの弾 {n}', { n: player.mg }) : '');
  $('shopList').innerHTML = SHOP_ITEMS[s.kind].map((it, i) => {
    const ok = it.can(), money = G.money >= it.price;
    return '<button class="shopItem" data-i="' + i + '"' + (ok && money ? '' : ' disabled') + '><span>' + esc(it.name()) + '</span><b>$' + it.price.toLocaleString() + '</b>' + (!ok ? '<small>' + esc(it.why()) + '</small>' : !money ? '<small>' + tr('お金がたりない') + '</small>' : '') + '</button>';
  }).join('');
}
function openShop(s) {
  G.shop = s; releaseHeld(); if (joy) { joy = null; setKnob(0, 0); } camTouch = null;
  renderShop(); $('shop').classList.remove('hidden');
}
function closeShop() { if (!G.shop) return; G.shopLock = G.shop; G.shop = null; $('shop').classList.add('hidden'); updateHUD(); }
$('shopList').addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('.shopItem') : null; if (!b || !G.shop) return;
  const it = SHOP_ITEMS[G.shop.kind][+b.dataset.i]; if (!it || !it.can() || G.money < it.price) return;
  G.money -= it.price; it.buy(); renderShop();
});
$('shopExit').addEventListener('click', closeShop);
// 店の光るマークに歩いて入ると、ゲームが止まって買い物の画面が出る(出たあとは、一度はなれるまで出ない)
function checkShops(t) {
  for (const s of SHOPS) { s.g.visible = G.mode === 'solo'; s.ring.position.y = 0.5 + Math.sin(t * 3) * 0.15; }
  if (G.mode !== 'solo') return;
  if (G.shopLock && Math.hypot(G.shopLock.x - player.x, G.shopLock.z - player.z) > 3) G.shopLock = null;
  if (player.mode !== 'foot' || player.hp <= 0 || G.downT > 0 || G.stunT > 0) return;
  for (const s of SHOPS) if (s !== G.shopLock && Math.hypot(s.x - player.x, s.z - player.z) < 1.8) { openShop(s); return; }
}

/* ===== ループ ===== */
let last = performance.now(), T = 0, hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (G.started && G.shop) { /* 買い物中は止まる */ }
  else if (G.started) {
    readInput(); updatePlayer(dt); updateClock(dt);
    for (const c of cars) { if (c.kind === 'traffic') updateTraffic(c, dt); else if (c.kind === 'police') updatePolice(c, dt, T); else if (c.kind === 'parked') updateParked(c, dt); }
    if (G.mode === 'race') updateAvatars(dt);
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].gone) removeCar(cars[i]);
    carPairs(); updatePeds(dt); updateVendors(dt); updateGangs(dt); updateNpcs(dt); updatePickups(dt, T); updateMkw(dt, T); updateShots(dt); updateFx(dt);
    if (G.mode === 'solo') updateCombat(dt);
    if (G.mode === 'solo') { managePolice(dt); updateMission(dt); }
    else { $('warn').textContent = ''; updateRaceMarks(T); R.sendT -= dt; if (R.sendT <= 0 && SC.onSend) { R.sendT = TUNE.posRate; SC.onSend(SC.getMe()); } }
    checkShops(T); G.hitCd -= dt; G.play += dt;
    for (const c of cars) { c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h; }
    updateCamera(dt); updateTalk(dt); marker.rotation.y += dt; ring.position.y = 0.4 + Math.sin(T * 3) * 0.2;
    hudT -= dt; if (hudT <= 0) { updateHUD(); hudT = 0.1; } drawMinimap();
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  } else {
    for (const c of cars) { if (c.kind === 'traffic') updateTraffic(c, dt); c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h; }
    updatePeds(dt); updateVendors(dt); updateGangs(dt); updateNpcs(dt);
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
  lockLandscape(); document.body.classList.add('solo');
  G.mode = 'solo'; showOnly(null); setPlaying(true); resetPlayerToFoot(startX, startZ, startH); setClock(DAY.start); beginMission(); // ひとり用は昼から
  if (window.BackGuard) BackGuard.set('game', () => location.reload());
}
$('goSolo').addEventListener('click', startSolo);
$('quitBtn').addEventListener('click', () => { if (G.mode === 'solo') location.reload(); else if (SC.onQuit) SC.onQuit(); });
if (window.BackGuard) BackGuard.set('home');

const SC = window.SC = {
  G, R, player, cars, peds, TUNE, MISSIONS, P, gangs, pickups, npcs, SHOPS, HOSPITAL, SHOP_ITEMS, closeShop, WEAPONS, MKT, MKW, shots, newNpc, confiscate, DAY, setClock, vendors, TALK, LINES, QAS, makeVip, startTalk, answerTalk, pickLine, getTalk: () => talk, camera,
  onSend: null, onQuit: null,
  startSolo,
  showOnly, setPlaying,
  onRoad: (x, z) => !inMerged(x, z), // 道路の上か(つなげた区画の中は道路ではない)
  extraSpots: EXTRA_SPOTS,
  // 配達競争を始める。slot は 0〜3(並ぶ場所)
  startRace(meId, slot, color) {
    document.body.classList.remove('solo'); G.mode = 'race'; G.wanted = 0; removeAllPolice(); R.me = meId; R.state = null; R.remotes = {};
    setClock(DAY.race); // 配達競争は夜のまま(時間は流れない)
    const sp = RACE_SPAWN[slot % 4], c0 = P(3, 3); const x = c0.x + sp[0] * sp[2] + sp[1] * 3.2, z = c0.z + sp[1] * sp[2] - sp[0] * 3.2, h = Math.atan2(sp[0], sp[1]);
    resetPlayerToFoot(x, z, h);
    if (R.myCar) removeCar(R.myCar);
    const car = R.myCar = newCar('parked', x, z, h, color || 0xffffff);
    enterCar(car);
    showOnly(null); setPlaying(true); toast(tr('配達競争スタート！'), 2.2);
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
    if (scored) toast(tr('{who}が配達成功！ {n}点', { who: scored === R.me ? tr('あなた') : raceName(scored), n: s.scores[scored] }), 2.4);
    else if (nh && nh !== ph) {
      if (nh === R.me) toast(tr(ph ? '荷物を奪った！' : '荷物ゲット！ 届け先へ急げ'), 2);
      else if (ph === R.me) toast(tr('{name}に荷物を奪われた！', { name: raceName(nh) }), 2);
      else toast(tr(ph ? '{name}が荷物を奪った' : '{name}が荷物を取った', { name: raceName(nh) }), 2);
    }
  },
  getMe() { return { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10, h: Math.round(player.h * 100) / 100, c: player.mode === 'car' ? 1 : 0, v: Math.round((player.v || 0) * 10) / 10 }; },
  toast,
};
applyEnv(G.clock);
requestAnimationFrame(frame);
})();
