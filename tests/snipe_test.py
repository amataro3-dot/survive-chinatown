"""狙撃ミッションのテスト(v=30。Claude 用): python3 tests/snipe_test.py . <画像フォルダ>
にせ Three.js で、紫の光の場所・ライフルがないと受けられない・屋上の目(屋上に上がる・取引の4人・60秒で失敗・狙撃してクリア)・
見えない護衛(夜だけ・3人ずつ2回・車へ歩く・2台目・車がこわされると失敗・全部たおしてクリア)・英語 を確かめる"""
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
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    # お使いは全部終わったことにする。街のマフィアは消して、静かにする。昼(100秒)で止める
    ev("(()=>{ SC.DAY.speed = 0; SC.setClock(100); SC.G.mi = SC.MISSIONS.length; SC.G.money = 0; SC.TUNE.gang.turf = 0; SC.gangs.forEach(g => { g.temp = true; g.hp = 0; g.dead = 7; g.per.g.visible = false; }); return 0 })()")
    pg.wait_for_timeout(300)
    def tp(x, z): ev(f"(()=>{{ SC.player.x = {x}; SC.player.z = {z}; return 0 }})()")
    def away(): tp(30, 0); pg.wait_for_timeout(250)
    F = ev("Object.fromEntries(SC.FREE.filter(f => f.id.startsWith('snipe')).map(f => [f.id, f.at]))")
    check(set(F) == {"snipe1", "snipe2"}, "狙撃ミッションが2つある")
    marks = ev("[SC.HOME, SC.BOAT.at, ...SC.FREE.filter(f => !f.id.startsWith('snipe')).map(f => f.at), ...SC.SHOPS, ...SC.ROOFS.map(r => r.ent)].map(m => [m.x, m.z])")
    for k, a in F.items():
        near = min(math.hypot(a["x"] - m[0], a["z"] - m[1]) for m in marks)
        check(near >= 6 and not ev(f"SC.pointBlocked({a['x']}, {a['z']})"), f"{k} の紫の光は、かべの中でなく、ほかの光から6m以上はなれている({near:.1f}m)")

    # ---------- 屋上の目 ----------
    a = F["snipe1"]
    tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(pg.is_visible("#offer") and "屋上の目" in pg.inner_text("#offerName") and "$4,000" in pg.inner_text("#offerReward"), "紫の光で「屋上の目」(ほうび $4,000)")
    check("ライフルと弾がいる" in pg.inner_text("#offerNote") and pg.is_disabled("#offerYes"), "ライフルがないと受けられない(「ライフルと弾がいる」)")
    pg.click("#offerNo"); away()
    ev("(()=>{ SC.player.inv.push('rifle'); SC.player.rf = 20; return 0 })()")
    tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(not pg.is_disabled("#offerYes"), "ライフルと弾があると受けられる")
    pg.click("#offerYes"); pg.wait_for_timeout(300)
    check("大きなビルの屋上に上がろう" in pg.inner_text("#mission") and ev("SC.raceMarker().visible"), "まず「大きなビルの屋上に上がろう」(光が出る)")
    rf = ev("(()=>{ const r = SC.roofNear(52, -130); return { i: SC.ROOFS.indexOf(r), ent: r.ent, x0: r.x0, x1: r.x1, z1: r.z1 } })()")
    tp(rf["ent"]["x"], rf["ent"]["z"]); pg.wait_for_timeout(400)
    check(ev("SC.player.roof === SC.ROOFS[%d]" % rf["i"]) and "白虎幇の手下を狙撃しろ" in pg.inner_text("#mission") and "のこり 4人" in pg.inner_text("#mission"), "屋上に上がると「白虎幇の手下を狙撃しろ(のこり 4人)」")
    men = ev("SC.MX.foes.map(g => ({ x: g.x, z: g.z, white: g.white, hp: g.hp }))")
    check(len(men) == 4 and all(m["white"] for m in men) and all(not ev(f"SC.pointBlocked({m['x']}, {m['z']})") for m in men), "取引の手下は白いスーツの4人(かべの中ではない)")
    check(57 <= ev("SC.G.timeLeft") <= 60 and "残り" in pg.inner_text("#timer"), "制限時間は60秒")
    pg.wait_for_timeout(1500)
    moved = ev("SC.MX.foes.every((g, i) => Math.abs(g.x - [46, 48.5, 51, 53.5][i]) < 0.01)")
    check(moved, "取引の手下は、その場に立ったまま")
    # 時間切れで失敗
    ev("(()=>{ SC.G.timeLeft = 0.05; return 0 })()"); pg.wait_for_timeout(300)
    check("逃げられた" in pg.inner_text("#toast") and ev("SC.G.free === null") and ev("SC.MX.foes.length") == 0, "60秒たつと「逃げられた… ミッション失敗」")
    # もう一度受けて、狙撃でクリア
    ev("(()=>{ SC.leaveRoof(); return 0 })()"); away()
    tp(a["x"], a["z"]); pg.wait_for_timeout(300); pg.click("#offerYes"); pg.wait_for_timeout(200)
    tp(rf["ent"]["x"], rf["ent"]["z"]); pg.wait_for_timeout(400)
    # 立つ所は、相手の方のふち(屋上の中で、相手にいちばん近い所)
    def snipe(g_idx):
        return ev(f"""(()=>{{ const g = SC.MX.foes[{g_idx}], r = SC.player.roof; SC.player.x = Math.min(Math.max(g.x, r.x0 + 0.6), r.x1 - 0.6); SC.player.z = Math.min(Math.max(g.z, r.z0 + 0.6), r.z1 - 0.6); SC.player.atkCd = 0;
          let yaw = Math.atan2(g.x - SC.player.x, g.z - SC.player.z), o = SC.scopeEye(yaw); yaw = Math.atan2(g.x - o.x, g.z - o.z); o = SC.scopeEye(yaw);
          return SC.fireRifle(yaw, Math.atan2(1.2 - o.y, Math.hypot(g.x - o.x, g.z - o.z))) }})()""")
    # v=33: 相手は遠く(50m 以上)。のぞいたときの向き(-0.3)から、画面の高さ(390px)のドラッグで届く
    def reach(g_idx):
        return ev(f"""(()=>{{ const g = SC.MX.foes[{g_idx}], r = SC.player.roof, sx = Math.min(Math.max(g.x, r.x0 + 0.6), r.x1 - 0.6), sz = Math.min(Math.max(g.z, r.z0 + 0.6), r.z1 - 0.6);
          SC.player.x = sx; SC.player.z = sz; let yaw = Math.atan2(g.x - sx, g.z - sz), o = SC.scopeEye(yaw); yaw = Math.atan2(g.x - o.x, g.z - o.z); o = SC.scopeEye(yaw);
          const hd = Math.hypot(g.x - o.x, g.z - o.z), p = Math.atan2(1.2 - o.y, hd); return [hd, Math.abs(p + 0.3) / SC.TUNE.rifle.sens] }})()""")
    rs = [reach(i) for i in range(4)]
    check(all(r[0] >= 50 and r[1] <= 390 for r in rs), "取引の手下は遠く(%s m)、ドラッグ %s px で届く" % ([round(r[0]) for r in rs], [round(r[1]) for r in rs]))
    hits = [snipe(i) for i in range(4)]
    check(all(hits), f"屋上のふちから、4人とも狙撃できる {hits}")
    pg.wait_for_timeout(400)
    check(ev("SC.G.done.snipe1 === 1") and ev("SC.G.money") == 4000 and "+$4,000" in pg.inner_text("#toast"), "4人たおすとクリア(+$4,000)")
    check(ev("SC.cars.every(c => !(Math.abs(c.x - 50) < 0.1 && Math.abs(c.z - 3.1) < 0.1))"), "取引の白い車は消える")
    ev("(()=>{ SC.leaveRoof(); return 0 })()"); away()

    # ---------- 見えない護衛(夜だけ) ----------
    a = F["snipe2"]
    tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check("見えない護衛" in pg.inner_text("#offerName") and "夜だけ" in pg.inner_text("#offerNote") and pg.is_disabled("#offerYes"), "「見えない護衛」は夜だけ")
    pg.click("#offerNo"); away()
    ev("(()=>{ SC.setClock(560); return 0 })()")
    tp(a["x"], a["z"]); pg.wait_for_timeout(300); pg.click("#offerYes"); pg.wait_for_timeout(200)
    check("東のビルの屋上に上がろう" in pg.inner_text("#mission"), "まず「東のビルの屋上に上がろう」")
    rf = ev("(()=>{ const r = SC.roofNear(78, -78); return { i: SC.ROOFS.indexOf(r), ent: r.ent, z1: r.z1 } })()")
    tp(rf["ent"]["x"], rf["ent"]["z"]); pg.wait_for_timeout(400)
    t = pg.inner_text("#mission")
    check("ボースンの車をねらうマフィア" in t and "のこり 6人" in t and "車の体力 100" in t, "屋上で「ボースンの車をねらうマフィアを狙撃しろ(のこり 6人・車の体力 100)」")
    check(ev("SC.MX.foes.length") == 3 and ev("!!SC.MX.mcar"), "はじめは南から3人(ボースンの車がある)")
    d0 = ev("Math.min(...SC.MX.foes.map(g => Math.hypot(g.x - SC.MX.mcar.x, g.z - SC.MX.mcar.z)))")
    pg.wait_for_timeout(1500)
    d1 = ev("Math.min(...SC.MX.foes.map(g => Math.hypot(g.x - SC.MX.mcar.x, g.z - SC.MX.mcar.z)))")
    check(d1 < d0 - 1.5, f"マフィアはボースンの車へ歩いてくる({d0:.1f}m → {d1:.1f}m)")
    rs = [reach(i) for i in range(3)]
    check(all(r[0] >= 50 and r[1] <= 390 for r in rs), "マフィアは遠く(%s m)、ドラッグ %s px で届く" % ([round(r[0]) for r in rs], [round(r[1]) for r in rs]))
    hit = snipe(0)
    pg.wait_for_timeout(200)
    check(hit and "のこり 5人" in pg.inner_text("#mission"), "屋上から狙撃できる(のこり 5人)")
    ev("(()=>{ SC.MX.foes.forEach(g => { if (g.hp > 0) SC.damageGang(g, 999); }); return 0 })()"); pg.wait_for_timeout(300)
    check(ev("SC.MX.foes.filter(g => g.hp > 0).length") == 3 and "北からも来たぞ" in pg.inner_text("#toast"), "南の3人をたおすと、北から3人来る")
    # 車にとりつかれると、車の体力がへる → こわされると失敗
    ev("(()=>{ const c = SC.MX.mcar; SC.MX.foes.filter(g => g.hp > 0).forEach((g, k) => { g.x = c.x + 1.5; g.z = c.z + (k - 1); }); return 0 })()"); pg.wait_for_timeout(800)
    hp = ev("SC.G.escHp")
    check(hp < 100 and "車の体力" in pg.inner_text("#mission"), f"車にとりつかれると、車の体力がへる({hp:.0f})")
    pg.wait_for_timeout(4500)
    check("ボースンの車がこわされた" in pg.inner_text("#toast") and ev("SC.G.free === null") and not ev("SC.MX.mcar"), "車の体力が0になると失敗")
    # もう一度受けて、全部たおしてクリア
    ev("(()=>{ SC.leaveRoof(); return 0 })()"); away()
    tp(a["x"], a["z"]); pg.wait_for_timeout(300); pg.click("#offerYes"); pg.wait_for_timeout(200)
    tp(rf["ent"]["x"], rf["ent"]["z"]); pg.wait_for_timeout(400)
    for _ in range(2):
        ev("(()=>{ SC.MX.foes.forEach(g => { if (g.hp > 0) SC.damageGang(g, 999); }); return 0 })()"); pg.wait_for_timeout(400)
    check(ev("SC.G.done.snipe2 === 1") and ev("SC.G.money") == 8000, "6人たおすとクリア(+$4,000)")
    check(ev("SC.G.wanted") == 0, "ミッションの相手をたおしても★は上がらない")
    check(ev("SC.readSave().done.includes('snipe2')"), "クリアはセーブに残る")

    # ---------- 英語 ----------
    ev("(()=>{ localStorage.setItem('muddys-lang', 'en'); localStorage.removeItem('sc-save'); return 0 })()")
    pg.reload(); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
    ev("(()=>{ SC.DAY.speed = 0; SC.setClock(100); SC.G.mi = SC.MISSIONS.length; return 0 })()")
    a = F["snipe1"]; tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check("Eye on the Roof" in pg.inner_text("#offerName") and "rifle and ammo" in pg.inner_text("#offerNote"), "英語: 「Eye on the Roof」「You need a rifle and ammo」")
    pg.screenshot(path=os.path.join(SHOTS, "snipe_en.png"))
    check(not errs, "エラーなし" + (" " + str(errs[:3]) if errs else ""))
    b.close()
print("\nNG が %d こ" % len(fails) if fails else "\n全部 OK")
sys.exit(1 if fails else 0)
