/* オンラインの通信係(配達競争・レース・鬼ごっこ。v=26 でルールをえらべるようにした)
   - みんな: 自分の位置を pos/自分のID に送る(1秒に8回くらい)。ほかの人の位置を見張って画面に出す
   - ホストだけ: みんなの位置を見て、荷物を取った・届けた・奪ったを決めて game に書く
   game(sc-rooms/1234/game):
     { id: 試合の番号, phase: 'play' | 'end', target: 何点先取, rev: 書きかえた回数,
       players: { 人のID: { name, color, slot } },
       scores:  { 人のID: 点数 },
       pkg:  { state: 'free' | 'held', x, z, holder: 持っている人のID, since: 持った時刻(ホストの時計) },
       dest: { x, z } (届け先。持っている人がいるときだけ),
       winner: 勝った人のID(引き分けのときは null),
       time: 'day' | 'eve' | 'night'(ホストが待合室でえらんだ時間。見た目だけ),
       out: { 人のID: true }(警察につかまった人。v=20), how: 'points'(点) | 'last'(のこり1人) | 'caught'(みんなつかまって点の多い人) | 'draw'(引き分け),
       rule: 'deliver'(配達競争) | 'race'(レース) | 'tag'(鬼ごっこ) | 'cops'(ケイドロ。v=27)(v=26。ないときは配達競争),
       レース: cps: [{ x, z }, …](チェックポイント。みんな同じ順番), prog: { 人のID: 通った数 },
       鬼ごっこ: oni: 鬼の人のID, since: 鬼になった時刻(ホストの時計。このあと tagGuard ミリ秒はタッチできない), endAt: 終わる時刻(ホストの時計),
                 left: のこり秒(ホストが1秒ごとに書く), oniT: { 人のID: 鬼だった秒 }, loser: 最後に鬼だった人,
       ケイドロ(v=27): cop: { 人のID: true }(警察。つかまった人も入る), first: 最初の警察, startAt: 始まった時刻, endAt, left,
                 copAt: { 人のID: つかまえられるようになる時刻 }, caughtT: { 人のID: つかまった秒(始まってから) },
                 how: 'cops'(みんなつかまった) | 'escape'(逃げ切った人がいる),
       撃ち合い(v=28): endAt, left, kills: { 人のID: たおした数 }, deaths: { 人のID: やられた数 },
                 items: [{ k: アイテムの種類, x, z, on: 出ているか, g: 何回目か, at: また出る時刻(ホストの時計) }], got: { 人のID: [拾った種類, …] }(順に足していく) }
   pos(sc-rooms/1234/pos/人のID): { x, z, h, c, v, t(車の種類), cc(車の色), w(手配中), out(つかまった), p(パトカー), k(警察官) } … main.js の getMe。g = 試合の番号 */
import { db, ref, set, update, onValue, onDisconnect } from "./firebase.js?v=31";

/* ===== 調整用の数字 ===== */
export const RACE = {
  target: 3,        // 何点先取
  pickDist: 5,      // 荷物を取れる距離
  deliverDist: 6,   // 届けたことになる距離
  stealDist: 4.8,   // ぶつかって奪える距離(車どうしは 4 で押し返されるので、それより少し大きく)
  stealGuard: 3000, // 奪った(取った)直後、奪い返されない時間(ミリ秒)
  destMin: 120, destMax: 260, // 届け先までの距離
};
// レース(v=26): cps = チェックポイントの数、cpDist = 通ったことになる距離、next = 次のチェックポイントまでの距離(いちばん近い〜遠い)、apart = ほかのチェックポイントとはなす距離
export const RUN = { cps: 8, cpDist: 7, nextMin: 70, nextMax: 150, apart: 45 };
// 鬼ごっこ(v=26): time = 試合の秒、tagDist = タッチできる距離、tagGuard = 鬼が交代したあと、タッチできないミリ秒、startGuard = 始まってから、タッチできないミリ秒
export const TAG = { time: 180, tagDist: 4.8, tagGuard: 3000, startGuard: 5000 };
// ケイドロ(v=27): time = 試合の秒、catchDist = つかまえられる距離、freeze = 最初の警察が動けないミリ秒、guard = つかまって警察になった人が、つかまえられるようになるまでのミリ秒
export const KD = { time: 240, catchDist: 4.8, freeze: 10000, guard: 3000 };
// サバイバル(v=28 撃ち合い。v=29 で名前を変えた): time = 試合の秒、respawn = 拾ったアイテムがまた出る秒、pickDist = 拾える距離、apart = アイテムどうしをはなす距離、items = 街に置く数
export const SHOOT = { time: 180, respawn: 30, pickDist: 3.2, apart: 25,
  items: { pistol: 4, mg: 2, rifle: 2, knife: 2, katana: 1, pig: 2, snake: 2, ammo: 3, vest: 2, heal: 2, speed: 2 } }; // rifle は v=29
