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
  carMax: 35, carAccel: 19,        // セダン・タクシーの最高速度(35 = 約126km/h)と加速。ほかの車の速さ・曲がりやすさ・重さは CAR_TYPES(v=21)
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
  // 配達競争の警察(v=20): 人をひいた人だけ追われる。パトカーの数・中の警察官の数・パトカーにぶつけて手配になる速さ
  //   逃げ切る距離と秒・つかまるまでの秒は police と同じ
  racePolice: { cars: 1, crew: 2, ramSpeed: 9 },
  peace: true,                     // お使いの間(大きな仕事が終わるまで)は、マフィアがおそってこない
  hp: 100, deathFine: 0.1,         // 主人公の体力、やられたときに減るお金(所持金の1割。最低$100)
  gang: { count: 16, hp: 100, speed: 4.2, turf: 15, giveUp: 32, respawn: 30, feud: 12, feudGiveUp: 22, feudDmg: 2 }, // ギャング: 数(街)・体力・走る速さ・なわばりの広さ・あきらめる距離・生きかえるまでの秒
  //   v=18 黒と白のケンカ: feud = これより近くで出会うとケンカ、feudGiveUp = これよりはなれるとやめる、feudDmg = マフィアどうしのダメージの倍
  // v=19 幹部と大ボス: hp = 幹部の体力、speed = 幹部と大ボスの走る速さ(手下より少し速い)、minions = 幹部の手下の数
  //   oyajiHp = 大ボス(屋台のおやじ)の体力、call = 体力が半分になると呼ぶ手下の数、near = これより近いと刀・遠いとピストル、carDmg = 車でひいたときのダメージの倍、giveUp = 幹部と大ボスがあきらめる距離(遠くから撃たれても、追ってくる)
  boss: { hp: 300, speed: 4.9, minions: 3, oyajiHp: 500, call: 6, near: 6, carDmg: 0.3, giveUp: 60 },
  hunt: { cars: 2, speed: 29, wait: 4, back: 0.9 }, // 「幹部の車をいただけ」の追っ手の車: 台数・速さ・次の1台が出るまでの秒・ぶつけたあと下がる秒
  // 昼と夜(v=12): 1日の秒・夕方が始まる秒・夜が始まる秒・ひとり用が始まる秒・配達競争とスタート画面の時間(夜)・時間の速さ(0 で止まる)
  //   far = 人がふえたり減ったりするのは、主人公からこれだけはなれた所だけ(目の前で急に消えないように)
  //   gangNight = 夜のマフィアの倍(昼は街のマフィアが半分)、pedEve = 夕方の街の人の倍、dayEvade = 昼に★がへるまでの時間の倍
  day: { len: 720, eve: 300, night: 420, start: 40, race: 560, speed: 1, far: 60, gangNight: 1.5, pedEve: 1.5, dayEvade: 1.5 },
  // 配達競争の時間(v=20。ホストが待合室でえらぶ。時間は流れない): 昼・夕方(夕やけ)・夜の秒
  raceAt: { day: 150, eve: 350, night: 560 },
  // ライフル(v=29): 値段・弾の値段・弾の数(買うと・弾だけ)・撃ったあと次を撃てない秒・スコープの見える広さ(度)・ドラッグの速さ・当たる太さ
  //   boss = 幹部・大ボスへのダメージ(手下・警察官は1発)、pvp = サバイバルでのダメージ(2発)、tap = これより短く押しただけなら撃たない(秒)
  rifle: { price: 3000, ammoPrice: 300, ammo: 5, cd: 1.5, fov: 14, sens: 0.0011, hitR: 0.6, boss: 100, pvp: 50, tap: 0.3 },
  // 屋上(v=29): 上がれるビルの数(高い順)・下からマフィアが撃ってくる距離と当たる割合・警察官が上がってくる★・何秒ごと・何人まで
  roof: { count: 4, gangRange: 40, gangHit: 0.35, copWanted: 3, copEvery: 8, copMax: 2 },
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
// realH(v=29) = 見た目の高さ。乱数は h のときと同じだけ使う(あとの街の作りを変えないため)。窓の絵は乱数を元にもどして作る
function makeBuilding(x, z, w, d, h, realH) {
  const base = palette[Math.floor(rnd() * palette.length)];
  const rows = Math.max(2, Math.round(h / 4)), cw = Math.max(2, Math.round(w / 4)), cd = Math.max(2, Math.round(d / 4));
  nightWin(cw, rows, base, 0.28, false); nightWin(cd, rows, base, 0.28, false); // h のときと同じだけ乱数を使う
  let mz, mx;
  if (realH) { const sv = seed, had = new Set(Object.keys(texCache)), rr = Math.max(2, Math.round(realH / 4)); mz = nightMat(cw, rr, base, 0.28, false); mx = nightMat(cd, rr, base, 0.28, false); for (const k of Object.keys(texCache)) if (!had.has(k)) delete texCache[k]; seed = sv; h = realH; }
  else { mz = nightMat(cw, rows, base, 0.28, false); mx = nightMat(cd, rows, base, 0.28, false); }
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, roofMat, roofMat, mz, mz]); m.position.set(x, h / 2 + 0.3, z); scene.add(m);
  addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2); buildings.push({ x, z, w, d, h });
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
// 通りの名前(v=23)。南北の道は西から A〜G、東西の道は北から H〜N(roadC(0)〜roadC(6))
const STREET_NS = ['ウエスト通り', '西門通り', '夜市通り', '中央通り', '東門通り', 'パーク通り', 'ハーバー通り'];
const STREET_EW = ['ビル街通り', 'サンセット通り', '北門通り', '塔前通り', '漢方通り', '南門通り', '倉庫通り'];
const plateCache = {};
function streetPlate(name) {
  if (!plateCache[name]) {
    const t = canvasTex(64 * name.length + 48, 72, (c, w, h) => { c.fillStyle = '#1f6b45'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#ffffff'; c.font = 'bold 50px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w / 2, h / 2 + 2); });
    plateCache[name] = { mat: new THREE.MeshLambertMaterial({ map: t }), w: 0.42 * name.length + 0.32 };
  }
  const p = plateCache[name], m = new THREE.Mesh(BG(p.w, 0.48, 0.06), p.mat); m.userData.w = p.w; return m;
}
// いまいる通り(道の上にいないときは null)。交差点では、前にいた通りのまま
function streetAt(x, z, prev) {
  if (Math.abs(x) > HALF + 6.5 || Math.abs(z) > HALF + 6.5 || inMerged(x, z)) return null;
  let i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL); i = clamp(i, 0, N); j = clamp(j, 0, N);
  const dx = Math.abs(x - roadC(i)), dz = Math.abs(z - roadC(j)), ns = dx < 7 ? STREET_NS[i] : null, ew = dz < 7 ? STREET_EW[j] : null;
  if (ns && ew) return prev === ns || prev === ew ? prev : dx < dz ? ns : ew;
  return ns || ew;
}
const LANTERNS = [], GLOWS = [], WIRES = [];
const EXTRA_SPOTS = []; // 配達競争: 道路のほかに荷物・届け先が出る場所(市場・公園・ビルの前・駐車場)
const MK_SPOTS = []; // 市場の武器(豚の頭・ヘビ・青龍刀)が出る場所
const MK_DEEP = { x: 0, z: 0 }; // 市場の奥(ミッション「市場のおつかい」で品物を受け取る所。market() の中で決める)
const MKC = {}; // 市場の迷路のマス(v=32): ix0・iz0 = 左上、cw・ch = マスの大きさ、ix1・iz1 = 右下(market() の中で決める)
const mkCell = (r, c) => ({ x: MKC.ix0 + (c + 0.5) * MKC.cw, z: MKC.iz0 + (r + 0.5) * MKC.ch });
const STALLS = []; // 市場の屋台の場所(屋台の人を立たせるのに使う)
// 黒マフィアのクラブ(v=16): 塔の西どなりの区画の、南がわ。店3けん分の場所に建てる(中には入れない。中は出だしのお話だけ)
const CLUB = { x: roadC(3) - 18.8, z: roadC(3) - 12.5, w: 21.4, d: 9, h: 9.5 };
// ホームのアパート(v=17): スタートの横の青い光のうしろ。店2けん分の場所に建てる(中には入れない)
const HOME_X = roadC(3) + 14; // ホームの青い光(アパートの入口の前)
const APT = { x: roadC(3) + 15.2, z: roadC(3) + 12.5, w: 14.3, d: 9, h: 13.4 };
const inClub = (x, z) => [CLUB, APT].some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < 1); // クラブ・アパートの場所(店は建てない)
// クラブのネオン: 夕方と夜だけ光る(昼は消える)。applyEnv で色を変える
const NEON_MATS = [];
function neonMat(col, map) { const m = new THREE.MeshBasicMaterial(map ? { map } : { color: col }); NEON_MATS.push({ m, on: new THREE.Color(map ? 0xffffff : col), off: new THREE.Color(map ? 0x3c3842 : 0x2c2832) }); return m; }
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
  const skip = inClub(x, z); // クラブ・アパートの場所: 乱数だけ前と同じ数だけ使って、店は建てない(ほかの店の見た目を変えないため)
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
  for (const sx of [-w / 2 + 1.1, w / 2 - 1.1]) { const q = toW(x, z, r, sx, d / 2 + 0.6), c = rnd() < 0.5 ? 1 : 0; if (!skip) LANTERNS.push([q[0], 3.0, q[1], 0.7, c]); }
  if (skip) return;
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
    makeBuilding(cx, cz, W - 6, D - 6, 14, 78); EXTRA_SPOTS.push({ x: cx - 25, z: r.z1 - 1.3 }, { x: cx + 25, z: r.z1 - 1.3 }); // ビルの前。v=29: 見た目は78m(乱数は14mのときと同じだけ使う)
  } else if (m.kind === 'parking') {
    addBox(W, 0.3, D, cx, 0.15, cz, M(0x34343a));
    const pos = []; for (const row of [0, 1, 2]) for (let k = 0; k <= 14; k++) pos.push([r.x0 + 8 + row * 12, r.z0 + 3 + k * 6]);
    const lg = new THREE.PlaneGeometry(5, 0.15); lg.rotateX(-Math.PI / 2); const im = new THREE.InstancedMesh(lg, M(0xdddddd), pos.length), o = new THREE.Object3D();
    pos.forEach((q, i) => { o.position.set(q[0], 0.32, q[1]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); scene.add(im);
    EXTRA_SPOTS.push({ x: r.x0 + 14, z: cz - 25 }, { x: r.x0 + 26, z: cz }, { x: r.x0 + 14, z: cz + 25 }); // 車のならびの間
    for (let k = 0; k < 4; k++) { const lz = r.z0 + 12 + k * 23; addBox(0.25, 6, 0.25, cx, 3.3, lz, M(0x333333)); addBox(0.9, 0.3, 0.9, cx, 6.3, lz, MB(0xfff0c8)); GLOWS.push([cx, lz, 10, 2]); }
  }
}
// 黒マフィアのクラブ(v=16)。正面は南(道路)。黒い建物・ピンクと紫のネオン・赤いじゅうたん・見はり。乱数は使わない
function club() {
  const { x, z, w, d, h } = CLUB, f = d / 2, g = new THREE.Group(); g.position.set(x, 0.3, z);
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
  const pink = neonMat(0xff4ad0), purple = neonMat(0x9a5cff), dark = M(0x17141d), black = M(0x0b090f), gold = M(0xd8a83a);
  add(BG(w, h, d), dark, 0, h / 2, 0); add(BG(w + 0.3, 0.35, d + 0.3), black, 0, h + 0.17, 0);
  add(BG(w, 3.5, 0.12), black, 0, 1.75, f + 0.02); // 1階のかべ(少し黒い)
  add(BG(w - 0.5, 0.14, 0.1), pink, 0, h - 0.45, f + 0.07); add(BG(w - 0.5, 0.14, 0.1), purple, 0, 3.95, f + 0.1); // 横のネオン
  for (const sx of [-1, 1]) { add(BG(0.14, h - 0.9, 0.1), pink, sx * (w / 2 - 0.3), h / 2, f + 0.07); for (const wx of [5.3, 8.3]) add(BG(1.7, 2.1, 0.08), purple, sx * wx, 6.4, f + 0.05); } // たてのネオン・2階の窓
  // 看板「黒龍 CLUB」
  const sign = canvasTex(320, 160, (c, W, H) => {
    c.fillStyle = '#0e0a14'; c.fillRect(0, 0, W, H); c.strokeStyle = '#ff4ad0'; c.lineWidth = 5; c.shadowColor = '#ff4ad0'; c.shadowBlur = 12; c.strokeRect(7, 7, W - 14, H - 14);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd0f4'; c.font = 'bold 84px ' + FONT; c.fillText('黒龍', W / 2, 66);
    c.fillStyle = '#c9a8ff'; c.shadowColor = '#9a5cff'; c.font = 'bold 30px ' + FONT; c.fillText('C L U B', W / 2, 128);
  });
  add(BG(6.4, 3.2, 0.2), neonMat(0, sign), 0, 6.4, f + 0.14);
  add(BG(0.2, 4.6, 1.2), neonMat(0, vSignMat('CLUB', '#9a5cff').map), -w / 2 + 0.7, 6.3, f + 0.7); // 横に出た、たての看板
  // 入口: 黒いとびら・ネオンのわく・ひさし
  add(BG(2.8, 3.2, 0.12), M(0x050408), 0, 1.6, f + 0.06); add(BG(0.06, 3.1, 0.14), M(0x2a2630), 0, 1.6, f + 0.08);
  for (const sx of [-1, 1]) { add(BG(0.14, 3.3, 0.14), pink, sx * 1.5, 1.65, f + 0.1); add(BG(0.08, 0.5, 0.1), gold, sx * 0.25, 1.6, f + 0.16); }
  add(BG(3.14, 0.14, 0.14), pink, 0, 3.3, f + 0.1);
  add(BG(4.6, 0.25, 2.0), black, 0, 3.7, f + 1.0); add(BG(4.6, 0.1, 0.1), purple, 0, 3.62, f + 2.0); for (const sx of [-1, 1]) add(BG(0.1, 0.1, 2.0), purple, sx * 2.3, 3.62, f + 1.0);
  // 赤いじゅうたんと、金の柱・赤いロープ
  add(BG(2.6, 0.05, 2.0), M(0xa8141c), 0, 0.03, f + 1.0);
  for (const sx of [-1, 1]) { for (const pz of [0.35, 1.75]) { add(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 8), gold, sx * 1.6, 0.5, f + pz); add(BG(0.2, 0.2, 0.2), gold, sx * 1.6, 1.05, f + pz); } add(BG(0.07, 0.07, 1.4), M(0xa8141c), sx * 1.6, 0.86, f + 1.05); }
  scene.add(g); colRot(x, z, w, d, 0);
  GLOWS.push([x, z + f + 2.2, 7, 3], [x - 7, z + f + 1.6, 4.5, 3], [x + 7, z + f + 1.6, 4.5, 3]);
  // 見はり(黒い服・サングラス。立っているだけ)
  const per = makePerson(0x15151a, 0x15151a, 0xc89870), bx = x - 2.5, bz = z + f + 0.75;
  part(per, 0.58, 0.13, 0.08, 0x050505, 0, 2.2, 0.28); part(per, 0.22, 0.55, 0.05, 0xf2f2f2, 0, 1.52, 0.24); part(per, 0.1, 0.5, 0.06, 0x15151a, 0, 1.5, 0.26); // サングラス・白いシャツ・黒いネクタイ
  per.g.position.set(bx, 0.3, bz); per.armL.rotation.z = -0.12; per.armR.rotation.z = 0.12; addCol(bx - 0.35, bx + 0.35, bz - 0.3, bz + 0.3);
}
// ホームのアパート(v=17)。正面は北(道路)。4階だて・クリーム色のかべ・ベランダと洗たく物・入口の明かり。乱数は使わない
function apartment() {
  const { x, z, w, d, h } = APT, f = d / 2, g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = Math.PI;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
  const COLS = 5, ROWS = 3, G0 = 3.4, cw = w / COLS, fh = (h - G0) / ROWS, wall = M(0xd9c9a3), trim = M(0xa8946c), iron = M(0x2e3238);
  // 窓(夜は、いくつかに明かりがつく)
  const c1 = document.createElement('canvas'), c2 = document.createElement('canvas'); c1.width = c2.width = COLS * 16; c1.height = c2.height = ROWS * 16;
  const g1 = c1.getContext('2d'), g2 = c2.getContext('2d'); g1.fillStyle = '#d9c9a3'; g1.fillRect(0, 0, 80, 48); g2.fillStyle = '#000'; g2.fillRect(0, 0, 80, 48);
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
    const on = (r * 3 + k * 2) % 5 < 2, col = (r + k) % 3 ? '#ffe6a8' : '#ffb46a';
    g1.fillStyle = '#8a7a58'; g1.fillRect(k * 16 + 3, r * 16 + 3, 10, 10); g1.fillStyle = on ? col : '#1f2a3a'; g1.fillRect(k * 16 + 4, r * 16 + 4, 8, 8); g1.fillStyle = '#8a7a58'; g1.fillRect(k * 16 + 7.5, r * 16 + 4, 1, 8);
    if (on) { g2.fillStyle = col; g2.fillRect(k * 16 + 4, r * 16 + 4, 8, 8); }
    g1.fillStyle = 'rgba(0,0,0,.18)'; g1.fillRect(k * 16, r * 16 + 15, 16, 1);
  }
  const t1 = new THREE.CanvasTexture(c1), t2 = new THREE.CanvasTexture(c2); t1.magFilter = t2.magFilter = THREE.NearestFilter;
  const win = new THREE.MeshLambertMaterial({ map: t1, emissive: 0xffffff, emissiveMap: t2 }); NIGHT_MATS.push(win);
  add(new THREE.BoxGeometry(w, h - G0, d), [wall, wall, trim, trim, win, wall], 0, G0 + (h - G0) / 2, 0);
  add(BG(w, G0, d), M(0xb8a47c), 0, G0 / 2, 0); add(BG(w + 0.2, 0.22, d + 0.2), trim, 0, G0, 0);
  add(BG(w + 0.3, 0.5, d + 0.3), trim, 0, h + 0.25, 0); // 屋上のふち
  const tank = add(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), M(0x6f7a80), -3.5, h + 1.7, -1); add(BG(1.8, 0.5, 1.8), iron, -3.5, h + 0.55, -1); tank.rotation.y = 0.3; // 水のタンク
  // ベランダ(1れつおき)と洗たく物、エアコン
  const CLOTH = [0xf4f4f4, 0xd9483a, 0x3f7fd0, 0xf2c230, 0x6fbf73];
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
    const bx = (k - (COLS - 1) / 2) * cw, by = G0 + r * fh;
    if (k % 2 === 0) {
      add(BG(2.5, 0.12, 0.9), trim, bx, by + 0.3, f + 0.45); add(BG(2.5, 0.75, 0.06), iron, bx, by + 0.75, f + 0.88); for (const sx of [-1.22, 1.22]) add(BG(0.06, 0.75, 0.9), iron, bx + sx, by + 0.75, f + 0.45);
      if ((r + k) % 3 !== 1) { add(BG(2.3, 0.04, 0.04), iron, bx, by + 2.25, f + 0.8); for (let c = 0; c < 3; c++) add(BG(0.5, 0.62 + (c % 2) * 0.2, 0.04), M(CLOTH[(r * 2 + k + c) % 5]), bx - 0.72 + c * 0.72, by + 1.9 - (c % 2) * 0.1, f + 0.8); }
    } else if ((r + k) % 2) add(BG(0.95, 0.6, 0.5), M(0xb9bdc0), bx, by + 0.55, f + 0.28);
  }
  add(BG(0.14, h - 0.6, 0.14), M(0x7a6a50), w / 2 - 0.5, h / 2, f + 0.1); // 雨どい
  // 入口(青い光のまうしろ): とびら・ひさし・明かり・郵便受け
  const dx = x - HOME_X;
  add(BG(2.3, 2.95, 0.12), M(0x8a7a58), dx, 1.47, f + 0.04); add(BG(1.8, 2.7, 0.14), M(0x3f2a20), dx, 1.35, f + 0.06); add(BG(0.5, 0.9, 0.16), MB(0x9a8c6a), dx - 0.4, 1.9, f + 0.07); add(BG(0.08, 0.3, 0.2), M(0xd8a83a), dx + 0.6, 1.3, f + 0.08);
  add(BG(3.0, 0.16, 1.2), M(0x8a3a2a), dx, 3.0, f + 0.6); add(BG(0.34, 0.26, 0.26), MB(0xffe0a0), dx, 2.82, f + 0.5); add(BG(2.4, 0.16, 0.7), M(0x9a948c), dx, 0.08, f + 0.35);
  for (let c = 0; c < 4; c++) add(BG(0.42, 0.3, 0.12), M(c % 2 ? 0x6f7a80 : 0x8a949a), dx + 1.75 + (c % 2) * 0.48, 1.25 + (c > 1 ? 0.36 : 0), f + 0.07);
  add(BG(1.6, 1.4, 0.1), M(0x1f2a3a), dx - 4.6, 1.9, f + 0.04); add(BG(1.8, 0.12, 0.3), trim, dx - 4.6, 1.15, f + 0.12); // 1階の窓
  add(BG(0.2, 5.4, 1.2), vSignMat('快晴部屋', '#ffd23f'), -w / 2 + 0.7, 7.6, f + 0.7); // たての看板
  scene.add(g); colRot(x, z, w, d, 0);
  GLOWS.push([HOME_X, z - f - 1.2, 4.5, 1]);
}
// 港の奥の倉庫(v=15)。とびらは西。船員のたのみの届け先
const WAREHOUSE = { x: 169.5, z: 151 };
function warehouse() {
  const m = nightMat(7, 2, '#5a6068', 0.55, false), top = M(0x3a3e44);
  const b = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 26), [m, m, top, top, m, m]); b.position.set(WAREHOUSE.x, 4.4, WAREHOUSE.z); scene.add(b);
  addCol(165, 174, 138, 164); buildings.push({ x: WAREHOUSE.x, z: WAREHOUSE.z, w: 9, d: 26 });
  addBox(0.2, 4.6, 6, 164.92, 2.7, WAREHOUSE.z, M(0x2a2e33)); addBox(0.24, 4.6, 0.2, 164.9, 2.7, WAREHOUSE.z, M(0x15171a)); // 鉄のとびら
  addBox(0.2, 1.3, 3.6, 164.9, 6.1, WAREHOUSE.z, hSignMat('倉庫', '#1a1a1a', '#c8d0d8'));
  GLOWS.push([163.2, WAREHOUSE.z, 5, 2]);
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
  for (const [kind, r, c] of [['wok', 1, 4], ['pole', 2, 8]]) MK_SPOTS.push({ kind, x: ix0 + (c + 0.5) * cw, z: iz0 + (r + 0.5) * ch, late: true }); // v=31: 中華なべ・棒(late = 屋台の人の場所は、前と同じにする)
  MK_DEEP.x = ix0 + 8.5 * cw; MK_DEEP.z = iz0 + 1.5 * ch;
  Object.assign(MKC, { ix0, iz0, ix1, iz1, cw, ch });
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
  warehouse();
  club();
  apartment();
  market();
  for (const m of MERGES) if (m.kind !== 'market') buildMerged(m);
  gate(roadC(1) + 8, roadC(4), Math.PI / 2); gate(roadC(4) - 8, roadC(3), Math.PI / 2); gate(roadC(2), roadC(2) + 8, 0); gate(roadC(3), roadC(5) - 8, 0);
  // 道の上のちょうちん(道を横切るように吊るす)
  const nearX = t => { for (let m = 0; m <= N; m++) if (Math.abs(t - roadC(m)) < 8) return true; return false; };
  for (const k of [2, 3]) for (let t = roadC(CT.j0) + 4; t < roadC(CT.j1 + 1); t += 9) { if (nearX(t) || inMarket(roadC(k), t)) continue; lanternString(roadC(k) - 6.3, 6.6, t, roadC(k) + 6.3, 6.6, t, 6, 0.9); if (Math.round(t) % 2) GLOWS.push([roadC(k), t, 5.5, 0]); }
  for (const k of [3, 4]) for (let t = roadC(CT.i0) + 4; t < roadC(CT.i1 + 1); t += 9) { if (nearX(t)) continue; lanternString(t, 6.6, roadC(k) - 6.3, t, 6.6, roadC(k) + 6.3, 6, 0.9); if (Math.round(t) % 2) GLOWS.push([t, roadC(k), 5.5, 0]); }
  // ふつうの街の交差点に、街灯のあかり
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const x = roadC(i), z = roadC(j); if (x > roadC(CT.i0) - 1 && x < roadC(CT.i1 + 1) + 1 && z > roadC(CT.j0) - 1 && z < roadC(CT.j1 + 1) + 1) continue; GLOWS.push([x, z, 9, 2]); addBox(0.25, 6, 0.25, x + 6.5, 3, z + 6.5, M(0x333333)); addBox(0.8, 0.3, 0.8, x + 6.2, 6, z + 6.2, MB(0xfff0c8)); }
  // 通りの名前の標識(v=23): 交差点の北西の角に、緑の板を2まい(上 = 東西の道、下 = 南北の道)。字は看板と同じで訳さない
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = roadC(i) - 6.7, z = roadC(j) - 6.7; if (inMerged(x, z)) continue;
    addBox(0.16, 3.4, 0.16, x, 1.7, z, M(0x4a5560));
    const a = streetPlate(STREET_EW[j]), b = streetPlate(STREET_NS[i]);
    a.position.set(x + a.userData.w / 2 - 0.1, 3.15, z); scene.add(a);
    b.rotation.y = Math.PI / 2; b.position.set(x, 2.6, z + b.userData.w / 2 - 0.1); scene.add(b);
  }
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
  [0xff5a2a, 0xffb060, 0xbfc8ff, 0xff4ad0].forEach((col, ci) => { // 赤・だいだい・白っぽい青・ピンク(クラブ)
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
  const ct = CAR_TYPES[c.type], walls = (ct && ct.walls) || [1.5, -1.5, 0], wr = (ct && ct.wr) || 1.15; // 長い車は、調べる点をふやす
  for (const off of walls) { const p = { x: c.x + fx * off, z: c.z + fz * off }; if (resolve(p, wr)) { hit = true; c.x += p.x - (c.x + fx * off); c.z += p.z - (c.z + fz * off); } }
  return hit;
}

/* ===== 車と人の形 ===== */
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12); wheelGeo.rotateZ(Math.PI / 2);
// 車の種類(v=21)。max = 最高速度(35 = 約126km/h)、accel = 加速、steer = 曲がりやすさの倍、mass = 重さ(ぶつかったときの強さ)、
// len = 長さ、w = 幅(ぶつかり判定)、walls = かべに当たるかを調べる点(車のまん中からの前後の距離)、wr = その点の半径、w8 = 街に出る割合、col = 決まった色
const CAR_TYPES = {
  sedan: { max: 35, accel: 19, steer: 1, mass: 1, len: 4.4, w8: 30 }, // セダン
  taxi: { max: 35, accel: 19, steer: 1, mass: 1, len: 4.4, w8: 16, col: 0xf2c418 }, // タクシー
  sports: { max: 42, accel: 27, steer: 1.18, mass: 0.75, len: 4.7, w8: 5 }, // スポーツカー
  rally: { max: 37, accel: 22, steer: 1.15, mass: 1.3, len: 4.3, w8: 8 }, // ラリー車
  wagon: { max: 33, accel: 18, steer: 0.95, mass: 1.15, len: 4.9, w8: 16 }, // ワゴン
  van: { max: 30, accel: 15, steer: 0.88, mass: 1.4, len: 4.8, w8: 12 }, // ワンボックス
  truck: { max: 26, accel: 12, steer: 0.72, mass: 2.6, len: 8.6, w8: 7, walls: [3.2, 1.6, 0, -1.6, -3.2], wr: 1.3 }, // トラック
  bus: { max: 22, accel: 9, steer: 0.6, mass: 3.2, len: 11, w8: 6, col: 0xe07a20, walls: [4.4, 2.9, 1.45, 0, -1.45, -2.9, -4.4], wr: 1.35 }, // バス
};
const CAR_KEYS = Object.keys(CAR_TYPES);
const carType = c => CAR_TYPES[c.type] || CAR_TYPES.sedan;
// 車のまん中の線の半分の長さ(ぶつかり判定は、この線からの距離で見る。セダンは0 = 今までどおりの丸)
const carSeg = c => Math.max(0, carType(c).len / 2 - 2.2);
// 点から車までの距離(長い車は、まん中の線のいちばん近い所から)
function carNear(c, x, z) { const L = carSeg(c); if (!L) return { x: c.x, z: c.z }; const fx = Math.sin(c.h), fz = Math.cos(c.h), t = clamp((x - c.x) * fx + (z - c.z) * fz, -L, L); return { x: c.x + fx * t, z: c.z + fz * t }; }
function carDist(c, x, z) { const q = carNear(c, x, z); return Math.hypot(x - q.x, z - q.z); }
// 車の種類をえらぶ(街の形・人の動きを変えないように、街の乱数 rnd とは別の乱数)
let carSeed = 8; // この数だと、8種類がみんな街に出る(tests/car_test.py)
function carRnd() { carSeed = carSeed + 0x6D2B79F5 | 0; let t = Math.imul(carSeed ^ carSeed >>> 15, 1 | carSeed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function pickCarType(noLong) { const ks = noLong ? CAR_KEYS.filter(k => !CAR_TYPES[k].walls) : CAR_KEYS; let sum = 0; for (const k of ks) sum += CAR_TYPES[k].w8; let r = carRnd() * sum; for (const k of ks) { r -= CAR_TYPES[k].w8; if (r < 0) return k; } return 'sedan'; }
const GLASS = 0x2b3a4a, carTex = {};
function carCanvas(key, w, h, draw) { if (!carTex[key]) { carTex[key] = canvasTex(w, h, draw); if (key === 'check') carTex[key].magFilter = THREE.NearestFilter; } return carTex[key]; }
function makeCarMesh(color, police, type) {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(BG(w, h, d), typeof col === 'number' ? M(col) : col); m.position.set(x, y, z); g.add(m); return m; };
  const wheels = (r, w, xs, zs) => { const k = 'w' + r + '_' + w; if (!carTex[k]) { carTex[k] = new THREE.CylinderGeometry(r, r, w, 12); carTex[k].rotateZ(Math.PI / 2); } for (const x of xs) for (const z of zs) { const m = new THREE.Mesh(r === 0.45 ? wheelGeo : carTex[k], M(0x151515)); m.position.set(x, r, z); g.add(m); } };
  const lamps = (xs, y, zf, zb, w, h) => { for (const x of xs) { box(w || 0.45, h || 0.25, 0.06, x, y, zf, 0xfff6cc); box(w || 0.45, h || 0.25, 0.06, x, y, zb, 0xd02020); } };
  if (police) type = 'sedan';
  if (!type || type === 'sedan' || type === 'taxi') {
    box(2.2, 0.9, 4.4, 0, 0.8, 0, police ? 0x1a1a1a : color);
    if (police) box(2.24, 0.4, 2.6, 0, 0.95, 0.1, 0xffffff);
    box(1.9, 0.7, 2.2, 0, 1.6, -0.2, GLASS);
    box(1.95, 0.12, 2.0, 0, 2.0, -0.2, police ? 0xffffff : color);
    wheels(0.45, 0.4, [-1.05, 1.05], [-1.4, 1.4]);
    lamps([-0.7, 0.7], 0.9, 2.21, -2.21);
    if (type === 'taxi') {
      box(0.9, 0.35, 0.45, 0, 2.24, -0.2, new THREE.MeshBasicMaterial({ map: carCanvas('taxi', 128, 48, (c, w, h) => { c.fillStyle = '#fff7d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAXI', w / 2, h / 2 + 2); }) }));
      const ck = new THREE.MeshLambertMaterial({ map: carCanvas('check', 64, 8, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 4, j * 4, 4, 4); } }) });
      for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.22), ck); m.rotation.y = sx * Math.PI / 2; m.position.set(sx * 1.111, 0.95, 0); g.add(m); }
    }
  } else if (type === 'sports') {
    box(2.25, 0.6, 4.7, 0, 0.62, 0, color); box(2.25, 0.18, 1.6, 0, 0.95, 1.4, color);
    box(1.8, 0.48, 1.6, 0, 1.15, -0.5, GLASS); box(1.82, 0.08, 1.3, 0, 1.42, -0.55, color);
    box(2.1, 0.08, 0.5, 0, 1.3, -2.15, 0x111111); for (const sx of [-0.8, 0.8]) box(0.1, 0.35, 0.1, sx, 1.08, -2.15, 0x111111); // うしろの羽
    box(2.27, 0.08, 4.72, 0, 0.42, 0, 0x111111);
    wheels(0.4, 0.45, [-1.08, 1.08], [-1.5, 1.5]); lamps([-0.75, 0.75], 0.75, 2.36, -2.36, 0.5, 0.15);
  } else if (type === 'rally') {
    box(2.3, 1.0, 4.3, 0, 1.25, 0, color); box(2.0, 0.85, 2.6, 0, 2.15, -0.35, GLASS); box(2.05, 0.12, 2.5, 0, 2.62, -0.35, color);
    box(2.32, 0.28, 4.32, 0, 1.15, 0, 0xffffff); box(1.8, 0.1, 2.0, 0, 2.78, -0.35, 0x333333); // 白いライン・屋根のラック
    box(1.6, 0.2, 0.2, 0, 2.95, 0.6, 0x222222); for (const sx of [-0.55, -0.18, 0.18, 0.55]) box(0.28, 0.16, 0.05, sx, 2.95, 0.72, 0xfff6cc); // 屋根のライト
    box(2.0, 0.25, 0.25, 0, 0.75, 2.25, 0x222222);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), M(0x151515)); sp.rotation.x = Math.PI / 2; sp.position.set(0, 1.45, -2.3); g.add(sp); // スペアタイヤ
    wheels(0.58, 0.5, [-1.1, 1.1], [-1.4, 1.4]); lamps([-0.7, 0.7], 1.4, 2.16, -2.16);
  } else if (type === 'wagon') {
    box(2.2, 0.9, 4.9, 0, 0.8, 0, color); box(1.9, 0.72, 3.4, 0, 1.61, -0.6, GLASS); box(1.95, 0.12, 3.3, 0, 2.02, -0.6, color);
    for (const sx of [-0.75, 0.75]) box(0.08, 0.08, 3.0, sx, 2.12, -0.6, 0x333333); // 屋根のレール
    wheels(0.45, 0.4, [-1.05, 1.05], [-1.6, 1.6]); lamps([-0.7, 0.7], 0.9, 2.46, -2.46);
  } else if (type === 'van') {
    box(2.3, 1.0, 4.8, 0, 0.9, 0, color); box(2.3, 1.15, 4.1, 0, 2.0, -0.35, color);
    box(2.32, 0.6, 3.6, 0, 2.05, -0.55, GLASS); box(2.0, 0.75, 0.1, 0, 2.05, 1.72, GLASS); box(2.0, 0.55, 0.1, 0, 2.15, -2.42, GLASS);
    wheels(0.47, 0.42, [-1.1, 1.1], [-1.55, 1.6]); lamps([-0.75, 0.75], 1.0, 2.41, -2.41);
  } else if (type === 'truck') {
    box(2.5, 1.4, 2.3, 0, 1.4, 2.6, color); box(2.3, 0.75, 0.1, 0, 2.35, 3.76, GLASS); box(2.5, 0.8, 2.3, 0, 2.5, 2.6, color); // 運転席
    for (const sx of [-1.26, 1.26]) box(0.05, 0.6, 1.2, sx, 2.45, 3.0, GLASS);
    box(2.6, 2.8, 5.6, 0, 2.3, -1.5, 0xe8e8e8); box(2.62, 0.3, 5.62, 0, 1.4, -1.5, color); box(2.2, 0.4, 7.8, 0, 0.75, 0, 0x2a2a2a); // 荷台
    wheels(0.6, 0.5, [-1.15, 1.15], [2.8, -2.4, -3.7]); lamps([-0.8, 0.8], 1.0, 3.76, -4.31);
  } else if (type === 'bus') {
    box(2.6, 2.6, 11, 0, 1.75, 0, color); box(2.62, 0.9, 9.4, 0, 2.35, -0.6, GLASS); box(2.3, 1.2, 0.1, 0, 2.2, 5.51, GLASS);
    box(2.64, 0.3, 11.02, 0, 1.15, 0, 0xffffff); box(2.5, 0.12, 10.6, 0, 3.1, 0, 0xdddddd);
    box(2.0, 0.3, 0.06, 0, 3.0, 5.53, new THREE.MeshBasicMaterial({ map: carCanvas('bus', 256, 32, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb020'; c.font = 'bold 24px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('港 PORT', w / 2, h / 2 + 1); }) }));
    wheels(0.55, 0.45, [-1.2, 1.2], [3.8, -3.6]); lamps([-0.9, 0.9], 0.95, 5.52, -5.52);
  }
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
function newCar(kind, x, z, h, color, type) { type = kind === 'police' ? 'sedan' : (type || 'sedan'); const tc = CAR_TYPES[type].col; if (tc !== undefined) color = tc; const m = makeCarMesh(color, kind === 'police', type); const c = { kind, x, z, h, v: 0, mesh: m.g, lights: m.lights, stuck: 0, rev: 0, color, type, cop: kind === 'police', crew: kind === 'police' ? 1 + Math.floor(Math.random() * 2) : 0 }; cars.push(c); return c; }
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
  const ty = pickCarType();
  if (rnd() < 0.5) { if (!inMerged(roadC(along) + 26, roadC(k) + side * 4.3)) newCar('parked', roadC(along) + 26, roadC(k) + side * 4.3, side > 0 ? Math.PI / 2 : -Math.PI / 2, col, ty); }
  else if (!inMerged(roadC(k) + side * 4.3, roadC(along) + 26)) newCar('parked', roadC(k) + side * 4.3, roadC(along) + 26, side > 0 ? Math.PI : 0, col, ty);
}
(function parkingCars() { const m = MERGES.find(q => q.kind === 'parking'); if (!m) return; const r = mergeRect(m); for (const row of [0, 1, 2]) for (let k = 0; k < 14; k++) { if (rnd() < 0.45) continue; const x = r.x0 + 8 + row * 12, z = r.z0 + 6 + k * 6; newCar('parked', x, z, row === 1 ? -Math.PI / 2 : Math.PI / 2, carColors[Math.floor(rnd() * carColors.length)], pickCarType(true)); } })(); // 駐車場には、トラックとバスは止めない(ならびに入らないので)
for (let i = 0; i < TUNE.trafficCars; i++) {
  const a = [Math.floor(rnd() * (N + 1)), Math.floor(rnd() * (N + 1))]; const nb = neighbors(a); const b = nb[Math.floor(rnd() * nb.length)];
  const c = newCar('traffic', 0, 0, 0, carColors[Math.floor(rnd() * carColors.length)], pickCarType()); c.a = a; c.b = b; c.p = rnd(); c.v = 10;
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
  // 市場で拾う武器(v=31): 中華なべ = 持っている間、前からの弾が半分(guard)。棒 = 当たると大きくふっとぶ(knock = ふっとばす強さの倍)
  wok: { name: '中華なべ', dmg: 20, range: 2.0, cd: 0.5, melee: true, guard: 0.5 },
  pole: { name: '棒', dmg: 25, range: 2.4, cd: 0.6, melee: true, knock: 2.8 },
  rifle: { name: 'ライフル', dmg: 100, range: 170, cd: TUNE.rifle.cd, melee: false, scope: true }, // v=29: 押すとスコープ。ドラッグでねらって、離すと撃つ
};
// 市場の武器: 持てる数・また出てくるまでの秒・豚の頭で前が見えない秒・ヘビで止まる秒・投げる速さ・当たる近さ
const MKT = { max: 3, respawn: 60, blind: 4, freeze: 5, speed: 18, hitR: 1.0, hide: 2, guardAng: 1.05 }; // hide = 市場の中で★がへる速さの倍(v=31)、guardAng = 中華なべで防げる前の向きの広さ(ラジアン。約60度)
// 屋台の食べ物(v=31): その場で食べる。ramen = 走るのが何倍・何秒
const FOOD = { ramen: 1.3, ramenT: 10 };
// ねらい方(ピストル・マシンガン): こうげきボタンを倒すと照準線、離すと撃つ。軽くタップは向いている方へ
const AIM = { dead: 16, max: 18, assist: 0.12, tapAssist: 0.35, wait: 0.4 }; // 倒したと見なす距離(px)・ボタンが動く距離(px)・ねらった方への自動補正(ラジアン)・タップのときの補正・撃てるまで待つ秒
// ギャングの武器
const GANG_W = { fist: { dmg: 5, cd: 1.0, range: 1.8 }, knife: { dmg: 12, cd: 1.1, range: 2.2 }, pistol: { dmg: 8, cd: 1.5, range: 18 },
  // v=19 幹部と大ボスの武器: 青龍刀(黒の幹部)・マシンガン(白の幹部。burst 発うって rest 秒休む)・日本刀(大ボス)
  dao: { dmg: 20, cd: 1.2, range: 2.8 }, mg: { dmg: 3, cd: 0.14, range: 20, burst: 6, rest: 1.6 }, katana: { dmg: 16, cd: 0.9, range: 2.5 } };
