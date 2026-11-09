/* オンラインの通信係(配達競争)
   - みんな: 自分の位置を pos/自分のID に送る(1秒に8回くらい)。ほかの人の位置を見張って画面に出す
   - ホストだけ: みんなの位置を見て、荷物を取った・届けた・奪ったを決めて game に書く
   game(sc-rooms/1234/game):
     { id: 試合の番号, phase: 'play' | 'end', target: 何点先取, rev: 書きかえた回数,
       players: { 人のID: { name, color, slot } },
       scores:  { 人のID: 点数 },
       pkg:  { state: 'free' | 'held', x, z, holder: 持っている人のID, since: 持った時刻(ホストの時計) },
       dest: { x, z } (届け先。持っている人がいるときだけ),
       winner: 勝った人のID } */
import { db, ref, set, update, onValue, onDisconnect } from "./firebase.js?v=3";

/* ===== 調整用の数字 ===== */
export const RACE = {
  target: 3,        // 何点先取
  pickDist: 5,      // 荷物を取れる距離
  deliverDist: 6,   // 届けたことになる距離
  stealDist: 4.8,   // ぶつかって奪える距離(車どうしは 4 で押し返されるので、それより少し大きく)
  stealGuard: 3000, // 奪った(取った)直後、奪い返されない時間(ミリ秒)
  destMin: 120, destMax: 260, // 届け先までの距離
};
const COLORS = [0xff4a4a, 0x3c8cff, 0x3fd06a, 0xffb020];

export const roomPath = code => "sc-rooms/" + code;
const $ = id => document.getElementById(id);
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
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pickSpot(ok) { const c = SPOTS.filter(ok); const list = c.length ? c : SPOTS; return { ...list[Math.floor(Math.random() * list.length)] }; }
function newPkg(avoid) { const s = pickSpot(p => !avoid || dist(p, avoid) > 90); return { state: "free", x: s.x, z: s.z }; }
function pickDest(from) { return pickSpot(p => { const d = dist(p, from); return d > RACE.destMin && d < RACE.destMax; }); }

// 新しい試合(ロビーのスタートと「もう一度」で使う)。list は入った順の参加者
export function makeGame(list) {
  const players = {};
  list.slice(0, 4).forEach((p, i) => { players[p.id] = { name: (p.name || "?").slice(0, 10), color: COLORS[i], slot: i }; });
  const first = newPkg(SC.P(3, 3));
  return { id: Math.random().toString(36).slice(2, 10), phase: "play", target: RACE.target, rev: 0, players, scores: {}, pkg: first, dest: null, winner: null };
}

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
  SC.startRace(uid, me.slot || 0, me.color);
  const myPos = ref(db, roomPath(code) + "/pos/" + uid);
  onDisconnect(myPos).remove();
  SC.onSend = p => set(myPos, p).catch(() => {});
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
  for (const id in hs.players) {
    if (id === cur.uid) pl[id] = SC.getMe();
    else if (positions[id] && isOn(id)) pl[id] = positions[id];
  }
  const pkg = hs.pkg || newPkg();
  let changed = false;
  if (pkg.state !== "held") {
    let best = null, bd = RACE.pickDist;
    for (const id in pl) { const d = dist(pl[id], pkg); if (d < bd) { bd = d; best = id; } }
    if (best) { hs.pkg = { state: "held", holder: best, since: now, x: pkg.x, z: pkg.z }; hs.dest = pickDest(pkg); changed = true; }
  } else {
    const h = pkg.holder, hp = pl[h];
    if (!hp) { hs.pkg = newPkg(); hs.dest = null; changed = true; } // 持っている人が抜けた → 荷物は別の場所へ
    else if (hs.dest && dist(hp, hs.dest) < RACE.deliverDist) {
      const scores = { ...(hs.scores || {}) }; scores[h] = (scores[h] || 0) + 1; hs.scores = scores;
      if (scores[h] >= (hs.target || RACE.target)) { hs.phase = "end"; hs.winner = h; hs.pkg = { state: "free", x: hs.dest.x, z: hs.dest.z }; }
      else hs.pkg = newPkg(hs.dest);
      hs.dest = null; changed = true;
    } else if (now - (pkg.since || 0) > RACE.stealGuard) {
      let best = null, bd = RACE.stealDist;
      for (const id in pl) { if (id === h) continue; const d = dist(pl[id], hp); if (d < bd) { bd = d; best = id; } }
      if (best) { hs.pkg = { state: "held", holder: best, since: now, x: pkg.x, z: pkg.z }; changed = true; }
    }
  }
  if (!changed) return;
  hs.rev = (hs.rev || 0) + 1;
  update(ref(db, roomPath(cur.code) + "/game"), { pkg: hs.pkg, dest: hs.dest || null, scores: hs.scores || null, phase: hs.phase, winner: hs.winner || null, rev: hs.rev }).catch(console.error);
}

/* ===== 結果画面 ===== */
function showResult(g) {
  if (g.phase !== "end") { $("result").classList.add("hidden"); return; }
  if (cur.resultShown) return;
  cur.resultShown = true;
  const iAmHost = room.meta.host === cur.uid;
  const name = id => (g.players[id] ? g.players[id].name : "?");
  $("resTitle").textContent = g.winner === cur.uid ? "あなたの勝ち！" : name(g.winner) + " の勝ち！";
  $("resNote").textContent = (g.target || RACE.target) + "点先取の配達競争";
  const ol = $("resList"); ol.textContent = "";
  const ids = Object.keys(g.players).sort((a, b) => ((g.scores && g.scores[b]) || 0) - ((g.scores && g.scores[a]) || 0));
  for (const id of ids) {
    const li = document.createElement("li");
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = "#" + g.players[id].color.toString(16).padStart(6, "0");
    const t = document.createElement("span"); t.textContent = name(id) + "　" + ((g.scores && g.scores[id]) || 0) + "点";
    li.append(dot, t);
    if (id === cur.uid) { const s = document.createElement("small"); s.textContent = " あなた"; li.append(s); }
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
  update(ref(db, roomPath(cur.code)), { game: makeGame(list), pos: null }).catch(console.error);
});
$("resLobby").addEventListener("click", () => {
  if (!cur || !room || room.meta.host !== cur.uid) return;
  update(ref(db, roomPath(cur.code)), { "meta/started": false, game: null, pos: null }).catch(console.error);
});