export const RULES = ["deliver", "race", "tag", "cops", "shoot"]; // ホストがえらべるルール(はじめは配達競争)
const COLORS = [0xff4a4a, 0x3c8cff, 0x3fd06a, 0xffb020];
export const TIMES = ["day", "eve", "night"]; // ホストがえらべる時間(はじめは夜)

export const roomPath = code => "sc-rooms/" + code;
const $ = id => document.getElementById(id);
const tr = window.t || (k => k); // ことば(i18n.js)
const SC = window.SC;

// 荷物と届け先が出る場所(道路の真ん中あたり)
const SPOTS = (() => {
  const out = [];
  for (let k = 0; k <= 6; k++) for (let a = 0; a < 6; a++) {
    const p = SC.P(a, k), q = SC.P(k, a);
    if (!SC.onRoad || SC.onRoad(p.x + 26, p.z)) out.push({ x: p.x + 26, z: p.z });
    if (!SC.onRoad || SC.onRoad(q.x, q.z + 26)) out.push({ x: q.x, z: q.z + 26 });
  }
  for (const p of SC.extraSpots || []) out.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }); // 市場・公園・ビルの前・駐車場
  return out;
})();
const ROAD = SPOTS.slice(0, SPOTS.length - (SC.extraSpots || []).length); // 道路の上だけ(レースのチェックポイント。市場などの中には置かない)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pickSpot(ok) { const c = SPOTS.filter(ok); const list = c.length ? c : SPOTS; return { ...list[Math.floor(Math.random() * list.length)] }; }
function newPkg(avoid) { const s = pickSpot(p => !avoid || dist(p, avoid) > 90); return { state: "free", x: s.x, z: s.z }; }
function pickDest(from) { return pickSpot(p => { const d = dist(p, from); return d > RACE.destMin && d < RACE.destMax; }); }

// レースのチェックポイント: まん中の交差点から、つぎつぎに少しはなれた道の上をえらぶ
function makeCps() {
  const out = []; let from = SC.P(3, 3);
  for (let i = 0; i < RUN.cps; i++) {
    let c = ROAD.filter(p => { const d = dist(p, from); return d > RUN.nextMin && d < RUN.nextMax && out.every(q => dist(p, q) > RUN.apart); });
    if (!c.length) c = ROAD.filter(p => out.every(q => dist(p, q) > 20));
    const p = c.length ? c[Math.floor(Math.random() * c.length)] : ROAD[i]; out.push({ x: p.x, z: p.z }); from = p;
  }
  return out;
}
// 撃ち合いのアイテムの場所: ほかのアイテム・まん中のスタートから少しはなす
function itemSpot(items, avoid) { return pickSpot(p => dist(p, SC.P(3, 3)) > 15 && items.every(q => q === avoid || dist(p, q) > SHOOT.apart) && (!avoid || dist(p, avoid) > 40)); }
// 新しい試合(ロビーのスタートと「もう一度」で使う)。list は入った順の参加者。rule = ルール(v=26)
export function makeGame(list, time, rule) {
  const players = {}, ru = RULES.includes(rule) ? rule : "deliver";
  list.slice(0, 4).forEach((p, i) => { players[p.id] = { name: (p.name || "?").slice(0, 10), color: COLORS[i], slot: i }; });
  const g = { id: Math.random().toString(36).slice(2, 10), phase: "play", rule: ru, rev: 0, players, winner: null, time: TIMES.includes(time) ? time : "night" };
  if (ru === "race") { g.cps = makeCps(); g.prog = {}; }
  else if (ru === "tag") { const ids = Object.keys(players), now = Date.now(); g.oni = ids[Math.floor(Math.random() * ids.length)]; g.since = now + TAG.startGuard - TAG.tagGuard; g.endAt = now + TAG.time * 1000; g.left = TAG.time; g.oniT = {}; }
  else if (ru === "cops") { const ids = Object.keys(players), now = Date.now(), f = ids[Math.floor(Math.random() * ids.length)]; Object.assign(g, { cop: { [f]: true }, first: f, startAt: now, endAt: now + KD.time * 1000, left: KD.time, copAt: { [f]: now + KD.freeze }, caughtT: {} }); }
  else if (ru === "shoot") { const now = Date.now(), items = []; for (const k in SHOOT.items) for (let i = 0; i < SHOOT.items[k]; i++) { const p = itemSpot(items); items.push({ k, x: p.x, z: p.z, on: true, g: 0, at: 0 }); } Object.assign(g, { endAt: now + SHOOT.time * 1000, left: SHOOT.time, kills: {}, deaths: {}, items, got: {} }); }
  else Object.assign(g, { target: RACE.target, scores: {}, pkg: newPkg(SC.P(3, 3)), dest: null });
  return g;
}
export const ruleOf = g => (g && RULES.includes(g.rule) ? g.rule : "deliver");