// 病院(東側の白い建物)。やられたら、この前で目がさめる(道路の方を向いて)
const HOSPITAL = { x: roadC(5) + 26, z: roadC(4) + 6.8, h: Math.PI };
// ホーム(v=14): スタート地点の近くの歩道。青い光に入るとセーブして、体力が全回復する。sx・sz・sh = 「つづきから」と逮捕のあとに立つ所
const HOME = { x: HOME_X, z: roadC(3) + 7.6, sx: HOME_X, sz: roadC(3) + 4.6, sh: Math.PI / 2 };
// 光るマーク(ホーム = 青、ミッション = 紫)。店のマークと同じ形
function glowMark(col, x, z) {
  const g = new THREE.Group();
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 16, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })); bm.position.y = 2.8; g.add(bm);
  const rg = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.15, 6, 24), new THREE.MeshBasicMaterial({ color: col })); rg.rotation.x = Math.PI / 2; rg.position.y = 0.5; g.add(rg);
  g.position.set(x, 0, z); g.visible = false; scene.add(g); return { g, ring: rg };
}
Object.assign(HOME, glowMark(0x4aa8ff, HOME.x, HOME.z));

/* ===== 屋上(v=29) =====
   高いビル(高い順に TUNE.roof.count こ。「大きなビル」は78m)の入口に緑の光。入ると屋上へ、屋上の緑の光で下へ
   屋上にいる間は player.roof にそのビル。屋上の上は、ふち(低いかべ)の内がわだけ歩ける(かべの判定 colGrid は使わない)
   ent = 入口の光、back = 下におりたときに立つ所、down = 屋上の光、up = 屋上に着いたときに立つ所、door = 警察官が出てくる所 */
const ROOF_COL = 0x5cff8a;
function roofMark(x, y, z, up) { const m = glowMark(ROOF_COL, x, z); m.g.position.y = y; const a = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.1, 4), MB(ROOF_COL)); a.position.y = 6.4; if (!up) a.rotation.x = Math.PI; m.g.add(a); return m; }
const ROOFS = buildings.filter(b => b.h).sort((a, b) => b.h - a.h).slice(0, TUNE.roof.count).map(b => {
  const top = b.h + 0.3, s = b.z < 0 ? 1 : -1, f = b.z + s * b.d / 2; // 入口は街のまん中がわ(南か北)
  const rf = { x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, top, s, x0: b.x - b.w / 2 + 0.8, x1: b.x + b.w / 2 - 0.8, z0: b.z - b.d / 2 + 0.8, z1: b.z + b.d / 2 - 0.8, cols: [] };
  rf.ent = { x: b.x, z: f + s * 2.2 }; rf.back = { x: b.x + 2.6, z: f + s * 2.2 };
  const hx = b.x - Math.min(8, b.w / 4), hz = b.z - s * 2; // 階段の小屋
  rf.door = { x: hx, z: hz + s * 2.6 }; rf.down = { x: hx, z: hz + s * 4.8 }; rf.up = { x: hx + 2.8, z: hz + s * 4.8 };
  const par = M(0x6b6e75), add = (w, h, d, x, z, mat, col) => { addBox(w, h, d, x, top + h / 2, z, mat); if (col) rf.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); };
  add(b.w, 1.1, 0.4, b.x, b.z - b.d / 2 + 0.2, par); add(b.w, 1.1, 0.4, b.x, b.z + b.d / 2 - 0.2, par); add(0.4, 1.1, b.d, b.x - b.w / 2 + 0.2, b.z, par); add(0.4, 1.1, b.d, b.x + b.w / 2 - 0.2, b.z, par); // ふち
  add(5, 3.4, 4, hx, hz, M(0x8a8d94), true); addBox(1.4, 2.4, 0.1, hx, top + 1.2, hz + s * 2.05, M(0x3a2a20)); // 小屋ととびら
  for (const ax of [4, 8.5]) add(3, 2, 3, b.x + b.w / 2 - ax, b.z - s * 4, M(0x9aa0a8), true); // エアコンの外の機械
  rf.inM = roofMark(rf.ent.x, 0, rf.ent.z, true); rf.outM = roofMark(rf.down.x, top, rf.down.z, false);
  return rf;
});
const lvY = rf => rf ? rf.top : 0; // その高さ(地面は0)
const lvOf = f => f.remote ? ((R.remotes[f.remote] && ROOFS[(R.remotes[f.remote].rf || 0) - 1]) || null) : (f.roof || null); // 相手がいる屋上(地面は null)
const roofOn = () => G.mode === 'solo' || shootOn(); // 屋上に上がれるのは、ひとり用とサバイバル
// 屋上の上の動き: ふちの内がわだけ。小屋と機械は押し返す
function roofClamp(o, rf, r) {
  for (const c of rf.cols) { if (o.x + r < c.x0 || o.x - r > c.x1 || o.z + r < c.z0 || o.z - r > c.z1) continue; const px = clamp(o.x, c.x0, c.x1), pz = clamp(o.z, c.z0, c.z1), dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz); if (d < r && d > 0.0001) { o.x = px + dx / d * r; o.z = pz + dz / d * r; } else if (d <= 0.0001) { o.z = rf.s > 0 ? c.z1 + r : c.z0 - r; } }
  o.x = clamp(o.x, rf.x0 + r, rf.x1 - r); o.z = clamp(o.z, rf.z0 + r, rf.z1 - r);
}
function dropRoofCops() { for (let i = npcs.length - 1; i >= 0; i--) if (npcs[i].roof) removeNpc(npcs[i]); }
function goRoof(rf) {
  endScope(); if (talk) endTalk();
  player.roof = rf; player.x = rf.up.x; player.z = rf.up.z; player.h = rf.s > 0 ? 0 : Math.PI; G.camYaw = player.h; G.roofCopT = TUNE.roof.copEvery / 2;
  camPos.set(player.x - Math.sin(player.h) * 7.5, rf.top + 3.8, player.z - Math.cos(player.h) * 7.5); toast(tr('屋上に上がった'), 1.6);
}
function leaveRoof() {
  const rf = player.roof; if (!rf) return; endScope(); player.roof = null; dropRoofCops();
  player.x = rf.back.x; player.z = rf.back.z; player.h = rf.s > 0 ? 0 : Math.PI; G.camYaw = player.h;
  camPos.set(player.x - Math.sin(player.h) * 7.5, 3.8, player.z - Math.cos(player.h) * 7.5); toast(tr('下におりた'), 1.4);
}
// 毎フレーム: 光を出して、入ったら上がる・おりる(着く所は光から2.6m以上はなれているので、すぐにはもどらない)
function checkRoofs(t) {
  const on = roofOn(), y = 0.5 + Math.sin(t * 3) * 0.15;
  for (const rf of ROOFS) { rf.inM.g.visible = on; rf.outM.g.visible = on && player.roof === rf; rf.inM.ring.position.y = y; rf.outM.ring.position.y = y; }
  if (!on) return;
  if (player.mode !== 'foot' || player.hp <= 0 || G.downT > 0 || G.stunT > 0 || paused() || G.out || (shootOn() && G.shDown > 0)) return;
  if (player.roof) { if (Math.hypot(player.roof.down.x - player.x, player.roof.down.z - player.z) < 1.8) leaveRoof(); return; }
  for (const rf of ROOFS) if (Math.hypot(rf.ent.x - player.x, rf.ent.z - player.z) < 1.8) { goRoof(rf); return; }
}
Object.assign(player, { roof: null, rf: 0, hp: TUNE.hp, inv: ['fist'], wi: 0, ammo: 0, mg: 0, pigs: 0, snakes: 0, atkCd: 0, swing: 0, item: null, armor: 0, heals: 0 }); // ammo = ピストルの弾、mg = マシンガンの弾、pigs = 豚の頭の数、snakes = ヘビの数

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
  else if (type === 'rifle') { const add = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), M(col)); m.position.set(x, y, z); g.add(m); }; add(0.12, 0.2, 0.5, 0x6a3e22, 0, -0.02, -0.4); add(0.1, 0.13, 0.7, 0x1c1f24, 0, 0, 0.2); add(0.05, 0.05, 0.8, 0x101214, 0, 0.02, 0.95); add(0.08, 0.2, 0.08, 0x1c1f24, 0, -0.15, 0.2); const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 10), M(0x0a0a0c)); sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.14, 0.22); g.add(sc); const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), MB(0x4aa8ff)); ln.rotation.x = Math.PI / 2; ln.position.set(0, 0.14, 0.44); g.add(ln); } // v=29 ライフル(青く光るスコープ)
  else if (type === 'wok') { const h = new THREE.Mesh(BG(0.06, 0.06, 0.5), M(0x5a3a22)); h.position.z = 0.05; g.add(h); const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.16, 14), M(0x2c2e33)); pan.rotation.x = Math.PI / 2; pan.position.z = 0.52; g.add(pan); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 18), M(0x6a6e76)); rim.position.z = 0.6; g.add(rim); }
  else if (type === 'pole') { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 8), M(0x9a6a3a)); p.rotation.x = Math.PI / 2; p.position.z = 0.6; g.add(p); for (const z of [-0.2, 1.4]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 8), M(0xc8261e)); b.rotation.x = Math.PI / 2; b.position.z = z; g.add(b); } }
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
function tracer(x0, z0, x1, z1, y0, y1) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0 === undefined ? 1.6 : y0, z0, x1, y1 === undefined ? 1.5 : y1, z1], 3)); const l = new THREE.Line(g, tracerMat); scene.add(l); fx.push({ m: l, t: 0.08, geo: g }); }
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
  if (k === 'rifle') player.rf += ammo || 0;
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
// vip = 幹部・大ボスの見た目(makeVip で作ったもの)。なければ、ふつうの黒い服とサングラス
function newGang(x, z, vip) {
  const per = vip || makePerson(0x141414, 0x1a1a1a, [0xf0c9a0, 0xc89870, 0x8a5a3a][Math.floor(rnd() * 3)]);
  if (!vip) { const gl = new THREE.Mesh(BG(0.5, 0.1, 0.05), M(0x050505)); gl.position.set(0, 2.2, 0.29); per.g.add(gl); }
  const r = rnd(), weapon = gangWeapon(r, false);
  const g = { per, x, z, h: rnd() * 6.28, home: { x, z }, hp: TUNE.gang.hp, weapon, state: 'idle', cd: 0, dead: -1, wt: 0, tx: x, tz: z, swing: 0, hitCd: 0, kx: 0, kz: 0, item: vip ? vip.item || null : null, r, white: false, foe: null, scan: Math.random(), mob: true, talkT: 0 };
  if (!vip) setHand(per, g, weapon); gangs.push(g); return g;
}
// 黒と白(v=18): 黒 = チャイナタウンの中(近づいてくる)、白 = 外の街(白いスーツ。ピストルが多い)。白が出るのは、大きな仕事のあとから
//   人数はふやさない。外の街にいる黒を、白いスーツに着せかえる(服の色を変えて、ネクタイを足すだけ)。武器は同じ乱数 r から決め直す
function gangWeapon(r, white) { return white ? (r < 0.25 ? 'fist' : r < 0.5 ? 'knife' : 'pistol') : (r < 0.45 ? 'fist' : r < 0.75 ? 'knife' : 'pistol'); }
const inCT = (x, z) => x > roadC(CT.i0) && x < roadC(CT.i1 + 1) && z > roadC(CT.j0) && z < roadC(CT.j1 + 1);
function setTeam(g, white, weapon) {
  white = !!white; if (g.white === white && !weapon) return; g.white = white;
  const per = g.per, c = M(white ? 0xf2f2f2 : 0x141414), p = M(white ? 0xf2f2f2 : 0x1a1a1a);
  per.body.material = c; per.armL.children[0].material = c; per.armR.children[0].material = c; per.legL.children[0].material = p; per.legR.children[0].material = p;
  if (white && !g.tie) g.tie = part(per, 0.12, 0.55, 0.04, 0x111111, 0, 1.52, 0.24); if (g.tie) g.tie.visible = white;
  g.weapon = weapon || gangWeapon(g.r, white); g.foe = null; if (g.hp > 0) setHand(per, g, g.weapon);
}
// 街のマフィアを、いまの進み具合に合わせて黒か白にする(ミッションの間だけ出る相手は変えない)
function applyTeams() { const on = G.mode === 'solo' && G.mi >= MISSIONS.length; for (const g of gangs) if (!g.temp) setTeam(g, on && !inCT(g.home.x, g.home.z)); }
// 幹部をたおしたチームは、主人公をおそってこない(v=19)。ミッションの間だけ出る相手(temp)は、いつもどおり
const isCalm = g => !g.temp && G.mode === 'solo' && G.bosses.includes(g.white ? 'W' : 'B');
function dropGang(g) { g.gone = true; const i = gangs.indexOf(g); if (i >= 0) gangs.splice(i, 1); scene.remove(g.per.g); }
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
// by = やったのがマフィアのとき(黒と白のケンカ)。主人公がやったときは、なし
function damageGang(g, dmg, kx, kz, by) {
  if (g.hp <= 0) return;
  g.hp -= dmg; g.kx = kx || 0; g.kz = kz || 0; spark(g.x, 1.6, g.z);
  if (!by) { if (isCalm(g)) { g.state = 'flee'; g.fleeT = 6; } else g.state = 'chase'; g.foe = null; g.talkT = 0; } // 主人公になぐられたら、主人公を追う(おとなしくなったチームは、逃げるだけ)
  else if (g.state !== 'chase' && !g.lure) g.foe = by; // マフィアにやられたら、やり返す(主人公を追っている間は、そのまま)
  if (g.hp <= 0) {
    g.dead = 0; g.foe = null; g.per.g.rotation.x = -Math.PI / 2; g.per.g.position.y = 0.4;
    if (by) { setHand(g.per, g, null); return; } // ケンカでたおれたときは、何も落とさない・★も上がらない
    dropPickup('money', g.x + 0.6, g.z, 20 + Math.floor(Math.random() * 7) * 10);
    if (g.weapon !== 'fist') { dropPickup(g.weapon, g.x - 0.6, g.z + 0.4, g.weapon === 'pistol' ? 12 : g.weapon === 'mg' ? 60 : 0); setHand(g.per, g, null); }
    if (!g.temp) addWanted(1); // ミッションの相手は、たおしても★は上がらない
  }
}
function updateGangs(dt) {
  const fight = G.mode === 'solo' && G.started && player.hp > 0, F = TUNE.gang, feud = G.mode === 'solo' && G.started && G.mi >= MISSIONS.length;
  for (let gi = gangs.length - 1; gi >= 0; gi--) {
    const g = gangs[gi];
    if (G.mode === 'race' || g.off) { g.per.g.visible = false; continue; }
    if (g.hp <= 0) { g.dead += dt; g.x += g.kx * dt; g.z += g.kz * dt; g.kx *= 1 - 3 * dt; g.kz *= 1 - 3 * dt; resolve(g, 0.45); g.per.g.position.set(g.x, 0.4, g.z); if (g.dead > 6) g.per.g.visible = false; if (g.brawl && (g.dead > 6 || Math.hypot(player.x - g.x, player.z - g.z) > DAY.far)) { dropGang(g); continue; } if (g.dead > F.respawn && !g.temp) respawnGang(g); continue; }
    if (g.brawl) { g.brawlT -= dt; if (g.brawlT <= 0 && Math.hypot(player.x - g.x, player.z - g.z) > DAY.far) { dropGang(g); continue; } } // 「火をつけろ」のあとに残った人は、しばらくして、見えない所で消える
    if (g.ctl) { // 狙撃ミッションの相手(v=30): 動きはミッションの方で決める。ここでは見せるだけ
      g.per.g.visible = true; statusTick(g, dt); if (g.swing > 0) g.swing -= dt;
      g.per.g.position.set(g.x, onWalk(g.x, g.z) ? 0.3 : 0, g.z); g.per.g.rotation.y = g.h; animPerson(g.per, g.ctlSp || 0, dt); if (g.swing > 0) g.per.armR.rotation.x = -1.5; continue;
    }
    g.per.g.visible = true; g.cd -= dt; g.hitCd -= dt; if (g.swing > 0) g.swing -= dt;
    const px = player.x, pz = player.z, dP = Math.hypot(px - g.x, pz - g.z), dHome = Math.hypot(px - g.home.x, pz - g.home.z);
    // 黒と白のケンカ(v=18): 近くで出会うと、たがいにおそう。先に主人公を見つけていたら主人公を、先に相手を見つけていたら相手をねらう
    let foe = g.foe;
    if (foe && (!feud || g.state === 'chase' || foe.hp <= 0 || foe.off || foe.gone || foe.white === g.white || Math.hypot(foe.x - g.x, foe.z - g.z) > F.feudGiveUp)) foe = g.foe = null;
    if (!foe && feud && g.state !== 'chase' && !g.lure && !g.nofeud) { // nofeud = 幹部・大ボスとその手下(ケンカに入らない)
      g.scan -= dt;
      if (g.scan <= 0) { g.scan = 0.4 + Math.random() * 0.3; let bd = F.feud; for (const o of gangs) { if (o.white === g.white || o.hp <= 0 || o.off || o.lure || o.nofeud || !o.per.g.visible) continue; const d = Math.hypot(o.x - g.x, o.z - g.z); if (d < bd) { bd = d; foe = o; } } g.foe = foe; }
    }
    const calm = isCalm(g); // 幹部をたおしたチーム: おそってこない。なぐられたら逃げる
    if (calm && g.state === 'chase') g.state = 'idle';
    if (g.state === 'flee') { g.fleeT -= dt; if (g.fleeT <= 0 || !calm) g.state = 'idle'; }
    if (g.state === 'idle' && !foe && fight && !peace() && !calm && dHome < F.turf) g.state = 'chase'; // お使いの間は、なわばりに入ってもおそってこない(なぐれば、やり返す)
    if (g.state === 'chase' && !g.lure && (!fight || dHome > (g.boss ? TUNE.boss.giveUp : F.giveUp))) g.state = 'idle'; // lure = 「火をつけろ」でついてくる黒の手下(あきらめるかは、ミッションの方で決める)
    let sp = 0, tx = g.tx, tz = g.tz;
    const dis = statusTick(g, dt); // 1 = 豚の頭で前が見えない、2 = ヘビで動けない
    if (g.boss === 'O' && g.state === 'chase') bossTick(g, dP, dt); // 大ボス: 遠いとピストル・近いと刀。体力が半分になると手下を呼ぶ
    if (dis) { if (dis === 1) { const q = blindWalk(g, dt); tx = q[0]; tz = q[1]; sp = 1.5; } }
    else if (g.state === 'flee') { tx = g.x * 2 - px; tz = g.z * 2 - pz; sp = F.speed * 1.2; }
    else if (foe || g.state === 'chase') {
      const W = GANG_W[g.weapon], ranged = g.weapon === 'pistol' || g.weapon === 'mg', dT = foe ? Math.hypot(foe.x - g.x, foe.z - g.z) : dP; tx = foe ? foe.x : px; tz = foe ? foe.z : pz;
      const up = !foe && !!player.roof; // 主人公が屋上(v=29): 銃を持っていたら下から撃つ。持っていなければ、見上げているだけ
      if (up) { if (ranged && dT > TUNE.roof.gangRange * 0.8) sp = F.speed; if (ranged && dT < TUNE.roof.gangRange && g.cd <= 0) { g.cd = W.cd; g.swing = 0.25; if (W.burst) { g.burst = (g.burst || W.burst) - 1; if (g.burst <= 0) { g.burst = W.burst; g.cd = W.rest; } } tracer(g.x, g.z, px + (Math.random() - 0.5) * 2, pz + (Math.random() - 0.5) * 2, 1.6, player.roof.top + 1.4); if (Math.random() < TUNE.roof.gangHit) hurtPlayer(W.dmg * (g.dmgX || 1), g); } }
      else if (dT > (ranged ? 9 : W.range * 0.8)) sp = g.boss ? TUNE.boss.speed : F.speed;
      if (!up && dT < W.range && g.cd <= 0) {
        g.cd = W.cd; g.swing = 0.25; const dmg = W.dmg * (g.dmgX || 1);
        if (W.burst) { g.burst = (g.burst || W.burst) - 1; if (g.burst <= 0) { g.burst = W.burst; g.cd = W.rest; } } // マシンガン: 何発かうって、少し休む
        if (ranged) {
          if (lineClear(g.x, g.z, tx, tz)) { tracer(g.x, g.z, tx + (Math.random() - 0.5), tz + (Math.random() - 0.5)); if (Math.random() < 0.6) { if (foe) damageGang(foe, dmg * F.feudDmg, 0, 0, g); else hurtPlayer(dmg * (player.mode === 'car' ? 0.5 : 1), g); } }
          else g.cd = 0.3;
        }
        else if (foe) damageGang(foe, dmg * F.feudDmg, 0, 0, g);
        else if (player.mode === 'foot') hurtPlayer(dmg);
      }
    } else if (g.talkT > 0) g.talkT -= dt; // 話している間は、立ち止まる(おとなしくなったマフィア)
    else {
      g.wt -= dt; if (g.wt <= 0) { g.wt = 2 + Math.random() * 4; const a = Math.random() * 6.28, r = Math.random() * 6; g.tx = g.home.x + Math.cos(a) * r; g.tz = g.home.z + Math.sin(a) * r; tx = g.tx; tz = g.tz; }
      if (Math.hypot(tx - g.x, tz - g.z) > 0.6) sp = 1.4;
    }
    if (sp > 0) { g.h += angDiff(g.h, Math.atan2(tx - g.x, tz - g.z)) * Math.min(1, 8 * dt); g.x += Math.sin(g.h) * sp * dt; g.z += Math.cos(g.h) * sp * dt; }
    else if ((foe || g.state === 'chase') && !dis) g.h += angDiff(g.h, Math.atan2(tx - g.x, tz - g.z)) * Math.min(1, 8 * dt);
    g.x += g.kx * dt; g.z += g.kz * dt; g.kx *= 1 - 6 * dt; g.kz *= 1 - 6 * dt;
    resolve(g, 0.45);
    if (player.mode === 'car' && g.hitCd <= 0) { const c = player.car, d = carDist(c, g.x, g.z); if (d < 2.4 && Math.abs(c.v) > 5) { g.hitCd = 0.6; damageGang(g, Math.abs(c.v) * 4 * (g.boss ? TUNE.boss.carDmg : 1), Math.sin(c.h) * c.v * 0.5, Math.cos(c.h) * c.v * 0.5); } }
    if (g.hp > 0) { g.per.g.position.set(g.x, onWalk(g.x, g.z) ? 0.3 : 0, g.z); g.per.g.rotation.y = g.h; animPerson(g.per, sp, dt); if (g.swing > 0) g.per.armR.rotation.x = -1.5; }
  }
}

// 主人公の体力
let hurtT = 0;
function hurtPlayer(d, from) { // from = 弾を撃った相手(v=31: 中華なべで、前からの弾を防ぐ)
  if (G.mode !== 'solo' || player.hp <= 0 || G.downT > 0) return;
  const W = WEAPONS[curWeapon()]; if (from && W && W.guard && player.mode === 'foot' && Math.abs(angDiff(player.h, Math.atan2(from.x - player.x, from.z - player.z))) < MKT.guardAng) { d *= W.guard; spark(player.x + Math.sin(player.h) * 0.6, lvY(player.roof) + 1.3, player.z + Math.cos(player.h) * 0.6); }
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
  if (missionOn()) failMission(lost + tr('　ミッション失敗')); else toast(lost, 3);
}

// 武器を没収(やられたとき・逮捕されたとき)。防弾チョッキもなくなる。持っておく回復は残る。豚の頭とヘビも残る
function confiscate() { player.inv = ['fist']; if (player.pigs > 0) player.inv.push('pig'); if (player.snakes > 0) player.inv.push('snake'); player.wi = 0; player.ammo = 0; player.mg = 0; player.rf = 0; player.armor = 0; setHand(player.per, player, null); }

/* ===== 車を奪われた運転手・パトカーから降りた警察官 ===== */
const npcs = [];
const SKINS = [0xf0c9a0, 0xc89870, 0x8a5a3a];
function newNpc(kind, x, z, h, look) { // look = [服, ズボン, はだ]。おこった街の人は、元と同じ見た目にする(屋台の人は { vip, shirt, apron, skin })
  const cop = kind === 'cop', skin = SKINS[Math.floor(Math.random() * 3)];
  const per = cop ? makeCop(skin) : look ? (look.vip ? makeVip('vendor', look) : makePerson(look[0], look[1], look[2])) : makePerson(shirts[Math.floor(Math.random() * shirts.length)], [0x2a3550, 0x333333, 0x5a4030][Math.floor(Math.random() * 3)], skin);
  const n = { npc: true, kind, per, x, z, h, hp: cop ? TUNE.police.copHp : TUNE.driver.hp, state: cop ? 'chase' : 'flee', cd: 0.6, down: 0, stagger: 0, kx: 0, kz: 0, life: 0, dead: -1, swing: 0, hitCd: 0, pull: 0, car: null };
  npcs.push(n); return n;
}
// 警察官の見た目(青い服と帽子)。配達競争で、ほかの人の警察官を出すときにも使う
function makeCop(skin) { const per = makePerson(0x2c56b8, 0x1a2a55, skin); const cap = new THREE.Mesh(BG(0.64, 0.16, 0.72), M(0x14224a)); cap.position.set(0, 2.52, 0.05); per.g.add(cap); return per; }
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
  n.hp -= dmg; n.kx = kx || 0; n.kz = kz || 0; n.stagger = 0.4; spark(n.x, lvY(n.roof) + 1.6, n.z);
  if (n.kind === 'cop' && n.state !== 'chase') n.state = 'chase';
  if (n.hp <= 0) {
    n.dead = 0; n.per.g.rotation.x = -Math.PI / 2; n.per.g.position.y = lvY(n.roof) + 0.4; n.per.armR.rotation.x = 0;
    if (n.kind === 'driver') dropPickup('money', n.x + 0.5, n.z, 10 + Math.floor(Math.random() * 3) * 10);
    addWanted(1); // 運転手でも警察官でも、たおすと★+1
  }
}
function updateNpcs(dt) {
  const alive = (G.mode === 'solo' || (G.mode === 'race' && !G.out)) && player.hp > 0 && G.downT <= 0;
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    if (n.kind === 'cop' && G.mode !== 'solo' && G.mode !== 'race') { removeNpc(n); continue; }
    if (n.hp <= 0) { n.dead += dt; n.x += n.kx * dt; n.z += n.kz * dt; n.kx *= 1 - 3 * dt; n.kz *= 1 - 3 * dt; if (n.roof) roofClamp(n, n.roof, 0.45); else resolve(n, 0.45); n.per.g.position.set(n.x, lvY(n.roof) + 0.4, n.z); if (n.dead > 6) removeNpc(n); continue; }
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
      if (n.state === 'angry' && (!alive || dP > 30 || player.roof)) n.state = 'flee';
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
      const same = (n.roof || null) === player.roof; // 同じ高さか(v=29: 屋上)
      if (n.roof && !same) { removeNpc(n); continue; } // 主人公が下におりたら、屋上の警察官は消える
      if (n.state === 'chase' && !same) faceP = true; // 主人公が屋上: 下の警察官は見上げて待つ
      else if (n.state === 'chase') {
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
    if (n.roof) roofClamp(n, n.roof, 0.45); else resolve(n, 0.45);
    if (G.mode === 'solo' && player.mode === 'car' && n.hitCd <= 0) { const c = player.car, d = carDist(c, n.x, n.z); if (d < 2.4 && Math.abs(c.v) > 5) { n.hitCd = 0.6; damageNpc(n, Math.abs(c.v) * 4, Math.sin(c.h) * c.v * 0.5, Math.cos(c.h) * c.v * 0.5); } }
    if (n.hp > 0) { n.per.g.position.set(n.x, n.roof ? n.roof.top : onWalk(n.x, n.z) ? 0.3 : 0, n.z); n.per.g.rotation.y = n.h; animPerson(n.per, sp, dt); if (n.swing > 0 || n.pull > 0) n.per.armR.rotation.x = -1.5; }
  }
}

