/* ロビー(配達競争の待合室)
   名前を入れる → ルームを作る(4桁のコード) or コードで参加 → 待合室 → ホストがスタート
   ルームのデータは sc-rooms/1234 に置く:
     meta:    { host: ホストの人のID, started: 始まったか, created: 作った時刻 }
     players: { 人のID: { name: 名前, joinedAt: 入った時刻, online: つながっているか } }
     game:    試合の状態(online.js が書く)
     pos:     みんなの位置(online.js が書く。1秒に8回くらい変わるので、ロビーは見張らない) */
import {
  db, auth, ref, get, set, update, remove, onValue,
  onDisconnect, serverTimestamp, runTransaction, signInAnonymously
} from "./firebase.js?v=22";
import { sync as syncGame, makeGame, roomPath, TIMES } from "./online.js?v=22";

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const NAME_KEY = "sc_name"; // スマホが覚えておく名前
const ROOM_KEY = "sc_room"; // 最後に入っていたルーム(ページを開き直したら戻れるように)

const $ = id => document.getElementById(id);
const tr = window.t || (k => k); // ことば(i18n.js)
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 覚えられなくても遊べる */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

let uid = null;     // 自分のID(Firebase の匿名ログインでもらう)
let code = null;    // 今いるルームのコード
let room = null;    // 今いるルームのデータ { meta, players, game }
let unsubs = [];    // 見張りをやめる関数
let lastView = "";  // 待合室の表示に使うデータ(変わったときだけ描き直す)

/* ---------- 画面の切りかえ ---------- */
function showLobby(view) {
  window.SC.showOnly("lobby");
  $("lbEntry").classList.toggle("hidden", view !== "entry");
  $("lbRoom").classList.toggle("hidden", view !== "room");
  if (window.BackGuard) {
    if (view === "room") BackGuard.set("room", () => $("lbLeave").click());
    else BackGuard.set("home");
  }
}
function backToStart() { window.SC.showOnly("start"); if (window.BackGuard) BackGuard.set("home"); }
const entryMsg = text => { $("lbMsg").textContent = text || ""; };

/* ---------- ログイン ---------- */
const ready = signInAnonymously(auth)
  .then(cred => { uid = cred.user.uid; tryRejoin(); })
  .catch(() => entryMsg(tr("ネットにつながりませんでした。電波を確認して、ページを開き直してね")));

/* ---------- 入り口 ---------- */
$("goOnline").addEventListener("click", () => {
  $("lbName").value = store.get(NAME_KEY);
  entryMsg(uid ? "" : tr("接続中…"));
  showLobby("entry");
});
$("lbBack").addEventListener("click", backToStart);

function readName() {
  const name = $("lbName").value.trim().slice(0, 10);
  if (!name) { entryMsg(tr("名前を入れてね")); return null; }
  if (!uid) { entryMsg(tr("接続中です。少し待ってね")); return null; }
  store.set(NAME_KEY, name);
  return name;
}

let busy = false; // ボタンの2度押し防止
async function guard(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); }
  catch (e) { console.error(e); entryMsg(tr("うまくいきませんでした。もう一度ためしてね")); }
  finally { busy = false; }
}

$("lbCreate").addEventListener("click", () => guard(async () => {
  const name = readName();
  if (!name) return;
  entryMsg(tr("ルームを作っています…"));
  let newCode = null;
  for (let i = 0; i < 20 && !newCode; i++) {
    const c = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!(await get(ref(db, roomPath(c) + "/meta"))).exists()) newCode = c;
  }
  if (!newCode) return entryMsg(tr("ルームを作れませんでした。もう一度ためしてね"));
  await set(ref(db, roomPath(newCode)), {
    meta: { host: uid, started: false, created: serverTimestamp() },
    players: { [uid]: { name, joinedAt: serverTimestamp(), online: true } },
  });
  enterRoom(newCode);
}));