let cur = null;       // 今の試合 { code, uid, gameId, resultShown, looked }
let room = null;      // ロビーからもらったルームのデータ
let positions = {};   // みんなの位置
let hs = null;        // ホストが覚えている試合の状態(書いたらすぐ反映する)
let unsubPos = null, hostTimer = null;

// ロビーから、ルームが変わるたびに呼ばれる。試合中なら true を返す
export function sync(r, uid, code) {
  if (!r) { stop(); return false; }
  room = r;
  const g = r.game, started = r.meta && r.meta.started;
  if (!started || !g || !g.players || !g.players[uid]) { stop(); return false; }
  if (!cur || cur.code !== code || cur.gameId !== g.id) { stop(); begin(uid, code, g); }
  if (!hs || hs.id !== g.id || (g.rev || 0) >= (hs.rev || 0)) hs = JSON.parse(JSON.stringify(g));
  SC.setRace(g);
  SC.setRemotes(positions);
  showResult(g);
  return true;
}

function begin(uid, code, g) {
  cur = { code, uid, gameId: g.id, resultShown: false };
  positions = {};
  const me = g.players[uid];
  SC.startRace(uid, me.slot || 0, me.color, g.time, ruleOf(g)); tagLast = 0;
  const myPos = ref(db, roomPath(code) + "/pos/" + uid);
  onDisconnect(myPos).remove();
  SC.onSend = p => set(myPos, { ...p, g: g.id }).catch(() => {}); // g = どの試合の位置か(前の試合の「つかまった」が残らないように)
  SC.onQuit = quit;
  unsubPos = onValue(ref(db, roomPath(code) + "/pos"), snap => { positions = snap.val() || {}; SC.setRemotes(positions); });
  hostTimer = setInterval(hostTick, 100);
  if (window.BackGuard) BackGuard.set("game", quit);
}

function stop() {
  if (!cur) return;
  const c = cur; cur = null;
  if (unsubPos) { unsubPos(); unsubPos = null; }
  clearInterval(hostTimer); hostTimer = null;
  SC.onSend = null; SC.onQuit = null;
  onDisconnect(ref(db, roomPath(c.code) + "/pos/" + c.uid)).cancel().catch(() => {});
  hs = null; positions = {};
  $("result").classList.add("hidden");
  SC.stopRace();
}

// 「やめる」: ホストなら全員をロビーにもどす。ほかの人は自分だけ試合から抜ける
function quit() {
  if (!cur || !room) return;
  SC.onSend = null; // すぐに位置を送るのをやめる(消したあとに、自分の位置がまた書かれないように)
  const path = roomPath(cur.code);
  if (room.meta.host === cur.uid) update(ref(db, path), { "meta/started": false, game: null, pos: null }).catch(console.error);
  else update(ref(db, path), { ["game/players/" + cur.uid]: null, ["pos/" + cur.uid]: null }).catch(console.error);
}