// こうげきの相手(ギャング・運転手・警察官)
function foes() { if (shootOn()) return shootFoes(); const a = []; for (const g of gangs) if (g.hp > 0 && g.per.g.visible) a.push(g); for (const n of npcs) if (n.hp > 0) a.push(n); return a; }
function hitFoe(f, dmg, kx, kz) { if (f.remote) { shootHit(f.remote, dmg); return; } if (f.npc) damageNpc(f, dmg, kx, kz); else damageGang(f, dmg, kx, kz); }
// こうげきできるか(歩いていて、たおれていない)
function canAttack() { return G.started && (G.mode === 'solo' || (shootOn() && G.shDown <= 0)) && player.mode === 'foot' && player.hp > 0 && G.downT <= 0 && G.stunT <= 0 && !paused(); }
const curWeapon = () => player.inv[player.wi];
const isGun = wk => !WEAPONS[wk].melee; // ねらって使う武器(銃・投げる物)
const isThrown = wk => !!WEAPONS[wk].thrown;
function ammoOf(wk) { return wk === 'rifle' ? player.rf : wk === 'pistol' ? player.ammo : wk === 'mg' ? player.mg : wk === 'pig' ? player.pigs : wk === 'snake' ? player.snakes : Infinity; }
let noAmmoT = 0;
// こうげき(素手・刀は近くの敵に。ピストル・マシンガンは向いている方へ。前の近くに敵がいたら、その敵をねらう)
function playerAttack() {
  if (!canAttack() || player.atkCd > 0) return;
  const wk = curWeapon(), W = WEAPONS[wk];
  if (isGun(wk)) { shoot(wk, player.h, AIM.tapAssist, true); return; }
  player.atkCd = W.cd; player.swing = 0.22;
  let best = null, bd = 1e9;
  for (const g of foes()) {
    if (lvOf(g) !== player.roof) continue; // 屋上と地面では、なぐれない(v=29)
    const dx = g.x - player.x, dz = g.z - player.z, d = Math.hypot(dx, dz), a = Math.abs(angDiff(player.h, Math.atan2(dx, dz)));
    if (d > W.range + 0.4) continue; const score = d + a * 1.5; if (score < bd) { bd = score; best = g; }
  }
  if (best) { player.h = Math.atan2(best.x - player.x, best.z - player.z); hitFoe(best, W.dmg, Math.sin(player.h) * 4 * (W.knock || 1), Math.cos(player.h) * 4 * (W.knock || 1)); }
}
// 銃を1発撃つ。dir = 撃つ向き、assist = その向きから、どれだけずれた敵までねらうか、turn = 敵の方を向くか
function gunTarget(W, dir, assist) {
  let best = null, bd = 1e9;
  for (const g of foes()) {
    const dx = g.x - player.x, dz = g.z - player.z, d = Math.hypot(dx, dz), a = Math.abs(angDiff(dir, Math.atan2(dx, dz)));
    const gl = lvOf(g); // 屋上と地面のあいだ(v=29): 投げる物はとどかない。銃は高さも入れた距離で、かべは見ない
    if (gl !== player.roof) { if (W.thrown || a > assist || Math.hypot(d, lvY(gl) - lvY(player.roof)) > W.range) continue; }
    else if (d > W.range || a > assist || !lineClear(player.x, player.z, g.x, g.z)) continue;
    const score = d + a * (assist < 0.3 ? 30 : 0); // ねらったときは、線に近い敵を先に
    if (score < bd) { bd = score; best = g; }
  }
  return best;
}
function rayEnd(dir, range) { if (player.roof) return [player.x + Math.sin(dir) * range, player.z + Math.cos(dir) * range]; let ex = player.x, ez = player.z; for (let s = 0.5; s <= range; s += 0.5) { const nx = player.x + Math.sin(dir) * s, nz = player.z + Math.cos(dir) * s; if (pointBlocked(nx, nz)) break; ex = nx; ez = nz; } return [ex, ez]; }
function fireGun(wk, dir, assist, turn) {
  const W = WEAPONS[wk];
  if (ammoOf(wk) <= 0) { if (noAmmoT <= 0) { toast(tr('弾がない！'), 1); noAmmoT = 1; } return false; }
  if (wk === 'pistol') player.ammo--; else player.mg--;
  player.atkCd = W.cd; player.swing = 0.22;
  if (W.spread) dir += (Math.random() - 0.5) * W.spread;
  const best = gunTarget(W, dir, assist), push = wk === 'mg' ? 0.8 : 2;
  const y0 = lvY(player.roof) + 1.6;
  if (best) { const a = Math.atan2(best.x - player.x, best.z - player.z), y1 = lvY(lvOf(best)) + 1.5; if (turn) player.h = a; tracer(player.x, player.z, best.x, best.z, y0, y1); shotFx(best.x, y1, best.z); hitFoe(best, W.dmg, Math.sin(a) * push, Math.cos(a) * push); }
  else { const [ex, ez] = rayEnd(dir, W.range), y1 = player.roof ? 0.5 : 1.5; tracer(player.x, player.z, ex, ez, y0, y1); shotFx(ex, y1, ez); }
  return true;
}

/* ===== 撃ち合い(v=28) =====
   当たったかは撃った人のスマホで決めて、送る位置の ev に入れる([番号, 'h', 相手, ダメージ, かぶる/巻きつく])。撃たれた人のスマホが体力をへらす
   見た目だけのもの(弾のすじ 'r'・投げた豚の頭 'p'・ヘビ 's')も ev で送る。やられたら dn(やられた数)と by(たおした人)を送る → ホストが数える
   アイテムは online.js のホストが置く(R.state.items)。近づくと pk = [番号, 何回目か] を送って、ホストが got に書いたら効く */
const SHOOT_T = { respawn: 3, inv: 2, runDmg: 50, runSpeed: 5, speed: 1.4, speedT: 10, heal: 40, vest: 50, ammo: { pistol: 12, mg: 30, rifle: 5, rifleBox: 3 }, pick: 3.2, evKeep: 1.2 };
const shootOn = () => G.mode === 'race' && G.rule === 'shoot';
const ITEM_NAME = { ammo: '弾の箱', vest: '防弾チョッキ', heal: '回復薬', speed: 'スピードアップ' };
const itemName = k => tr(WEAPONS[k] ? WEAPONS[k].name : ITEM_NAME[k]);
function shootFoes() { const a = []; for (const id in R.avatars) { const av = R.avatars[id], r = R.remotes[id]; if (av.seen && r && !r.dd && !r.iv) { av.remote = id; a.push(av); } } return a; }
function shootEv(e) { R.evSeq++; R.ev.push([R.evSeq, T, ...e]); }
function shootHit(id, dmg, st) { shootEv(['h', id, dmg, st || 0]); }
// 弾のすじをほかの人に送る。屋上がからむときは高さも送る('q')(v=29)
function shotFx(x1, y1, z1) { const y0 = lvY(player.roof) + 1.6; if (y0 === 1.6 && y1 === 1.5) { shootFx('r', x1, z1); return; } if (shootOn()) { const r1 = n => Math.round(n * 10) / 10; shootEv(['q', r1(player.x), r1(y0), r1(player.z), r1(x1), r1(y1), r1(z1)]); } }
function shootFx(type, x1, z1, hit) { if (shootOn()) shootEv([type, Math.round(player.x * 10) / 10, Math.round(player.z * 10) / 10, Math.round(x1 * 10) / 10, Math.round(z1 * 10) / 10, hit || 0]); }
// ほかの人の ev を見る(まだ見ていない番号だけ)
function shootRecv() {
  for (const id in R.remotes) {
    const r = R.remotes[id]; if (!Array.isArray(r.ev)) continue; let last = R.evSeen[id] || 0;
    for (const e of r.ev) {
      if (!Array.isArray(e) || e[0] <= last) continue; last = e[0];
      const [, type, a, b, c, d, f] = e;
      if (type === 'h' && a === R.me) shootHurt(b, id, c);
      else if (type === 'r') tracer(a, b, c, d);
      else if (type === 'q') { const [, , x0, y0, z0, x1, y1, z1] = e; tracer(x0, z0, x1, z1, y0, y1); }
      else if (type === 'p' || type === 's') { const kind = type === 'p' ? 'pig' : 'snake', m = marketItem(kind), L = Math.max(0.5, Math.hypot(c - a, d - b)); m.position.set(a, 1.7, b); scene.add(m); shots.push({ kind, m, x0: a, z0: b, x1: c, z1: d, L, y1: f ? 1.6 : 0.5, t: 0, dur: Math.max(0.2, L / MKT.speed), vis: true }); }
    }
    R.evSeen[id] = last;
  }
}
function shootHurt(d, by, st) {
  if (!shootOn() || G.shDown > 0 || T < G.shInv || player.hp <= 0 || R.state && R.state.phase !== 'play') return;
  if (st === 'b') setStatus(player, 'blind'); else if (st === 'f') { setStatus(player, 'frozen'); if (player.mode === 'car') player.car.v *= 0.3; }
  if (player.armor > 0) { const a = Math.min(player.armor, d); player.armor -= a; d -= a; }
  if (d <= 0 && !st) return;
  player.hp = Math.max(0, player.hp - d); hurtT = 0.35;
  if (player.hp <= 0) shootDie(by);
}
function shootReset() { // 持ち物を全部なくして、素手・体力100
  player.inv = ['fist']; player.wi = 0; player.ammo = 0; player.mg = 0; player.rf = 0; player.pigs = 0; player.snakes = 0; player.armor = 0; player.heals = 0; player.hp = TUNE.hp; player.atkCd = 0;
  setHand(player.per, player, null); clearStatus(player); pendShot = null; endAim(); endScope(); G.spdT = 0;
}
function shootDie(by) {
  G.shDown = SHOOT_T.respawn; G.dn++; G.by = by || null; G.pk = null; if (player.mode === 'car') exitCar();
  player.per.g.rotation.x = -Math.PI / 2; clearStatus(player); endAim(); endScope();
  toast(by ? tr('{name}にやられた…', { name: raceName(by) }) : tr('やられた…'), 2.4);
}
// 復活: ほかの人から60m以上はなれた道の上(なければ、いちばん遠い所)
function shootRespawn() {
  const others = Object.values(R.avatars).filter(a => a.seen), far = p => Math.min(1e9, ...others.map(a => Math.hypot(a.x - p.x, a.z - p.z)));
  const list = []; for (let k = 0; k <= N; k++) for (let a = 0; a < N; a++) { const p = P(a, k), q = P(k, a); if (!inMerged(p.x + 26, p.z)) list.push({ x: p.x + 26, z: p.z, h: Math.PI / 2 }); if (!inMerged(q.x, q.z + 26)) list.push({ x: q.x, z: q.z + 26, h: 0 }); }
  const ok = list.filter(p => far(p) > 60), pick = ok.length ? ok[Math.floor(Math.random() * ok.length)] : list.reduce((b, p) => far(p) > far(b) ? p : b, list[0]);
  shootReset(); player.per.g.rotation.x = 0; resetPlayerToFoot(pick.x + 5, pick.z + 5.5, pick.h); G.shInv = T + SHOOT_T.inv; toast(tr('復活！ 2秒は無敵'), 1.6);
}
// 拾えるか(持てないものは拾わない)
function canTake(k) {
  if (k === 'pistol' || k === 'mg' || k === 'rifle' || k === 'speed') return true;
  if (k === 'knife' || k === 'katana') return !player.inv.includes(k);
  if (k === 'pig' || k === 'snake') return ammoOf(k) < MKT.max;
  if (k === 'ammo') return player.inv.includes('pistol') || player.inv.includes('mg') || player.inv.includes('rifle');
  if (k === 'vest') return player.armor < TUNE.armor;
  if (k === 'heal') return player.hp < TUNE.hp;
  return false;
}
function applyItem(k) {
  let note = '';
  if (k === 'pistol' || k === 'mg' || k === 'rifle') { addWeapon(k, SHOOT_T.ammo[k]); note = tr(' (弾+{n})', { n: SHOOT_T.ammo[k] }); }
  else if (WEAPONS[k]) addWeapon(k);
  else if (k === 'ammo') { if (player.inv.includes('pistol')) player.ammo += SHOOT_T.ammo.pistol; if (player.inv.includes('mg')) player.mg += SHOOT_T.ammo.mg; if (player.inv.includes('rifle')) player.rf += SHOOT_T.ammo.rifleBox; }
  else if (k === 'vest') player.armor = Math.min(TUNE.armor, player.armor + SHOOT_T.vest);
  else if (k === 'heal') player.hp = Math.min(TUNE.hp, player.hp + SHOOT_T.heal);
  else if (k === 'speed') G.spdT = T + SHOOT_T.speedT;
  toast(tr('{w}をひろった！', { w: itemName(k) }) + note, 1.4);
}
// アイテムの見た目(武器は手に持つ形、補助アイテムは箱。下に輪: 武器は赤、補助は水色)
function itemMesh(k) {
  const g = new THREE.Group(), add = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), M(col)); m.position.set(x, y, z); g.add(m); return m; };
  if (k === 'pig' || k === 'snake') { const it = marketItem(k); it.scale.set(1.2, 1.2, 1.2); g.add(it); }
  else if (WEAPONS[k]) { const it = handItem(k); it.position.y = 0; it.rotation.x = Math.PI / 2; it.scale.set(1.4, 1.4, 1.4); g.add(it); }
  else if (k === 'ammo') { add(0.8, 0.5, 0.55, 0x6b5a2a, 0, 0, 0); add(0.82, 0.1, 0.57, 0xd8b440, 0, 0.12, 0); }
  else if (k === 'vest') { add(0.8, 0.9, 0.3, 0x2c56b8, 0, 0, 0); add(0.3, 0.3, 0.32, 0x1a2a55, 0, 0.45, 0); }
  else if (k === 'heal') { add(0.7, 0.55, 0.45, 0xf4f4f4, 0, 0, 0); add(0.42, 0.12, 0.47, 0xe8303a, 0, 0, 0); add(0.12, 0.42, 0.47, 0xe8303a, 0, 0, 0); }
  else if (k === 'speed') { const b = add(0.25, 0.7, 0.25, 0xffd23f, 0.08, 0.15, 0); b.rotation.z = -0.5; const c = add(0.25, 0.7, 0.25, 0xffd23f, -0.08, -0.2, 0); c.rotation.z = -0.5; }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 6, 20), MB(WEAPONS[k] ? 0xff5a4a : 0x5ae8ff)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.8; g.add(ring);
  scene.add(g); return g;
}
function updateItems(t) {
  const its = (R.state && R.state.items) || [];
  for (let i = 0; i < Math.max(its.length, R.itemM.length); i++) {
    const it = its[i]; let m = R.itemM[i];
    if (!it) { if (m) { scene.remove(m.g); R.itemM[i] = null; } continue; }
    if (!m || m.k !== it.k) { if (m) scene.remove(m.g); m = R.itemM[i] = { g: itemMesh(it.k), k: it.k }; }
    m.g.visible = !!it.on && G.rule === 'shoot'; m.g.position.set(it.x, 1.3 + Math.sin(t * 3 + i) * 0.12, it.z); m.g.rotation.y = t * 1.5;
  }
}
function clearItems() { for (const m of R.itemM) if (m) scene.remove(m.g); R.itemM = []; }
// 車でひく(1人1秒に1回。歩いている人だけ)
function shootRun(id) {
  if (player.mode !== 'car' || Math.abs(player.car.v) <= SHOOT_T.runSpeed || G.shDown > 0 || !R.state || R.state.phase !== 'play') return;
  const a = R.avatars[id], r = R.remotes[id]; if (!a || !a.seen || !r || r.c || r.dd || r.iv || r.rf || (R.runCd[id] || 0) > T) return;
  if (carDist(player.car, a.x, a.z) < 2.6) { R.runCd[id] = T + 1; shootHit(id, SHOOT_T.runDmg); spark(a.x, 1, a.z); }
}
// 毎フレーム(撃ち合いのとき)
function updateShoot(dt) {
  player.atkCd -= dt; updateAim(dt); shootRecv(); updateItems(T);
  if (hurtT > 0) hurtT -= dt;
  $('hurt').style.opacity = Math.max(0, hurtT / 0.35) * 0.9 + (player.hp > 0 && player.hp < 30 ? 0.25 : 0);
  statusTick(player, dt); $('blindFx').style.opacity = player.blind > 0 ? Math.min(1, player.blind) * 0.92 : 0; // 豚の頭をかぶると、前が見えない
  if (G.shDown > 0) { G.shDown -= dt; player.per.g.position.set(player.x, lvY(player.roof) + 0.4, player.z); if (G.shDown <= 0 && R.state && R.state.phase === 'play') shootRespawn(); }
  player.per.g.visible = player.mode !== 'car' && !G.scope && (T >= G.shInv || Math.floor(T * 10) % 2 === 0); // 無敵の間は、ちかちかする
  const s = R.state; if (!s || s.phase !== 'play' || G.shDown > 0) { G.pk = null; return; }
  for (const id in R.avatars) shootRun(id); // 車でひく
  // アイテムを拾う(ホストに知らせる)
  if (G.pk) { const it = s.items && s.items[G.pk[0]]; if (!it || !it.on || it.g !== G.pk[1] || Math.hypot(it.x - player.x, it.z - player.z) > SHOOT_T.pick + 1) G.pk = null; }
  if (!G.pk) (s.items || []).some((it, i) => { if (it.on && Math.hypot(it.x - player.x, it.z - player.z) < SHOOT_T.pick && canTake(it.k)) { G.pk = [i, it.g]; return true; } return false; });
}

/* ===== 市場の武器(豚の頭・ヘビを投げる) ===== */
const shoot = (wk, dir, assist, turn) => isThrown(wk) ? throwItem(wk, dir, assist, turn) : fireGun(wk, dir, assist, turn);
// 投げた物の高さ(t = 0〜1、L = 飛ぶ距離、y1 = 落ちる高さ)
function arcY(t, L, y1) { return 1.7 + (y1 - 1.7) * t + 4 * Math.min(1.5, L * 0.12) * t * (1 - t); }
const shots = []; // 飛んでいる豚の頭・ヘビ
function throwItem(wk, dir, assist, turn) {
  const W = WEAPONS[wk]; if (ammoOf(wk) <= 0) return false;
  if (player.roof) { if (noAmmoT <= 0) { toast(tr('屋上からは投げられない'), 1.2); noAmmoT = 1; } return false; } // v=29
  const tg = gunTarget(W, dir, assist); let ex, ez;
  if (tg) { ex = tg.x; ez = tg.z; if (turn) player.h = Math.atan2(ex - player.x, ez - player.z); } else [ex, ez] = rayEnd(dir, W.range);
  if (wk === 'pig') player.pigs--; else player.snakes--;
  player.atkCd = W.cd; player.swing = 0.22;
  const m = marketItem(wk), L = Math.max(0.5, Math.hypot(ex - player.x, ez - player.z));
  m.position.set(player.x, 1.7, player.z); m.rotation.y = Math.atan2(ex - player.x, ez - player.z); scene.add(m);
  shots.push({ kind: wk, m, x0: player.x, z0: player.z, x1: ex, z1: ez, L, y1: tg ? 1.6 : 0.5, t: 0, dur: Math.max(0.2, L / MKT.speed) }); shootFx(wk === 'pig' ? 'p' : 's', ex, ez, tg ? 1 : 0);
  if (ammoOf(wk) <= 0) { player.inv.splice(player.inv.indexOf(wk), 1); player.wi = Math.max(0, player.wi - 1); setHand(player.per, player, curWeapon()); } // なくなったら、前の武器にもどる
  return true;
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt / s.dur; const t = Math.min(1, s.t), x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t;
    s.m.position.set(x, arcY(t, s.L, s.y1), z); s.m.rotation.x += dt * 9;
    let hit = null; if ((G.mode === 'solo' || shootOn()) && !s.vis) for (const f of foes()) if (Math.hypot(f.x - x, f.z - z) < MKT.hitR) { hit = f; break; }
    if (hit) {
      const a = Math.atan2(s.x1 - s.x0, s.z1 - s.z0);
      if (hit.remote) shootHit(hit.remote, s.kind === 'pig' ? WEAPONS.pig.dmg : 0, s.kind === 'pig' ? 'b' : 'f'); // 撃ち合い(v=28): 撃たれた人のスマホで、かぶる・巻きつく
      else if (s.kind === 'pig') { hitFoe(hit, WEAPONS.pig.dmg, Math.sin(a) * 3, Math.cos(a) * 3); if (hit.hp > 0) setStatus(hit, 'blind'); }
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
  const one = WEAPONS[s.kind].melee, g = new THREE.Group(), it = one ? handItem(s.kind) : marketItem(s.kind);
  if (one) { it.position.set(0, 0, -0.6); it.rotation.x = -0.5; } it.scale.set(1.3, 1.3, 1.3); g.add(it);
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
    const one = WEAPONS[w.kind].melee; // 青龍刀・中華なべ・棒は1本だけ
    if (one ? player.inv.includes(w.kind) : ammoOf(w.kind) >= MKT.max) continue; // もう持てない
    addWeapon(w.kind); w.t = MKT.respawn;
    toast(tr('{w}をひろった！', { w: tr(WEAPONS[w.kind].name) }) + (one ? '' : ' ' + ammoOf(w.kind) + '/' + MKT.max), 1.4);
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
  if (WEAPONS[curWeapon()].scope) { startScope(e); return; } // ライフル(v=29): スコープ
  atk = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, aim: false };
}
function atkMove(e) {
  if (G.scope && e.pointerId === G.scope.id) { moveScope(e); return; }
  if (!atk || e.pointerId !== atk.id) return;
  let dx = e.clientX - atk.sx, dy = e.clientY - atk.sy; const l = Math.hypot(dx, dy);
  atk.dx = dx; atk.dy = dy; if (l > AIM.dead) atk.aim = true; else if (!atk.aim) return;
  if (l > AIM.max) { dx *= AIM.max / l; dy *= AIM.max / l; } setAtkKnob(dx, dy);
}
function atkUp(e) {
  if (G.scope && e.pointerId === G.scope.id) { upScope(e); return; }
  if (!atk || e.pointerId !== atk.id) return;
  const wk = curWeapon();
  if ((wk === 'pistol' || isThrown(wk)) && e.type === 'pointerup') pendShot = atk.aim ? { dir: aimDir(), assist: AIM.assist, turn: false, t: AIM.wait } : { dir: null, assist: AIM.tapAssist, turn: true, t: AIM.wait };
  endAim();
}
// 毎フレーム: ねらっている間は、その向きを向いて照準線を出す。マシンガンは押している間ずっと撃つ
function updateAim(dt) {
  noAmmoT -= dt;
  const wk = curWeapon(), gun = isGun(wk), ok = canAttack();
  if (G.scope) { if (!ok || !WEAPONS[wk].scope) endScope(); else { player.h = G.scope.yaw; player.per.g.rotation.y = G.scope.yaw; $('scopeInfo').textContent = player.atkCd > 0 ? tr('装てん中…') : tr('弾 {n}・離すと撃つ', { n: player.rf }); } }
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
    if (WEAPONS[wk].auto && atk) { // マシンガン: 押している間
      if (atk && atk.aim) fireGun(wk, aimDir(), AIM.assist, false); else fireGun(wk, player.h, AIM.tapAssist, true);
    } else if (pendShot && (wk === 'pistol' || isThrown(wk))) { const ps = pendShot; pendShot = null; if (ps.dir !== null) player.h = ps.dir; shoot(wk, ps.dir === null ? player.h : ps.dir, ps.assist, ps.turn); }
  }
  if (pendShot) { pendShot.t -= dt; if (pendShot.t <= 0 || !gun) pendShot = null; }
}
/* ===== ライフル(v=29) =====
   こうげきボタンを押すとスコープ(拡大した丸い画面)。押したままドラッグでねらって、離すと撃つ(短く押しただけなら撃たない)
   弾はカメラのまん中へまっすぐ飛ぶ。かべ(高さは、ビルは本当の高さ・ほかは7m)と地面で止まる */
