"""ライフルと屋上のテスト(v=29。Claude 用): python3 tests/rifle_test.py . <画像フォルダ>
にせ Three.js で、武器屋でライフル・スコープ(押す・ドラッグ・離すと撃つ)・1発でたおす・装てん中・短く押すだけでは撃たない・
屋上に上がる/おりる・ふちから落ちない・車に乗れない・下のマフィアが撃ってくる・★3で警察官が上がってくる・屋上から狙撃・
ビルのうしろには当たらない・セーブと中断・サバイバルのアイテム を確かめる"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from fakefb import serve, handler_for, FAKE
ROOT, SHOTS = sys.argv[1], sys.argv[2]
URL = serve(ROOT); THREE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'three-stub.js')).read()
fails = []
def check(c, what):
    print(('OK  ' if c else 'NG  ') + what)
    if not c: fails.append(what)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    # ほかのマフィアは消して、静かにする
    ev("(()=>{ SC.TUNE.gang.turf=0; SC.gangs.forEach((g,i)=>{ if(i>0){ g.temp=true; g.hp=0; g.dead=7; g.per.g.visible=false; } }); return 0 })()")

    # --- 屋上が4つ。いちばん高いのは「大きなビル」78m。入口の光はかべの中でなく、ほかの光から6m以上はなれている ---
    R = ev("SC.ROOFS.map(r => ({ h: r.h, top: r.top, ent: r.ent, back: r.back, up: r.up, down: r.down }))")
    check(len(R) == 4 and abs(R[0]["h"] - 78) < 0.01 and all(r["h"] >= 39 for r in R), "屋上は4つ(いちばん高いのは78m)" + str([round(r["h"]) for r in R]))
    check(all(not ev(f"SC.pointBlocked({r['ent']['x']}, {r['ent']['z']})") and not ev(f"SC.pointBlocked({r['back']['x']}, {r['back']['z']})") for r in R), "入口の光と、おりて立つ所は、かべの中ではない")
    marks = ev("[SC.HOME, SC.BOAT.at, ...SC.FREE.map(f => f.at), ...SC.SHOPS].map(m => [m.x, m.z])")
    near = min(math.hypot(r["ent"]["x"] - m[0], r["ent"]["z"] - m[1]) for r in R for m in marks)
    check(near >= 6, f"入口の光は、ほかの光から6m以上はなれている({near:.1f}m)")

    # --- 武器屋でライフルを買う ---
    gun = ev("(()=>{ const s = SC.SHOPS.find(s => s.kind === 'gun'); return [s.x, s.z] })()")
    ev(f"(()=>{{ SC.G.money = 5000; SC.player.x = {gun[0]}; SC.player.z = {gun[1]}; return 0 }})()"); pg.wait_for_timeout(300)
    txt = pg.inner_text("#shopList")
    check("ライフル(弾5発つき)" in txt and "$3,000" in txt and "ライフルの弾 5発" in txt, "武器屋にライフル $3,000 と弾5発 $300")
    i = ev("SC.SHOP_ITEMS.gun.findIndex(it => it.name().startsWith('ライフル('))")
    pg.click(f'.shopItem[data-i="{i}"]'); pg.wait_for_timeout(100)
    check(ev("SC.player.inv.includes('rifle') && SC.player.rf === 5 && SC.G.money === 2000"), "買うと、ライフルと弾5発(のこり $2,000)")
    j = ev("SC.SHOP_ITEMS.gun.findIndex(it => it.name().startsWith('ライフルの弾'))")
    pg.click(f'.shopItem[data-i="{j}"]'); pg.wait_for_timeout(100)
    check(ev("SC.player.rf === 10 && SC.G.money === 1700"), "弾を買うと、10発($300)")
    pg.click("#shopExit"); pg.wait_for_timeout(100)

    # --- スコープ: 道の上で、東40mのマフィアをねらう ---
    def place_target(dx, dz, wk='fist', hp=100):
        ev(f"""(()=>{{ const g = SC.gangs[0]; g.off = false; g.hp = {hp}; g.dead = -1; g.per.g.visible = true; g.state = 'idle'; g.weapon = '{wk}'; g.x = SC.player.x + {dx}; g.z = SC.player.z + {dz}; g.home = {{ x: g.x, z: g.z }}; g.tx = g.x; g.tz = g.z; g.temp = true; return 0 }})()""")
    ev("(()=>{ SC.player.x = 30; SC.player.z = 0; SC.player.wi = SC.player.inv.indexOf('rifle'); SC.G.camYaw = Math.PI / 2; SC.player.atkCd = 0; return 0 })()"); pg.wait_for_timeout(200)
    check(not ev("SC.pointBlocked(30, 0)") and not ev("SC.pointBlocked(70, 0)"), "テストの場所は道の上")
    place_target(40, 0)
    bb = pg.locator("#atkBtn").bounding_box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    pg.dispatch_event("#atkBtn", "pointerdown", {"pointerId": 5, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(150)
    check(ev("document.body.classList.contains('scoped')") and pg.is_visible("#scopeFx") and "離すと撃つ" in pg.inner_text("#scopeInfo"), "押すとスコープの画面(「弾 10・離すと撃つ」)")
    y0 = ev("SC.G.scope.yaw")
    pg.dispatch_event("#atkBtn", "pointermove", {"pointerId": 5, "clientX": cx + 100, "clientY": cy + 50, "bubbles": True}); pg.wait_for_timeout(50)
    sc = ev("[SC.G.scope.yaw, SC.G.scope.pitch]")
    check(abs(sc[0] - (y0 - 100 * 0.0011)) < 1e-6 and sc[1] < -0.02, "右へドラッグで右を向く・下へで下を向く")
    # ねらいをマフィアの胸に合わせて、離す
    ev("(()=>{ const g = SC.gangs[0], o = SC.scopeEye(); SC.G.scope.yaw = Math.atan2(g.x - o.x, g.z - o.z); SC.G.scope.pitch = Math.atan2(1.3 - o.y, Math.hypot(g.x - o.x, g.z - o.z)); return 0 })()")
    pg.wait_for_timeout(400)
    pg.dispatch_event("#atkBtn", "pointerup", {"pointerId": 5, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(150)
    check(ev("SC.gangs[0].hp <= 0") and ev("SC.player.rf") == 9, "離すと撃つ。40m先のマフィアを1発でたおす(弾 9)")
    check(not ev("document.body.classList.contains('scoped')") and ev("SC.player.per.g.visible"), "離すとスコープが閉じる")
    # 装てん中
    place_target(40, 0)
    pg.dispatch_event("#atkBtn", "pointerdown", {"pointerId": 6, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(50)
    check("装てん中" in pg.inner_text("#scopeInfo"), "撃ったすぐあとは「装てん中…」")
    pg.wait_for_timeout(400); pg.dispatch_event("#atkBtn", "pointerup", {"pointerId": 6, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(100)
    check(ev("SC.player.rf") == 9 and ev("SC.gangs[0].hp") == 100, "装てん中は撃てない(弾もへらない)")
    pg.wait_for_timeout(1500)
    # 短く押すだけでは撃たない
    pg.dispatch_event("#atkBtn", "pointerdown", {"pointerId": 7, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(60)
    pg.dispatch_event("#atkBtn", "pointerup", {"pointerId": 7, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(100)
    check(ev("SC.player.rf") == 9, "短く押しただけなら撃たない")
    # すぐにのぞくと、前のねらいのまま
    prev = ev("SC.G.scAim.yaw")
    pg.dispatch_event("#atkBtn", "pointerdown", {"pointerId": 8, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(60)
    keep = ev("SC.G.scope.yaw") == prev
    pg.dispatch_event("#atkBtn", "pointercancel", {"pointerId": 8, "clientX": cx, "clientY": cy, "bubbles": True}); pg.wait_for_timeout(100)
    check(keep and ev("SC.player.rf") == 9 and not ev("SC.G.scope"), "すぐにのぞくと前のねらいのまま・キャンセルでは撃たない")
    # ビルのうしろには当たらない(大きなビルの北がわに立って、南の道のマフィアをねらう)
    rf0 = R[0]
    ev(f"(()=>{{ SC.player.x = {rf0['ent']['x']}; SC.player.z = {rf0['ent']['z']} - 40; SC.player.atkCd = 0; return 0 }})()")
    blocked = ev(f"(()=>{{ const o = SC.scopeEye(), tx = {rf0['ent']['x']}, tz = {rf0['ent']['z']} + 6, yaw = Math.atan2(tx - o.x, tz - o.z), pitch = Math.atan2(1.3 - o.y, Math.hypot(tx - o.x, tz - o.z)); const g = SC.gangs[0]; g.hp = 100; g.dead = -1; g.x = tx; g.z = tz; return SC.rifleRay(o, SC.scopeDir(yaw, pitch), 170).f === null }})()")
    check(blocked, "ビルのうしろの敵には当たらない")

    # --- 屋上に上がる ---
    ev(f"(()=>{{ SC.player.x = {rf0['ent']['x']} + 0.3; SC.player.z = {rf0['ent']['z']}; SC.player.hp = 100; return 0 }})()"); pg.wait_for_timeout(300)
    check(ev("SC.player.roof === SC.ROOFS[0]") and "屋上に上がった" in pg.inner_text("#toast"), "入口の緑の光に入ると、屋上に上がる")
    ev("(()=>{ SC.player.x += 500; return 0 })()"); pg.wait_for_timeout(100)
    check(ev("SC.player.x <= SC.ROOFS[0].x1"), "屋上のふちから外へは出られない")
    ev("(()=>{ SC.player.x = SC.ROOFS[0].up.x; SC.player.z = SC.ROOFS[0].up.z; return 0 })()"); pg.wait_for_timeout(100)
    check(ev("SC.player.roof === SC.ROOFS[0]"), "屋上の光から少しはなれた所では、おりない")
    # 車は近くにない(乗るボタンが光らない)
    check(not ev("document.getElementById('enterBtn').classList.contains('near')"), "屋上では車に乗れない")

    # --- 下のマフィア: 銃なら撃ってくる。素手は見上げるだけ ---
    ev("(()=>{ SC.TUNE.peace = false; SC.G.mi = SC.MISSIONS.length; SC.TUNE.roof.gangHit = 1; return 0 })()")
    tz = rf0["ent"]["z"] + 8
    ev(f"(()=>{{ const g = SC.gangs[0]; g.off = false; g.hp = 100; g.dead = -1; g.per.g.visible = true; g.weapon = 'fist'; g.temp = true; g.x = {rf0['ent']['x']}; g.z = {tz}; g.home = {{ x: g.x, z: g.z }}; g.state = 'chase'; SC.player.hp = 100; return 0 }})()")
    pg.wait_for_timeout(2500)
    check(ev("SC.player.hp") == 100, "素手のマフィアは、屋上にはとどかない")
    ev("(()=>{ const g = SC.gangs[0]; g.weapon = 'pistol'; g.state = 'chase'; g.cd = 0; return 0 })()"); pg.wait_for_timeout(2500)
    check(ev("SC.player.hp") < 100, f"銃のマフィアは、下から撃ってくる(体力 {ev('SC.player.hp')})")
    ev("(()=>{ const g = SC.gangs[0]; g.state = 'idle'; g.weapon = 'fist'; SC.TUNE.gang.giveUp = 0; return 0 })()")

    # --- 屋上から狙撃: 下の道のマフィア ---
    ev("(()=>{ SC.player.hp = 100; SC.player.atkCd = 0; SC.player.x = SC.ROOFS[0].x; SC.player.z = SC.ROOFS[0].s > 0 ? SC.ROOFS[0].z1 - 0.6 : SC.ROOFS[0].z0 + 0.6; return 0 })()"); pg.wait_for_timeout(100)
    shot = ev(f"(()=>{{ const g = SC.gangs[0]; g.hp = 100; g.dead = -1; g.state = 'idle'; g.x = {rf0['ent']['x']} + 10; g.z = {rf0['ent']['z']} + 14; g.home = {{ x: g.x, z: g.z }}; g.temp = true; let yaw = Math.atan2(g.x - SC.player.x, g.z - SC.player.z), o = SC.scopeEye(yaw); yaw = Math.atan2(g.x - o.x, g.z - o.z); o = SC.scopeEye(yaw); return [SC.fireRifle(yaw, Math.atan2(1.2 - o.y, Math.hypot(g.x - o.x, g.z - o.z))), g.hp, Math.round(o.y)] }})()")
    mid = ev(f"(()=>{{ SC.player.x = SC.ROOFS[0].x; SC.player.z = SC.ROOFS[0].z; const g = SC.gangs[0]; g.hp = 100; g.dead = -1; g.x = {rf0['ent']['x']}; g.z = {rf0['ent']['z']} + 2; const yaw = Math.atan2(g.x - SC.player.x, g.z - SC.player.z), o = SC.scopeEye(yaw); return SC.rifleRay(o, SC.scopeDir(yaw, Math.atan2(1.2 - o.y, Math.hypot(g.x - o.x, g.z - o.z))), 170).f === null }})()")
    check(mid, "屋上のまん中からは、ビルのすぐ下は見えない(ふちまで行く)")
    check(shot[0] and shot[1] <= 0 and shot[2] >= 79, f"屋上(目の高さ {shot[2]}m)から、下の道のマフィアを狙撃できる")

    # --- ★3で警察官が上がってくる → くっつくと逮捕 ---
    ev("(()=>{ SC.G.wanted = 3; SC.G.roofCopT = 0; SC.G.evade = 0; return 0 })()"); pg.wait_for_timeout(500)
    rc = ev("SC.npcs.filter(n => n.kind === 'cop' && n.roof === SC.ROOFS[0]).length")
    check(rc >= 1 and "警察が屋上に上がってきた" in pg.inner_text("#toast"), f"★3だと、警察官が屋上に上がってくる({rc}人)")
    check(ev("SC.npcs.filter(n => n.roof).every(n => n.x >= SC.ROOFS[0].x0 && n.x <= SC.ROOFS[0].x1 && n.z >= SC.ROOFS[0].z0 && n.z <= SC.ROOFS[0].z1)"), "警察官も屋上の上にいる")
    ev("(()=>{ const n = SC.npcs.find(n => n.roof); n.x = SC.player.x + 0.8; n.z = SC.player.z; SC.player.atkCd = 1; return 0 })()"); pg.wait_for_timeout(3000)
    check(ev("SC.player.roof === null") and ev("SC.G.wanted") == 0 and ev("SC.npcs.filter(n => n.roof).length") == 0, "屋上でつかまると逮捕(ホームの前にもどる)")

    # --- もう一度上がって、屋上の光でおりる ---
    rf3 = R[3]
    ev(f"(()=>{{ SC.G.wanted = 0; SC.player.x = {rf3['ent']['x']}; SC.player.z = {rf3['ent']['z']}; return 0 }})()"); pg.wait_for_timeout(300)
    check(ev("SC.player.roof === SC.ROOFS[3]"), "ほかのビル(4つ目)にも上がれる")
    ev("(()=>{ SC.writeSuspend(); return 0 })()")
    sp = ev("SC.readSuspend()")
    check(sp and abs(sp["x"] - rf3["back"]["x"]) < 0.11 and abs(sp["z"] - rf3["back"]["z"]) < 0.11 and sp["rf"] == ev("SC.player.rf"), "屋上で中断すると、下の入口の前にもどる記録(ライフルの弾も残る)")
    ev("(()=>{ SC.clearSuspend(); return 0 })()")
    ev(f"(()=>{{ SC.player.x = {rf3['down']['x']}; SC.player.z = {rf3['down']['z']}; return 0 }})()"); pg.wait_for_timeout(300)
    check(ev("SC.player.roof === null") and abs(ev("SC.player.x") - rf3["back"]["x"]) < 0.6 and "下におりた" in pg.inner_text("#toast"), "屋上の光に入ると、下におりる")
    pg.wait_for_timeout(400)
    check(ev("SC.player.roof === null"), "おりたすぐあとに、また上がらない")

    # --- セーブ ---
    check(ev("SC.player.rf") == 0 and not ev("SC.player.inv.includes('rifle')"), "逮捕されると、ライフルも没収")
    ev("(()=>{ SC.player.inv.push('rifle'); SC.player.rf = 7; SC.save(); return 0 })()")
    check(ev("SC.readSave().rf") == 7 and "rifle" in ev("SC.readSave().inv"), "セーブにライフルと弾が残る")
    # --- やられると、ライフルも没収 ---
    ev("(()=>{ SC.confiscate(); return 0 })()")
    check(ev("SC.player.rf") == 0 and not ev("SC.player.inv.includes('rifle')"), "没収されると、ライフルと弾もなくなる")

    # --- サバイバルのアイテム ---
    check(ev("SC.canTake('rifle')"), "サバイバル: ライフルは拾える")
    ev("(()=>{ SC.applyItem('rifle'); return 0 })()")
    check(ev("SC.player.rf") == 5, "ライフルを拾うと弾5発")
    check(ev("SC.canTake('ammo')"), "ライフルだけでも弾の箱を拾える")
    ev("(()=>{ SC.applyItem('ammo'); return 0 })()")
    check(ev("SC.player.rf") == 8, "弾の箱でライフルの弾+3")
    check(ev("SC.TUNE.rifle.pvp") * 2 >= 100 and ev("SC.TUNE.rifle.pvp") < 100, "サバイバルでは2発でたおせる強さ")

    # --- 英語 ---
    ev("(()=>{ localStorage.setItem('muddys-lang', 'en'); return 0 })()")
    pg.reload(); pg.wait_for_timeout(1200)
    check("Rifle: press for the scope" in pg.inner_text("#start"), "英語: スタート画面の操作の説明")
    pg.screenshot(path=os.path.join(SHOTS, "rifle_en.png"))
    check(not errs, "エラーなし" + (" " + str(errs[:3]) if errs else ""))
    b.close()
print("\nNG が %d こ" % len(fails) if fails else "\n全部 OK")
sys.exit(1 if fails else 0)