const isOn = id => room && room.players && room.players[id] && room.players[id].online !== false;

/* ===== ホストの仕事 ===== */
function hostTick() {
  if (!cur || !room || !room.meta || room.meta.host !== cur.uid || !hs || hs.phase !== "play") return;
  const now = Date.now();
  const pl = {};
  let changed = false;
  hs.out = hs.out || {};
  for (const id in hs.players) {
    const p = id === cur.uid ? { ...SC.getMe(), g: hs.id } : positions[id] && isOn(id) ? positions[id] : null;
    if (!p) continue;
    if (p.out && p.g === hs.id && !hs.out[id]) { // 警察につかまった(v=20)。荷物を持っていたら、その場に落ちる
      hs.out = { ...hs.out, [id]: true }; changed = true;
      if (hs.pkg && hs.pkg.state === "held" && hs.pkg.holder === id) { hs.pkg = { state: "free", x: p.x, z: p.z }; hs.dest = null; }
    }
    if (!hs.out[id]) pl[id] = p; // つかまった人は、荷物を取れない・奪えない
  }
  if (ruleOf(hs) === "race") return hostRace(pl);
  if (ruleOf(hs) === "tag") return hostTag(pl, now);
  if (ruleOf(hs) === "cops") return hostCops(pl, now);
  if (ruleOf(hs) === "shoot") return hostShoot(now);
  if (lastOne()) return write(); // つかまった人がいて、のこり1人以下なら終わり(ぬけた人がいても)
  const pkg = hs.pkg || newPkg();
  if (pkg.state !== "held") {
    let best = null, bd = RACE.pickDist;
    for (const id in pl) { const d = dist(pl[id], pkg); if (d < bd) { bd = d; best = id; } }
    if (best) { hs.pkg = { state: "held", holder: best, since: now, x: pkg.x, z: pkg.z }; hs.dest = pickDest(pkg); changed = true; }
  } else {
    const h = pkg.holder, hp = pl[h];
    if (!hp) { hs.pkg = newPkg(); hs.dest = null; changed = true; } // 持っている人が抜けた → 荷物は別の場所へ
    else if (hs.dest && dist(hp, hs.dest) < RACE.deliverDist) {
      const scores = { ...(hs.scores || {}) }; scores[h] = (scores[h] || 0) + 1; hs.scores = scores;
      if (scores[h] >= (hs.target || RACE.target)) { hs.phase = "end"; hs.winner = h; hs.how = "points"; hs.pkg = { state: "free", x: hs.dest.x, z: hs.dest.z }; }
      else hs.pkg = newPkg(hs.dest);
      hs.dest = null; changed = true;
    } else if (now - (pkg.since || 0) > RACE.stealGuard) {
      let best = null, bd = RACE.stealDist;
      for (const id in pl) { if (id === h) continue; const d = dist(pl[id], hp); if (d < bd) { bd = d; best = id; } }
      if (best) { hs.pkg = { state: "held", holder: best, since: now, x: pkg.x, z: pkg.z }; changed = true; }
    }
  }
  if (changed) write();
}
function write() {
  hs.rev = (hs.rev || 0) + 1;
  const r = ruleOf(hs), w = { phase: hs.phase, winner: hs.winner || null, rev: hs.rev };
  if (r === "race") w.prog = hs.prog || null;
  else if (r === "tag") Object.assign(w, { oni: hs.oni || null, since: hs.since || 0, left: hs.left, oniT: hs.oniT || null, loser: hs.loser || null });
  else if (r === "shoot") Object.assign(w, { kills: hs.kills || null, deaths: hs.deaths || null, items: hs.items || null, got: hs.got || null, left: hs.left });
  else if (r === "cops") Object.assign(w, { cop: hs.cop || null, copAt: hs.copAt || null, caughtT: hs.caughtT || null, left: hs.left, how: hs.how || null });
  else Object.assign(w, { pkg: hs.pkg, dest: hs.dest || null, scores: hs.scores || null, out: hs.out && Object.keys(hs.out).length ? hs.out : null, how: hs.how || null });
  update(ref(db, roomPath(cur.code) + "/game"), w).catch(console.error);
}
// レース(v=26): 次のチェックポイントに近づいたら、通った数を1ふやす。ぜんぶ通った人の勝ち
function hostRace(pl) {
  const cps = hs.cps || [], prog = { ...(hs.prog || {}) }; let changed = false;
  for (const id in pl) {
    const n = prog[id] || 0; if (n >= cps.length) continue;
    if (dist(pl[id], cps[n]) < RUN.cpDist) { prog[id] = n + 1; changed = true; if (n + 1 >= cps.length && hs.phase === "play") { hs.phase = "end"; hs.winner = id; } }
  }
  if (changed) { hs.prog = prog; write(); }
}
// 鬼ごっこ(v=26): 鬼がぶつかると交代。時間切れのときに鬼だった人の負け
let tagLast = 0;
function hostTag(pl, now) {
  let changed = false; const dt = tagLast ? Math.min(1, (now - tagLast) / 1000) : 0; tagLast = now;
  if (!hs.players[hs.oni]) { const ids = Object.keys(hs.players); hs.oni = ids[Math.floor(Math.random() * ids.length)] || null; hs.since = now; changed = true; } // 鬼がぬけた → だれかが鬼
  const oni = hs.oni, op = pl[oni];
  if (oni) { const t = { ...(hs.oniT || {}) }; t[oni] = Math.round(((t[oni] || 0) + dt) * 10) / 10; hs.oniT = t; }
  if (op && now - (hs.since || 0) > TAG.tagGuard) {
    let best = null, bd = TAG.tagDist;
    for (const id in pl) { if (id === oni) continue; const d = dist(pl[id], op); if (d < bd) { bd = d; best = id; } }
    if (best) { hs.oni = best; hs.since = now; changed = true; }
  }
  const left = Math.max(0, Math.ceil(((hs.endAt || now) - now) / 1000));
  if (left !== hs.left) { hs.left = left; changed = true; }
  if (left <= 0 && hs.phase === "play") { hs.phase = "end"; hs.loser = hs.oni; hs.winner = null; changed = true; }
  if (changed) write();
}
// ケイドロ(v=27): 警察がぶつかると、つかまって警察の仲間になる。時間まで逃げ切った人の勝ち。みんなつかまったら警察の勝ち
function hostCops(pl, now) {
  let changed = false; const cop = { ...(hs.cop || {}) }, copAt = { ...(hs.copAt || {}) }, caughtT = { ...(hs.caughtT || {}) };
  const ids = Object.keys(hs.players), sec = () => Math.round((now - (hs.startAt || now)) / 100) / 10;
  if (!ids.some(id => cop[id])) { const run = ids.filter(id => !cop[id]); if (run.length) { const id = run[Math.floor(Math.random() * run.length)]; cop[id] = true; copAt[id] = now + KD.guard; caughtT[id] = sec(); changed = true; } } // 警察がみんなぬけた → だれかが警察
  for (const c in pl) {
    if (!cop[c] || now < (copAt[c] || 0)) continue;
    for (const r in pl) if (!cop[r] && dist(pl[r], pl[c]) < KD.catchDist) { cop[r] = true; copAt[r] = now + KD.guard; caughtT[r] = sec(); changed = true; }
  }
  if (changed) { hs.cop = cop; hs.copAt = copAt; hs.caughtT = caughtT; }
  const left = Math.max(0, Math.ceil(((hs.endAt || now) - now) / 1000));
  if (left !== hs.left) { hs.left = left; changed = true; }
  if (hs.phase === "play" && ids.length && ids.every(id => cop[id])) { hs.phase = "end"; hs.how = "cops"; hs.winner = null; changed = true; }
  else if (hs.phase === "play" && left <= 0) { hs.phase = "end"; hs.how = "escape"; hs.winner = null; changed = true; }
  if (changed) write();
}
// 撃ち合い(v=28): やられた数(各スマホが送る dn と、たおした人 by)を数える。アイテムを拾う(各スマホが送る pk = [番号, 何回目か])。時間切れで、たおした数がいちばん多い人の勝ち
//   当たったかどうかは、撃った人のスマホが決めて、撃たれた人のスマホが体力をへらす(main.js)
const lastPk = {};
function hostShoot(now) {
  let changed = false; const ids = Object.keys(hs.players);
  const kills = { ...(hs.kills || {}) }, deaths = { ...(hs.deaths || {}) }, items = (hs.items || []).map(it => ({ ...it })), got = { ...(hs.got || {}) };
  for (const id of ids) {
    const p = id === cur.uid ? { ...SC.getMe(), g: hs.id } : positions[id] && isOn(id) ? positions[id] : null;
    if (!p || p.g !== hs.id) continue;
    if ((p.dn || 0) > (deaths[id] || 0)) { const n = p.dn - (deaths[id] || 0); deaths[id] = p.dn; if (p.by && p.by !== id && hs.players[p.by]) kills[p.by] = (kills[p.by] || 0) + n; changed = true; }
    if (p.pk && hs.phase === "play") { const [i, gen] = p.pk, it = items[i], key = id + ":" + i + ":" + gen;
      if (it && it.on && it.g === gen && lastPk[key] !== true && dist(p, it) < SHOOT.pickDist + 2) { lastPk[key] = true; it.on = false; it.at = now + SHOOT.respawn * 1000; got[id] = [...(got[id] || []), it.k]; changed = true; } }
  }
  for (const it of items) if (!it.on && now >= (it.at || 0)) { const s = itemSpot(items, it); it.x = s.x; it.z = s.z; it.on = true; it.g = (it.g || 0) + 1; changed = true; } // 30秒たったら、別の場所にまた出る
  if (changed) { hs.kills = kills; hs.deaths = deaths; hs.items = items; hs.got = got; }
  const left = Math.max(0, Math.ceil(((hs.endAt || now) - now) / 1000));
  if (left !== hs.left) { hs.left = left; changed = true; }
  if (hs.phase === "play" && left <= 0) { hs.phase = "end"; const k = id => kills[id] || 0, top = Math.max(0, ...ids.map(k)), best = ids.filter(id => k(id) === top); hs.winner = best.length === 1 && top > 0 ? best[0] : null; changed = true; }
  if (changed) write();
}
// みんなつかまって、のこり1人なら勝ち。同時にのこり0人になったら、点の多い人の勝ち(同じ点なら引き分け)
//   試合 g を見て、終わりなら { winner, how } を返す(まだなら null)。テストからも使う
export function judge(g) {
  const out = g.out || {}, ids = Object.keys(g.players || {}), left = ids.filter(id => !out[id]);
  if (left.length > 1 || !Object.keys(out).length) return null;
  if (left.length === 1) return { winner: left[0], how: "last" };
  const sc = id => (g.scores && g.scores[id]) || 0, top = Math.max(...ids.map(sc)), best = ids.filter(id => sc(id) === top);
  return best.length === 1 ? { winner: best[0], how: "caught" } : { winner: null, how: "draw" };
}
function lastOne() {
  const r = judge(hs); if (!r) return false;
  hs.phase = "end"; hs.dest = null; hs.winner = r.winner; hs.how = r.how;
  if (hs.pkg && hs.pkg.state === "held") { const p = hs.pkg; hs.pkg = { state: "free", x: p.x, z: p.z }; }
  return true;
}