function startScope(e) {
  if (!canAttack()) return;
  const k = G.scAim && T - G.scAim.t < 4 && G.scAim.roof === player.roof && Math.hypot(G.scAim.x - player.x, G.scAim.z - player.z) < 2; // すぐにもう一度のぞくと、前のねらいのまま
  G.scope = { id: e.pointerId, lx: e.clientX, ly: e.clientY, t0: T, yaw: k ? G.scAim.yaw : G.camYaw, pitch: k ? G.scAim.pitch : player.roof ? -0.3 : -0.02 };
  document.body.classList.add('scoped'); player.per.g.visible = false; pendShot = null;
}
function moveScope(e) {
  const sc = G.scope, dx = e.clientX - sc.lx, dy = e.clientY - sc.ly; sc.lx = e.clientX; sc.ly = e.clientY;
  sc.yaw -= dx * TUNE.rifle.sens; sc.pitch = clamp(sc.pitch - dy * TUNE.rifle.sens, -1.55, 0.5); // 右へドラッグ = 右を向く、下へ = 下を向く
}
function upScope(e) {
  const sc = G.scope; endScope();
  if (e.type === 'pointerup' && T - sc.t0 >= TUNE.rifle.tap) fireRifle(sc.yaw, sc.pitch);
}
function endScope() {
  if (!G.scope) return; const sc = G.scope; G.scope = null; G.scAim = { yaw: sc.yaw, pitch: sc.pitch, t: T, x: player.x, z: player.z, roof: player.roof };
  document.body.classList.remove('scoped'); if (player.mode === 'foot') player.per.g.visible = true; G.camYaw = sc.yaw;
}
// 目の位置。屋上では、ふちの近く(2.4m まで)なら、ねらう方へ身をのり出す(下の道まで見える)
function scopeEye(yaw) {
  const rf = player.roof, o = { x: player.x, y: lvY(rf) + 1.75, z: player.z }; if (!rf) return o;
  if (yaw === undefined) yaw = G.scope ? G.scope.yaw : player.h;
  const dx = Math.sin(yaw), dz = Math.cos(yaw), ex = rf.x + (dx > 0 ? 1 : -1) * rf.w / 2, ez = rf.z + (dz > 0 ? 1 : -1) * rf.d / 2;
  if (Math.abs(dx) > 0.01 && Math.abs(ex - o.x) < 2.4) o.x = ex + Math.sign(dx) * 0.6; // ねらう方のふち(東西)の外へ
  if (Math.abs(dz) > 0.01 && Math.abs(ez - o.z) < 2.4) o.z = ez + Math.sign(dz) * 0.6; // ねらう方のふち(南北)の外へ
  return o;
}
const scopeDir = (yaw, pitch) => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) });
// 箱に当たるまでの長さ(当たらなければ null)
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let ta = (a - oo) / dd, tb = (b - oo) / dd; if (ta > tb) { const q = ta; ta = tb; tb = q; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t0;
}
// 人(立っている円柱)に当たるまでの長さ
function rayPerson(o, d, x, y0, z, r) {
  const ox = o.x - x, oz = o.z - z, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  let t0 = 0, t1 = 1e9;
  if (a > 1e-9) { const D = b * b - 4 * a * c; if (D < 0) return null; const q = Math.sqrt(D); t0 = (-b - q) / (2 * a); t1 = (-b + q) / (2 * a); } else if (c > 0) return null;
  if (Math.abs(d.y) > 1e-9) { let ya = (y0 - o.y) / d.y, yb = (y0 + 2.4 - o.y) / d.y; if (ya > yb) { const q = ya; ya = yb; yb = q; } t0 = Math.max(t0, ya); t1 = Math.min(t1, yb); } else if (o.y < y0 || o.y > y0 + 2.4) return null;
  return t0 <= t1 && t1 > 0 ? Math.max(0, t0) : null;
}
// 弾がどこまで飛ぶか・だれに当たるか
function rifleRay(o, d, range) {
  let tEnd = range; if (d.y < -1e-6) tEnd = Math.min(tEnd, (0 - o.y) / d.y); // 地面
  for (const b of buildings) if (b.h) { const t = rayBox(o, d, b.x - b.w / 2, 0, b.z - b.d / 2, b.x + b.w / 2, b.h + 0.3, b.z + b.d / 2); if (t !== null && t < tEnd) tEnd = t; }
  for (const c of colliders) { if (c.x1 - c.x0 > 100) continue; const t = rayBox(o, d, c.x0, 0, c.z0, c.x1, 7, c.z1); if (t !== null && t > 0.3 && t < tEnd) tEnd = t; } // ほかのかべ(店・屋台など)は7mとする。足もとのかべは見ない
  let best = null;
  for (const f of foes()) { const t = rayPerson(o, d, f.x, lvY(lvOf(f)), f.z, TUNE.rifle.hitR); if (t !== null && t < tEnd) { tEnd = t; best = f; } }
  return { f: best, t: tEnd };
}
function fireRifle(yaw, pitch) {
  if (!canAttack()) return false;
  if (player.atkCd > 0) { toast(tr('装てん中…'), 0.8); return false; }
  if (player.rf <= 0) { toast(tr('弾がない！'), 1); return false; }
  player.rf--; player.atkCd = TUNE.rifle.cd; player.h = yaw;
  const o = scopeEye(yaw), d = scopeDir(yaw, pitch), hit = rifleRay(o, d, WEAPONS.rifle.range), ex = o.x + d.x * hit.t, ey = o.y + d.y * hit.t, ez = o.z + d.z * hit.t;
  tracer(o.x + d.x * 0.8, o.z + d.z * 0.8, ex, ez, o.y - 0.1 + d.y * 0.8, ey); if (shootOn()) { const r1 = n => Math.round(n * 10) / 10; shootEv(['q', r1(o.x), r1(o.y - 0.1), r1(o.z), r1(ex), r1(ey), r1(ez)]); }
  const f = hit.f;
  if (f) { const dmg = shootOn() ? TUNE.rifle.pvp : f.boss ? TUNE.rifle.boss : Math.max(WEAPONS.rifle.dmg, f.hp); hitFoe(f, dmg, d.x * 3, d.z * 3); }
  else spark(ex, ey, ez);
  return !!f;
}
function switchWeapon() { if (!G.started || (G.mode !== 'solo' && !shootOn()) || player.hp <= 0) return; player.wi = (player.wi + 1) % player.inv.length; setHand(player.per, player, player.inv[player.wi]); pendShot = null; }
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
// kind: 'vendor'(屋台の人) 'oyaji'(屋台のおやじ) 'info'(情報屋) 'bossB'(黒の幹部) 'white'(白の手下) 'bossW'(白の幹部) 'bossO'(大ボス) 'sis'(妹)
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
  } else if (kind === 'bossO') { // 大ボス(v=19。屋台のおやじが、エプロンをぬいだすがた): コック帽・白髪・赤い帯・1.1倍
    per = makePerson(0x4a4f5a, 0x2a2a30, skin); part(per, 0.52, 0.24, 0.52, 0xf4f2ea, 0, 2.62, 0); part(per, 0.72, 0.34, 0.72, 0xffffff, 0, 2.9, 0); per.hair.material = M(0x9a9a9a);
    part(per, 0.84, 0.14, 0.5, 0x8a1a1a, 0, 0.93, 0); per.g.scale.setScalar(1.1);
  } else if (kind === 'sis') { // 妹(v=19。終わりの絵だけに出る): 長い髪
    per = makePerson(0x6fa8c8, 0x3a3a48, 0xf0c9a0); part(per, 0.56, 0.7, 0.12, 0x2a1d14, 0, 2.05, -0.3);
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
//   later = 幹部・白いスーツ・ボス・黒と白のケンカ・「あの屋台だけは…」の話もするか(v=18 から true。白が出る「大きな仕事のあと」から言う)
//   rumor = 「聞きこみ」のうわさが出ている秒(文が長いので、ふつうより長い)
//   mobHit = マフィアの Q&A でまちがえたときに、なぐられる体力(v=25。これでやられることはない)、mobWait = なぐられたあと、その人と話せない秒
const TALK = { dist: 2.8, show: 3.2, qa: 0.3, oyajiQa: 0.5, hint: 0.3, wait: 12, leave: 7, vendors: 6, later: true, rumor: 5.5, mobHit: 10, mobWait: 30 };
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
  { text: 'この街を出たいなら港へ。残りたいなら…てっぺんを取るしかないね', hint: 1 },
  { text: '市場の屋台にヘビがいる。投げつけると、相手がかたまるんだって', hint: 1 },
  { text: '豚の頭は、警察に取られないらしい。証拠品にしたくないんだろう', hint: 1 },
  { text: 'あの屋台だけは、黒も白も手を出さないんだ。なんでだろうね', hint: 1, self: 1, later: 1 },
  { text: '屋台のおやじ、30年あそこにいるらしい。街が変わっても、あの鍋だけは同じだ', hint: 1, self: 1 },
  { text: '港の奥の倉庫、夜も明かりがついてる。何を積んでるんだか', hint: 1 },
  { text: '前にもいたよ、あんたみたいな運び屋。若い女の子だった。急に見なくなったけど', hint: 1 },
];
// 幹部のうわさ(v=18。情報屋のミッション「聞きこみ」の間だけ、いつものひとことのかわりに言う。5つを順番に)
const RUMORS = [
  { text: '黒龍幇の幹部、カラス？市場のいちばん奥だよ。でっかい刀をいつも持ってる。魚をさばくんじゃないよ、あれは' },
  { text: '白虎幇の幹部、シラサギは北の大きなビルにいるよ。スーツにしわがつくと、手下がおこられるらしい' },
  { text: 'シラサギの車、見たことある？毎朝じぶんでみがいてるんだ。あれにさわったら終わりだね' },
  { text: '黒龍幇と白虎幇は、門をはさんでにらみ合ってる。ちょっとしたきっかけで、すぐ火がつくよ' },
  { text: '幹部の話？…声が大きいよ。こっちまでにらまれるじゃないか' },
];
// おとなしくなったマフィアのひとこと(v=19。幹部をたおしたチームの手下に話しかけると言う)
const CALM_LINES = [
  { text: 'おつかれさまです！…いえ、何も見てません' },
  { text: '前の幹部より、話がわかる人でよかった' },
  { text: 'なぐらないでください。もう充分です' },
];
// Q&A。ok = ふつうのこたえ、ng = 相手がおこるこたえ(おそってくる)。who: 'shop' = 屋台の人がよく聞く、'oyaji' = 屋台のおやじだけ
//   v=25: 'mobB' = 黒のマフィアだけ、'mobW' = 白のマフィアだけ(おとなしくなったマフィア。まちがえると1発なぐって去る)。reply = いいこたえのときのひとこと
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
  { text: '黒龍幇と白虎幇、どっちが強いと思う？', ok: '黒龍幇', ng: '白虎幇', who: 'mobB', reply: 'わかってるじゃねぇか' },
  { text: '黒龍幇と白虎幇、どっちが強いと思う？', ok: '白虎幇', ng: '黒龍幇', who: 'mobW', reply: 'わかってるじゃねぇか' },
  { text: 'このサングラス、夜でもよく見えるんだぜ？', ok: '見えてそう', ng: 'さっき電柱にぶつかってた', who: 'mobB', reply: 'だろ？ 夜でもバッチリだ' },
  { text: 'このスーツ、白くてかっこいいだろ？', ok: 'かっこいい', ng: 'コックさんみたい', who: 'mobW', reply: 'だろ？ 毎朝アイロンかけてんだ' },
];
// 屋台の人(市場の屋台の前に立っている。話せる)。1人は屋台のおやじ(コック帽)で、夜市の入口にいちばん近い屋台にいる
const vendors = [];
(function placeVendors() {
  const cand = [], dd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (const s of STALLS) for (const side of [1, -1]) for (const lx of [-0.9, 0.9]) {
    const q = toW(s.x, s.z, s.r, lx, side * 2.2), o = { x: q[0], z: q[1] };
    if (!inMarket(o.x, o.z)) continue; resolve(o, 0.5); if (Math.hypot(o.x - q[0], o.z - q[1]) > 0.01) continue; // かべや箱に近すぎる所には立たせない
    if (MK_SPOTS.some(m => !m.late && dd(m, o) < 2)) continue; // 市場の武器の置き場所もよける
    cand.push({ x: q[0], z: q[1], h: s.r + (side > 0 ? 0 : Math.PI), st: s, lx, side });
  }
  if (!cand.length) return;
  const gateN = { x: roadC(2), z: MK.z0 }, sel = [cand.reduce((a, b) => dd(a, gateN) <= dd(b, gateN) ? a : b)];
  while (sel.length < TALK.vendors && sel.length < cand.length) { // のこりは、なるべくばらばらに
    let best = null, bd = -1; for (const c of cand) { if (sel.includes(c)) continue; const d = Math.min(...sel.map(p => dd(p, c))); if (d > bd) { bd = d; best = c; } } sel.push(best);
  }
  const APRONS = [0xc8261e, 0x2f8a55, 0x2a4a8a, 0xd9a020, 0x7a4a9a];
  sel.forEach((c, i) => {
    const o = { shirt: shirts[(i * 3 + 1) % shirts.length], apron: APRONS[i % APRONS.length], skin: SKINS[i % 3] }, per = makeVip(i ? 'vendor' : 'oyaji', o);
    o.vip = true; vendors.push({ vendor: true, oyaji: i === 0, per, look: o, x: c.x, z: c.z, h: c.h, h0: c.h, talkT: 0, angry: null, st: c.st, lx: c.lx, side: c.side });
  });
})();
// 屋台の食べ物の黄色い光(v=31): おやじ以外の屋台の人のよこ(屋台にそって、人から2m)。入ると買い物の画面
const FOODS = [];
for (const v of vendors) {
  if (v.oyaji) continue;
  for (const sg of [Math.sign(v.lx), -Math.sign(v.lx)]) {
    const q = toW(v.st.x, v.st.z, v.st.r, v.lx + sg * 2.0, v.side * 2.2), o = { x: q[0], z: q[1] };
    if (!inMarket(o.x, o.z)) continue; resolve(o, 0.6); if (Math.hypot(o.x - q[0], o.z - q[1]) > 0.01) continue;
    if (MK_SPOTS.some(m => Math.hypot(m.x - o.x, m.z - o.z) < 2.5) || vendors.some(w => w !== v && Math.hypot(w.x - o.x, w.z - o.z) < 2.5)) continue;
    const col = 0xffc23a, g = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })); bm.position.y = 2.0; g.add(bm);
    const rg = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.13, 6, 24), new THREE.MeshBasicMaterial({ color: col })); rg.rotation.x = Math.PI / 2; rg.position.y = 0.5; g.add(rg);
    g.position.set(o.x, 0.34, o.z); g.visible = false; scene.add(g);
    FOODS.push({ kind: 'food', name: '屋台', x: o.x, z: o.z, g, ring: rg, v }); break;
  }
}
function updateVendors(dt) {
  for (const v of vendors) {
    if (v.oyaji) { const away = G.mode === 'solo' && (!!G.done.tower || (!!G.free && G.free.id === 'tower')); if (away !== !!v.off) { v.off = away; v.per.g.visible = !away; } if (away) continue; } // 塔の対決が始まると、おやじは屋台からいなくなる
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
  if (!G.started || G.mode !== 'solo' || player.mode !== 'foot' || player.roof || player.hp <= 0 || G.downT > 0 || G.stunT > 0 || G.shop || G.wanted > 0 || (talk && talk.qa)) return null;
  let best = null, bd = TALK.dist;
  const see = e => { if (e.off || e.down > 0 || e.angry || (talk && talk.who === e)) return; const d = Math.hypot(e.x - player.x, e.z - player.z); if (d < bd) { bd = d; best = e; } };
  peds.forEach(see); vendors.forEach(see);
  for (const g of gangs) if (g.hp > 0 && g.state === 'idle' && !g.foe && g.per.g.visible && isCalm(g) && G.play >= (g.mad || 0)) see(g); // おとなしくなったマフィアにも話せる
  return best;
}
function setBubble(s) { const e = $('bubble'); e.textContent = s; e.style.display = 'block'; }
function endTalk() { if (talk && talk.qa && !talk.who.npc) talk.who.talkT = 0; talk = null; $('bubble').style.display = 'none'; $('qa').classList.add('hidden'); }
function pickLine(who) {
  const later = TALK.later && G.mi >= MISSIONS.length; // 白や幹部の話は、大きな仕事のあとから
  const ok = LINES.filter(l => (later || !l.later) && !(who.oyaji && l.self) && l !== who.lastLine && l !== lastLine);
  const hints = ok.filter(l => l.hint), jokes = ok.filter(l => !l.hint), pool = hints.length && (Math.random() < TALK.hint || !jokes.length) ? hints : jokes;
  return pool[Math.floor(Math.random() * pool.length)];
}
// 「話す」ボタン: 近くの人が立ち止まって、ひとこと言う。ときどき質問(Q&A)される
function startTalk() {
  const who = talkTarget(); if (!who) return;
  if (who.mob && Math.random() >= TALK.qa) { endTalk(); const pool = CALM_LINES.filter(l => l !== who.lastLine), l = pool[Math.floor(Math.random() * pool.length)]; who.lastLine = l; who.talkT = TALK.show; talk = { who, t: TALK.show }; setBubble(tr(l.text)); return; }
  const ask = !!asking() && who.asked !== G.askId; // 聞きこみ中で、まだ聞いていない人
  endTalk(); who.talkT = TALK.show; let qa = null;
  if (who.mob) { const pool = QAS.filter(q => q.who === (who.white ? 'mobW' : 'mobB') && q !== lastQA); qa = pool[Math.floor(Math.random() * pool.length)]; } // おとなしくなったマフィアの Q&A(v=25)
  else if (who.oyaji) { if (!who.met || Math.random() < TALK.oyajiQa) qa = QAS.find(q => q.who === 'oyaji'); who.met = true; }
  else if (Math.random() < TALK.qa) { const pool = QAS.filter(q => (!q.who || q.who === 'shop') && q !== lastQA); qa = who.vendor && Math.random() < 0.5 ? QAS[0] : pool[Math.floor(Math.random() * pool.length)]; }
  if (qa) {
    lastQA = qa; const opts = [{ text: qa.ok, ng: false }, { text: qa.ng, ng: true }]; if (Math.random() < 0.5) opts.reverse();
    talk = { who, qa, opts, t: TALK.wait, ask }; setBubble(tr(qa.text));
    opts.forEach((o, i) => { $('qa' + i).textContent = tr(o.text); }); $('qa').classList.remove('hidden');
  } else if (ask) tellRumor(who);
  else { const l = pickLine(who); who.lastLine = lastLine = l; talk = { who, t: TALK.show }; setBubble(tr(l.text)); }
}
// 聞きこみ(v=18): いまの段が「聞きこみ」なら、その段。ちがえば null
function asking() { const st = G.free && !G.busy && !G.over ? G.free.steps[G.si] : null; return st && st.type === 'ask' ? st : null; }
// 幹部のうわさを言う(同じ人は1回だけ数える)
function tellRumor(who) {
  who.asked = G.askId; G.left = Math.max(0, G.left - 1); who.talkT = TALK.rumor; talk = { who, t: TALK.rumor };
  setBubble(tr(RUMORS[G.askI++ % RUMORS.length].text)); toast(G.left > 0 ? tr('うわさを聞いた！ のこり {n}人', { n: G.left }) : tr('うわさを聞いた！'), 1.6);
}
// 街の人・屋台の人がおこって、おそってくる(車を奪われておこった運転手と同じ動き。元の人は、いなくなるまで消しておく)
function makeAngry(who) { const n = newNpc('driver', who.x, who.z, who.h, who.look); n.state = 'angry'; n.cd = 0.8; who.angry = n; who.talkT = 0; who.per.g.visible = false; return n; }
// Q&A のこたえをえらぶ(i = 0 か 1)
function answerTalk(i) {
  if (!talk || !talk.qa || !talk.opts[i]) return;
  const who = talk.who, bad = talk.opts[i].ng; $('qa').classList.add('hidden'); talk.qa = null; talk.t = who.talkT = 1.8;
  const st = asking();
  if (!bad) { if (st && talk.ask) tellRumor(who); else if (who.mob) { setBubble(tr(lastQA.reply)); talk.t = who.talkT = 2.6; } else setBubble('😊'); } // いいこたえ(ごほうびは、なし。聞きこみ中なら、うわさを教えてくれる)
  else if (who.oyaji) { setBubble('…'); talk.t = who.talkT = 2.6; }
  else if (who.mob) { // おとなしくなったマフィア(v=25): 1発なぐって、去っていく。追ってこない・★は上がらない。しばらく話せない
    const d = Math.min(TALK.mobHit, player.hp + player.armor - 1); if (d > 0) hurtPlayer(d);
    who.swing = 0.3; who.state = 'flee'; who.fleeT = 3; who.talkT = 0; who.mad = G.play + TALK.mobWait; talk.hit = true; talk.t = 1.6; setBubble('💢');
  } // 屋台のおやじは、おこらない(だまって見るだけ)
  else {
    talk.who = makeAngry(who); setBubble('💢'); talk.t = 2.4; // おこって、おそってくる
    if (st) { G.left = st.n; G.askId++; toast(tr('おこらせた！ 聞きこみは最初からやり直し'), 2.4); } // 聞きこみ中: 集めた数が0にもどる
  }
}
// 毎フレーム: 「話す」ボタンを出す・消す、ふきだしを相手の頭の上に動かす
function updateTalk(dt) {
  const tg = talkTarget(); if (!!tg !== talkShown) { talkShown = !!tg; $('talkBtn').style.display = tg ? 'flex' : 'none'; }
  if (!talk) return;
  const w = talk.who, d = Math.hypot(w.x - player.x, w.z - player.z); talk.t -= dt;
  const gone = w.npc ? (w.hp <= 0 || npcs.indexOf(w) < 0) : (w.off || w.down > 0 || !!w.angry || G.wanted > 0 || (w.mob && (w.hp <= 0 || (w.state !== 'idle' && !(talk.hit && w.state === 'flee'))))); // 手配されたら、こわがって話をやめる
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
// 鬼ごっこの鬼のしるし(頭の上の赤いひし形。v=26)
const oniMesh = new THREE.Mesh(BG(0.95, 0.95, 0.3), MB(0xff3030)); oniMesh.rotation.z = Math.PI / 4; scene.add(oniMesh); oniMesh.visible = false;

/* ===== ゲームの状態 ===== */
// お使い(黒マフィア)。say = 始まるときに、画面の下に出るひとこと
const MISSIONS = [
  { title: '車に乗ろう', reward: 300, steps: [{ type: 'car', text: '近くの赤い車に近づいて「乗る」で乗ろう' }] },
  { title: 'はじめての配達', reward: 1500, say: { name: 'ジン', text: '中身は聞くな。届けろ。それだけだ' }, steps: [{ type: 'go', pos: P(2, 5), text: '荷物を受け取りに行こう(黄色い光)', done: '荷物ゲット！' }, { type: 'go', pos: P(5, 1), text: '荷物を届けよう' }] },
  { title: '急ぎの配達', reward: 2500, say: { name: 'ジン', text: '遅れた分は、利子につける' }, steps: [{ type: 'go', pos: P(1, 1), text: '急ぎの荷物を受け取ろう', done: '荷物ゲット！' }, { type: 'go', pos: P(5, 5), text: '50秒以内に届けろ！', time: 50 }] },
  { title: 'あやしい荷物', reward: 4000, say: { name: 'ジン', text: '警察に止められても、うちの名前は出すな' }, steps: [{ type: 'go', pos: P(0, 3), text: 'あやしい荷物を受け取れ', done: '荷物ゲット！' }, { type: 'go', pos: { x: 168, z: 60 }, text: '警察をかわして港の船へ運べ！', wanted: 2 }] },
  { title: '大きな仕事', reward: 10000, say: { name: 'ジン', text: 'これが済んだら、あの女のことを教えてやる' }, steps: [{ type: 'go', pos: P(3, 0), text: 'チェックポイント 1/4', time: 140, wanted: 3 }, { type: 'go', pos: P(6, 2), text: 'チェックポイント 2/4' }, { type: 'go', pos: P(4, 5), text: 'チェックポイント 3/4' }, { type: 'go', pos: P(1, 6), text: 'チェックポイント 4/4' }, { type: 'go', pos: { x: 168, z: -60 }, text: '港の船へ急げ！' }] },
];
// お話の場面(文字が1行ずつ出る。「」で始まる行はセリフ)
/* story:start */
const STORY = {
  intro: ['妹からの手紙がとだえて、半年。', '最後の消印は、この街だった。', '着いた夜、人ごみでだれかと肩がぶつかった。', '「…すまない」', '妹の写真を見せて回り、たどりついたのは一軒のクラブ。', '「その女なら知ってるぞ。…ん？クラブに来て何も頼まずに聞けると思ってるのか？」', '言われるままに頼みつづけた。気づけば、朝だった。', '会計で、財布がないことに気づいた。', '妹の写真も、いっしょに消えていた。', '「払えない？ なら、働いて返してもらう」', '見せられた数字は、一生かかっても返せない額だった。', '「今日からお前は、黒龍幇の運び屋だ。まずは、そこの車に乗れ」'],
  big: ['荷物は届けた。言われた場所に、言われた時間に。', 'だが、受け取ったのは白いスーツの男たちだった。', '「黒龍幇の連中が、うちに届け物とはな」', '電話が鳴った。', '「…お前、どこに届けた」', '渡された地図は、たしかにこの場所をさしていた。', 'その夜から、黒も白も敵になった。', '妹の手がかりは、また消えた。'],
  caught: ['「まままままままま待つのね…！！」', '「メニメニマネー足りない！ミー死にたくないザンス！！＄10000貸してプリーズミー！」', '「ボクチン無償とは言わないエレガントマン。この街の事ならな〜んでも知ってんねん」', '「ユーちゃんは、ひ・と・さ・が・しって感じかしら？フェイスにライティングよ」'],
  lend: ['「ユーちゃん！ありがとう！！夜の時間に港の前のパークにいらっしゃい。こう見えてもボクチン情報屋なの」', '「ボクチンのことは、ミーチャンって呼んでちょうだい」', '「ユーちゃんの探し物はアリンコちゃんのままじゃ分からないわよ。大空飛べる鳥になるしかないわ」'],
  refuse: ['「んまぁ〜！人でなし！ノーヒューマン！！」', '男は連れて行かれた。二度と会うことはなかった。'],
  sis: ['鉄のとびらの向こうに、人がいた。', 'そのひとりは、写真と同じ顔をしていた。', 'とびらは開かない。声も届かない。', '「かぎを持っているのは、この街でいちばん上の男だけだ」', '「それでも船に乗るなら、乗せてやる。決めるのはお前だ」'],
  end1: ['$20,000。船員は、数えもせずに受け取った。', '船が岸をはなれる。街の明かりが小さくなっていく。', '妹のことは、何もわからなかった。', 'それでも、生きて出た。'],
  // v=19 塔でのネタばらし(tower → トゥルーの順番のときだけ towerT → tower2)・大ボス・終わり 3・4
  tower: ['「ユーちゃ〜ん！来てくれたのね！ボクチンうれしいわ〜！」', '「…もういいか、この話し方も」', '「あの夜、人ごみで肩がぶつかっただろう。あれは俺だ」', '「金は使った。写真は役に立った。人をさがしてる人間は、何でもやるからな」', '「大仕事の地図をすりかえたのも俺だ。黒と白をぶつけるには、火種がいる」', '「よく働いてくれた。幹部は消えた。あとは俺が、その席に座るだけだ」', '「妹？ 前の運び屋のことか。とっくに消されたよ。この街の、いちばん上にな」'],
  towerT: ['うそだ。妹は生きている。この目で見た。', '「…だれに聞いた」'],
  tower2: ['「さあ、最後の仕事だ。ここで死んでくれ」', '銃声。', 'たおれたのは、ミーチャンのほうだった。', 'その手から、財布が落ちた。金はない。身分証が1まい、残っているだけだった。'],
  boss: ['「口の軽い男は、長生きせん」', '「うちの屋台に、何度か来てくれたな。顔は覚えとる」', '「この街じゃ、わしを龍頭と呼ぶ」', '「黒も白も、あのクラブも、ぜんぶわしの鍋の中だ。30年、つぎ足してきた」', '「運び屋はいい。よく働いて、金がかからん。お前の前の子も、そうだった」', '「幹部を2人つぶしたな。その席は、命で払ってもらう」'],
  bossEnd: ['「…鍋は、火を止めたら終わりだ。次は、お前がかき回せ」'],
  key: ['おやじの手から、かぎが落ちた。'],
  end3: ['街は静かになった。黒も白も、頭を下げた。', '妹は、もういない。そう聞かされた。', '塔の上から見る街は、きれいだった。', 'ここを出る理由は、もう残っていなかった。', '港の倉庫で、だれかが夜空を見上げていた。'],
  end4: ['とびらが開く。朝の光が入る。', '「…おそいよ」', '「むかえに来た」', '朝のチャイナタウン。港から、船が出ていく。', 'もう、乗る必要はなかった。', 'この街は、ふたりのものになった。'],
  end2: ['コンテナのかげで、人が働かされていた。', 'そのひとりが、顔を上げた。', '「…うそ。なんで、ここに」', '「話はあとだ。走れるか」', '船は、夜のうちに出た。', '何も持たずに来て、何も持たずに出ていく。', 'となりに妹がいる。それで充分だった。'],
};
/* story:end */
// 港の場所: 船員(船員のたのみ)・船(船代をはらう)・忍び込みの入口・忍び込む船
const PORT = { sailor: { x: 165, z: 52 }, boat: { x: 169.5, z: 66 }, sneak: { x: 163.5, z: -8 }, ship: { x: 170, z: -60 } };
const DEBT = 10000, FARE = 20000; // 情報屋に貸すお金・船代
// 自由なミッション: MISSIONS(黒マフィアのお使い。順番どおり)が全部終わると、紫の光るマーク(at)で受けられる。好きな順番でよい
// id はセーブに残すので変えない
//   when = 'night'(夜だけ)・'day'(昼だけ)・'dark'(夕方と夜。v=32)、after = このミッションのあとに出る、need = 出る条件、say・endSay = 始まり・終わりのひとこと
//   steps の type: go(そこへ行く。car: 1 = 車で、2 = ミッションの車で。foot = 歩いて。fragile = ぶつけてよい回数。guest = 待っている人(1 = 行き先の南、-1 = 北)
//       fail = ぶつけすぎたときの文、ouch = ぶつけるたびのひとこと、spill = ぶつけるとへる秒)・kill(n人たおす)・collect(items を全部拾う)
//     ram(逃げる車に n回ぶつける)・getin(ミッションの車に乗る)・survive(time 秒、★wanted のまま逃げる)・sneak(警察官のライトをよけて歩く)
//     hook(next) = その段が終わったときにすること(お話など)。終わったら next() を呼ぶ
const STALL_POS = { x: roadC(2), z: MK.z0 + 4.6 }; // 夜市の入口のすぐ中(「夜市の屋台を守れ」でマフィアが出る所)
// 情報屋(v=18): 夜、港の前の公園のベンチの前にいる(お金を貸したあとだけ)。だいだい色の光で、情報屋のミッションを受ける
const PARK = mergeRect(MERGES[1]), LOT = mergeRect(MERGES[3]), TWR = mergeRect(MERGES[2]);
const INFO = { x: (PARK.x0 + PARK.x1) / 2 + 1.2, z: (PARK.z0 + PARK.z1) / 2 - 20 }; // だいだい色の光(情報屋とベンチは、この西がわ)
// 「火をつけろ」: from = 黒の手下が立っている所(北の門の中)、to = 連れていく所(門の外・白のなわばり)、give = これよりはなれると手下があきらめる、near = 着いたときに、これより近くにいる手下を数える
const LURE = { from: { x: roadC(2) + 7.3, z: roadC(2) + 26 }, to: { x: roadC(2) + 7.3, z: roadC(1) + 14 }, n: 3, need: 2, give: 24, near: 18 };
// 「幹部の車をいただけ」: 白い高級車が止まっている所(北の大きなビルの前)と、かくす所(駐車場の、車のならびの間)
const BOSSCAR = { x: TWR.x0 + 32, z: roadC(1) - 4.3, h: Math.PI / 2, to: { x: LOT.x0 + 26, z: (LOT.z0 + LOT.z1) / 2 } };
// v=19 幹部・塔: PGD = 塔(パゴダ)のまん中、TOWER = 塔の広場のだいだい色の光(info = 情報屋が立つ所、boss = 大ボスが出てくる所)
//   INFO2 = 「白の幹部をたおせ」の光(情報屋の光のとなり。幹部2人は好きな順番でえらべるように、光を2つならべる)
//   BOSS_AT = 幹部と大ボスが出る所(B = 黒の幹部: 市場の奥、W = 白の幹部: 北の大きなビルの前、O = 大ボス: 塔の広場)
const PGD = { x: roadC(3) + 26, z: roadC(2) + 26 };
const TOWER = { x: PGD.x, z: PGD.z + 13, info: { x: PGD.x, z: PGD.z + 9.2 }, boss: { x: PGD.x + 3.5, z: PGD.z + 8.2 } };
const INFO2 = { x: INFO.x, z: INFO.z + 6.5 };
const BOSS_AT = { B: () => ({ x: MK_DEEP.x, z: MK_DEEP.z, h: 0 }), W: () => ({ x: TWR.x0 + 44, z: TWR.z1 - 1.4, h: 0 }), O: () => ({ x: TOWER.boss.x, z: TOWER.boss.z, h: 0 }) };
const INFO_GO = { name: 'ミーチャン', text: '場所はもう教えたわよん。ここから先はユーちゃんのお仕事。ボクチンは応援する係やねん。フレー、フレー！' };
// 狙撃ミッション(v=30): walk = 車をねらうマフィアの歩く速さ、dmg = 車にとりついたマフィア1人が1秒にへらす車の体力、wave2 = 2台目が来るまでの秒(1台目を全部たおすと、すぐ来る)、reach = 車にとりつく距離
const SNIPE = { walk: 2.2, dmg: 8, wave2: 20, reach: 2.6, carHp: 100 };
// 市場のミッション(v=32): おやじの屋台の前(紫の光と届け先)・材料を置く4つのマス・どろぼうの数字(hp 体力・run 逃げる速さ・walk ふだんの速さ・see 気づく距離・start 出てくるマス)
const OYAJI_AT = (() => { const v = vendors.find(v => v.oyaji); return v ? { x: v.x + Math.sin(v.h) * 1.8, z: v.z + Math.cos(v.h) * 1.8 } : { x: roadC(2), z: MK.z0 + 9 }; })();
const SPICE_AT = [[0, 0], [3, 0], [3, 9], [0, 11]].map(q => mkCell(q[0], q[1]));
const TH = { hp: 60, run: 5.6, walk: 1.6, see: 14, start: [0, 4] };
const hasRifle = () => player.inv.includes('rifle') && player.rf > 0;
const roofNear = (x, z) => ROOFS.reduce((b, r) => Math.hypot(r.x - x, r.z - z) < Math.hypot(b.x - x, b.z - z) ? r : b, ROOFS[0]);
const FREE = [
  { id: 'market', title: '市場のおつかい', desc: '市場の奥で品物を受け取って、店に届ける。市場には歩いてしか入れない。', reward: 2000, at: { x: roadC(2), z: MK.z0 + 3.2 }, steps: [{ type: 'go', pos: MK_DEEP, text: '市場の奥で品物を受け取ろう(歩いて入る)', done: '品物ゲット！' }, { type: 'go', pos: { x: roadC(4) - 7.5, z: roadC(2) + 26 }, text: '品物を店に届けよう' }] },
  { id: 'guard', title: '用心棒', desc: '店をおそいに来るマフィアを、5人たおす。', reward: 3000, at: { x: -90, z: 57.3 }, steps: [{ type: 'kill', pos: { x: -76, z: 52 }, n: 5, text: '店をおそうマフィアをたおせ(のこり {n}人)' }] },
  { id: 'taxi', title: 'お客さんを送る', desc: 'お客さんを車に乗せて、時間内に病院へ送る。ぶつけすぎると失敗。', reward: 2500, at: { x: -90, z: -98.7 }, steps: [{ type: 'go', car: 1, guest: 1, pos: { x: -76, z: -100.5 }, text: '車に乗って、お客さん(黄色い光)をむかえに行こう', done: 'お客さんが乗った！' }, { type: 'go', car: 1, pos: { x: roadC(5) + 26, z: roadC(4) + 2.5 }, time: 70, fragile: 3, text: '時間内に病院へ！ ぶつけすぎると失敗' }] },
  { id: 'debt', title: '借金の取り立て', desc: '金を借りて逃げた男の車を追いかけて、車でぶつけて止める。', reward: 1500, at: { x: 66, z: 109.3 }, need: () => G.money >= DEBT && !G.lent, say: { name: '金貸し', text: '金を借りて逃げた男がいる。車を止めろ。生きたまま連れてこい' }, steps: [{ type: 'ram', n: 3, time: 150, text: '逃げる車(赤い光)に、車でぶつけて止めろ(あと {n}回)', hook: debtHook }] },
  { id: 'bao', title: '小籠包のピンチ', desc: '小籠包が冷める前に、3か所へ配る。', reward: 2500, at: { x: -5.3, z: 66 }, steps: [{ type: 'go', pos: { x: roadC(2) + 20, z: roadC(2) }, time: 70, text: '冷める前に小籠包を配ろう 1/3', done: 'あつあつ！' }, { type: 'go', pos: { x: roadC(1), z: roadC(3) + 20 }, text: '冷める前に小籠包を配ろう 2/3', done: 'あつあつ！' }, { type: 'go', pos: { x: roadC(3) + 20, z: roadC(5) }, text: '冷める前に小籠包を配ろう 3/3' }] },
  { id: 'snake', when: 'night', title: 'ヘビが逃げた', desc: '市場から逃げたヘビを3匹つかまえて、市場に返す。', reward: 2000, at: { x: -74, z: 46.7 }, steps: [{ type: 'collect', items: [{ x: -100, z: 30 }, { x: -52, z: -4 }, { x: -20, z: 55 }], text: '逃げたヘビをつかまえろ(のこり {n}匹。歩いて近づく)', done: 'ヘビを全部つかまえた！' }, { type: 'go', pos: { x: -74, z: 46.7 }, text: 'ヘビを市場に返そう' }] },
  { id: 'valet', when: 'night', title: '車を届ける', desc: '駐車場の車を、ぶつけずに港まで運ぶ。', reward: 3500, at: { x: -109.3, z: 90 }, steps: [{ type: 'getin', text: '駐車場の光っている車に乗ろう', done: 'この車を港へ！' }, { type: 'go', car: 2, pos: { x: 156, z: -30 }, fragile: 1, text: 'ぶつけずに港まで運べ' }] },
  { id: 'decoy', when: 'day', title: 'おとり', desc: 'わざと警察に追われて、★3のまま2分逃げ切る。', reward: 5000, wantedOff: 1, at: { x: 118, z: -98.7 }, steps: [{ type: 'survive', wanted: 3, time: 120, text: '★3のまま、2分逃げ切れ' }] },
  // 夜だけのミッション(v=16)
  { id: 'stall', when: 'night', title: '夜市の屋台を守れ', desc: '夜市の屋台をこわしに来るマフィアを、3回追いはらう。', reward: 3500, at: { x: roadC(2) + 9, z: MK.z0 - 0.7 }, say: { name: '屋台の人', text: '今夜も、あいつらが屋台をこわしに来る。たのむ、追いはらってくれ' }, endSay: { name: '屋台の人', text: '助かった！ これで今夜も店を出せるよ' },
    steps: [{ type: 'kill', pos: STALL_POS, n: 3, text: '屋台をこわしに来たマフィアをたおせ 1/3(のこり {n}人)', done: 'まだ来るぞ！' }, { type: 'kill', pos: STALL_POS, n: 4, text: '屋台をこわしに来たマフィアをたおせ 2/3(のこり {n}人)', done: 'まだ来るぞ！' }, { type: 'kill', pos: STALL_POS, n: 5, text: '屋台をこわしに来たマフィアをたおせ 3/3(のこり {n}人)' }] },
  { id: 'drunk', when: 'night', title: '酔っぱらいを送る', desc: 'クラブから出てきた酔っぱらいを、車で家まで送る。3回ぶつけると失敗。', reward: 3000, at: { x: CLUB.x + 5, z: roadC(3) - 5.3 }, say: { name: '酔っぱらい', text: 'うぃ〜… 家まで、たのむ… ゆっくりな…' }, endSay: { name: '酔っぱらい', text: '…ついた？ あんた、いい運転手だな… つりは、いらねぇ' },
    steps: [{ type: 'go', car: 1, guest: -1, pos: { x: CLUB.x, z: roadC(3) - 3.5 }, text: '車に乗って、クラブの前の酔っぱらい(黄色い光)をむかえに行こう', done: '酔っぱらいが乗った！' },
      { type: 'go', car: 1, pos: { x: roadC(5), z: roadC(0) + 26 }, fragile: 2, fail: '車の中が大変なことに… ミッション失敗', ouch: [{ name: '酔っぱらい', text: 'うっ… ゆ、ゆらすな…' }, { name: '酔っぱらい', text: 'も、もうだめだ… 次は、出る…' }], text: 'ゆらさないように、家まで送ろう(3回ぶつけると失敗)' }] },
  { id: 'ramen', when: 'night', title: '夜中の出前', desc: '夜しか開いていない店のラーメンを、のびる前に車で港へ届ける。ぶつけるとスープがこぼれて、時間がへる。', reward: 3000, at: { x: roadC(2) + 26, z: roadC(2) + 5.3 }, say: { name: 'ラーメン屋', text: '港の夜勤に、ラーメン1ぱいだ。のびる前にたのむ。スープはこぼすなよ' }, endSay: { name: '港の人', text: 'お、まだのびてない。夜中のラーメンは、しみるなあ' },
    steps: [{ type: 'go', car: 1, pos: { x: roadC(6), z: roadC(5) + 20 }, time: 60, spill: 5, text: '車で、のびる前にラーメンを港へ届けろ！(ぶつけると時間がへる)' }] },
  // 市場のミッション(v=32): thief = 市場の迷路で、どろぼうを歩いて追いかけて、たおす。spice = 市場の4か所で材料を集めて、おやじに届ける(when: 'dark' = 夕方と夜)
  { id: 'thief', when: 'day', title: '迷路のどろぼう', desc: '屋台の売り上げを盗んだどろぼうを、市場の迷路で追いかけて、たおす。90秒。市場には歩いてしか入れない。', reward: 2500, at: { x: roadC(2) - 9, z: MK.z0 - 0.7 }, say: { name: '屋台の人', text: 'どろぼうだ！ 売り上げを持って、市場の中に逃げこんだ！' }, endSay: { name: '屋台の人', text: '取り返してくれたのか！ 助かったよ。これはお礼だ' },
    steps: [{ type: 'thief', time: 90, late: 'どろぼうに逃げられた… ミッション失敗', text: '市場に逃げたどろぼう(赤い光)を追いかけて、たおせ', done: '売り上げを取り返した！' }] },
  { id: 'spice', when: 'dark', need: () => !G.done.tower, title: '秘伝の材料', desc: '1分以内に、市場の4か所でタレの材料を集めて、屋台のおやじに届ける。夕方と夜だけ。', reward: 3000, at: OYAJI_AT, say: { name: '屋台のおやじ', text: 'タレの材料が切れた。市場の中に4つ置いてある。1分で持ってこい' }, endSay: { name: '屋台のおやじ', text: '…ふむ。いい手際だ。おまえ、使えるな' },
    steps: [{ type: 'collect', look: 'spice', got: '材料をひろった！', time: 60, items: SPICE_AT, text: '市場の4か所で、タレの材料を集めろ(のこり {n}こ。歩いて近づく)', done: '材料がそろった！ おやじの所へ' },
      { type: 'go', foot: 1, pos: OYAJI_AT, text: '材料を、屋台のおやじに届けよう(歩いて)' }] },
  // 狙撃ミッション(v=30。ライフルと弾がいる): roof = 屋上に上がる(roofAt のビル)、snipe = 屋上から狙撃(deal = 取引の手下、escort = 車を守る)
  { id: 'snipe1', when: 'day', title: '屋上の目', desc: '大きなビルの屋上から、下で取引をする白虎幇の手下4人を、1分以内に狙撃する。ライフルがいる。', reward: 4000, at: { x: 66, z: -108.7 }, req: hasRifle, reqNote: 'ライフルと弾がいる(武器屋で買える)',
    say: { name: '黒龍幇の男', text: '白虎幇が、大きなビルの下で取引をする。上から全部つぶせ。1分で終わらせろ' }, endSay: { name: '黒龍幇の男', text: '見事だ。白虎幇は、しばらく静かになる' },
    steps: [{ type: 'roof', roofAt: { x: 52, z: -130 }, text: '大きなビルの屋上に上がろう(入口の緑の光)', done: '屋上に着いた！ 下の取引を探せ' },
      { type: 'snipe', time: 60, late: '取引が終わって、逃げられた… ミッション失敗', deal: { car: [90, -108.3, Math.PI / 2], men: [[86, -111.4, Math.PI / 2], [88.5, -111.4, -Math.PI / 2], [91, -111.4, Math.PI / 2], [93.5, -111.4, -Math.PI / 2]] }, text: '取引に来た白虎幇の手下を狙撃しろ(のこり {n}人)' }] },
  { id: 'snipe2', when: 'night', title: '見えない護衛', desc: '東のビルの屋上から、ボースンの車をねらうマフィア6人を狙撃して守る。ライフルがいる。', reward: 4000, at: { x: 90, z: -56.7 }, req: hasRifle, reqNote: 'ライフルと弾がいる(武器屋で買える)',
    say: { name: 'ボースン', text: '荷物を積んだ車が、東のビルの前で動けなくなった。上から見はって、近づくやつを撃て' }, endSay: { name: 'ボースン', text: '助かった。…お前、いい目をしてるな' },
    steps: [{ type: 'roof', roofAt: { x: 78, z: -78 }, text: '東のビルの屋上に上がろう(入口の緑の光)', done: '屋上に着いた！ 車を守れ' },
      { type: 'snipe', escort: { car: [70, -48.8, Math.PI / 2], from: [[26, -55.2, Math.PI / 2], [118, -48.8, -Math.PI / 2]] }, fail: 'ボースンの車がこわされた… ミッション失敗', text: 'ボースンの車をねらうマフィアを狙撃しろ(のこり {n}人・車の体力 {hp})' }] },
  { id: 'sailor1', title: '船員のたのみ 1', desc: '箱を受け取って、港の倉庫まで運ぶ。', reward: 3000, at: PORT.sailor, say: { name: 'ボースン', text: '運び屋か。口がかたいなら、仕事がある。この箱を倉庫まで。中は見るな' }, endSay: { name: 'ボースン', text: '…見なかったな。また来い' }, steps: [{ type: 'go', pos: { x: roadC(1), z: roadC(1) + 20 }, text: '箱を受け取りに行こう', done: '箱ゲット！' }, { type: 'go', pos: { x: 162.5, z: 151 }, text: '箱を港の倉庫へ運ぼう' }] },
  { id: 'sailor2', after: 'sailor1', title: '船員のたのみ 2', desc: '市場の奥で箱を受け取って、港まで運ぶ。警察に追われる。', reward: 4000, at: PORT.sailor, say: { name: 'ボースン', text: '次は市場の奥から、港までだ。追われても、箱は落とすな' }, endSay: { name: 'ボースン', text: 'この港には、表に出せない荷物もある。知りたきゃ、もっと深い所まで来い' }, steps: [{ type: 'go', pos: MK_DEEP, text: '市場の奥で箱を受け取ろう(歩いて入る)', done: '箱ゲット！' }, { type: 'go', pos: PORT.sailor, wanted: 2, text: '警察をかわして、箱を港の船員に届けろ' }] },
  { id: 'sailor3', after: 'sailor2', need: () => !G.tru, title: '船員のたのみ 3', desc: '最後の荷物を、時間内に港の船まで運ぶ。警察に追われる。', reward: 5000, at: PORT.sailor, say: { name: 'ボースン', text: '最後だ。これを船まで運べ。済んだら、荷物にまぎれて乗せてやる' }, endSay: { name: 'ボースン', text: '約束だ。夜、コンテナの間を抜けてこい。見つかるなよ' }, steps: [{ type: 'go', pos: { x: roadC(0) + 20, z: roadC(6) }, text: '最後の荷物を受け取りに行こう', done: '荷物ゲット！' }, { type: 'go', pos: { x: 168, z: -60 }, time: 150, wanted: 3, text: '時間内に港の船へ運べ！' }] },
  // 船員のたのみを2つクリアしてから情報屋に貸すと、3つ目がこれに変わる(裏のトゥルーエンドの入口。つづきは⑥)
  { id: 'sailor3t', alt: 1, after: 'sailor2', need: () => !!G.tru && !G.done.sailor3, title: '倉庫への届け物', desc: '港の奥の倉庫へ、飯を届ける。', reward: 5000, at: PORT.sailor, say: [{ name: 'ボースン', text: 'お前、あの情報屋と組んだのか。なら、見せておくものがある' }, { name: 'ボースン', text: 'この飯を、奥の倉庫へ届けろ' }], onDone: () => { G.done.sailor3 = 1; G.sis = 1; }, steps: [{ type: 'go', foot: 1, pos: { x: 162.5, z: 151 }, text: '飯を、港の奥の倉庫へ届けよう(歩いて)', hook: next => story(STORY.sis, next) }] },
  { id: 'sneak', after: 'sailor3', when: 'night', ending: 2, title: '船に忍び込む', desc: '夜のうちに、警察官のライトをよけて船まで歩く。船に乗ると、街を出てゲームが終わる。セーブは消える。', reward: 0, at: PORT.sneak, steps: [{ type: 'sneak', foot: 1, pos: PORT.ship, text: '警察官のライトに入らないように、船まで歩け' }] },
  // 情報屋のミッション(v=18。裏ルート。順番どおり。夜、公園の情報屋の所で受ける。ほうびのお金は出ない)。つづき(幹部・ボス)は⑥後半
  //   steps の type: ask(街の人 n人から、うわさを聞く)・bait(黒の手下に気づかせる)・lure(歩いて、手下を to まで連れていく)・leave(車から降りる)
  //     keep = 次の段になっても、出ている相手や車を消さない。boss = 白い高級車と見はり。hunt = 追っ手の車が出る
  { id: 'info1', alt: 1, info: 1, when: 'night', need: () => G.lent === 1, title: '聞きこみ', desc: '街の人3人に話しかけて、幹部のうわさを集める。おこらせると、最初からやり直し。', reward: 0, at: INFO, say: { name: 'ミーチャン', text: 'まずはイヤーよ、イヤー！街のピーポーに聞いて回るのね。幹部ちゃんの話は、みんなヒソヒソ・ウィスパーなんやで' },
    steps: [{ type: 'ask', n: 3, text: '街の人に話しかけて、幹部のうわさを集めろ(のこり {n}人)' }] },
  { id: 'info2', alt: 1, info: 1, when: 'night', after: 'info1', need: () => G.lent === 1, doneMsg: '黒と白のケンカが始まった！', title: '火をつけろ', desc: '黒の手下をおこらせて、歩いて白のなわばりまで連れていく。車に乗ると、あきらめられる。', reward: 0, at: INFO, say: { name: 'ミーチャン', text: 'ブラックちゃんとホワイトちゃんは、ほっといてもファイヤーなの。ユーちゃんはマッチをシュッ！ってするだけよ〜ん' },
    steps: [{ type: 'bait', keep: 1, pos: LURE.from, text: '北の門の近くの黒の手下(赤い光)に、歩いて近づけ', done: '気づかれた！ 走れ！' },
      { type: 'lure', pos: LURE.to, text: '歩いて、門の外の白のなわばり(黄色い光)まで連れていけ(ついてきている {n}人)', hook: lureHook }] },
  { id: 'info3', alt: 1, info: 1, when: 'night', after: 'info2', need: () => G.lent === 1, title: '幹部の車をいただけ', desc: '白の幹部の車をうばって、駐車場にかくす。追っ手の車が来る。ぶつけていいのは5回まで。', reward: 0, at: INFO, say: { name: 'ミーチャン', text: 'ホワイトの幹部ちゃんはね、マイカーだけは自分でピッカピカにみがくの。あれがバイバイしたら、プンプンで出てくるわよ' },
    steps: [{ type: 'getin', boss: 1, keep: 1, text: '北の大きなビルの前の、白い車をうばえ', done: '追っ手が来る！ 駐車場へ！' },
      { type: 'go', car: 2, keep: 1, hunt: 1, pos: BOSSCAR.to, fragile: 5, fail: '車がきずだらけだ… ミッション失敗', text: '追っ手をかわして、車を駐車場にかくせ(ぶつけていいのは5回まで)', done: '着いた！' },
      { type: 'leave', text: '車から降りよう' }] },
  // 情報屋のミッションのつづき(v=19): 幹部2人(好きな順番)→ 塔でのネタばらし → 大ボス
  //   steps の kill に boss がつくと、幹部か大ボスが出る(B・W・O)。その1人をたおすとクリア。{n} は相手の体力
  //   intro(next) = 受けたときに、ミッションの前に出すお話。ending が関数のときは、終わりの番号を返す(0 = 終わらない)。col = 光の色
  { id: 'info4', alt: 1, info: 1, when: 'night', after: 'info3', need: () => G.lent === 1, doneMsg: 'カラスをたおした！ 黒龍幇は、もうおそってこない', title: 'カラスをたおせ', desc: '市場のいちばん奥にいる、黒龍幇の幹部カラスをたおす。手下が3人いる。市場には歩いてしか入れない。', reward: 0, at: INFO, say: INFO_GO, onDone: () => bossDown('B'),
    steps: [{ type: 'kill', boss: 'B', text: '市場の奥にいるカラス(赤い光)をたおせ(幹部の体力 {n})' }] },
  { id: 'info5', alt: 1, info: 1, when: 'night', after: 'info3', need: () => G.lent === 1, doneMsg: 'シラサギをたおした！ 白虎幇は、もうおそってこない', title: 'シラサギをたおせ', desc: '北の大きなビルの前にいる、白虎幇の幹部シラサギをたおす。手下が3人いる。', reward: 0, at: INFO2, say: INFO_GO, onDone: () => bossDown('W'),
    steps: [{ type: 'kill', boss: 'W', text: '北の大きなビルの前にいるシラサギ(赤い光)をたおせ(幹部の体力 {n})' }] },
  { id: 'tower', alt: 1, info: 1, when: 'night', need: () => G.lent === 1 && !!G.done.info4 && !!G.done.info5, ending: () => G.sis ? 0 : 3, doneMsg: 'かぎを手に入れた！ 港の奥の倉庫へ行こう', title: '塔の対決', desc: 'ミーチャンが、塔の前で待っている。話を聞いたら、最後の戦いになる。', reward: 0, at: TOWER, intro: towerIntro,
    steps: [{ type: 'kill', boss: 'O', text: '大ボスをたおせ(大ボスの体力 {n})', hook: next => story(STORY.bossEnd.concat(G.sis ? STORY.key : []), next) }] },
  // 裏のトゥルー: 大ボスが落としたかぎで、港の奥の倉庫のとびらを開ける(終わり 4)
  { id: 'rescue', alt: 1, col: 0xffe9a0, after: 'tower', title: '倉庫のとびら', desc: '大ボスのかぎで、倉庫のとびらを開ける。開けると、ゲームが終わる。セーブは消える。', yes: '開ける', reward: 0, at: { x: 162.5, z: 151 }, steps: [], onYes: () => { endScene(4); story(STORY.end4, () => finish(4), i => { if (i === 3) endScene(6); }); } },
];
for (const f of FREE) Object.assign(f, glowMark(f.col || (f.info ? 0xffa53a : 0xb06bff), f.at.x, f.at.z));
// 塔の前の情報屋・ネタばらしのあとに出てくる大ボス・落ちた財布(v=19。乱数は使わない)
const twrInfo = makeVip('info'), twrOyaji = makeVip('bossO'); setHand(twrOyaji, twrOyaji, 'pistol');
twrInfo.g.position.set(TOWER.info.x, 0.34, TOWER.info.z); twrOyaji.g.position.set(TOWER.boss.x, 0.34, TOWER.boss.z);
const twrWallet = addBox(0.34, 0.07, 0.22, TOWER.info.x + 1.1, 0.4, TOWER.info.z + 0.7, M(0x6a4a2a)); twrInfo.g.visible = twrOyaji.g.visible = twrWallet.visible = false;
// 情報屋と、公園のベンチ(乱数は使わない)
const infoPer = makeVip('info'); infoPer.g.position.set(INFO.x - 3.1, 0.3, INFO.z); infoPer.g.rotation.y = Math.PI / 2; infoPer.g.visible = false;
addBox(0.7, 0.14, 2.6, INFO.x - 3.9, 0.78, INFO.z, M(0x6a4a2a)); addBox(0.12, 0.6, 2.6, INFO.x - 4.2, 1.15, INFO.z, M(0x6a4a2a)); for (const dz of [-1.1, 1.1]) addBox(0.6, 0.45, 0.12, INFO.x - 3.9, 0.52, INFO.z + dz, M(0x333333));
addCol(INFO.x - 4.3, INFO.x - 3.55, INFO.z - 1.3, INFO.z + 1.3);
// 船代をはらって街を出る(水色の光。お使いが終わると出る)
const BOAT = { id: 'boat', title: '船で街を出る', desc: '船代をはらうと、街を出てゲームが終わる。セーブは消える。', pay: FARE, yes: 'はらう', at: PORT.boat, onYes: () => { G.money -= FARE; story(STORY.end1, () => finish(1)); } };
Object.assign(BOAT, glowMark(0x7fe8ff, BOAT.at.x, BOAT.at.z));
// 港の船員(立っているだけ)
const sailorPer = makePerson(0x1f3a6e, 0x1a1a2a, 0xc89870); part(sailorPer, 0.62, 0.16, 0.62, 0xffffff, 0, 2.5, 0); sailorPer.g.position.set(PORT.sailor.x + 1.8, 0.3, PORT.sailor.z - 1.6); sailorPer.g.rotation.y = -Math.PI / 2; sailorPer.g.visible = false;
// mode: 'menu'(画面の後ろで街が動いている) / 'solo'(ひとり用) / 'race'(配達競争)
//   lent = 情報屋に 0: まだ会っていない、1: 貸した、2: 貸さなかった。tru = トゥルーエンドの順番で貸した。sis = 倉庫で妹を見た
const G = { twrDown: false, askId: 1, askI: 0, huntT: 0, mode: 'menu', started: false, over: false, money: 0, wanted: 0, mi: 0, si: 0, timeLeft: -1, play: 0, evade: 0, bust: 0, downT: 0, stunT: 0, shop: null, shopLock: null, hitCd: 0, spawnCd: 0, failWait: 0, waitMsg: '', free: null, done: {}, offer: null, markLock: null, freeT: 0, bosses: [], lent: 0, tru: 0, sis: 0, left: 0, bumps: 0, bumpCd: 0, ramCd: 0, busy: false, tp: null, story: null, sleep: false, camYaw: Math.PI, camDrag: 0, clock: DAY.race, phase: 'night', out: false, watchYaw: 0, rule: 'deliver', tagUntil: 0 };
// 配達競争の状態(online.js から setRace でもらう)
const R = { me: null, state: null, remotes: {}, avatars: {}, sendT: 0, ev: [], evSeq: 0, evSeen: {}, gotN: 0, runCd: {}, itemM: [], soloKeep: null }; // ev〜soloKeep は撃ち合い(v=28)
let toastT = 0;
function toast(s, t) { const e = $('toast'); e.textContent = s; e.style.opacity = 1; toastT = t || 2.2; }
function addWanted(n) { if (G.mode !== 'solo') return; const before = G.wanted; G.wanted = Math.min(5, G.wanted + n); G.evade = 0; if (G.wanted > before && before === 0) toast(tr('警察に追われている！')); }
// 配達競争(v=20): 人をひいた・パトカーにぶつけたときだけ追われる(★は1つだけ。ふえない)
// ケイドロ(v=27): 自分が警察か・最初の10秒で動けないか・パトカーに乗りかえる
const kdCop = id => G.rule === 'cops' && !!(R.state && R.state.cop && R.state.cop[id || R.me]);
const kdFrozen = () => G.mode === 'race' && kdCop() && T < G.kdFree;
function kdMakeCop() {
  const old = player.mode === 'car' ? player.car : null; if (!old || old.cop) return; // 歩いていたら、そのまま(ほかの人には警察官の服で見える)
  const x = old.x, z = old.z, h = old.h, v = old.v;
  exitCar(); removeCar(old); if (R.myCar === old) R.myCar = null;
  const c = newCar('police', x, z, h, 0); c.crew = 0; c.v = v; if (R.myCar) removeCar(R.myCar); R.myCar = c;
  player.x = x; player.z = z; enterCar(c);
}
function raceWanted(msg) { if (G.mode !== 'race' || G.rule !== 'deliver' || G.out || !G.started) return; if (!G.wanted) { G.wanted = 1; G.spawnCd = 0; toast(tr(msg), 2.4); } G.evade = 0; } // 警察が出るのは配達競争だけ(v=26)
// お使いの間(大きな仕事が終わるまで)は、マフィアはおそってこない
const peace = () => TUNE.peace && G.mi < MISSIONS.length;
// ゲームが止まっている間(買い物・ミッションをえらぶ・お話・ねる)
const paused = () => !!(G.shop || G.offer || G.story || G.sleep || G.pause); // G.pause = 一時停止の窓(v=23)
function stopInput() { endScope(); releaseHeld(); if (joy) { joy = null; setKnob(0, 0); } camTouch = null; }

/* ===== お話の場面・ひとこと(v=15) ===== */
// お話: 文字が1行ずつ出る。タップで次へ。「とばす」で終わりまで。出ている間はゲームが止まる。終わったら done()
//   on(i) = i 行目が出たときにすること(場面を変えるなど。なくてもよい)
function story(lines, done, on) { G.story = { lines, i: 0, done, on }; stopInput(); document.body.classList.add('story'); $('story').classList.remove('hidden'); drawStory(); }
function drawStory() {
  const s = G.story, a = Math.max(0, s.i - 4), show = s.lines.slice(a, s.i + 1);
  $('storyLines').innerHTML = show.map((l, k) => '<p class="' + (l[0] === '「' ? 'q' : '') + (k < show.length - 1 ? ' old' : '') + '">' + esc(tr(l)) + '</p>').join('');
}
function storyNext(skip) {
  const s = G.story; if (!s) return;
  if (!skip && s.i < s.lines.length - 1) { s.i++; drawStory(); if (s.on) s.on(s.i); return; }
  G.story = null; document.body.classList.remove('story'); $('story').classList.add('hidden'); if (s.done) s.done();
}
$('story').addEventListener('click', () => storyNext(false));
$('storySkip').addEventListener('click', e => { e.stopPropagation(); storyNext(true); });
/* ===== 出だしのクラブの中(v=17) ===== */
// 街とは別の所(街の地面のずっと下)に作った1部屋。「はじめから」のお話の間だけ見せる。操作はなし、カメラは止めたまま
//   左にカウンター(うしろの棚にびん、バーテンダー)。手前に主人公(うしろ姿)、向かいにクラブの男。カウンターの上に、からのグラス。右の奥で20人がおどる
const INTRO = { y: -80, g: null, dancers: [], tiles: [], beams: [], ball: null, cam: [-4.3, 2.75, 7.9], look: [-2.2, 1.35, -3] };
function buildIntro() {
  const g = INTRO.g = new THREE.Group(); g.position.set(0, INTRO.y, 0); scene.add(g);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const person = (shirt, pants, skin, x, z, r) => { const p = makePerson(shirt, pants, skin); g.add(p.g); p.g.position.set(x, 0, z); p.g.rotation.y = r; return p; };
  let sd = 7; const rd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; // この部屋だけの乱数(街の乱数は使わない)
  const H = 5.2, ZB = -13.4, ZF = 9, ZC = (ZB + ZF) / 2, ZD = ZF - ZB, wall = M(0x241a30), dark = M(0x0e0b13), wood = M(0x4a2e1e), pink = MB(0xff4ad0), purple = MB(0x9a5cff), dim = MB(0x2a1c52);
  // 部屋(ゆか・天井・かべ)
  add(BG(28, 0.2, ZD), M(0x1c1624), 2, -0.1, ZC); add(BG(28, 0.2, ZD), dark, 2, H + 0.1, ZC);
  add(BG(28, H, 0.2), wall, 2, H / 2, ZB - 0.1); add(BG(28, H, 0.2), wall, 2, H / 2, ZF + 0.1); add(BG(0.2, H, ZD), wall, -12.1, H / 2, ZC); add(BG(0.2, H, ZD), wall, 16.1, H / 2, ZC);
  add(BG(27.8, 0.12, 0.1), pink, 2, H - 0.4, ZB + 0.06); add(BG(27.8, 0.12, 0.1), purple, 2, 0.3, ZB + 0.06); add(BG(0.1, 0.12, ZD), purple, 15.95, H - 0.4, ZC); add(BG(0.1, 0.12, ZD), pink, -11.95, H - 0.4, ZC);
  for (let k = 0; k < 9; k++) add(BG(0.12, H - 1.2, 0.08), dim, -9.5 + k * 3, H / 2, ZB + 0.05); // 奥のかべのたての線
  for (let k = 0; k < 5; k++) add(BG(0.1, 0.06, ZD), dim, -6 + k * 5, H - 0.02, ZC);           // 天井の線
  add(BG(5.6, 2.0, 0.12), hSignMat('黒龍', '#120a18', '#ff7ae0'), 6.2, 3.6, ZB + 0.08);
  // カウンター(左)・いす・棚とびん
  add(BG(1.5, 1.1, 17), wood, -8.6, 0.55, -1); add(BG(1.8, 0.1, 17.2), M(0x1a1016), -8.6, 1.15, -1); add(BG(0.06, 0.1, 17), pink, -7.82, 0.95, -1);
  for (let k = 0; k < 7; k++) { const z = 6.4 - k * 2.2; if (k === 1) continue; add(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 8), M(0x55505a), -7.1, 0.38, z); add(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12), M(0x8a1a2a), -7.1, 0.8, z); }
  add(BG(0.12, 3.5, 16.6), dim, -11.9, 2.75, -1);
  const BOT = [0xffb347, 0x7dff6a, 0x3bf0ff, 0xff7ae0, 0xffe08a, 0xff5a3a];
  for (let r = 0; r < 3; r++) { add(BG(0.5, 0.07, 16.6), M(0x2a1c22), -11.6, 1.5 + r * 1.0, -1); for (let k = 0; k < 30; k++) { if (rd() < 0.2) continue; const bh = 0.4 + rd() * 0.3; add(BG(0.16, bh, 0.16), MB(BOT[Math.floor(rd() * 6)]), -11.6, 1.54 + r * 1.0 + bh / 2, -9 + k * 0.55); } }
  // カウンターの上: からのグラスがならぶ(「頼みつづけた」のしるし)
  const glass = new THREE.MeshBasicMaterial({ color: 0xe4f2ff, transparent: true, opacity: 0.7 }), gg = new THREE.CylinderGeometry(0.1, 0.075, 0.26, 10);
  for (let k = 0; k < 14; k++) add(gg, glass, -8.15 - (k % 3) * 0.27, 1.33, 5.3 - k * 0.3);
  add(BG(0.18, 0.55, 0.18), MB(0xffb347), -8.9, 1.48, 2.2);
  // バーテンダー・主人公(うしろ姿)・クラブの男(黒い服・サングラス・赤いネクタイ)
  const bar = person(0xf2f2f2, 0x15151a, 0xe0b890, -10.3, 1.2, Math.PI / 2); part(bar, 0.84, 0.7, 0.2, 0x15151a, 0, 1.3, 0.14); part(bar, 0.24, 0.1, 0.06, 0x15151a, 0, 1.8, 0.26);
  const me = person(0xffd23f, 0x23324f, 0xf0c9a0, -6.3, 4.0, Math.PI + 0.3); part(me, 0.58, 0.42, 0.1, 0x2a1d14, 0, 2.2, -0.26); // うしろ姿(うしろ頭に髪)
  const man = person(0x15151a, 0x15151a, 0xc89870, -5.5, 1.3, -0.15); part(man, 0.58, 0.13, 0.08, 0x050505, 0, 2.2, 0.28); part(man, 0.22, 0.55, 0.05, 0xf2f2f2, 0, 1.52, 0.24); part(man, 0.1, 0.5, 0.06, 0xc8261e, 0, 1.5, 0.26);
  // まん中: 丸いテーブルと、立って飲んでいる人
  for (const [x, z, c] of [[-0.6, 2.6, 0x3bf0ff], [3.8, 4.6, 0xff7ae0], [9.5, 3.2, 0x9a5cff]]) { add(new THREE.CylinderGeometry(0.09, 0.09, 1.05, 8), M(0x55505a), x, 0.52, z); add(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 16), new THREE.MeshBasicMaterial({ color: c }), x, 1.08, z); add(gg, glass, x + 0.2, 1.25, z - 0.1); }
  person(0xd9483a, 0x23232c, 0xe0b890, 0.5, 2.9, -1.9); person(0x3f7fd0, 0x3a3048, 0xc89870, 4.8, 4.2, -2.2); person(0xf2f2f2, 0x23232c, 0xf0c9a0, 2.9, 5.2, 2.2);
  // おどる所(右の奥): 光るゆか・スピーカー・ミラーボール・ライト
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); add(BG(2.05, 0.08, 2.05), m, 0.2 + i * 2.15, 0.04, -12.2 + j * 2.15); INTRO.tiles.push({ m, i, j }); }
  for (const x of [-1.9, 13.7]) { add(BG(1.5, 3.2, 1.2), dark, x, 1.6, ZB + 0.8); for (const [y, r] of [[2.3, 0.5], [1.1, 0.35]]) add(new THREE.CylinderGeometry(r, r, 0.06, 14), M(0x3a3644), x, y, ZB + 1.42).rotation.x = Math.PI / 2; }
  INTRO.ball = add(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe8e8f4 }), 5.6, H - 0.75, -8); add(BG(0.06, 0.4, 0.06), dark, 5.6, H - 0.2, -8);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), x = 1.4 + k * 3.1, z = -10.6 + (k % 2) * 4.2;
    const b = add(new THREE.ConeGeometry(1.5, H - 0.2, 16, 1, true), m, x, (H - 0.2) / 2, z), lamp = add(BG(0.4, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), x, H - 0.11, z); INTRO.beams.push({ m, b, k, lamp });
  }
  const SH = [0xff5a8a, 0x3bd0ff, 0xffd23f, 0x7dff6a, 0xb48cff, 0xff8a3a, 0xf2f2f2, 0xd9483a], SK = [0xf0c9a0, 0xc89870, 0xe0b890];
  for (let k = 0; k < 20; k++) { const x = 0.1 + (k % 5) * 2.5 + rd() * 1.6, z = -12.4 + Math.floor(k / 5) * 2.5 + rd() * 1.4, p = person(SH[k % 8], k % 3 ? 0x23232c : 0x3a3048, SK[k % 3], x, z, rd() * 6.28); INTRO.dancers.push({ p, r: p.g.rotation.y, ph: rd() * 6.28, sp: 0.85 + rd() * 0.4, up: k % 3 === 0 }); }
}
const introCol = new THREE.Color();
// お話の間、毎フレーム: カメラを止める・おどる人が体をゆらす・ライトの色がゆっくり変わる
function updateIntro(dt, t) {
  const y = INTRO.y; camera.position.set(INTRO.cam[0], y + INTRO.cam[1], INTRO.cam[2]); camera.lookAt(INTRO.look[0], y + INTRO.look[1], INTRO.look[2]);
  if (Math.abs(camera.fov - baseFov) > 0.1) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
  for (const d of INTRO.dancers) {
    const a = t * 4.2 * d.sp + d.ph, s = Math.sin(a), p = d.p;
    p.g.position.y = Math.abs(s) * 0.14; p.g.rotation.y = d.r + Math.sin(a * 0.31) * 0.6; p.g.rotation.z = Math.sin(a * 0.5) * 0.07;
    p.legL.rotation.x = s * 0.3; p.legR.rotation.x = -s * 0.3;
    if (d.up) { p.armL.rotation.x = Math.PI + s * 0.35; p.armR.rotation.x = Math.PI - s * 0.35; } else { p.armL.rotation.x = -0.9 + s * 0.6; p.armR.rotation.x = -0.9 - s * 0.6; }
  }
  for (const k of INTRO.tiles) k.m.color.setHSL((k.i * 0.13 + k.j * 0.21 + t * 0.045) % 1, 0.95, 0.3 + 0.22 * Math.sin(t * 2.2 + k.i * 1.7 + k.j * 2.3));
  for (const k of INTRO.beams) { k.m.color.setHSL((k.k * 0.25 + t * 0.03) % 1, 1, 0.55); k.lamp.material.color.copy(k.m.color); k.b.rotation.z = Math.sin(t * 0.6 + k.k * 1.4) * 0.16; k.b.rotation.x = Math.cos(t * 0.45 + k.k) * 0.12; }
  INTRO.ball.rotation.y = t * 0.5; INTRO.ball.material.color.copy(introCol.setHSL((t * 0.03 + 0.5) % 1, 0.35, 0.85));
}
// 「はじめから」: クラブの中で出だしのお話 → 終わったら街へ(done)。テストは window.SC_NO_INTRO = 1 でとばす
function startIntro(done) {
  if (!INTRO.g) buildIntro(); INTRO.g.visible = true; G.intro = true; setClock(DAY.night + 60); // 部屋の中は夜の明るさ
  story(STORY.intro, () => { G.intro = false; INTRO.g.visible = false; setClock(DAY.start); done(); });
}
// ひとこと: 画面の下に、名前つきの字幕(ゲームは止まらない)。s = { name, text } か、そのならび
const subQ = []; let subT = 0;
function say(s, now) { if (now) { subQ.length = 0; subT = 0; } for (const l of Array.isArray(s) ? s : [s]) subQ.push(l); } // now = 前のひとことが残っていたら、入れかえる
function updateSub(dt) {
  const e = $('sub'); if (subT > 0) { subT -= dt; if (subT > 0) return; e.style.opacity = 0; }
  if (subQ.length) { const l = subQ.shift(); $('subName').textContent = tr(l.name); $('subText').textContent = tr(l.text); e.style.opacity = 1; subT = 4.6; }
}
// 終わり(n = 1: 船代をはらう、2: 忍び込む、3: 裏(大ボスをたおす)、4: 裏のトゥルー(妹も助ける))。セーブは消える。見た終わりは sc-ends に残す
const ENDS = [{ text: '船代をはらって、ひとりで街を出た' }, { text: '妹といっしょに、街を出た' }, { text: '大ボスをたおして、この街のてっぺんに立った' }, { text: '妹を助けて、この街をふたりのものにした' }];
function finish(n) {
  clearSave(); try { const a = JSON.parse(localStorage.getItem('sc-ends') || '[]'); if (!a.includes(n)) a.push(n); localStorage.setItem('sc-ends', JSON.stringify(a)); } catch (e) { /* 残せなくてもよい */ }
  G.over = true; marker.visible = false; setPlaying(false);
  $('clearPanel').innerHTML = '<h1>SURVIVE CHINATOWN</h1><p class="sub">' + tr('おわり {n}/4', { n }) + '</p><h2>' + tr(ENDS[n - 1].text) + '</h2><p>' + tr('所持金 ${m}', { m: G.money.toLocaleString() }) + '　' + tr('遊んだ時間 {m}分', { m: Math.floor(G.play / 60) }) + '</p><p class="sub">' + tr(n === 4 ? '4つ目の終わり。ここまで遊んでくれて、ありがとう！' : '終わり方は、ほかにもある。') + '</p><button class="btn-big" id="clearBtn">' + tr('タイトルへ') + '</button>';
  showOnly('clear'); $('clearBtn').addEventListener('click', () => location.reload());
}