$("lbJoin").addEventListener("click", () => guard(async () => {
  const name = readName();
  if (!name) return;
  const c = $("lbCode").value.replace(/\D/g, "");
  if (c.length !== 4) return entryMsg(tr("ルームコードは数字4桁だよ"));
  entryMsg(tr("さがしています…"));
  const meta = (await get(ref(db, roomPath(c) + "/meta"))).val();
  if (!meta) return entryMsg(tr("そのルームはありません"));
  const players = (await get(ref(db, roomPath(c) + "/players"))).val() || {};
  if (!players[uid]) {
    if (meta.started) return entryMsg(tr("もう始まっています。終わるまで待ってね"));
    if (Object.keys(players).length >= MAX_PLAYERS) return entryMsg(tr("満員です(最大{n}人)", { n: MAX_PLAYERS }));
    await set(ref(db, roomPath(c) + "/players/" + uid), { name, joinedAt: serverTimestamp(), online: true });
  } else {
    await update(ref(db, roomPath(c) + "/players/" + uid), { name });
  }
  enterRoom(c);
}));
$("lbCode").addEventListener("keydown", e => { if (e.key === "Enter") $("lbJoin").click(); });

// ページを開き直したとき、さっきのルームにまだ自分がいれば戻る
async function tryRejoin() {
  const saved = store.get(ROOM_KEY);
  if (!saved) return;
  try {
    const snap = await get(ref(db, roomPath(saved) + "/players/" + uid));
    if (snap.exists()) enterRoom(saved);
    else store.del(ROOM_KEY);
  } catch { store.del(ROOM_KEY); }
}

/* ---------- 待合室 ---------- */
function stopWatching() { for (const u of unsubs) u(); unsubs = []; }
function enterRoom(c) {
  code = c;
  store.set(ROOM_KEY, c);
  entryMsg("");
  // 「つながっている」印。スマホを閉じたりして切れたら、Firebase が自動で false にしてくれる
  const me = roomPath(c) + "/players/" + uid;
  update(ref(db, me), { online: true });
  onDisconnect(ref(db, me + "/online")).set(false);

  $("lbRoomCode").textContent = c;
  showLobby("room");
  lastView = "";
  stopWatching();
  room = { meta: null, players: null, game: null };
  const got = { meta: false, players: false, game: false };
  for (const key of ["meta", "players", "game"]) {
    unsubs.push(onValue(ref(db, roomPath(c) + "/" + key), snap => {
      if (c !== code) return;
      room[key] = snap.val(); got[key] = true;
      if (got.meta && got.players && got.game) changed();
    }));
  }
}
function changed() {
  if (!room.meta) return leaveLocal(tr("ルームがなくなりました"));
  if (!room.players || !room.players[uid]) return leaveLocal(tr("ルームから外れました"));
  ensureHost();
  // 試合中はゲーム画面、そうでなければ待合室
  const playing = syncGame(room, uid, code);
  if (!playing && $("lobby").classList.contains("hidden")) { showLobby("room"); lastView = ""; }
  const view = JSON.stringify([room.meta, room.players]);
  if (view !== lastView) { lastView = view; render(); }
}

// 入った順に並べた参加者 [{ id, name, joinedAt, online }]
function playerList() {
  return Object.entries(room.players || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || (a.id < b.id ? -1 : 1));
}
const isOnline = p => p.online !== false;

// ホストが切れていたら、つながっている人の中でいちばん先に入った人が引きつぐ(試合はそのまま続く)
// 試合中は、試合に出ている人を先にえらぶ(ホストが荷物や点数を決めるため)
function ensureHost() {
  const host = room.meta && room.meta.host;
  const hp = room.players[host];
  if (hp && isOnline(hp)) return;
  const inGame = p => !!(room.meta.started && room.game && room.game.players && room.game.players[p.id]);
  const on = playerList().filter(isOnline);
  const next = on.find(inGame) || on[0];
  if (!next || next.id !== uid) return;
  runTransaction(ref(db, roomPath(code) + "/meta"), meta => {
    if (!meta || meta.host !== host) return; // ほかの人が先に引きついだ → 何もしない
    return { ...meta, host: uid };
  }).catch(console.error);
}