/* ===== 結果画面 ===== */
function showResult(g) {
  if (g.phase !== "end") { $("result").classList.add("hidden"); return; }
  if (cur.resultShown) return;
  cur.resultShown = true;
  const iAmHost = room.meta.host === cur.uid;
  const name = id => (g.players[id] ? g.players[id].name : "?"), rule = ruleOf(g);
  const run = rule === "cops" ? Object.keys(g.players).filter(id => !(g.cop && g.cop[id])) : [];
  if (rule === "cops") $("resTitle").textContent = g.how === "cops" || !run.length ? tr("警察の勝ち！") : run.includes(cur.uid) ? tr("あなたの勝ち！") : run.length === 1 ? tr("{name} の勝ち！", { name: name(run[0]) }) : tr("逃げ切った人の勝ち！");
  else if (rule === "tag") $("resTitle").textContent = g.loser === cur.uid ? tr("あなたの負け…") : g.loser ? tr("{name} の負け！", { name: name(g.loser) }) : tr("おわり！");
  else $("resTitle").textContent = !g.winner ? tr("引き分け！") : g.winner === cur.uid ? tr("あなたの勝ち！") : tr("{name} の勝ち！", { name: name(g.winner) });
  $("resNote").textContent = rule === "race" ? tr("チェックポイント{n}つのレース", { n: (g.cps || []).length }) : rule === "tag" ? tr("{n}分の鬼ごっこ。最後に鬼だった人の負け", { n: Math.round(TAG.time / 60) })
    : rule === "shoot" ? tr("{n}分のサバイバル。たおした数がいちばん多い人の勝ち", { n: Math.round(SHOOT.time / 60) })
    : rule === "cops" ? (g.how === "cops" || !run.length ? tr("みんな警察につかまった") : tr("{n}分のケイドロ。逃げ切った人の勝ち", { n: Math.round(KD.time / 60) }))
    : g.how === "last" ? tr("ほかの人がみんな警察につかまった") : g.how === "draw" ? tr("みんな警察につかまった(同じ点)") : g.how === "caught" ? tr("みんな警察につかまった(点の多い人の勝ち)") : tr("{n}点先取の配達競争", { n: g.target || RACE.target });
  const ol = $("resList"); ol.textContent = "";
  const kdT = id => run.includes(id) ? KD.time : g.caughtT && typeof g.caughtT[id] === "number" ? g.caughtT[id] : 0; // ケイドロ: 逃げた秒(逃げ切った人は試合の秒、最初の警察は0)
  const stK = id => (g.kills && g.kills[id]) || 0, stD = id => (g.deaths && g.deaths[id]) || 0;
  const val = id => rule === "shoot" ? stK(id) * 1000 - stD(id) : rule === "cops" ? kdT(id) : rule === "race" ? (g.prog && g.prog[id]) || 0 : rule === "tag" ? -((g.oniT && g.oniT[id]) || 0) : (g.scores && g.scores[id]) || 0; // 上から、よかった順(鬼ごっこは、鬼だった時間が短い順)
  const ids = Object.keys(g.players).sort((a, b) => val(b) - val(a));
  for (const id of ids) {
    const li = document.createElement("li");
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = "#" + g.players[id].color.toString(16).padStart(6, "0");
    const t = document.createElement("span"); t.textContent = name(id) + "　" + (rule === "shoot" ? tr("たおした {a}・やられた {b}", { a: stK(id), b: stD(id) }) : rule === "cops" ? (id === g.first ? tr("最初の警察") : tr("逃げ {n}秒", { n: Math.round(val(id)) })) : rule === "race" ? tr("{a}/{b}", { a: val(id), b: (g.cps || []).length }) : rule === "tag" ? tr("鬼 {n}秒", { n: Math.round(-val(id)) }) : tr("{n}点", { n: val(id) }));
    li.append(dot, t);
    const tags = []; if (id === cur.uid) tags.push(tr("あなた")); if (g.out && g.out[id]) tags.push(tr("つかまった")); if (rule === "tag" && g.loser === id) tags.push(tr("最後の鬼")); if (rule === "cops" && run.includes(id)) tags.push(tr("逃げ切った"));
    if (tags.length) { const s = document.createElement("small"); s.textContent = " " + tags.join("・"); li.append(s); }
    ol.append(li);
  }
  $("resAgain").classList.toggle("hidden", !iAmHost);
  $("resLobby").classList.toggle("hidden", !iAmHost);
  $("resWait").classList.toggle("hidden", iAmHost);
  $("result").classList.remove("hidden");
}
$("resLook").addEventListener("click", () => $("result").classList.add("hidden"));
$("resAgain").addEventListener("click", () => {
  if (!cur || !room || room.meta.host !== cur.uid) return;
  const list = Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p })).filter(p => p.online !== false)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || (a.id < b.id ? -1 : 1));
  update(ref(db, roomPath(cur.code)), { game: makeGame(list, room.meta.time, room.meta.rule), pos: null }).catch(console.error);
});
$("resLobby").addEventListener("click", () => {
  if (!cur || !room || room.meta.host !== cur.uid) return;
  update(ref(db, roomPath(cur.code)), { "meta/started": false, game: null, pos: null }).catch(console.error);
});