/* ===== ミッションの進み方 ===== */
// ミッションの間だけ出るもの: たおす相手・拾う物・立っている人・見はりの警察官・逃げる車・運ぶ車
const MX = { foes: [], items: [], props: [], guards: [], hunters: [], runner: null, mcar: null, boss: null };
const SNEAK = { x: 166, z0: -82, z1: -38, speed: 3.2, see: 8, half: 0.5 }; // 見はりが歩く所・速さ・ライトのとどく距離・広がり
function aim(x, z) { marker.visible = true; marker.position.set(x, 0, z); G.tp = { x, z }; }
// その段だけのものを消す
function clearStep() {
  for (const g of MX.foes) dropGang(g);
  for (const it of MX.items) scene.remove(it.g); for (const p of MX.props) scene.remove(p); for (const g of MX.guards) scene.remove(g.per.g);
  MX.foes.length = MX.items.length = MX.props.length = MX.guards.length = 0; MX.boss = null;
}
// ミッションが終わったとき(クリア・失敗): 逃げる車・運ぶ車も消す(主人公が乗っている車は残す)
function clearMission() {
  clearStep();
  for (const k of ['runner', 'mcar']) { const c = MX[k]; MX[k] = null; if (!c) continue; if (player.car === c) { c.flee = false; continue; } removeCar(c); }
  for (const c of MX.hunters) removeCar(c); MX.hunters.length = 0; // 追っ手の車
  G.busy = false; G.tp = null; markerColor(0xffd23f);
}
// いまのミッション(自由なミッションを受けていればそれ。なければ、お使いの次の1つ。全部終わっていれば null)
function curM() { return G.free || (G.mi < MISSIONS.length ? MISSIONS[G.mi] : null); }
// やられた・逮捕されたときに、ミッション失敗になるか(お使いは、まだ最初の所なら失敗にしない)
function missionOn() { const m = curM(); return !!m && !G.over && (!!G.free || G.si > 0 || !!m.steps[0].wanted); }
function freeOpen(f) { return G.mi >= MISSIONS.length && !G.free && !G.done[f.id] && (!f.after || !!G.done[f.after]) && (!f.need || f.need()) && (!f.info || G.phase === 'night'); } // 情報屋は夜だけいる
const boatOpen = () => G.mi >= MISSIONS.length && !G.free && !G.over;
function beginStep() {
  const st = curM().steps[G.si]; G.left = st.n || 0; G.bumps = 0; G.tp = null;
  if (st.time) G.timeLeft = st.time; if (st.wanted) G.wanted = Math.max(G.wanted, st.wanted);
  markerColor(0xffd23f); marker.visible = false; if (st.pos) aim(st.pos.x, st.pos.z);
  if (st.guest) { const per = makePerson(0xff8040, 0x333333, 0xc89870); per.g.position.set(st.pos.x, 0, st.pos.z + 2.3 * st.guest); per.g.rotation.y = st.guest > 0 ? Math.PI : 0; if (st.guest < 0) per.g.rotation.z = 0.14; MX.props.push(per.g); } // 待っているお客さん(guest: -1 = 行き先の北がわ。酔っぱらいは少しかたむく)
  if (st.type === 'kill' && st.boss) spawnBoss(st.boss); // 幹部か大ボス
  else if (st.type === 'kill') for (let k = 0; k < st.n; k++) { // おそってくるマフィア
    const a = k / st.n * 6.28, g = newGang(st.pos.x + Math.cos(a) * 5, st.pos.z + Math.sin(a) * 3);
    g.temp = true; g.tier = 0; g.weapon = k === 0 ? 'pistol' : k % 2 ? 'knife' : 'fist'; setHand(g.per, g, g.weapon); g.state = 'chase'; MX.foes.push(g);
  }
  if (st.type === 'thief') { // 迷路のどろぼう(v=32): 緑の上着と帽子、売り上げのふくろ。動きは updateThief
    const q = mkCell(TH.start[0], TH.start[1]), per = makePerson(0x4f6b3a, 0x2a2a2a, 0xc89870);
    const cap = new THREE.Mesh(BG(0.64, 0.16, 0.72), M(0x2e3e22)); cap.position.set(0, 2.52, 0.05); per.g.add(cap); const bag = new THREE.Mesh(BG(0.45, 0.45, 0.35), M(0xd9b45a)); bag.position.set(0, 1.4, -0.42); per.g.add(bag);
    const g = newGang(q.x, q.z, per); g.temp = true; g.tier = 0; g.ctl = true; g.nofeud = true; g.thief = true; g.weapon = 'fist'; g.hp = TH.hp; g.h = 0; g.dir = 0; g.dirT = 0; g.wt = 0; MX.foes.push(g); MX.boss = g; markerColor(0xff4a4a); aim(g.x, g.z);
  }
  if (st.type === 'collect') { // 逃げたヘビ・秘伝の材料(look: 'spice')
    for (const p of st.items) { const g = new THREE.Group(), it = st.look === 'spice' ? spiceJar() : marketItem('snake'); it.scale.set(1.5, 1.5, 1.5); g.add(it); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 20), MB(0xffd23f)); rg.rotation.x = Math.PI / 2; rg.position.y = -0.7; g.add(rg); g.position.set(p.x, 1.1, p.z); scene.add(g); MX.items.push({ x: p.x, z: p.z, g }); }
    G.left = st.items.length;
  }
  if (st.type === 'ram') { // 逃げる車(交差点 (5,5) から北へ走り出す)
    const c = MX.runner = newCar('traffic', roadC(5) - 3.2, roadC(5) - 16, Math.PI, 0x8a2be2); c.flee = true; c.a = [5, 5]; c.b = [5, 4]; c.p = 0.3; c.v = 12; markerColor(0xff4a4a); aim(c.x, c.z);
  }
  if (st.type === 'getin' && st.boss) { // 白の幹部の車(北の大きなビルの前)と、見はりの白の手下3人
    for (let i = cars.length - 1; i >= 0; i--) { const o = cars[i]; if (o !== player.car && o.kind === 'parked' && Math.hypot(o.x - BOSSCAR.x, o.z - BOSSCAR.z) < 6) removeCar(o); } // 前に失敗したときの車などが残っていたら、どける
    const c = MX.mcar = newCar('parked', BOSSCAR.x, BOSSCAR.z, BOSSCAR.h, 0xf4f4f4); carTrim(c, 'boss'); aim(c.x, c.z);
    ['pistol', 'knife', 'fist'].forEach((w, k) => { const g = newGang(BOSSCAR.x + [-4, 0, 4][k], TWR.z1 - 1.3); g.temp = true; g.tier = 0; setTeam(g, true, w); MX.foes.push(g); }); // 見はりは歩道に立つ
  }
  else if (st.type === 'getin') { const r = mergeRect(MERGES[3]), c = MX.mcar = newCar('parked', r.x0 + 14, (r.z0 + r.z1) / 2, 0, 0xffd23f); aim(c.x, c.z); } // 運ぶ車(駐車場の、車のならびの間)
  if (st.type === 'roof') { const rf = roofNear(st.roofAt.x, st.roofAt.z); aim(rf.ent.x, rf.ent.z); }
  if (st.type === 'snipe' && st.deal) { // 屋上の目: 白い車と、取引をする白の手下4人(立っているだけ)
    const d = st.deal, c = newCar('parked', d.car[0], d.car[1], d.car[2], 0xf4f4f4); c.flee = true; MX.hunters.push(c); markerColor(0xff4a4a);
    d.men.forEach((q, k) => { const g = newGang(q[0], q[1]); g.temp = true; g.tier = 0; g.ctl = true; g.nofeud = true; setTeam(g, true, k % 2 ? 'pistol' : 'fist'); g.h = q[2]; MX.foes.push(g); });
  }
  if (st.type === 'snipe' && st.escort) { // 見えない護衛: ボースンの車。マフィアの車が西から(あとで東からも)来て、3人ずつ降りてくる
    const e = st.escort, c = MX.mcar = newCar('parked', e.car[0], e.car[1], e.car[2], 0x1f3a6e); c.flee = true; G.escHp = SNIPE.carHp; G.wave = 0; G.waveT = 0; spawnWave(e, 0); markerColor(0xff4a4a);
  }
  if (st.type === 'ask') { G.askId++; G.askI = Math.floor(Math.random() * RUMORS.length); }
  if (st.type === 'bait') { // 「火をつけろ」: 北の門の中に黒の手下3人(lure)、門の外に白の手下3人
    markerColor(0xff4a4a);
    for (let k = 0; k < LURE.n; k++) { const g = newGang(LURE.from.x, LURE.from.z - 3 + k * 3); g.temp = true; g.tier = 0; g.lure = true; g.weapon = k ? 'knife' : 'fist'; setHand(g.per, g, g.weapon); MX.foes.push(g); }
    [[0, -4, 'pistol'], [0, -6.5, 'knife'], [2.5, -6.8, 'pistol']].forEach(q => { const g = newGang(LURE.to.x + q[0], LURE.to.z + q[1]); g.temp = true; g.tier = 0; setTeam(g, true, q[2]); MX.foes.push(g); });
  }
  if (st.hunt) G.huntT = 2; // 追っ手の車は、少ししてから出る
  if (st.type === 'sneak') for (const s of [1, -1]) { // 見はりの警察官(ライトを持って、行ったり来たりする)
    const per = makePerson(0x2c56b8, 0x1a2a55, 0xc89870), cap = new THREE.Mesh(BG(0.64, 0.16, 0.72), M(0x14224a)); cap.position.set(0, 2.52, 0.05); per.g.add(cap);
    const cg = new THREE.CircleGeometry(SNEAK.see, 14, -Math.PI / 2 - SNEAK.half, SNEAK.half * 2); cg.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); cone.position.y = 0.3; per.g.add(cone);
    MX.guards.push({ per, x: SNEAK.x, z: s > 0 ? SNEAK.z1 : SNEAK.z0, dir: -s, h: 0 });
  }
}
// マフィアの車が止まって、3人降りてくる(ボースンの車へ歩いていく)
function spawnWave(e, i) {
  const q = e.from[i], c = newCar('parked', q[0], q[1], q[2], 0x111111); c.flee = true; MX.hunters.push(c); G.wave = i + 1;
  for (let k = 0; k < 3; k++) { const g = newGang(q[0] - Math.sin(q[2]) * (2 + k * 1.6) + (k - 1) * 0.3, q[1] + (k - 1) * 1.2); g.temp = true; g.tier = 0; g.ctl = true; g.nofeud = true; g.weapon = k ? 'knife' : 'pistol'; setHand(g.per, g, g.weapon); MX.foes.push(g); }
  if (i) toast(tr('東からも来たぞ！'), 2);
}
// 狙撃ミッションの毎フレーム
// 秘伝の材料のつぼ(赤いふたと、白い紙)
function spiceJar() {
  const g = new THREE.Group(), j = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 10), M(0x7a4a26)); g.add(j);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), M(0xc8261e)); lid.position.y = 0.3; g.add(lid);
  const lb = new THREE.Mesh(BG(0.3, 0.26, 0.04), M(0xf2ead8)); lb.position.set(0, 0.02, 0.27); g.add(lb); return g;
}
// 迷路のどろぼう(v=32): 近づくと、主人公から遠くなる向きに逃げる(かべの手前は、えらばない)。はなれていると、ゆっくりうろうろする。市場の外には出ない
function updateThief(dt) {
  const g = MX.boss; if (!g || g.hp <= 0) { stepDone(); return; }
  aim(g.x, g.z);
  const d = Math.hypot(player.x - g.x, player.z - g.z), m = 0.8, x0 = MKC.ix0 + m, x1 = MKC.ix1 - m, z0 = MKC.iz0 + m, z1 = MKC.iz1 - m;
  const inside = (x, z) => x > x0 && x < x1 && z > z0 && z < z1 && !pointBlocked(x, z);
  let sp = 0;
  if (g.frozen > 0) sp = 0;
  else if (g.blind > 0) { const q = blindWalk(g, dt); g.h += angDiff(g.h, Math.atan2(q[0] - g.x, q[1] - g.z)) * Math.min(1, 6 * dt); sp = 1.5; }
  else if (d < TH.see) { // 逃げる: 16の向きから、0.25秒ごとにえらび直す(前の向きに少しおまけ)
    g.dirT -= dt;
    if (g.dirT <= 0 || !inside(g.x + Math.sin(g.dir) * 1.2, g.z + Math.cos(g.dir) * 1.2)) {
      g.dirT = 0.25; let best = g.dir, bs = -1e9;
      for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28, nx = g.x + Math.sin(a) * 1.6, nz = g.z + Math.cos(a) * 1.6; if (!inside(nx, nz) || !inside(g.x + Math.sin(a) * 0.8, g.z + Math.cos(a) * 0.8)) continue; const sc = Math.hypot(nx - player.x, nz - player.z) + Math.cos(angDiff(a, g.dir)) * 0.8; if (sc > bs) { bs = sc; best = a; } }
      g.dir = best;
    }
    g.h += angDiff(g.h, g.dir) * Math.min(1, 10 * dt); sp = TH.run;
  } else { // うろうろ
    g.wt -= dt; if (g.wt <= 0) { g.wt = 2 + Math.random() * 3; g.dir = Math.random() * 6.28; }
    if (inside(g.x + Math.sin(g.dir) * 1.2, g.z + Math.cos(g.dir) * 1.2)) { g.h += angDiff(g.h, g.dir) * Math.min(1, 6 * dt); sp = TH.walk; } else g.wt = 0;
  }
  g.x += Math.sin(g.h) * sp * dt + g.kx * dt; g.z += Math.cos(g.h) * sp * dt + g.kz * dt; g.kx *= 1 - 6 * dt; g.kz *= 1 - 6 * dt;
  resolve(g, 0.45); g.x = clamp(g.x, x0, x1); g.z = clamp(g.z, z0, z1); g.ctlSp = sp;
}
function updateSnipe(st, dt) {
  const live = MX.foes.filter(g => g.hp > 0), e = st.escort;
  if (e) {
    const car = MX.mcar; G.waveT += dt;
    if (G.wave < e.from.length && (G.waveT > SNIPE.wave2 || !live.length)) { spawnWave(e, G.wave); return; }
    for (const g of live) { // 車へ歩いて、とりつくと車の体力をへらす
      const dx = car.x - g.x, dz = car.z - g.z, d = Math.hypot(dx, dz); g.h = Math.atan2(dx, dz);
      if (g.frozen > 0) { g.ctlSp = 0; continue; }
      if (d > SNIPE.reach) { const sp = g.blind > 0 ? 0.8 : SNIPE.walk; g.x += dx / d * sp * dt; g.z += dz / d * sp * dt; g.ctlSp = sp; }
      else { g.ctlSp = 0; G.escHp -= SNIPE.dmg * dt; if (g.swing <= 0) g.swing = 0.25; }
    }
    if (G.escHp <= 0) { G.escHp = 0; failMission(tr(st.fail)); return; }
  }
  G.left = live.length + (e ? (e.from.length - G.wave) * 3 : 0);
  let best = null, bd = 1e9; for (const g of live) { const d = Math.hypot(g.x - player.x, g.z - player.z); if (d < bd) { bd = d; best = g; } }
  if (best) aim(best.x, best.z);
  if (!G.left) stepDone();
}
function beginMission() { G.si = 0; G.timeLeft = -1; G.busy = false; const m = curM(); toast(G.free ? tr('ミッション：{title}', { title: tr(m.title) }) : tr('ミッション{n}：{title}', { n: G.mi + 1, title: tr(m.title) }), 2.6); if (m.say) say(m.say, true); beginStep(); }
// 段が終わった。hook があれば、それ(お話など)が終わってから次へ
function stepDone() { if (G.busy) return; const st = curM().steps[G.si]; if (st.hook) { G.busy = true; st.hook(() => { G.busy = false; stepNext(); }); } else stepNext(); }
function stepNext() {
  const m = curM(); if (!m.steps[G.si].keep) clearStep(); G.si++;
  if (G.si < m.steps.length) { toast(tr(m.steps[G.si - 1].done || 'チェックポイント通過！'), 1.2); beginStep(); return; }
  G.timeLeft = -1; marker.visible = false; clearMission();
  const en = typeof m.ending === 'function' ? m.ending() : m.ending;
  if (en) { G.free = null; endScene(en); story(STORY['end' + en], () => finish(en), en === 3 ? i => { if (i === 4) endScene(5); } : null); return; } // 船に乗って終わり・大ボスをたおして終わり
  G.money += m.reward; toast(m.doneMsg ? tr(m.doneMsg) : m.reward ? tr('ミッション完了！ +${r}', { r: m.reward.toLocaleString() }) : tr('ミッション完了！'), 2.6);
  if (m.endSay) say(m.endSay, true);
  if (m.wantedOff) { G.wanted = 0; removeAllPolice(); }
  if (G.free) { G.done[m.id] = 1; if (m.onDone) m.onDone(); G.markLock = G.free; G.free = null; }
  else { G.mi++; if (G.mi >= MISSIONS.length) story(STORY.big, () => { G.freeT = 0.6; }); else { G.failWait = 2.6; G.waitMsg = tr('次のミッションへ…'); } } // 大きな仕事のあと: 荷物をまちがえる話
  save(); // クリアしたら自動でセーブ
}
// 失敗: お使いは少し待ってやり直し。自由なミッションは、紫のマークがもどる(何度でも受け直せる)
function failMission(msg) { toast(msg, 2.6); G.timeLeft = -1; marker.visible = false; clearMission(); if (G.free) { G.free = null; return; } G.failWait = 2.8; G.waitMsg = tr('もう一度挑戦…'); }
// 車をぶつけた(「ぶつけすぎると失敗」のミッション)
function bump(hit) { // hit = 追っ手の車にぶつけられた
  const m = curM(), st = m && !G.over && !(!G.free && G.failWait > 0) ? m.steps[G.si] : null;
  if (!st || (st.fragile === undefined && !st.spill) || G.bumpCd > 0 || G.busy || (st.car === 2 && player.car !== MX.mcar)) return;
  G.bumpCd = 0.8;
  if (st.spill) { G.timeLeft = Math.max(0.01, G.timeLeft - st.spill); toast(tr('スープがこぼれた！ -{n}秒', { n: st.spill }), 1.2); return; } // 夜中の出前: 時間がへる
  G.bumps++;
  if (G.bumps > st.fragile) failMission(st.fail ? tr(st.fail) : tr('ぶつけすぎた… ミッション失敗'));
  else { toast(tr(hit ? 'ぶつけられた！ あと{n}回で失敗' : 'ぶつけた！ あと{n}回で失敗', { n: st.fragile - G.bumps + 1 }), 1.2); if (st.ouch) say(st.ouch[Math.min(G.bumps, st.ouch.length) - 1], true); }
}
// 「火をつけろ」: 白のなわばりに着いた。黒と白のケンカが始まる(ミッションが終わっても、しばらく残る)
function lureHook(next) {
  const all = MX.foes.filter(g => g.hp > 0), bl = all.filter(g => !g.white), wh = all.filter(g => g.white), near = (g, a) => a.reduce((b, o) => !b || Math.hypot(o.x - g.x, o.z - g.z) < Math.hypot(b.x - g.x, b.z - g.z) ? o : b, null);
  for (const g of all) { g.lure = false; g.state = 'idle'; g.brawl = true; g.brawlT = 30; g.home = { x: g.x, z: g.z }; g.foe = near(g, g.white ? bl : wh); g.scan = 0; }
  MX.foes.length = 0; next();
}
// 車のかざり(v=18): boss = 白の幹部の車(金のかざり)、hunt = 追っ手の車(黒い屋根と線)
function carTrim(c, kind) {
  const add = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(BG(w, h, d), M(col)); m.position.set(x, y, z); c.mesh.add(m); };
  if (kind === 'boss') { for (const sx of [-1.12, 1.12]) add(0.04, 0.1, 4.2, 0xd8b13a, sx, 0.78, 0); add(0.9, 0.42, 0.06, 0xd8b13a, 0, 0.86, 2.22); add(0.12, 0.24, 0.12, 0xd8b13a, 0, 1.37, 1.95); add(1.97, 0.14, 2.02, 0x15151a, 0, 2.0, -0.2); add(2.24, 0.08, 4.44, 0xd8b13a, 0, 0.4, 0); }
  else { add(1.97, 0.14, 2.02, 0x15151a, 0, 2.0, -0.2); add(0.7, 0.06, 4.42, 0x15151a, 0, 1.26, 0); }
}
// 追っ手の車を1台出す(主人公から少しはなれた交差点に)
function spawnHunter() {
  const cand = []; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const q = P(i, j), d = Math.hypot(q.x - player.x, q.z - player.z); if (d > 45 && d < 110) cand.push(q); }
  if (!cand.length) return; const q = cand[Math.floor(Math.random() * cand.length)], c = newCar('hunter', q.x, q.z, Math.atan2(player.x - q.x, player.z - q.z), 0xf2f2f2); carTrim(c, 'hunt'); c.v = 10; MX.hunters.push(c);
}
// 追っ手の車: 主人公の車を追いかけて、ぶつけてくる(走り方はパトカーと同じ。人は降りてこない)
function updateHunter(c, dt) {
  const tx = player.x, tz = player.z, d = Math.hypot(tx - c.x, tz - c.z);
  if (c.rev > 0) { c.rev -= dt; c.v += clamp(-7 - c.v, -60 * dt, 60 * dt); if (c.turn) c.h += 1.6 * dt; }
  else if (player.mode === 'foot' && d < 12) c.v += clamp(-c.v, -35 * dt, 35 * dt); // 主人公が降りていたら、近くで止まる
  else {
    let gx, gz;
    if (d < 30) { gx = tx; gz = tz; c.node = null; }
    else {
      if (!c.node) c.node = nearestNode(c.x, c.z);
      let np = nodePos(c.node);
      if (Math.hypot(np.x - c.x, np.z - c.z) < 6) { let best = null, bd = 1e9; for (const n of neighbors(c.node)) { const q = nodePos(n), dd = Math.hypot(q.x - tx, q.z - tz); if (dd < bd) { bd = dd; best = n; } } c.node = best; np = nodePos(best); }
      gx = np.x; gz = np.z;
    }
    const dh = angDiff(c.h, Math.atan2(gx - c.x, gz - c.z)); c.h += clamp(dh, -2.6 * dt, 2.6 * dt);
    const want = Math.abs(dh) > 1.2 ? 11 : TUNE.hunt.speed; c.v += clamp(want - c.v, -35 * dt, 15 * dt);
  }
  c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
  if (resolveCar(c)) { c.v *= 0.3; c.stuck += dt; } else c.stuck = Math.max(0, c.stuck - dt * 0.5);
  if (c.stuck > 1.2 && c.rev <= 0) { c.rev = 1.1; c.turn = true; c.stuck = 0; c.node = null; }
  if (d > 190) { c.gone = true; const i = MX.hunters.indexOf(c); if (i >= 0) MX.hunters.splice(i, 1); } // 遠くにおいていかれたら消えて、近くにまた出る
}
/* ===== 幹部・塔・大ボス・終わり 3・4(v=19) ===== */
// 幹部(B = 黒・青龍刀、W = 白・マシンガン)と手下3人、または大ボス(O = 屋台のおやじ。ピストルと日本刀)を出す
function spawnBoss(k) {
  const B = TUNE.boss, q = BOSS_AT[k](), g = newGang(q.x, q.z, makeVip(k === 'B' ? 'bossB' : k === 'W' ? 'bossW' : 'bossO'));
  g.temp = true; g.tier = 0; g.boss = k; g.nofeud = true; g.white = k === 'W'; g.h = q.h; g.hp = k === 'O' ? B.oyajiHp : B.hp; g.weapon = k === 'B' ? 'dao' : k === 'W' ? 'mg' : 'pistol';
  if (k === 'O') { g.dmgX = 1.25; g.state = 'chase'; g.cd = 1.6; setHand(g.per, g, g.weapon); twrOyaji.g.visible = false; } // 大ボスは、お話のあとすぐおそってくる
  g.per.g.position.set(g.x, 0.3, g.z); g.per.g.rotation.y = g.h; MX.foes.push(g); MX.boss = g; markerColor(0xff4a4a); aim(g.x, g.z);
  if (k === 'O') return;
  const off = k === 'W' ? [[-5, 0], [5, 0], [9, 0]] : [[3, 0], [-3, 0.5], [0, 3]], ws = k === 'W' ? ['pistol', 'pistol', 'knife'] : ['knife', 'fist', 'pistol'];
  for (let i = 0; i < B.minions; i++) { // 手下(幹部のまわり)
    const o = off[i % 3], w = ws[i % 3], m = newGang(q.x + o[0], q.z + o[1]); m.temp = true; m.tier = 0; m.nofeud = true;
    if (k === 'W') setTeam(m, true, w); else { m.weapon = w; setHand(m.per, m, w); }
    resolve(m, 0.45); m.home = { x: m.x, z: m.z }; MX.foes.push(m);
  }
}
// 大ボス: 遠いとピストル・近いと日本刀に持ちかえる。体力が半分になると、黒と白の手下を呼ぶ(1回だけ)
function bossTick(g, dP, dt) {
  const B = TUNE.boss, want = dP > B.near ? 'pistol' : 'katana'; g.swap = (g.swap || 0) - dt;
  if (want !== g.weapon && g.swap <= 0) { g.weapon = want; g.swap = 1.2; g.cd = Math.max(g.cd, 0.5); setHand(g.per, g, want); }
  if (!g.called && g.hp <= B.oyajiHp / 2) { g.called = true; callMinions(); }
}
function callMinions() {
  const pts = [[-12, 12], [12, 12], [-16, 2], [16, 2], [-6, 17], [6, 17]], ws = ['knife', 'pistol', 'fist'];
  for (let i = 0; i < TUNE.boss.call; i++) { // 黒と白が半分ずつ(広場のまわりから走ってくる)
    const o = pts[i % pts.length], w = ws[i % 3], m = newGang(PGD.x + o[0], PGD.z + o[1]); m.temp = true; m.tier = 0; m.nofeud = true;
    if (i % 2) setTeam(m, true, w); else { m.weapon = w; setHand(m.per, m, w); }
    m.state = 'chase'; resolve(m, 0.45); MX.foes.push(m);
  }
  toast(tr('大ボスが手下を呼んだ！'), 2);
}
// 幹部をたおした: そのチームは、もうおそってこない。情報屋がひとこと
function bossDown(k) {
  if (!G.bosses.includes(k)) G.bosses.push(k);
  say({ name: 'ミーチャン', text: G.bosses.length < 2 ? 'ワンダウン！んまぁ〜、ユーちゃん、思ったよりストロングじゃないの！' : 'オールクリアよ〜！今夜、タワーにいらっしゃい。ボクチン、ぜ〜んぶお話しするわ' }, true);
}
// 塔の前の情報屋(幹部を2人たおしたあとの夜に立っている。ネタばらしのあとは、たおれている)
function poseTwr() {
  const mine = !!G.free && G.free.id === 'tower', on = G.mode === 'solo' && G.lent === 1 && !!G.done.info4 && !!G.done.info5 && !G.done.tower && !G.over, down = mine && G.twrDown;
  twrInfo.g.visible = on && (mine || (!G.free && G.phase === 'night')); twrWallet.visible = on && down;
  twrInfo.g.rotation.x = down ? -Math.PI / 2 : 0; twrInfo.g.position.y = down ? 0.75 : 0.34;
}
// カメラを、決めた所に止める(お話の間は、カメラが動かない)
function camAt(px, py, pz, lx, ly, lz) { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); camPos.copy(camera.position); }
function hideMarks() { for (const f of FREE) f.g.visible = false; BOAT.g.visible = false; } // お話の間は、光るマークを消す
function standAt(per, x, y, z, h) { per.g.visible = true; per.g.position.set(x, y, z); per.g.rotation.set(0, h, 0); }
// 「塔の対決」を受けたとき: 情報屋のネタばらし → 銃声 → 大ボス(屋台のおやじ)が出てくる → 戦い(next)
function towerIntro(next) {
  G.si = 0; G.timeLeft = -1; G.twrDown = false; twrOyaji.g.visible = false; poseTwr();
  player.x = TOWER.x; player.z = TOWER.z; player.h = G.camYaw = Math.PI; standAt(player.per, player.x, 0.3, player.z, Math.PI); // 塔のほう(北)を向く
  camAt(TOWER.x + 4.5, 3, TOWER.z + 3.5, TOWER.x - 2, 1.5, TOWER.z - 4.5); hideMarks();
  const lines = STORY.tower.concat(G.sis ? STORY.towerT : [], STORY.tower2), shot = lines.length - 2; // shot =「たおれたのは、ミーチャンのほうだった」の行
  const fall = () => { G.twrDown = true; poseTwr(); twrOyaji.g.visible = true; };
  story(lines, () => { fall(); story(STORY.boss, next); }, i => { if (i >= shot) fall(); });
}
// 終わりの絵(お話の間、カメラを止めて見せる)。3 = 裏: 夜、塔の上から街を見下ろす。5 = 港の倉庫(夜)。4 = 朝、倉庫のとびらの前で妹と会う。6 = 朝、港でふたりで船を見送る
const END = { crowd: null, sis: null, ship: null, scene: 0 }; // scene = いま見せている絵
function endScene(n) {
  if (n < 3) return; END.scene = n;
  marker.visible = false; hideMarks(); twrInfo.g.visible = twrOyaji.g.visible = twrWallet.visible = false; endTalk(); $('toast').style.opacity = 0; toastT = 0;
  if (player.mode === 'car') exitCar(); player.per.g.rotation.x = 0;
  if (n === 3) {
    setClock(DAY.night + 80);
    if (!END.crowd) { END.crowd = []; for (let i = 0; i < 12; i++) { const white = (i + (i >= 6 ? 1 : 0)) % 2, c = white ? 0xf2f2f2 : 0x141414, per = makePerson(c, white ? 0xf2f2f2 : 0x1a1a1a, SKINS[i % 3]); standAt(per, PGD.x - 7.5 + (i % 6) * 3, 0.34, PGD.z + 12 + (i >= 6 ? 3 : 0), Math.PI); per.g.rotation.x = -0.55; END.crowd.push(per); } } // 黒と白が、塔に向かって頭を下げる
    standAt(player.per, PGD.x, 6.2, PGD.z + 5.4, 0);
    camAt(PGD.x - 7, 7.5, PGD.z + 27, PGD.x + 1, 6, PGD.z + 4);
  } else if (n === 5) camAt(149, 3.2, WAREHOUSE.z + 13, WAREHOUSE.x, 6.5, WAREHOUSE.z);
  else {
    setClock(22); if (!END.sis) END.sis = makeVip('sis');
    if (n === 4) { player.x = 160.5; player.z = WAREHOUSE.z; standAt(player.per, player.x, 0.3, player.z, Math.PI / 2); standAt(END.sis, 163.7, 0.3, WAREHOUSE.z, -Math.PI / 2); camAt(153.5, 3.4, WAREHOUSE.z + 3.2, 164, 1.9, WAREHOUSE.z - 0.4); }
    else {
      if (!END.ship) { END.ship = 1; addBox(9, 3, 26, 206, 1.5, 104, M(0xeeeeee)); addBox(7, 3.2, 8, 206, 4.6, 110, M(0x2f5f9f)); addBox(1.6, 3, 1.6, 206, 7.6, 110, M(0xc8261e)); } // 港から出ていく船
      player.x = 173.4; player.z = 126; standAt(player.per, player.x, 0.3, player.z, Math.PI / 2); standAt(END.sis, 173.4, 0.3, 127.5, Math.PI / 2);
      camAt(166, 4.2, 130.5, 192, 1.6, 120);
    }
  }
}
// 借金の取り立て: 車を止めたら、中から情報屋が出てくる →「貸す」「貸さない」
function debtHook(next) {
  const c = MX.runner; c.kind = 'parked'; c.flee = false; c.v = 0; marker.visible = false;
  if (G.money < DEBT) { failMission(tr('男の話を聞くには、$10,000 いる… ミッション失敗')); return; }
  const per = makeVip('info'), rx = -Math.cos(c.h), rz = Math.sin(c.h); per.g.position.set(c.x - rx * 2.2, 0, c.z - rz * 2.2); per.g.rotation.y = Math.atan2(player.x - per.g.position.x, player.z - per.g.position.z); MX.props.push(per.g);
  story(STORY.caught, () => openOffer({
    title: '$10,000 貸す？', desc: '貸したお金は、もどってこない。', yes: '貸す', no: '貸さない',
    onYes: () => { G.money -= DEBT; G.lent = 1; G.tru = G.done.sailor2 && !G.done.sailor3 ? 1 : 0; story(STORY.lend, next); },
    onNo: () => { G.lent = 2; story(STORY.refuse, next); },
  }));
}