function render() {
  const list = playerList();
  const hostId = room.meta && room.meta.host;
  const iAmHost = hostId === uid;
  const started = !!(room.meta && room.meta.started);
  const onlineCount = list.filter(isOnline).length;

  const ol = $("lbPlayers");
  ol.textContent = "";
  for (const p of list) {
    const li = document.createElement("li");
    if (!isOnline(p)) li.className = "off";
    const name = document.createElement("span");
    name.textContent = p.name || "?";
    li.append(name);
    const tags = [];
    if (p.id === hostId) tags.push(tr("ホスト"));
    if (p.id === uid) tags.push(tr("あなた"));
    if (!isOnline(p)) tags.push(tr("切断中"));
    if (tags.length) {
      const t = document.createElement("small");
      t.textContent = " " + tags.join("・");
      li.append(t);
    }
    ol.append(li);
  }
  $("lbCount").textContent = tr("{a} / {b}人", { a: list.length, b: MAX_PLAYERS });

  let note;
  if (started) note = tr("試合中です。終わるまで待ってね");
  else if (iAmHost) note = onlineCount < MIN_PLAYERS ? tr("{n}人以上そろったらスタートできます", { n: MIN_PLAYERS }) : tr("みんなそろったらスタートを押してね");
  else note = tr("ホストがスタートするのを待っています");
  $("lbRoomMsg").textContent = note;

  // 時間(v=20): ホストだけえらべる。はじめは夜
  const time = TIMES.includes(room.meta && room.meta.time) ? room.meta.time : "night";
  for (const k of TIMES) { const b = $("lbT" + k); b.classList.toggle("on", k === time); b.disabled = !iAmHost || started; }
  $("lbStart").classList.toggle("hidden", !iAmHost || started);
  $("lbStart").disabled = onlineCount < MIN_PLAYERS;
  $("lbReset").classList.toggle("hidden", !iAmHost || !started);
}

$("lbStart").addEventListener("click", () => guard(async () => {
  if (!room || room.meta.host !== uid) return;
  const list = playerList();
  const on = list.filter(isOnline);
  if (on.length < MIN_PLAYERS) return;
  const changes = { "meta/started": true, "meta/startedAt": serverTimestamp(), game: makeGame(on, room.meta.time), pos: null };
  for (const p of list) if (!isOnline(p)) changes["players/" + p.id] = null; // 切断中の人はこの試合に入れない
  await update(ref(db, roomPath(code)), changes);
}));

// 時間をえらぶ(ホストだけ。試合の前だけ)
for (const k of TIMES) $("lbT" + k).addEventListener("click", () => {
  if (!room || !room.meta || room.meta.host !== uid || room.meta.started) return;
  update(ref(db, roomPath(code) + "/meta"), { time: k }).catch(console.error);
});

// ロビーにもどす
$("lbReset").addEventListener("click", () => guard(async () => {
  if (!room || room.meta.host !== uid) return;
  await update(ref(db, roomPath(code)), { "meta/started": false, game: null, pos: null });
}));

$("lbLeave").addEventListener("click", () => guard(async () => {
  if (!code) return;
  const c = code, path = roomPath(c);
  const others = room ? playerList().filter(p => p.id !== uid) : [];
  const iAmHost = room && room.meta && room.meta.host === uid;
  await onDisconnect(ref(db, path + "/players/" + uid + "/online")).cancel();
  leaveLocal("");
  if (!others.some(isOnline)) {
    await remove(ref(db, path)); // 最後の1人が出たらルームを片づける
  } else if (iAmHost) {
    const next = others.find(isOnline);
    await update(ref(db, path), { "meta/host": next.id, ["players/" + uid]: null, ["pos/" + uid]: null });
  } else {
    await update(ref(db, path), { ["players/" + uid]: null, ["pos/" + uid]: null, ["game/players/" + uid]: null });
  }
}));

// 自分の画面だけ、ルームの外(入り口)に戻す
function leaveLocal(text) {
  stopWatching();
  // 切れたときの自動書きこみも取り消す(消えたルームに書きこんで、ゴミが残らないように)
  if (code) onDisconnect(ref(db, roomPath(code) + "/players/" + uid + "/online")).cancel().catch(() => {});
  syncGame(null); // 試合中なら片づける
  code = null;
  room = null;
  store.del(ROOM_KEY);
  $("lbName").value = store.get(NAME_KEY);
  showLobby("entry");
  entryMsg(text);
}

export { ready };