/* ===== セーブ(v=14) ===== */
// そのスマホのブラウザの中(localStorage)に残す。覚えるもの: お金・クリアしたミッション・武器と弾・回復薬・チョッキ・たおした幹部・遊んだ時間
const SAVE_KEY = 'sc-save';
function saveData() { return { v: 1, money: G.money, mi: G.mi, done: Object.keys(G.done), inv: player.inv.slice(), ammo: player.ammo, mg: player.mg, rf: player.rf, pigs: player.pigs, snakes: player.snakes, heals: player.heals, armor: player.armor, bosses: G.bosses.slice(), lent: G.lent, tru: G.tru, sis: G.sis, play: Math.floor(G.play) }; }
function save() { if (G.mode !== 'solo') return false; try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData())); return true; } catch (e) { return false; } }
function readSave() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.v === 1 ? d : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 消せなくてもよい */ } }
/* ===== 一時停止と中断(v=23) ===== */
// 中断: セーブとは別に、いまの場所・乗っている車・時間・体力も記録する。再開すると消える(つづける・やめるでも消える)。ミッションの途中なら、受ける前にもどる
const SUSP_KEY = 'sc-susp';
function canSuspend() { return G.started && G.mode === 'solo' && !G.over && !G.story && !G.intro && !G.leaving; } // G.leaving = スタート画面にもどるところ(読みこみ直すときにも pagehide が来るので)
function leave() { G.leaving = true; G.pause = false; location.reload(); }
function writeSuspend() {
  if (!canSuspend()) return false;
  const d = saveData(), at = player.roof ? player.roof.back : player; Object.assign(d, { susp: 1, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, // 屋上にいたら、下の入口の前にもどる(v=29)
    h: Math.round(player.h * 100) / 100, clock: Math.floor(G.clock), hp: Math.ceil(player.hp) });
  if (player.mode === 'car' && player.car && !player.car.cop) d.car = { t: player.car.type || 'sedan', c: player.car.color >>> 0 }; // パトカーは残さない(歩きにもどる)
  try { localStorage.setItem(SUSP_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}
function readSuspend() { try { const d = JSON.parse(localStorage.getItem(SUSP_KEY)); return d && d.v === 1 && d.susp ? d : null; } catch (e) { return null; } }
function clearSuspend() { try { localStorage.removeItem(SUSP_KEY); } catch (e) { /* 消せなくてもよい */ } }
// 中断したところの場所・車・時間・体力をもどす(applySave のあとに呼ぶ。こわれた数字なら、ホームの前に立つ)
function applySuspend(d) {
  const ok = v => typeof v === 'number' && isFinite(v);
  if (ok(d.x) && ok(d.z) && Math.abs(d.x) < 200 && Math.abs(d.z) < 200) { resetPlayerToFoot(d.x, d.z, ok(d.h) ? d.h : 0); resolve(player, 0.5); } else resetPlayerToFoot(HOME.sx, HOME.sz, HOME.sh);
  if (ok(d.clock)) setClock(((d.clock % DAY.len) + DAY.len) % DAY.len);
  if (ok(d.hp)) player.hp = clamp(Math.ceil(d.hp), 1, TUNE.hp);
  if (d.car && CAR_TYPES[d.car.t]) { const c = newCar('parked', player.x, player.z, player.h, ok(d.car.c) ? d.car.c : 0xd33c3c, d.car.t); resolveCar(c); player.x = c.x; player.z = c.z; enterCar(c); }
}
function openPause() {
  if (!G.started || G.mode !== 'solo' || G.over || G.pause) return;
  G.pause = true; stopInput(); $('pMenu').classList.remove('hidden'); $('pAsk').classList.add('hidden'); $('pause').classList.remove('hidden');
}
function closePause() { G.pause = false; $('pause').classList.add('hidden'); clearSuspend(); } // つづける: ほかのアプリから帰ってきたときの中断の記録は消す
// ほかのアプリに切りかえたとき: 一時停止にして、中断の記録もしておく(そのままページが閉じられても、中断から遊べる)
function autoSuspend() { if (!canSuspend()) return; openPause(); writeSuspend(); }
// セーブの中身を、ゲームにもどす(こわれた数字が入っていても動くように、1つずつ確かめる)
function applySave(d) {
  const num = (v, lo, hi) => { v = Math.floor(+v); return v >= lo ? Math.min(hi, v) : lo; }; // 数字でないときは lo
  G.money = num(d.money, 0, 1e9); G.mi = num(d.mi, 0, MISSIONS.length); G.play = num(d.play, 0, 1e9);
  G.done = {}; for (const id of Array.isArray(d.done) ? d.done : []) if (FREE.some(f => f.id === id)) G.done[id] = 1;
  G.bosses = (Array.isArray(d.bosses) ? d.bosses : []).filter(b => typeof b === 'string');
  G.lent = num(d.lent, 0, 2); G.tru = num(d.tru, 0, 1); G.sis = num(d.sis, 0, 1);
  player.ammo = num(d.ammo, 0, 9999); player.mg = num(d.mg, 0, 9999); player.rf = num(d.rf, 0, 9999); player.pigs = num(d.pigs, 0, MKT.max); player.snakes = num(d.snakes, 0, MKT.max);
  player.heals = num(d.heals, 0, TUNE.maxHeal); player.armor = num(d.armor, 0, TUNE.armor); player.hp = TUNE.hp;
  const inv = ['fist']; for (const k of Array.isArray(d.inv) ? d.inv : []) if (WEAPONS[k] && !inv.includes(k) && !(k === 'pig' && !player.pigs) && !(k === 'snake' && !player.snakes)) inv.push(k);
  player.inv = inv; player.wi = 0; setHand(player.per, player, null);
}
// ホームの青い光に入ったとき: セーブして、体力が全回復
function atHome() { player.hp = TUNE.hp; G.markLock = HOME; toast(tr(save() ? 'セーブした！ 体力が全回復' : '体力が全回復(セーブはできなかった)'), 2.4); }
// ホームでねる(v=15): 「ねる」ボタン → 朝・夕方・夜をえらぶ。時間が変わって、体力が全回復して、セーブする
function canSleep() { return G.started && G.mode === 'solo' && player.mode === 'foot' && player.hp > 0 && G.downT <= 0 && G.stunT <= 0 && !paused() && Math.hypot(HOME.x - player.x, HOME.z - player.z) < 3; }
function openSleep() {
  if (!canSleep()) return;
  if (G.wanted > 0 || G.free || G.timeLeft > 0) { toast(tr(G.wanted > 0 ? '警察に追われている間は、ねられない' : 'ミッション中は、ねられない'), 1.8); return; }
  G.sleep = true; stopInput(); $('sleep').classList.remove('hidden');
}
function sleepTo(ph) {
  if (!G.sleep) return; G.sleep = false; $('sleep').classList.add('hidden'); if (!ph) return;
  setClock(ph === 'day' ? DAY.start : ph === 'eve' ? DAY.eve + 5 : DAY.night + 20); player.hp = TUNE.hp; save();
  toast(tr(ph === 'day' ? '朝までねた' : ph === 'eve' ? '夕方までねた' : '夜までねた'), 2.2);
}
function busted() {
  if (G.mode === 'race') { raceCaught(); return; }
  G.money = Math.max(0, G.money - TUNE.police.fine); G.wanted = 0; G.bust = 0; removeAllPolice(); if (player.mode === 'car') exitCar(); resetPlayerToFoot(HOME.sx, HOME.sz, HOME.sh); // 逮捕されたら、ホームの前にもどる
  confiscate(); G.stunT = 0; player.per.g.rotation.x = 0; // 逮捕されても武器は没収
  if (missionOn()) failMission(tr('逮捕された！ -$1000　武器を没収　ミッション失敗')); else toast(tr('逮捕された！ -$1000　武器を没収'), 2.6);
}
// 配達競争でつかまった: その場で動けなくなって観戦する(荷物はホストが落とす)
function raceCaught() {
  G.wanted = 0; G.bust = 0; G.evade = 0; removeAllPolice(); if (player.mode === 'car') exitCar();
  G.stunT = 0; player.per.g.rotation.x = 0; G.out = true; G.watchYaw = 0; releaseHeld();
  $('warn').textContent = ''; toast(tr('つかまった！ ここからは観戦'), 3);
  if (SC.onSend) SC.onSend(SC.getMe()); // すぐに知らせる
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
  for (const n of NEON_MATS) n.m.color.copy(n.off).lerp(n.on, lit); // クラブのネオン(昼は消える)
  if (starPts) { starPts.visible = lit > 0.05; starPts.material.opacity = lit; }
  if (moonM) moonM.visible = lit > 0.5; if (sunM) sunM.visible = lit < 0.5;
}
// 時間に合わせて、マフィアと街の人をふやす・減らす。force でなければ、主人公の近くでは変えない
function applyPop(force) {
  const ph = G.mode === 'solo' ? G.phase : 'eve', far = (x, z) => force || Math.hypot(x - player.x, z - player.z) > DAY.far;
  applyTeams();
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
// スマホだけで遊ぶ(パソコン版は作らない。2026-11-13)。キーボードの操作はない
const input = { jx: 0, jy: 0, dash: false, brake: false, acc: false, rev: false };
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
$('sleepBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openSleep(); });
for (const [id, ph] of [['sleepDay', 'day'], ['sleepEve', 'eve'], ['sleepNight', 'night'], ['sleepNo', null]]) $(id).addEventListener('click', () => sleepTo(ph));
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
  if (joy) { jx += joy.dx / 50; jy -= joy.dy / 50; }
  input.jx = clamp(jx, -1, 1); input.jy = clamp(jy, -1, 1);
  input.dash = held.dash;
  // 車: アクセル・ブレーキ・バックのボタン(スティックは左右のハンドルだけ)
  input.acc = held.acc; input.rev = held.rev; input.brake = held.brk;
  if (G.out || kdFrozen() || (shootOn() && (G.shDown > 0 || player.frozen > 0))) { input.jx = input.jy = 0; input.dash = input.acc = input.rev = false; input.brake = true; } // 配達競争でつかまった人・ケイドロの始まりの警察は動けない
}

/* ===== 車の乗り降り ===== */
function nearestEnterable() { if (player.roof) return null; let best = null, bd = TUNE.enterDist; for (const c of cars) { if ((c.kind === 'police' && G.mode !== 'solo') || c.flee || c.kind === 'hunter') continue; const d = carDist(c, player.x, player.z) - (c.type === 'truck' || c.type === 'bus' ? 0.4 : 0); if (d < bd) { bd = d; best = c; } } return best; }
function toggleCar() {
  if (!G.started || G.stunT > 0 || G.downT > 0 || G.out || kdFrozen() || (shootOn() && G.shDown > 0) || paused()) return; if (player.mode === 'car') { exitCar(); return; }
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
  if (G.downT > 0 || (shootOn() && G.shDown > 0)) { player.per.g.position.set(player.x, lvY(player.roof) + 0.4, player.z); return; } // やられて倒れている
  if (G.stunT > 0) { // 車から引きずり出されて、たおれている
    G.stunT -= dt; player.per.g.position.set(player.x, 0.4, player.z); player.v = 0;
    if (G.stunT <= 0) player.per.g.rotation.x = 0;
    return;
  }
  if (player.mode === 'foot') {
    const a = G.camYaw; const fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    let mx = fx * input.jy + rx * input.jx, mz = fz * input.jy + rz * input.jx; const l = Math.hypot(mx, mz); let sp = 0;
    if (l > 0.08) { mx /= l; mz /= l; sp = (input.dash ? TUNE.dash : TUNE.walk) * Math.min(1, l) * (shootOn() && G.spdT > T ? SHOOT_T.speed : 1) * (G.ramenT > 0 ? FOOD.ramen : 1); player.x += mx * sp * dt; player.z += mz * sp * dt; player.h += angDiff(player.h, Math.atan2(mx, mz)) * Math.min(1, 12 * dt); }
    if (player.roof) roofClamp(player, player.roof, 0.5); // 屋上(v=29): ふちの内がわだけ
    else { resolve(player, 0.5);
    for (const c of cars) { const q = carNear(c, player.x, player.z), dx = player.x - q.x, dz = player.z - q.z, d = Math.hypot(dx, dz), r = c.type === 'truck' || c.type === 'bus' ? 1.95 : 2.1; if (d < r && d > 0.001) { player.x = q.x + dx / d * r; player.z = q.z + dz / d * r; } } }
    player.v = sp;
    const per = player.per; per.g.position.set(player.x, player.roof ? player.roof.top : onWalk(player.x, player.z) ? 0.3 : 0, player.z); per.g.rotation.y = player.h; animPerson(per, sp, dt);
    if (player.swing > 0) { player.swing -= dt; per.armR.rotation.x = -1.5; }
    $('enterBtn').textContent = tr('乗る'); $('enterBtn').classList.toggle('near', !!nearestEnterable());
  } else {
    const c = player.car; const th = (input.acc ? 1 : 0) - (input.rev ? 1 : 0), st = input.jx;
    if (input.brake) { const b = Math.min(Math.abs(c.v), TUNE.carBrake * dt); c.v -= Math.sign(c.v) * b; }
    else if (th > 0.05) { const ct = carType(c), sedan = !c.type || c.type === 'sedan' || c.type === 'taxi', vmax = c.cop ? TUNE.copCarMax : sedan ? TUNE.carMax : ct.max, acc = sedan ? TUNE.carAccel : ct.accel; if (c.v < 0) c.v += 40 * dt * th; else c.v += acc * th * dt * (1 - c.v / vmax); }
    else if (th < -0.05) { if (c.v > 0) c.v += 38 * th * dt; else c.v = Math.max(-TUNE.carReverse, c.v + 12 * th * dt); }
    else { c.v *= 1 - 0.7 * dt; if (Math.abs(c.v) < 0.3) c.v = 0; }
    const tf = clamp(c.v / 7, -1, 1) * (Math.abs(c.v) > 22 ? 0.75 : 1); c.h -= st * TUNE.steer * (c.cop ? 1 : carType(c).steer) * dt * tf; // 車の種類で曲がりやすさがちがう
    c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
    if (resolveCar(c)) { if (Math.abs(c.v) > 3) bump(); c.v *= Math.abs(c.v) > 3 ? -0.25 : 0.5; }
    player.x = c.x; player.z = c.z; player.h = c.h; player.v = c.v;
    if (c.cop) copLights(c, performance.now() / 1000); // 奪ったパトカー: 屋根のライトが光る
    $('enterBtn').textContent = tr('降りる'); $('enterBtn').classList.remove('near');
  }
}
function updateTraffic(c, dt) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h); let blocked = false; const ahead = (carType(c).len - 4.4) / 2; // 長い車は、人や車を前の方で見る
  const others = c.flee ? [] : [{ x: player.x, z: player.z, same: true }]; // 逃げる車は、主人公が前にいても止まらない
  if (!c.flee && player.mode === 'car') others[0].len = carType(player.car).len;
  for (const o of cars) if (o !== c && o.kind !== 'player') others.push({ x: o.x, z: o.z, len: carType(o).len, same: o.kind !== 'traffic' || (Math.sin(o.h) * fx + Math.cos(o.h) * fz) > 0.5 });
  const myL = carType(c).len;
  for (const id in R.avatars) { const a = R.avatars[id]; if (a.seen) others.push({ x: a.x, z: a.z, same: true }); }
  for (const o of others) { const rx = o.x - c.x, rz = o.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 3.1 + (myL + (o.len || 4.4)) / 2 && sd < 2.4 && o.same) { blocked = true; break; } } // 長い車は、前の車との間をあける
  if (!blocked) for (const g of gangs) { if (g.hp <= 0 || !g.per.g.visible) continue; const rx = g.x - c.x, rz = g.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 + ahead && sd < 2) { blocked = true; break; } }
  if (!blocked) for (const g of npcs) { if (g.hp <= 0) continue; const rx = g.x - c.x, rz = g.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 + ahead && sd < 2) { blocked = true; break; } }
  if (!blocked) for (const p of peds) { if (p.down > 0 || p.off || p.angry) continue; const rx = p.x - c.x, rz = p.z - c.z, ah = rx * fx + rz * fz, sd = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 6 + ahead && sd < 2) { blocked = true; break; } }
  const tv = blocked ? 0 : c.flee ? 17 : c.type === 'bus' ? 9 : c.type === 'truck' ? 10 : 11; c.v += clamp(tv - c.v, -30 * dt, 8 * dt); c.p += c.v * dt / CELL; // バスとトラックは、ゆっくり走る
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
// 2つの車(または人)のまん中の線の、いちばん近い点どうし(v=21。セダンどうしは、まん中どうし = 今までどおり)
function segPair(a, b) {
  const La = a.type ? carSeg(a) : 0, Lb = b.type ? carSeg(b) : 0;
  if (!La && !Lb) return [a, b];
  if (!Lb) return [carNear(a, b.x, b.z), b];
  if (!La) return [a, carNear(b, a.x, a.z)];
  // 線と線: 何回か、たがいに近い点をさがす(短い線なので、これで十分)
  let pa = carNear(a, b.x, b.z), pb = carNear(b, pa.x, pa.z);
  for (let k = 0; k < 3; k++) { pa = carNear(a, pb.x, pb.z); pb = carNear(b, pa.x, pa.z); }
  return [pa, pb];
}
function carPairs() {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (!(a.kind === 'player' || b.kind === 'player' || a.kind === 'police' || b.kind === 'police' || a.kind === 'hunter' || b.kind === 'hunter')) continue;
    if (Math.abs(b.x - a.x) > 12 || Math.abs(b.z - a.z) > 12) continue;
    const [pa, pb] = segPair(a, b), dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz); if (d > 3.6 || d < 0.001) continue;
    const ma = carType(a).mass, mb = carType(b).mass, nx = dx / d, nz = dz / d, pa2 = (3.6 - d) * mb / (ma + mb), pb2 = (3.6 - d) * ma / (ma + mb); // 重い車ほど、押されない
    const pl = a.kind === 'player' ? a : b.kind === 'player' ? b : null;
    if (pl) { const o = pl === a ? b : a; if (o.flee) { if (Math.abs(pl.v) > 6 && G.ramCd <= 0 && G.left > 0) { G.ramCd = 1; G.left--; toast(tr('ぶつけた！ あと{n}回', { n: G.left }), 1.2); } } else if (Math.abs(pl.v) > 9 && G.hitCd <= 0 && (o.kind === 'traffic' || o.kind === 'police')) { addWanted(1); G.hitCd = 3; } if (o.kind === 'hunter' && o.rev <= 0 && Math.abs(o.v) > 6) { bump(true); o.rev = TUNE.hunt.back; o.turn = false; o.v *= 0.3; } // 追っ手にぶつけられた(これも数える)。追っ手は、いったん下がる
      if (Math.abs(pl.v) > 4) {
        if (!o.flee) bump();
        const ratio = carType(o).mass / carType(pl).mass; // 重さのちがい(v=21)
        if (ratio <= 0.5 && (o.kind === 'parked' || o.kind === 'traffic')) { o.kind = 'parked'; o.v = pl.v * 0.9; o.h = pl.h; pl.v *= 0.75; } // トラック・バス: 軽い車をはね飛ばして、そのまま進む
        else { if (o.kind === 'parked' && ratio < 2) { o.v = pl.v * 0.5; o.h = pl.h; } pl.v *= ratio >= 2 ? -0.45 : -0.3; } // 軽い車で重い車にぶつかると、大きくはじかれる
      } }
    a.x -= nx * pa2; a.z -= nz * pa2; b.x += nx * pb2; b.z += nz * pb2;
  }
  // 配達競争: ほかの人のパトカー・警察官にも重ならないように、自分だけ押し返す。パトカーに速くぶつけると、自分も手配(v=20)
  if (!G.out) for (const id in R.avatars) {
    const av = R.avatars[id];
    if (av.cop && av.cop.seen) {
      const k = av.cop, r = player.mode === 'car' ? 3.6 : 2.1, dx = player.x - k.x, dz = player.z - k.z, d = Math.hypot(dx, dz);
      if (d < r && d > 0.001) {
        const o = player.mode === 'car' ? player.car : player; o.x = k.x + dx / d * r; o.z = k.z + dz / d * r; player.x = o.x; player.z = o.z;
        if (player.mode === 'car') { if (Math.abs(player.car.v) > TUNE.racePolice.ramSpeed) raceWanted('パトカーにぶつけた！ 警察に追われている！'); if (Math.abs(player.car.v) > 4) player.car.v *= -0.3; }
      }
    }
    for (const q of av.cops || []) {
      if (!q.seen) continue; const r = player.mode === 'car' ? 2.4 : 1.0, dx = player.x - q.x, dz = player.z - q.z, d = Math.hypot(dx, dz);
      if (d < r && d > 0.001) { const o = player.mode === 'car' ? player.car : player; o.x = q.x + dx / d * r; o.z = q.z + dz / d * r; player.x = o.x; player.z = o.z; if (player.mode === 'car') player.car.v *= 0.5; }
    }
  }
  // 配達競争: ほかの人(の車)に重ならないように、自分だけ押し返す
  for (const id in R.avatars) {
    const av = R.avatars[id]; if (!av.seen) continue; const r = (av.car ? 2 : 0.6) + (player.mode === 'car' ? 2 : 0.6);
    const o = player.mode === 'car' ? player.car : player, oa = av.car ? { x: av.x, z: av.z, h: av.h, type: av.type } : { x: av.x, z: av.z }; // 長い車は、まん中の線で見る(v=21)
    const [po, pv] = segPair(player.mode === 'car' ? o : { x: o.x, z: o.z }, oa), dx = po.x - pv.x, dz = po.z - pv.z, d = Math.hypot(dx, dz); if (d > r || d < 0.001) continue;
    if (shootOn()) shootRun(id); // 撃ち合い(v=28): 押し返す前に、ひいたかを見る
    o.x += dx / d * (r - d); o.z += dz / d * (r - d); player.x = o.x; player.z = o.z;
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
    if (player.mode === 'car') { const c = player.car; const d = carDist(c, p.x, p.z); if (d < 2.4 && Math.abs(c.v) > 5) { p.down = 7; p.per.g.rotation.x = -Math.PI / 2; p.push.x = Math.sin(c.h) * c.v * 0.6; p.push.z = Math.cos(c.h) * c.v * 0.6; addWanted(1); raceWanted('人をひいた！ 警察に追われている！'); continue; } }
    p.per.g.position.set(p.x, 0.3, p.z); p.per.g.rotation.y = p.h; animPerson(p.per, stop ? 0 : p.speed * (fleeing ? 2.2 : 1), dt);
  }
}
function managePolice(dt) {
  const race = G.mode === 'race'; // 配達競争: パトカー1台・警察官2人。★は1つだけ。昼・夕方・夜で変わらない
  if (race && G.out) { $('warn').textContent = ''; return; }
  const dayX = race ? 0 : G.phase === 'day' ? 1 : G.phase === 'night' ? -1 : 0; // 昼はパトカーが1台多い、夜は1台少ない
  const want = G.wanted === 0 ? 0 : race ? TUNE.racePolice.cars : clamp(G.wanted + dayX, 1, TUNE.police.maxCars + (dayX > 0 ? 1 : 0)); const pol = cars.filter(c => c.kind === 'police');
  if (race && G.wanted === 0 && npcs.some(n => n.kind === 'cop')) { removeAllPolice(); return; }
  if (G.wanted === 0 && pol.length) { removeAllPolice(); return; }
  G.spawnCd -= dt;
  if (pol.length < want && G.spawnCd <= 0) {
    G.spawnCd = 2.5; const cand = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const q = P(i, j); const d = Math.hypot(q.x - player.x, q.z - player.z); if (d > 60 && d < 130) cand.push(q); }
    if (cand.length) { const q = cand[Math.floor(Math.random() * cand.length)]; const c = newCar('police', q.x, q.z, Math.atan2(player.x - q.x, player.z - q.z), 0); c.v = 10; if (race) c.crew = TUNE.racePolice.crew; }
  }
  let nd = 1e9, nearCop = false; for (const c of pol) if (c.crew > 0) nd = Math.min(nd, Math.hypot(c.x - player.x, c.z - player.z));
  for (const n of npcs) { if (n.kind !== 'cop' || n.hp <= 0 || n.state !== 'chase' || n.blind > 0 || n.frozen > 0) continue; const d = Math.hypot(n.x - player.x, n.z - player.z); nd = Math.min(nd, d); if (player.mode === 'foot' && d < TUNE.police.catchDist && n.stagger <= 0 && (n.roof || null) === player.roof) nearCop = true; }
  // 屋上(v=29): ★が高いと、警察官が階段の小屋から上がってくる
  if (!race && player.roof && G.wanted >= TUNE.roof.copWanted && player.hp > 0) { G.roofCopT -= dt; const rf = player.roof; if (G.roofCopT <= 0 && npcs.filter(n => n.roof === rf && n.hp > 0).length < TUNE.roof.copMax) { G.roofCopT = TUNE.roof.copEvery; const n = newNpc('cop', rf.door.x, rf.door.z, rf.s > 0 ? 0 : Math.PI); n.roof = rf; toast(tr('警察が屋上に上がってきた！'), 1.8); } }
  // 市場の中(v=31): パトカーが入れないので、★が早くへる(警察官がそばにいるときはへらない)
  const hide = !race && G.wanted > 0 && player.mode === 'foot' && !player.roof && inMarket(player.x, player.z);
  if (hide && !G.hideIn) toast(tr('市場にかくれた！ ★が早くへる'), 2); G.hideIn = hide;
  if (G.wanted > 0) { if (nd > TUNE.police.evadeDist) G.evade += dt * (hide ? MKT.hide : 1); else G.evade = Math.max(0, G.evade - dt * 0.5); if (G.evade > TUNE.police.evadeTime * (G.phase === 'day' && !race ? DAY.dayEvade : 1)) { G.wanted--; G.evade = 0; toast(tr(G.wanted ? '手配度ダウン' : '逃げ切った！'), 1.6); } }
  // 逮捕: 歩いている主人公に、警察官がしばらくくっつく
  if (G.wanted > 0 && nearCop) G.bust += dt; else G.bust = Math.max(0, G.bust - dt);
  $('warn').textContent = G.bust > 0.2 ? tr('逃げろ！ 捕まるぞ！') : ''; if (G.bust > TUNE.police.bustTime) busted();
}
function updateMission(dt) {
  if (G.freeT > 0) { G.freeT -= dt; if (G.freeT <= 0) toast(tr('紫の光で、好きなミッションを受けよう'), 3.6); }
  G.bumpCd -= dt; G.ramCd -= dt;
  const m = curM(); if (G.over || !m || G.busy) return;
  if (!G.free && G.failWait > 0) { G.failWait -= dt; if (G.failWait <= 0) beginMission(); return; }
  const st = m.steps[G.si], foot = player.mode === 'foot';
  if (G.timeLeft > 0) { G.timeLeft -= dt; if (G.timeLeft <= 0) { if (st.type === 'survive') stepDone(); else failMission(tr(st.late || '時間切れ… ミッション失敗')); return; } }
  if (st.type === 'car') { if (!foot) stepDone(); }
  else if (st.type === 'go' || st.type === 'sneak') {
    if (st.type === 'sneak') { // 見はりの警察官: 行ったり来たりする。ライトの中に入ると見つかる
      for (const g of MX.guards) {
        g.z += g.dir * SNEAK.speed * dt; if (g.z < SNEAK.z0) g.dir = 1; if (g.z > SNEAK.z1) g.dir = -1;
        g.h += angDiff(g.h, g.dir > 0 ? 0 : Math.PI) * Math.min(1, 5 * dt); g.per.g.position.set(g.x, 0.3, g.z); g.per.g.rotation.y = g.h; animPerson(g.per, SNEAK.speed, dt);
        const dx = player.x - g.x, dz = player.z - g.z;
        if (Math.hypot(dx, dz) < SNEAK.see && Math.abs(angDiff(g.h, Math.atan2(dx, dz))) < SNEAK.half && lineClear(g.x, g.z, player.x, player.z)) { failMission(tr('ライトに見つかった！ ミッション失敗')); return; }
      }
    }
    if (Math.hypot(st.pos.x - player.x, st.pos.z - player.z) < (st.type === 'sneak' ? 3.5 : 5.5) && (!st.car || (!foot && (st.car !== 2 || player.car === MX.mcar))) && (!st.foot || foot)) stepDone();
  }
  else if (st.type === 'kill' && st.boss) { // 幹部・大ボス: その1人をたおすとクリア。赤い光がついていく。幹部がおそってきたら、手下もいっしょに来る
    const b = MX.boss; if (!b || b.hp <= 0) { G.left = 0; stepDone(); return; }
    G.left = Math.ceil(b.hp); aim(b.x, b.z); if (b.state === 'chase') for (const g of MX.foes) if (g.hp > 0 && g.state === 'idle') g.state = 'chase';
  }
  else if (st.type === 'kill') { G.left = MX.foes.filter(g => g.hp > 0).length; if (!G.left) stepDone(); }
  else if (st.type === 'collect') { // 歩いて近づくと拾う。光は、いちばん近い1つに出す
    let best = null, bd = 1e9;
    for (let i = MX.items.length - 1; i >= 0; i--) {
      const it = MX.items[i], d = Math.hypot(it.x - player.x, it.z - player.z); it.g.rotation.y += dt * 2;
      if (d < 1.8 && foot) { scene.remove(it.g); MX.items.splice(i, 1); toast(tr(st.got || 'ヘビをつかまえた！'), 1); continue; }
      if (d < bd) { bd = d; best = it; }
    }
    G.left = MX.items.length; if (best) aim(best.x, best.z); else stepDone();
  }
  else if (st.type === 'ram') { const c = MX.runner; aim(c.x, c.z); if (G.left <= 0) stepDone(); }
  else if (st.type === 'getin') { const c = MX.mcar; aim(c.x, c.z); if (player.car === c) stepDone(); }
  else if (st.type === 'ask') { if (G.left <= 0) stepDone(); } // 聞きこみ: 数えるのは startTalk・answerTalk
  else if (st.type === 'bait') { // 黒の手下が主人公に気づいたら(なわばりに入る・なぐる)、3人とも追ってくる
    const bl = MX.foes.filter(g => g.lure && g.hp > 0);
    if (bl.length < LURE.need) { failMission(tr('手下をたおしすぎた… ミッション失敗')); return; }
    if (bl.some(g => g.state === 'chase')) { for (const g of bl) g.state = 'chase'; stepDone(); }
  }
  else if (st.type === 'lure') { // 歩いて連れていく。車に乗る・はなれすぎると、あきらめて帰る
    if (!foot) { failMission(tr('車に乗ったので、手下があきらめた… ミッション失敗')); return; }
    let dead = 0;
    for (const g of MX.foes) { if (!g.lure) continue; if (g.hp <= 0) { dead++; continue; } g.state = 'chase'; if (Math.hypot(g.x - player.x, g.z - player.z) > LURE.give) { g.lure = false; g.state = 'idle'; } }
    const bl = MX.foes.filter(g => g.lure && g.hp > 0); G.left = bl.length;
    if (bl.length < LURE.need) { failMission(tr(dead > LURE.n - LURE.need ? '手下をたおしすぎた… ミッション失敗' : '手下があきらめて帰った… ミッション失敗')); return; }
    if (Math.hypot(st.pos.x - player.x, st.pos.z - player.z) < 6 && bl.filter(g => Math.hypot(g.x - player.x, g.z - player.z) < LURE.near).length >= LURE.need) stepDone();
  }
  else if (st.type === 'roof') { if (player.roof === roofNear(st.roofAt.x, st.roofAt.z)) stepDone(); } // v=30
  else if (st.type === 'snipe') updateSnipe(st, dt);
  else if (st.type === 'thief') updateThief(dt);
  else if (st.type === 'leave') { if (foot) { MX.mcar = null; stepDone(); } } // 降りた車は、そのまま駐車場に置いておく(消さない)
  else if (st.type === 'survive') { G.wanted = Math.max(G.wanted, st.wanted); G.evade = 0; } // ★は下がらない
  if (st.hunt && !G.busy && curM() === m) { G.huntT -= dt; if (MX.hunters.length < TUNE.hunt.cars && G.huntT <= 0) { G.huntT = TUNE.hunt.wait; spawnHunter(); } } // 追っ手の車をそろえる
}

/* ===== 配達競争(画面側) ===== */
// ほかの人のパトカーと警察官(v=20): 追われている人のスマホが動かして、位置を送ってくる(p = パトカー [x, z, h]、k = 警察官 [[x, z, h], …])。ここでは見せるだけ
function updateRemoteCops(a, r, k, dt) {
  const pc = r && !r.out ? r.p : null, ks = r && !r.out ? r.k || [] : [];
  if (pc) {
    if (!a.cop) { const m = makeCarMesh(0, true); a.cop = { g: m.g, lights: m.lights, x: pc[0], z: pc[1], h: pc[2], seen: false }; }
    const c = a.cop; if (!c.seen) { c.x = pc[0]; c.z = pc[1]; c.h = pc[2]; c.seen = true; }
    c.x += (pc[0] - c.x) * k; c.z += (pc[1] - c.z) * k; c.h += angDiff(c.h, pc[2]) * k;
    c.g.visible = true; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; copLights(c, T);
  } else if (a.cop) { a.cop.seen = false; a.cop.g.visible = false; }
  a.cops = a.cops || [];
  for (let i = 0; i < Math.max(ks.length, a.cops.length); i++) {
    const q = ks[i]; let o = a.cops[i];
    if (!q) { if (o) { o.seen = false; o.per.g.visible = false; } continue; }
    if (!o) o = a.cops[i] = { per: makeCop(SKINS[i % 3]), x: q[0], z: q[1], h: q[2], seen: false };
    if (!o.seen) { o.x = q[0]; o.z = q[1]; o.h = q[2]; o.seen = true; }
    const ox = o.x, oz = o.z; o.x += (q[0] - o.x) * k; o.z += (q[1] - o.z) * k; o.h += angDiff(o.h, q[2]) * k;
    o.per.g.visible = true; o.per.g.position.set(o.x, onWalk(o.x, o.z) ? 0.3 : 0, o.z); o.per.g.rotation.y = o.h; animPerson(o.per, Math.hypot(o.x - ox, o.z - oz) / Math.max(dt, 0.001), dt);
  }
}
function dropAvatar(a) { scene.remove(a.carM.g); scene.remove(a.per.g); scene.remove(a.star); if (a.cop) scene.remove(a.cop.g); for (const o of a.cops || []) scene.remove(o.per.g); }
// 観戦: つかまった人のカメラは、荷物を持っている人(いなければ、まだ走っている人)についていく
function watchTarget() {
  if (!G.out) return null; const h = raceHolder(), ok = id => { const a = R.avatars[id]; return a && a.seen; };
  const id = h && ok(h) ? h : Object.keys(R.avatars).find(ok); if (!id) return null;
  const a = R.avatars[id]; return { id, x: a.x, z: a.z, h: a.h, car: a.car };
}
const RACE_SPAWN = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10]]; // 真ん中の交差点から4方向に並ぶ
function raceHolder() { const s = R.state; return s && s.pkg && s.pkg.state === 'held' ? s.pkg.holder : null; }
function updateAvatars(dt) {
  const k = 1 - Math.exp(-10 * dt);
  for (const id in R.avatars) {
    const a = R.avatars[id], r = R.remotes[id];
    updateRemoteCops(a, r, k, dt); // その人を追っているパトカーと警察官(v=20)
    if (!r || r.out) { a.seen = false; a.carM.g.visible = false; a.per.g.visible = false; a.star.visible = false; continue; } // つかまった人は、ほかの人の画面から消える
    a.star.visible = !!r.w; // 手配中の人の頭の上に、黄色い★
    if (r.w) { a.star.position.set(a.x, (a.car ? 3.4 : 3.3) + Math.sin(T * 4) * 0.15, a.z); a.star.rotation.y += dt * 3; }
    if (!a.seen || (r.rf || 0) !== (a.rf || 0)) { a.x = r.x; a.z = r.z; a.h = r.h; a.seen = true; a.rf = r.rf || 0; } // 屋上に上がった・おりたときは、すぐその場所に(v=29)
    a.x += (r.x - a.x) * k; a.z += (r.z - a.z) * k; a.h += angDiff(a.h, r.h) * k; a.car = !!r.c;
    if (a.car) { const ty = CAR_KEYS[r.t] || 'sedan', cc = typeof r.cc === 'number' ? r.cc : a.col, pol = !!r.pc; if (ty !== a.type || cc !== a.cc || pol !== !!a.pol) { const vis = a.carM.g.visible; scene.remove(a.carM.g); a.carM = makeCarMesh(cc, pol, pol ? 'sedan' : ty); a.carM.g.visible = vis; a.type = ty; a.cc = cc; a.pol = pol; } } // 乗りかえた車の形と色(v=21)。パトカー(v=27)
    if (a.car && a.pol) copLights(a.carM, T); // ケイドロの警察のパトカーは、屋根のライトが光る
    const isCop = kdCop(id); if (isCop !== !!a.copPer) { const vis = a.per.g.visible; scene.remove(a.per.g); a.per = isCop ? makeCop(SKINS[0]) : makePerson(a.col, 0x23324f, 0xf0c9a0); a.per.g.visible = vis; a.copPer = isCop; } // ケイドロの警察は、歩くと警察官の服
    a.carM.g.visible = a.car; a.per.g.visible = !a.car;
    if (G.rule === 'shoot') { // 撃ち合い(v=28): 持っている武器・たおれている・かぶる/巻きつく・無敵でちかちか
      if ((r.wk || null) !== (a.wk || null)) { setHand(a.per, a, r.wk && WEAPONS[r.wk] ? r.wk : null); a.wk = r.wk || null; }
      a.per.g.rotation.x = r.dd ? -Math.PI / 2 : 0;
      const st = r.st || 0; if (st !== (a.st || 0)) { clearStatus(a); if (st === 1) setStatus(a, 'blind'); else if (st === 2) setStatus(a, 'frozen'); a.st = st; }
      if (r.iv && Math.floor(T * 10) % 2) { a.per.g.visible = false; a.carM.g.visible = false; }
    }
    if (a.car) { a.carM.g.position.set(a.x, 0, a.z); a.carM.g.rotation.y = a.h; }
    else { const rf = ROOFS[(r.rf || 0) - 1]; a.per.g.position.set(a.x, rf ? rf.top + (r.dd ? 0.4 : 0) : onWalk(a.x, a.z) ? 0.3 : 0, a.z); a.per.g.rotation.y = a.h; animPerson(a.per, Math.abs(r.v || 0), dt); }
  }
}
function updateRaceMarks(t) {
  const s = R.state; if (!s) { marker.visible = false; pkgMesh.visible = false; oniMesh.visible = false; return; }
  if (G.rule === 'race') { // レース(v=26): 自分の次のチェックポイント(緑の光)
    pkgMesh.visible = false; oniMesh.visible = false; const cp = s.phase === 'play' && s.cps ? s.cps[(s.prog && s.prog[R.me]) || 0] : null;
    R.cp = cp; marker.visible = !!cp; if (cp) { markerColor(0x4cff6a); marker.position.set(cp.x, 0, cp.z); } return;
  }
  if (G.rule === 'cops' || G.rule === 'shoot') { marker.visible = false; pkgMesh.visible = false; oniMesh.visible = false; return; } // ケイドロ(v=27): 警察はパトカーと服でわかる
  if (G.rule === 'tag') { // 鬼ごっこ(v=26): 鬼の頭の上に赤いしるし。ほかの人には、鬼の所に赤い光
    pkgMesh.visible = false; const o = s.oni; let x, z, car;
    if (o === R.me) { x = player.x; z = player.z; car = player.mode === 'car'; }
    else { const a = R.avatars[o]; if (!a || !a.seen) { oniMesh.visible = false; marker.visible = false; return; } x = a.x; z = a.z; car = a.car; }
    oniMesh.visible = true; oniMesh.position.set(x, (car ? 3.2 : 3.4) + Math.sin(t * 4) * 0.15, z); oniMesh.rotation.y = t * 2;
    marker.visible = o !== R.me && s.phase === 'play'; if (marker.visible) { markerColor(0xff4a4a); marker.position.set(x, 0, z); } return;
  }
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
  const w = watchTarget();
  if (w) { // 観戦(配達競争でつかまった): ほかの人のうしろについていく。ドラッグで回せる
    G.watchYaw += G.camDrag; G.camDrag = 0; G.camYaw += angDiff(G.camYaw, w.h + G.watchYaw) * Math.min(1, 3 * dt);
    const dist = w.car ? 12 : 8, hgt = w.car ? 5.5 : 4, yaw = G.camYaw;
    camPos.lerp(new THREE.Vector3(w.x - Math.sin(yaw) * dist, hgt, w.z - Math.cos(yaw) * dist), 1 - Math.exp(-4 * dt)); camera.position.copy(camPos);
    lookT.set(w.x + Math.sin(yaw) * 3, 1.6, w.z + Math.cos(yaw) * 3); camera.lookAt(lookT); return;
  }
  beam.visible = !G.scope; // スコープの間は、目印の光の柱を消す(地面の輪だけ)(v=30)
  if (G.scope) { // ライフルのスコープ(v=29): 主人公の目から、ねらっている方を拡大して見る
    const o = scopeEye(), d = scopeDir(G.scope.yaw, G.scope.pitch); camPos.set(o.x, o.y, o.z); camera.position.copy(camPos); lookT.set(o.x + d.x * 10, o.y + d.y * 10, o.z + d.z * 10); camera.lookAt(lookT);
    if (Math.abs(camera.fov - TUNE.rifle.fov) > 0.1) { camera.fov = TUNE.rifle.fov; camera.updateProjectionMatrix(); } return;
  }
  let dist, hgt; const target = player.mode === 'car' ? player.car.h : player.h, by = lvY(player.roof); // by = 屋上の高さ(v=29)
  if (player.mode === 'car') { G.camYaw += angDiff(G.camYaw, target) * Math.min(1, 4 * dt); dist = 11 + Math.abs(player.car.v) * 0.08; hgt = 5; G.camDrag *= 1 - 2 * dt; }
  else { if (input.jy > -0.3 && (Math.abs(input.jx) + Math.abs(input.jy)) > 0.1) G.camYaw += angDiff(G.camYaw, target) * Math.min(1, 1.2 * dt); dist = 7.5; hgt = 3.8; if (G.camDrag) { G.camYaw += G.camDrag; G.camDrag = 0; } }
  const yaw = G.camYaw + (player.mode === 'car' ? G.camDrag : 0);
  const want = new THREE.Vector3(player.x - Math.sin(yaw) * dist, hgt + by, player.z - Math.cos(yaw) * dist);
  camPos.lerp(want, 1 - Math.exp(-6 * dt)); camera.position.copy(camPos); lookT.set(player.x + Math.sin(yaw) * 3, 1.6 + by, player.z + Math.cos(yaw) * 3); camera.lookAt(lookT);
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
  if (FOODS.length) icon(FOODS.reduce((a, f) => a + f.x, 0) / FOODS.length, FOODS.reduce((a, f) => a + f.z, 0) / FOODS.length, '#d99a10', tr('食')); // 屋台の食べ物は、まとめて1つ(v=31)
  icon(HOSPITAL.x, HOSPITAL.z + 8, '#ffffff', '');
  // ホーム(青い丸に白い家)
  icon(HOME.x, HOME.z + 6, '#2f7fe0', ''); { const hx = X(HOME.x), hz = X(HOME.z + 6); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(hx, hz - 8); g.lineTo(hx + 8, hz - 1); g.lineTo(hx - 8, hz - 1); g.closePath(); g.fill(); g.fillRect(hx - 5, hz - 1, 10, 7); }
  g.fillStyle = '#16a34a'; g.fillRect(X(HOSPITAL.x) - 2.5, X(HOSPITAL.z + 8) - 7, 5, 14); g.fillRect(X(HOSPITAL.x) - 7, X(HOSPITAL.z + 8) - 2.5, 14, 5);
})();
const mm = $('mm'), mg = mm.getContext('2d');
function drawMinimap() {
  const w = watchTarget(), px = w ? w.x : player.x, pz = w ? w.z : player.z, phd = w ? w.h : player.h; // 観戦中は、見ている人がまん中
  const W = 260, Rr = 130, sc = 1.3; mg.clearRect(0, 0, W, W); mg.save(); mg.beginPath(); mg.arc(Rr, Rr, Rr, 0, Math.PI * 2); mg.clip(); mg.fillStyle = '#222'; mg.fillRect(0, 0, W, W);
  const a = G.camYaw, th = -Math.PI / 2 - Math.atan2(Math.cos(a), Math.sin(a));
  mg.translate(Rr, Rr); mg.rotate(th); mg.scale(sc, sc); mg.drawImage(mapC, -180 - px, -180 - pz, 360, 360);
  mg.rotate(Math.atan2(Math.cos(phd), Math.sin(phd)) + Math.PI / 2); mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(0, 2); mg.lineTo(-5, 5); mg.closePath(); mg.fill(); mg.restore();
  const ct = Math.cos(th), stn = Math.sin(th);
  function dot(x, z, col, r, clampIt) { const dx = (x - px) * sc, dz = (z - pz) * sc; let sx = dx * ct - dz * stn, sy = dx * stn + dz * ct; const l = Math.hypot(sx, sy); if (l > Rr - 10) { if (!clampIt) return; sx *= (Rr - 10) / l; sy *= (Rr - 10) / l; } mg.fillStyle = col; mg.beginPath(); mg.arc(Rr + sx, Rr + sy, r, 0, Math.PI * 2); mg.fill(); mg.strokeStyle = '#000'; mg.lineWidth = 1.5; mg.stroke(); }
  for (const c of cars) if (c.kind === 'police') dot(c.x, c.z, (Math.floor(performance.now() / 250) % 2) ? '#ff3030' : '#3060ff', 6, false);
  for (const id in R.avatars) { const av = R.avatars[id]; if (av.seen) dot(av.x, av.z, raceColor(id), 7, true); if (av.cop && av.cop.seen) dot(av.cop.x, av.cop.z, (Math.floor(performance.now() / 250) % 2) ? '#ff3030' : '#3060ff', 5, false); } // ほかの人を追うパトカーも
  for (const c of MX.hunters) dot(c.x, c.z, '#ffffff', 6, false); // 追っ手の車(白)
  if (shootOn() && R.state && R.state.items) for (const it of R.state.items) if (it.on) dot(it.x, it.z, WEAPONS[it.k] ? '#ff5a4a' : '#5ae8ff', 4, false); // 撃ち合いのアイテム(武器は赤・補助は水色)
  if (G.mode === 'solo') { for (const f of FREE) if (freeOpen(f)) dot(f.at.x, f.at.z, f.info ? '#ffa53a' : f.col ? '#ffe9a0' : '#b06bff', 8, true); if (boatOpen()) dot(BOAT.at.x, BOAT.at.z, '#7fe8ff', 7, true); } // 受けられるミッション(紫)・船(水色)
  if (roofOn()) for (const rf of ROOFS) dot(rf.ent.x, rf.ent.z, '#5cff8a', 5, false); // 屋上の入口(v=29)
  if (marker.visible) dot(marker.position.x, marker.position.z, '#' + ringMat.color.getHexString(), 9, true);
}

/* ===== 画面の文字 ===== */
function updateHUD() {
  const st = G.started ? streetAt(player.x, player.z, G.street) : null; if (st !== G.street) { G.street = st; $('street').textContent = st ? tr(st) : ''; } // いまいる通りの名前(v=23)
  if (G.mode === 'race') { updateRaceHUD(); return; }
  const m = curM(); let html = '';
  if (G.over || !m) html = '<div class="t">' + tr('フリー走行') + '</div>' + tr(G.done.tower ? '港の奥の倉庫へ行って、とびらを開けよう' : FREE.some(freeOpen) ? '紫の光で、好きなミッションを受けよう' : '街を自由に走り回ろう');
  else if (!G.free && G.failWait > 0) html = '<div class="t">' + tr('ミッション{n}', { n: G.mi + 1 }) + '</div>' + G.waitMsg;
  else { const st = m.steps[G.si]; html = '<div class="t">' + (G.free ? tr('ミッション：{title}', { title: tr(m.title) }) : tr('ミッション{n}/{total}：{title}', { n: G.mi + 1, total: MISSIONS.length, title: tr(m.title) })) + '</div>' + tr(st.text, { n: G.left, hp: Math.ceil(G.escHp || 0) }); if (G.tp) { const d = Math.hypot(G.tp.x - player.x, G.tp.z - player.z); html += '<div class="d">' + tr('あと {d} m', { d: Math.round(d) }) + '</div>'; } }
  $('mission').innerHTML = html; $('money').textContent = '$' + G.money.toLocaleString();
  let s = ''; for (let i = 0; i < 5; i++) s += '<span style="color:' + (i < G.wanted ? '#ffd23f' : 'rgba(255,255,255,.35)') + '">★</span>'; $('stars').innerHTML = s;
  $('clock').textContent = G.phase === 'day' ? '☀ ' + tr('昼') : G.phase === 'eve' ? '◐ ' + tr('夕方') : '☾ ' + tr('夜');
  const hp = Math.max(0, player.hp); $('hpFill').style.width = hp + '%'; $('hpFill').style.background = hp < 30 ? '#e8463c' : ''; $('hpText').textContent = tr('体力 {n}', { n: Math.ceil(hp) });
  $('armorBar').style.display = player.armor > 0 ? 'block' : 'none'; $('armorFill').style.width = (player.armor / TUNE.armor * 100) + '%';
  const hb = $('healBtn'); hb.style.display = player.heals > 0 ? 'flex' : 'none'; hb.textContent = tr('回復 ×{n}', { n: player.heals });
  const wk = player.inv[player.wi]; $('wpnBtn').textContent = tr(WEAPONS[wk].name) + (isGun(wk) ? ' ' + ammoOf(wk) : '') + (player.inv.length > 1 ? ' ⇄' : '');
  $('timer').textContent = G.timeLeft > 0 ? tr('残り {n} 秒', { n: Math.ceil(G.timeLeft) }) : ''; $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : G.ramenT > 0 ? tr('はやく走れる {n}秒', { n: Math.ceil(G.ramenT) }) : '';
}
function updateRaceHUD() {
  if (G.rule === 'race' || G.rule === 'tag' || G.rule === 'cops' || G.rule === 'shoot') { updateRuleHUD(); return; }
  const s = R.state; let html = '<div class="t">' + tr('配達競争：{n}点先取', { n: (s && s.target) || 3 }) + '</div>';
  const w = watchTarget();
  if (!s) html += tr('準備中…');
  else if (s.phase === 'end') html += tr('おわり！');
  else if (G.out) html += tr('つかまった… 観戦中') + (w ? '<div class="d">' + tr('{name} を見ている', { name: '<b style="color:' + raceColor(w.id) + '">' + esc(raceName(w.id)) + '</b>' }) + '</div>' : '');
  else {
    const holder = raceHolder();
    if (!holder) { html += tr('荷物(黄色い光)を取りに行け！'); html += '<div class="d">' + tr('あと {d} m', { d: Math.round(Math.hypot(s.pkg.x - player.x, s.pkg.z - player.z)) }) + '</div>'; }
    else if (holder === R.me) { html += tr('届け先(緑の光)へ急げ！') + '<div class="d">' + tr('ぶつかられると取られるぞ'); if (s.dest) html += tr('・あと {d} m', { d: Math.round(Math.hypot(s.dest.x - player.x, s.dest.z - player.z)) }); html += '</div>'; }
    else html += tr('{name} から荷物を奪え！', { name: '<b style="color:' + raceColor(holder) + '">' + esc(raceName(holder)) + '</b>' }) + '<div class="d">' + tr('赤い光の人にぶつかろう') + '</div>';
  }
  $('mission').innerHTML = html;
  let sc = '';
  if (s && s.players) for (const id of Object.keys(s.players).sort((a, b) => (s.players[a].slot || 0) - (s.players[b].slot || 0))) sc += '<div' + (id === R.me ? ' class="me"' : '') + '><span class="dot" style="background:' + raceColor(id) + '"></span>' + esc(s.players[id].name) + '　' + tr('{n}点', { n: (s.scores && s.scores[id]) || 0 }) + (s.out && s.out[id] ? ' <small>' + tr('つかまった') + '</small>' : '') + '</div>';
  $('scores').innerHTML = sc; $('money').textContent = ''; $('clock').textContent = ''; $('timer').textContent = '';
  $('stars').innerHTML = G.wanted && !G.out ? '<span style="color:#ffd23f">★</span>' : ''; // 手配中は★が1つ
  $('speed').textContent = player.mode === 'car' ? Math.round(Math.abs(player.car.v) * 3.6) + ' km/h' : '';
}

// レース・鬼ごっこの画面の文字(v=26)
function updateRuleHUD() {
  const s = R.state, race = G.rule === 'race', n = race && s && s.cps ? s.cps.length : 0, who = id => '<b style="color:' + raceColor(id) + '">' + esc(raceName(id)) + '</b>';
  const kd = G.rule === 'cops', sh = G.rule === 'shoot', left = s && typeof s.left === 'number' ? s.left : kd ? 240 : 180;
  let html = '<div class="t">' + (race ? tr('レース：チェックポイント{n}つ', { n: n || 8 }) : sh ? tr('サバイバル：のこり {n}秒', { n: left }) : kd ? tr('ケイドロ：のこり {n}秒', { n: left }) : tr('鬼ごっこ：のこり {n}秒', { n: left })) + '</div>';
  if (!s) html += tr('準備中…');
  else if (s.phase === 'end') html += tr('おわり！');
  else if (sh) { // 撃ち合い(v=28)
    const k = (s.kills && s.kills[R.me]) || 0, d = (s.deaths && s.deaths[R.me]) || 0;
    if (G.shDown > 0) html += (G.by ? tr('{name}にやられた…', { name: who(G.by) }) : tr('やられた…')) + '<div class="d">' + tr('{n}秒後に復活', { n: Math.ceil(G.shDown) }) + '</div>';
    else html += tr('武器を拾って、たおせ！') + '<div class="d">' + tr('たおした {a}・やられた {b}', { a: k, b: d }) + (G.spdT > T ? '　' + tr('スピードアップ {n}秒', { n: Math.ceil(G.spdT - T) }) : '') + '</div>';
  }
  else if (kd) { // ケイドロ(v=27)
    const free = G.kdFree - T, run = Object.keys(s.players || {}).filter(id => !kdCop(id)).length;
    if (kdCop()) html += tr('あなたが警察！ 逃げる人にぶつかってつかまえよう') + '<div class="d">' + (free > 0 ? tr('{n}秒後に動ける', { n: Math.ceil(free) }) : G.kdCatch > T ? tr('{n}秒後につかまえられる', { n: Math.ceil(G.kdCatch - T) }) : tr('逃げている人 のこり{n}人', { n: run })) + '</div>';
    else html += tr('警察から逃げろ！') + '<div class="d">' + (free > 0 ? tr('警察は{n}秒後に動き出す', { n: Math.ceil(free) }) : tr('パトカーにぶつかられると、つかまる')) + '</div>';
  }
  else if (race) {
    const k = (s.prog && s.prog[R.me]) || 0, cp = s.cps && s.cps[k];
    html += tr('緑の光へ急げ！({a}/{b})', { a: k + 1, b: n }); if (cp) html += '<div class="d">' + tr('あと {d} m', { d: Math.round(Math.hypot(cp.x - player.x, cp.z - player.z)) }) + '</div>';
  } else if (s.oni === R.me) {
    const w = G.tagUntil - T; html += tr('あなたが鬼！ だれかにぶつかってタッチしよう') + '<div class="d">' + (w > 0 ? tr('{n}秒後にタッチできる', { n: Math.ceil(w) }) : tr('ミニマップで、みんなの場所がわかる')) + '</div>';
  } else html += tr('{name}が鬼！ 逃げろ！', { name: who(s.oni) }) + '<div class="d">' + tr('赤い光の人が鬼') + '</div>';
  $('mission').innerHTML = html;
  let sc = '';
  if (s && s.players) for (const id of Object.keys(s.players).sort((a, b) => (s.players[a].slot || 0) - (s.players[b].slot || 0))) {
    const v = race ? tr('{a}/{b}', { a: (s.prog && s.prog[id]) || 0, b: n }) : sh ? tr('たおした {n}', { n: (s.kills && s.kills[id]) || 0 }) : kd ? (kdCop(id) ? tr('警察') : tr('逃げている')) : tr('鬼 {n}秒', { n: Math.round((s.oniT && s.oniT[id]) || 0) });
    sc += '<div' + (id === R.me ? ' class="me"' : '') + '><span class="dot" style="background:' + raceColor(id) + '"></span>' + esc(s.players[id].name) + '　' + v + (G.rule === 'tag' && s.oni === id ? ' <small>' + tr('鬼') + '</small>' : '') + '</div>';
  }
  $('scores').innerHTML = sc; $('money').textContent = ''; $('clock').textContent = ''; $('timer').textContent = ''; $('stars').innerHTML = '';
  if (sh) { // 撃ち合い: 体力・チョッキ・武器のボタン(ひとり用と同じ)
    const hp = Math.max(0, player.hp); $('hpFill').style.width = hp + '%'; $('hpFill').style.background = hp < 30 ? '#e8463c' : ''; $('hpText').textContent = tr('体力 {n}', { n: Math.ceil(hp) });
    $('armorBar').style.display = player.armor > 0 ? 'block' : 'none'; $('armorFill').style.width = (player.armor / TUNE.armor * 100) + '%';
    const wk = player.inv[player.wi] || 'fist'; $('wpnBtn').textContent = tr(WEAPONS[wk].name) + (isGun(wk) ? ' ' + ammoOf(wk) : '') + (player.inv.length > 1 ? ' ⇄' : ''); $('healBtn').style.display = 'none';
  }
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
    { name: () => tr('ライフル(弾{n}発つき)', { n: TUNE.rifle.ammo }), price: TUNE.rifle.price, can: () => !player.inv.includes('rifle'), why: () => tr('持っている'), buy: () => addWeapon('rifle', TUNE.rifle.ammo) }, // v=29
    { name: () => tr('ライフルの弾 {n}発', { n: TUNE.rifle.ammo }), price: TUNE.rifle.ammoPrice, can: () => player.inv.includes('rifle'), why: () => tr('ライフルがない'), buy: () => { player.rf += TUNE.rifle.ammo; } },
  ],
  // 屋台の食べ物(v=31): その場で食べる
  food: [
    { name: () => tr('小籠包(体力+{n})', { n: 25 }), price: 50, can: () => player.hp < TUNE.hp, why: () => tr('体力は満タン'), buy: () => { player.hp = Math.min(TUNE.hp, player.hp + 25); } },
    { name: () => tr('肉まん(体力+{n})', { n: 40 }), price: 80, can: () => player.hp < TUNE.hp, why: () => tr('体力は満タン'), buy: () => { player.hp = Math.min(TUNE.hp, player.hp + 40); } },
    { name: () => tr('ラーメン({n}秒、はやく走れる)', { n: FOOD.ramenT }), price: 100, can: () => !(G.ramenT > 0), why: () => tr('まだおなかいっぱい'), buy: () => { G.ramenT = FOOD.ramenT; } },
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
  $('shopInfo').innerHTML = tr('所持金 ${m}', { m: G.money.toLocaleString() }).replace(/\$([\d,]+)/, '<b>$$$1</b>') + '　' + tr('体力 {n}', { n: Math.ceil(player.hp) }) + (player.armor > 0 ? '　' + tr('チョッキ {n}', { n: player.armor }) : '') + (player.heals ? '　' + tr('回復薬 {n}', { n: player.heals }) : '') + (player.inv.includes('pistol') ? '　' + tr('弾 {n}', { n: player.ammo }) : '') + (player.inv.includes('mg') ? '　' + tr('マシンガンの弾 {n}', { n: player.mg }) : '') + (player.inv.includes('rifle') ? '　' + tr('ライフルの弾 {n}', { n: player.rf }) : '');
  $('shopList').innerHTML = SHOP_ITEMS[s.kind].map((it, i) => {
    const ok = it.can(), money = G.money >= it.price;
    return '<button class="shopItem" data-i="' + i + '"' + (ok && money ? '' : ' disabled') + '><span>' + esc(it.name()) + '</span><b>$' + it.price.toLocaleString() + '</b>' + (!ok ? '<small>' + esc(it.why()) + '</small>' : !money ? '<small>' + tr('お金がたりない') + '</small>' : '') + '</button>';
  }).join('');
}
function openShop(s) {
  G.shop = s; stopInput();
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
  for (const s of SHOPS.concat(FOODS)) { s.g.visible = G.mode === 'solo'; s.ring.position.y = 0.5 + Math.sin(t * 3) * 0.15; }
  if (G.mode !== 'solo') return;
  if (G.shopLock && Math.hypot(G.shopLock.x - player.x, G.shopLock.z - player.z) > 3) G.shopLock = null;
  if (player.mode !== 'foot' || player.hp <= 0 || G.downT > 0 || G.stunT > 0) return;
  for (const s of SHOPS.concat(FOODS)) if (s !== G.shopLock && Math.hypot(s.x - player.x, s.z - player.z) < 1.8) { openShop(s); return; }
}

/* ===== ホームと、ミッションの紫のマーク(v=14)・船(v=15) ===== */
// 紫のマークに歩いて入ると、ゲームが止まって、名前とほうびが出る。「受ける」「やめる」をえらぶ
// o = ミッション(FREE)か、えらぶもの { title, desc, yes, no, onYes, onNo, pay(いるお金) }。when = 'night'・'day' のものは、その時間だけ受けられる
const whenOk = o => !o.when || (o.when === 'dark' ? G.phase !== 'day' : o.when === G.phase); // when: 'dark' = 夕方と夜(v=32)
function openOffer(o) {
  G.offer = o; stopInput();
  $('offerKind').textContent = o.steps && o.steps.length ? tr('ミッション') : ''; $('offerName').textContent = tr(o.title); $('offerDesc').textContent = tr(o.desc);
  $('offerReward').textContent = o.reward ? tr('ほうび ${r}', { r: o.reward.toLocaleString() }) : o.pay ? tr('船代 ${r}', { r: o.pay.toLocaleString() }) + '　' + tr('所持金 ${m}', { m: G.money.toLocaleString() }) : '';
  const note = o.req && !o.req() ? tr(o.reqNote) : !whenOk(o) ? tr(o.when === 'night' ? '夜だけ受けられる(家でねると、夜にできる)' : o.when === 'dark' ? '夕方と夜だけ受けられる(家でねると、夜にできる)' : '昼だけ受けられる(家でねると、朝にできる)') : o.pay && G.money < o.pay ? tr('お金がたりない') : '';
  $('offerNote').textContent = note; $('offerYes').disabled = !!note;
  $('offerYes').textContent = tr(o.yes || '受ける'); $('offerNo').textContent = tr(o.no || 'やめる');
  $('offer').classList.remove('hidden');
}
function closeOffer(take) {
  const o = G.offer; if (!o || (take && $('offerYes').disabled)) return; G.offer = null; if (o.at) G.markLock = o; $('offer').classList.add('hidden');
  if (take) { if (o.onYes) o.onYes(); else { G.free = o; if (o.intro) o.intro(beginMission); else beginMission(); } } else if (o.onNo) o.onNo();
  updateHUD();
}
$('offerYes').addEventListener('click', () => closeOffer(true));
$('offerNo').addEventListener('click', () => closeOffer(false));
// 出たあとは、一度はなれるまで出ない(店と同じ)
let sleepShown = null;
function checkMarks(t) {
  const solo = G.mode === 'solo', y = 0.5 + Math.sin(t * 3) * 0.15;
  HOME.g.visible = solo; HOME.ring.position.y = y; sailorPer.g.visible = solo; infoPer.g.visible = solo && G.lent === 1 && G.phase === 'night' && !(G.done.info4 && G.done.info5); // 情報屋は、貸したあとの夜だけ公園にいる(幹部を2人たおしたあとは、塔の前)
  poseTwr();
  for (const f of FREE) { f.g.visible = solo && freeOpen(f); f.ring.position.y = y; }
  BOAT.g.visible = solo && boatOpen(); BOAT.ring.position.y = y;
  const sl = solo && canSleep(); if (sl !== sleepShown) { sleepShown = sl; $('sleepBtn').style.display = sl ? 'flex' : 'none'; } // 家の光の近くでは「ねる」ボタンが出る
  if (!solo) return;
  if (G.markLock && Math.hypot((G.markLock.at || G.markLock).x - player.x, (G.markLock.at || G.markLock).z - player.z) > 3) G.markLock = null;
  if (player.mode !== 'foot' || player.hp <= 0 || G.downT > 0 || G.stunT > 0 || paused()) return;
  if (G.markLock !== HOME && Math.hypot(HOME.x - player.x, HOME.z - player.z) < 1.8) { atHome(); return; }
  for (const f of FREE) if (freeOpen(f) && f !== G.markLock && Math.hypot(f.at.x - player.x, f.at.z - player.z) < 1.8) { openOffer(f); return; }
  if (boatOpen() && BOAT !== G.markLock && Math.hypot(BOAT.at.x - player.x, BOAT.at.z - player.z) < 1.8) openOffer(BOAT);
}

/* ===== ループ ===== */
let last = performance.now(), T = 0, hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (G.started && paused()) { if (G.intro) updateIntro(dt, T); /* 買い物中・ミッションをえらんでいる間・お話の間・ねる画面は止まる(出だしのクラブだけ動く) */ }
  else if (G.started) {
    readInput(); updatePlayer(dt); updateClock(dt);
    for (const c of cars) { if (c.kind === 'traffic') updateTraffic(c, dt); else if (c.kind === 'police') updatePolice(c, dt, T); else if (c.kind === 'hunter') updateHunter(c, dt); else if (c.kind === 'parked') updateParked(c, dt); }
    if (G.mode === 'race') updateAvatars(dt);
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].gone) removeCar(cars[i]);
    carPairs(); updatePeds(dt); updateVendors(dt); updateGangs(dt); updateNpcs(dt); updatePickups(dt, T); updateMkw(dt, T); updateShots(dt); updateFx(dt);
    if (G.mode === 'solo') updateCombat(dt);
    if (G.mode === 'solo') { managePolice(dt); updateMission(dt); updateSub(dt); }
    else { if (shootOn()) updateShoot(dt); managePolice(dt); updateRaceMarks(T); R.sendT -= dt; if (R.sendT <= 0 && SC.onSend) { R.sendT = TUNE.posRate; SC.onSend(SC.getMe()); } }
    if (G.ramenT > 0) G.ramenT = G.mode === 'solo' ? G.ramenT - dt : 0;
    checkShops(T); checkMarks(T); checkRoofs(T); G.hitCd -= dt; G.play += dt;
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
function resetPlayerToFoot(x, z, h) { if (player.mode === 'car') exitCar(); if (player.roof) { player.roof = null; dropRoofCops(); } endScope(); player.x = x; player.z = z; player.h = h; player.per.g.visible = true; G.camYaw = h; camPos.set(x - Math.sin(h) * 8, 6, z - Math.cos(h) * 8); }
// Android: スタートを押したら全画面にして横に固定する(iPhone はできないので、縦のときは「横にしてね」の警告だけ)
function lockLandscape() {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)) return;
  const d = document.documentElement; if (!d.requestFullscreen || document.fullscreenElement) return;
  d.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => { /* できなくてもよい */ });
}
$('goOnline').addEventListener('click', lockLandscape);
// d = セーブの中身(「つづきから」のとき)。なければ、はじめから
function startSolo(d) {
  lockLandscape(); document.body.classList.add('solo');
  G.mode = 'solo'; showOnly(null); setPlaying(true); setClock(DAY.start); // ひとり用は昼から
  const cont = !!(d && d.v === 1), go = () => { if (curM()) beginMission(); else toast(tr('つづきから'), 2); };
  if (cont) { applySave(d); if (d.susp) applySuspend(d); else resetPlayerToFoot(HOME.sx, HOME.sz, HOME.sh); } else resetPlayerToFoot(startX, startZ, startH); // d.susp = 中断したところから(v=23)
  if (!cont && !window.SC_NO_INTRO) startIntro(go); else go(); // はじめから: 出だしのお話(クラブの中)のあとに始まる
  if (window.BackGuard) BackGuard.set('game', () => { clearSuspend(); leave(); }); // 戻るボタン:「ゲームをやめますか？」→ スタート画面(このファイルは全ゲーム共通なので、確認の文は変えない)
}
// スタート画面: セーブがあれば「つづきから」を出して、「ひとりで遊ぶ」は「はじめから」にする(1回目は確かめる。2回目でセーブを消して始める)
let newAsk = false;
function initStart() {
  const sp = readSuspend(), b = $('goSusp'); b.classList.toggle('hidden', !sp); // 中断したところから(v=23)
  if (sp) b.innerHTML = tr('中断したところから') + '<small>$' + (Math.floor(+sp.money) || 0).toLocaleString() + '　' + tr('{m}分', { m: Math.floor((+sp.play || 0) / 60) }) + '</small>';
  const d = readSave(), c = $('goCont'), n = $('goSolo'); c.classList.toggle('hidden', !d); n.classList.toggle('ghost', !!d || !!sp); c.classList.toggle('ghost', !!sp);
  if (!d) return;
  const fr = FREE.filter(f => !f.alt).map(f => f.id), total = MISSIONS.length + fr.length, cleared = Math.min(total, (+d.mi || 0) + (Array.isArray(d.done) ? d.done.filter(id => fr.includes(id)).length : 0));
  c.innerHTML = tr('つづきから') + '<small>$' + (Math.floor(+d.money) || 0).toLocaleString() + '　' + tr('ミッション {a}/{b}', { a: cleared, b: total }) + '　' + tr('{m}分', { m: Math.floor((+d.play || 0) / 60) }) + '</small>';
  n.textContent = tr('はじめから(ひとり用)');
}
$('goSusp').addEventListener('click', () => { const d = readSuspend(); clearSuspend(); if (d) startSolo(d); else initStart(); }); // 再開すると、中断の記録は消える
$('goCont').addEventListener('click', () => { const d = readSave(); if (d) { clearSuspend(); startSolo(d); } else initStart(); });
$('goSolo').addEventListener('click', () => {
  if (readSave() && !newAsk) { newAsk = true; $('goSolo').textContent = tr('セーブが消えます。もう一度押すと、はじめから'); return; }
  clearSave(); clearSuspend(); startSolo();
});
initStart();
$('quitBtn').addEventListener('click', () => { if (G.mode === 'solo') location.reload(); else if (SC.onQuit) SC.onQuit(); }); // 配達競争だけに出る
// 一時停止の窓(v=23)
$('optBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openPause(); });
$('pResume').addEventListener('click', closePause);
$('pSusp').addEventListener('click', () => { writeSuspend(); leave(); });
$('pQuit').addEventListener('click', () => { $('pMenu').classList.add('hidden'); $('pAsk').classList.remove('hidden'); });
$('pNo').addEventListener('click', () => { $('pAsk').classList.add('hidden'); $('pMenu').classList.remove('hidden'); });
$('pYes').addEventListener('click', () => { clearSuspend(); leave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) autoSuspend(); });
addEventListener('pagehide', autoSuspend);
if (window.BackGuard) BackGuard.set('home');

const SC = window.SC = {
  openPause, closePause, writeSuspend, readSuspend, clearSuspend, autoSuspend, initStart, streetAt, // 一時停止と中断・通りの名前(v=23)
  CAR_TYPES, newCar, removeCar, enterCar, exitCar, carDist, segPair, carSeg, // 車の種類(v=21)
  G, R, player, cars, peds, TUNE, MISSIONS, FREE, HOME, save, readSave, applySave, curM, pointBlocked, P, gangs, pickups, npcs, SHOPS, FOODS, FOOD, MKC, TH, OYAJI_AT, SPICE_AT, HOSPITAL, SHOP_ITEMS, closeShop, WEAPONS, MKT, MKW, shots, newNpc, confiscate, DAY, setClock, vendors, TALK, LINES, QAS, makeVip, startTalk, answerTalk, pickLine, getTalk: () => talk, camera, BOAT, PORT, MX, STORY, SNEAK, freeOpen, story, say, finish, openSleep, sleepTo, bump, CLUB, NEON_MATS, STALL_POS, APT, INTRO, INFO, LURE, BOSSCAR, RUMORS, infoPer, setTeam, applyTeams, inCT, newGang, damageGang, GANG_W, PGD, TOWER, INFO2, BOSS_AT, MK_DEEP, WAREHOUSE, twrInfo, twrOyaji, isCalm, CALM_LINES, endScene, END, ENDS, closeOffer, hurtPlayer, callMinions,
  raceMarker: () => marker, oniMark: () => oniMesh, // テスト用(v=26)
  applyItem, canTake, itemMeshes: () => R.itemM, // テスト用(v=28)
  ROOFS, goRoof, leaveRoof, fireRifle, rifleRay, scopeEye, scopeDir, buildings, // テスト用(v=29)
  SNIPE, roofNear, openOffer, // テスト用(v=30)
  onSend: null, onQuit: null,
  startSolo,
  showOnly, setPlaying,
  onRoad: (x, z) => !inMerged(x, z), // 道路の上か(つなげた区画の中は道路ではない)
  extraSpots: EXTRA_SPOTS,
  // 配達競争を始める。slot は 0〜3(並ぶ場所)
  startRace(meId, slot, color, time, rule) {
    G.rule = ['race', 'tag', 'cops', 'shoot'].includes(rule) ? rule : 'deliver'; G.tagUntil = T + 5; G.kdFree = T + 10; G.kdCatch = 0; // ケイドロ(v=27): 最初の警察は10秒動けない // ルール(v=26)。鬼ごっこは、始まって5秒はタッチできない
    document.body.classList.remove('solo'); G.mode = 'race'; G.wanted = 0; G.bust = 0; G.evade = 0; G.out = false; G.stunT = 0; player.per.g.rotation.x = 0; removeAllPolice(); R.me = meId; R.state = null; R.remotes = {};
    setClock(TUNE.raceAt[time] || DAY.race); // 配達競争の時間は、ホストがえらぶ(時間は流れない。見た目だけ変わる)
    const sp = RACE_SPAWN[slot % 4], c0 = P(3, 3); const x = c0.x + sp[0] * sp[2] + sp[1] * 3.2, z = c0.z + sp[1] * sp[2] - sp[0] * 3.2, h = Math.atan2(sp[0], sp[1]);
    resetPlayerToFoot(x, z, h);
    if (R.myCar) removeCar(R.myCar);
    const car = R.myCar = newCar('parked', x, z, h, color || 0xffffff);
    enterCar(car);
    showOnly(null); setPlaying(true); toast(tr(G.rule === 'race' ? 'レーススタート！' : G.rule === 'tag' ? '鬼ごっこスタート！' : G.rule === 'cops' ? 'ケイドロスタート！' : G.rule === 'shoot' ? 'サバイバルスタート！ 武器を拾え' : '配達競争スタート！'), 2.2);
    // 撃ち合い(v=28): ひとり用の持ち物はとっておいて、素手・体力100で始める
    R.ev = []; R.evSeq = 0; R.evSeen = {}; R.gotN = 0; R.runCd = {}; clearItems(); G.shDown = 0; G.shInv = 0; G.dn = 0; G.by = null; G.pk = null; G.spdT = 0;
    if (G.rule === 'shoot') { if (!R.soloKeep) R.soloKeep = { hp: player.hp, inv: player.inv.slice(), wi: player.wi, ammo: player.ammo, mg: player.mg, rf: player.rf, pigs: player.pigs, snakes: player.snakes, armor: player.armor, heals: player.heals }; shootReset(); }
    else if (R.soloKeep) { Object.assign(player, R.soloKeep); R.soloKeep = null; setHand(player.per, player, player.inv[player.wi]); }
    document.body.classList.toggle('shoot', G.rule === 'shoot');
  },
  stopRace() {
    if (G.mode !== 'race') return;
    for (const id in R.avatars) dropAvatar(R.avatars[id]);
    R.avatars = {}; R.remotes = {}; R.state = null; marker.visible = false; pkgMesh.visible = false; oniMesh.visible = false;
    G.wanted = 0; G.bust = 0; G.out = false; G.rule = 'deliver'; removeAllPolice(); $('warn').textContent = '';
    clearItems(); G.shDown = 0; G.shInv = 0; player.per.g.rotation.x = 0; player.per.g.visible = true; clearStatus(player); endAim(); document.body.classList.remove('shoot'); $('blindFx').style.opacity = 0; $('hurt').style.opacity = 0;
    if (R.soloKeep) { Object.assign(player, R.soloKeep); R.soloKeep = null; setHand(player.per, player, player.inv[player.wi]); } // ひとり用の持ち物にもどす
    $('scores').innerHTML = ''; setPlaying(false); G.mode = 'menu'; resetPlayerToFoot(startX, startZ, startH); setClock(DAY.race);
  },
  // ほかの人の位置 { id: { x, z, h, c(車なら1), v } }
  setRemotes(pos) {
    const s = R.state; R.remotes = {};
    for (const id in pos || {}) {
      if (id === R.me || !s || !s.players || !s.players[id]) continue;
      R.remotes[id] = pos[id];
      if (!R.avatars[id]) { const col = s.players[id].color, star = new THREE.Mesh(BG(0.75, 0.75, 0.22), MB(0xffd23f)); star.rotation.z = Math.PI / 4; star.visible = false; scene.add(star); R.avatars[id] = { carM: makeCarMesh(col, false), type: 'sedan', cc: col, col, per: makePerson(col, 0x23324f, 0xf0c9a0), star, x: 0, z: 0, h: 0, seen: false, car: false }; }
    }
  },
  // 試合の状態(ホストが決めたもの)
  setRace(s) {
    const prev = R.state; R.state = s;
    if (s && G.rule === 'tag' && s.oni && (!prev || prev.oni !== s.oni)) { // 鬼ごっこ(v=26): 鬼が変わった
      const nm = raceName(s.oni);
      if (!prev) toast(tr(s.oni === R.me ? 'あなたが鬼！ 5秒後にタッチできる' : '{name}が鬼！ 逃げろ！', { name: nm }), 2.6);
      else { G.tagUntil = T + 3; toast(s.oni === R.me ? tr('タッチされた！ あなたが鬼') : prev.oni === R.me ? tr('タッチ！ {name}が鬼になった', { name: nm }) : tr('{name}が鬼になった', { name: nm }), 2.2); }
      return;
    }
    if (s && G.rule === 'shoot') { // 撃ち合い(v=28): ホストが「拾った」と書いたアイテムを使う
      const got = (s.got && s.got[R.me]) || []; while (R.gotN < got.length) applyItem(got[R.gotN++]);
      if (prev && prev.phase === 'play' && s.phase === 'end') { endAim(); pendShot = null; }
      return;
    }
    if (s && G.rule === 'cops') { // ケイドロ(v=27): 警察になった(始まり・つかまった)。乗っている車がパトカーに変わる
      const was = !!(prev && prev.cop && prev.cop[R.me]), now = !!(s.cop && s.cop[R.me]);
      if (now && !was) {
        kdMakeCop();
        if (!prev) toast(tr('あなたが警察！ 10秒後に追いかけられる'), 2.6);
        else { G.kdCatch = T + 3; toast(tr(s.phase === 'end' ? 'つかまった！' : 'つかまった！ 警察の仲間になった'), 2.4); }
      } else if (!prev) { const f = Object.keys(s.cop || {})[0]; toast(tr('{name}が警察！ 逃げろ！', { name: raceName(f) }), 2.6); }
      else { const nw = Object.keys(s.cop || {}).filter(id => !(prev.cop && prev.cop[id]) && id !== R.me); if (nw.length && s.phase === 'play') toast(tr('{name}がつかまった！', { name: raceName(nw[0]) }), 2.2); }
      return;
    }
    if (!s || !prev) return;
    if (G.rule === 'race') { const a = (prev.prog && prev.prog[R.me]) || 0, b = (s.prog && s.prog[R.me]) || 0; if (b > a && s.phase === 'play') toast(tr('チェックポイント {a}/{b}！', { a: b, b: (s.cps || []).length }), 1.6); return; } // レース(v=26)
    if (G.rule === 'tag') return;
    const ph = prev.pkg && prev.pkg.state === 'held' ? prev.pkg.holder : null, nh = s.pkg && s.pkg.state === 'held' ? s.pkg.holder : null;
    let scored = null; for (const id in s.scores || {}) if ((s.scores[id] || 0) > ((prev.scores && prev.scores[id]) || 0)) scored = id;
    let caught = null; for (const id in s.out || {}) if (!(prev.out && prev.out[id])) caught = id; // だれかがつかまった(v=20)
    if (caught && caught !== R.me && s.phase !== 'end') { toast(tr(ph === caught ? '{name}がつかまった！ 荷物が落ちたぞ' : '{name}がつかまった！', { name: raceName(caught) }), 2.6); return; }
    if (scored) toast(tr('{who}が配達成功！ {n}点', { who: scored === R.me ? tr('あなた') : raceName(scored), n: s.scores[scored] }), 2.4);
    else if (nh && nh !== ph) {
      if (nh === R.me) toast(tr(ph ? '荷物を奪った！' : '荷物ゲット！ 届け先へ急げ'), 2);
      else if (ph === R.me) toast(tr('{name}に荷物を奪われた！', { name: raceName(nh) }), 2);
      else toast(tr(ph ? '{name}が荷物を奪った' : '{name}が荷物を取った', { name: raceName(nh) }), 2);
    }
  },
  // 自分の位置。w = 手配中、out = つかまった、p = 自分を追うパトカー、k = 降りている警察官(v=20)
  getMe() {
    const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100;
    const me = { x: r1(player.x), z: r1(player.z), h: r2(player.h), c: player.mode === 'car' ? 1 : 0, v: r1(player.v || 0) };
    if (player.mode === 'car') { const t = CAR_KEYS.indexOf(player.car.type); if (t > 0) me.t = t; if (player.car.color !== undefined) me.cc = player.car.color >>> 0; if (player.car.cop) me.pc = 1; } // 乗っている車の種類(0 = セダンは送らない)と色(v=21)
    if (shootOn()) { // 撃ち合い(v=28)
      R.ev = R.ev.filter(e => T - e[1] < SHOOT_T.evKeep); if (R.ev.length) me.ev = R.ev.map(e => [e[0], ...e.slice(2)]);
      if (G.dn) { me.dn = G.dn; if (G.by) me.by = G.by; } if (G.pk) me.pk = G.pk;
      const wk = player.inv[player.wi]; if (wk && wk !== 'fist' && player.mode === 'foot') me.wk = wk;
      const st = player.frozen > 0 ? 2 : player.blind > 0 ? 1 : 0; if (st) me.st = st; if (G.shDown > 0) me.dd = 1; if (T < G.shInv) me.iv = 1;
      if (player.roof) me.rf = ROOFS.indexOf(player.roof) + 1; // 屋上にいる(v=29)
    }
    if (G.mode === 'race') {
      if (G.out) me.out = 1; else if (G.wanted) me.w = 1;
      const pc = cars.find(c => c.kind === 'police'); if (pc) me.p = [r1(pc.x), r1(pc.z), r2(pc.h)];
      const ks = npcs.filter(n => n.kind === 'cop' && n.hp > 0).slice(0, 3).map(n => [r1(n.x), r1(n.z), r2(n.h)]); if (ks.length) me.k = ks;
    }
    return me;
  },
  toast,
};
applyEnv(G.clock);
requestAnimationFrame(frame);
})();
