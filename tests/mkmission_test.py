"""市場のミッションのテスト(v=32。Claude 用): python3 tests/mkmission_test.py . <画像フォルダ>
にせ Three.js で、迷路のどろぼう(昼だけ・逃げる・市場から出ない・おそってこない・90秒で失敗・たおすとクリア・★は上がらない)と
秘伝の材料(夕方と夜だけ・4つのつぼ・60秒・おやじに届ける・塔のあとは出ない)・セーブ・英語 を確かめる"""
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
    def open_page(lang=None):
        ctx = b.new_context(viewport={"width":844,"height":390}, device_scale_factor=2)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/",1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
        ctx.expose_function("__db", handler_for("u"))
        ctx.add_init_script('window.SC_NO_INTRO = 1' + (f'; localStorage.setItem("muddys-lang", "{lang}")' if lang else ''))
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
        pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
        # お使いは全部終わったことにする。街のマフィアは消す。昼(100秒)で止める
        pg.evaluate("(()=>{ SC.DAY.speed = 0; SC.setClock(100); SC.G.mi = SC.MISSIONS.length; SC.G.money = 0; SC.TUNE.gang.turf = 0; SC.gangs.forEach(g => { g.temp = true; g.hp = 0; g.dead = 7; g.per.g.visible = false; }); return 0 })()")
        pg.wait_for_timeout(300)
        return pg
    pg = open_page()
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def tp(x, z): ev(f"(()=>{{ SC.player.x = {x}; SC.player.z = {z}; return 0 }})()")
    def away(): tp(30, 0); pg.wait_for_timeout(250)
    F = ev("Object.fromEntries(SC.FREE.filter(f => f.id === 'thief' || f.id === 'spice').map(f => [f.id, f.at]))")
    check(set(F) == {"thief", "spice"}, "市場のミッションが2つある")
    marks = ev("[SC.HOME, SC.BOAT.at, ...SC.FREE.filter(f => f.id !== 'thief' && f.id !== 'spice').map(f => f.at), ...SC.SHOPS, ...SC.FOODS, ...SC.ROOFS.map(r => r.ent)].map(m => [m.x, m.z])")
    for k, a in F.items():
        near = min(math.hypot(a["x"] - m[0], a["z"] - m[1]) for m in marks)
        check(near >= 6 and not ev(f"SC.pointBlocked({a['x']}, {a['z']})"), f"{k} の紫の光は、かべの中でなく、ほかの光から6m以上はなれている({near:.1f}m)")
    check(math.hypot(F["thief"]["x"] - F["spice"]["x"], F["thief"]["z"] - F["spice"]["z"]) >= 6, "2つの紫の光どうしも6m以上はなれている")
    check(ev("(()=>{ const v = SC.vendors.find(v => v.oyaji); return Math.hypot(v.x - SC.OYAJI_AT.x, v.z - SC.OYAJI_AT.z) })()") < 2.5, "秘伝の材料の光は、おやじの屋台の前")

    # ---------- 迷路のどろぼう ----------
    a = F["thief"]
    ev("(()=>{ SC.setClock(560); return 0 })()"); tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(pg.is_visible("#offer") and "迷路のどろぼう" in pg.inner_text("#offerName") and "$2,500" in pg.inner_text("#offerReward"), "紫の光で「迷路のどろぼう」(ほうび $2,500)")
    check("昼だけ" in pg.inner_text("#offerNote") and pg.is_disabled("#offerYes"), "夜は受けられない(昼だけ)")
    pg.click("#offerNo"); away(); ev("(()=>{ SC.setClock(100); return 0 })()")
    tp(a["x"], a["z"]); pg.wait_for_timeout(300); pg.click("#offerYes"); pg.wait_for_timeout(300)
    th = ev("(()=>{ const g = SC.MX.boss; return g ? { x: g.x, z: g.z, hp: g.hp, thief: !!g.thief } : null })()")
    check(th and th["thief"] and th["hp"] == 60 and ev(f"SC.pointBlocked({th['x']}, {th['z']})") == False, "どろぼうが市場の中に出る(体力60。かべの中ではない)")
    check("どろぼう" in pg.inner_text("#mission") and 87 <= ev("SC.G.timeLeft") <= 90 and ev("SC.raceMarker().visible"), "「どろぼう(赤い光)を追いかけて、たおせ」・90秒・光が出る")
    pg.screenshot(path=SHOTS + "/mm_thief.png")
    # はなれていると、ゆっくり。近づくと逃げる
    inner = ev("({ x0: SC.MKC.ix0, x1: SC.MKC.ix1, z0: SC.MKC.iz0, z1: SC.MKC.iz1 })")
    tp(th["x"] - 3.5, th["z"]); pg.wait_for_timeout(50); d0 = ev("Math.hypot(SC.player.x - SC.MX.boss.x, SC.player.z - SC.MX.boss.z)")
    ev("(()=>{ window.__p = { x: SC.player.x, z: SC.player.z }; return 0 })()")
    pg.wait_for_timeout(900)
    d1 = ev("Math.hypot(window.__p.x - SC.MX.boss.x, window.__p.z - SC.MX.boss.z)")
    check(d1 > d0 + 2, f"近づくと、逃げる({d0:.1f}m → {d1:.1f}m)")
    # 追いかけ続けても、市場の外には出ない・かべの中に入らない・おそってこない
    ev("(()=>{ SC.player.hp = 100; return 0 })()"); ok = True; hp0 = 100
    for i in range(24):
        ev("(()=>{ const g = SC.MX.boss, a = Math.atan2(g.x - SC.player.x, g.z - SC.player.z); SC.player.x = g.x - Math.sin(a + 0.3) * 3; SC.player.z = g.z - Math.cos(a + 0.3) * 3; return 0 })()")
        pg.wait_for_timeout(200)
        q = ev("({ x: SC.MX.boss.x, z: SC.MX.boss.z })")
        if not (inner["x0"] < q["x"] < inner["x1"] and inner["z0"] < q["z"] < inner["z1"]) or ev(f"SC.pointBlocked({q['x']}, {q['z']})"): ok = False
    check(ok, "追いかけても、どろぼうは市場の外に出ない・かべに入らない")
    check(ev("SC.player.hp") == 100, "どろぼうは、おそってこない")
    # 時間切れで失敗
    ev("(()=>{ SC.G.timeLeft = 0.05; return 0 })()"); pg.wait_for_timeout(300)
    check("逃げられた" in pg.inner_text("#toast") and ev("SC.G.free === null") and ev("SC.MX.foes.length") == 0, "90秒たつと「どろぼうに逃げられた… ミッション失敗」(どろぼうは消える)")
    # もう一度受けて、素手でたおす
    away(); tp(a["x"], a["z"]); pg.wait_for_timeout(300); pg.click("#offerYes"); pg.wait_for_timeout(300)
    for i in range(8):
        if ev("SC.MX.boss ? SC.MX.boss.hp : 0") <= 0: break
        ev("(()=>{ const g = SC.MX.boss; SC.player.x = g.x - 1; SC.player.z = g.z; SC.player.h = Math.PI / 2; SC.player.atkCd = 0; return 0 })()")
        pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup"); pg.wait_for_timeout(120)
    pg.wait_for_timeout(400)
    check(ev("SC.G.done.thief === 1") and ev("SC.G.money") == 2500 and "+$2,500" in pg.inner_text("#toast"), "どろぼうをたおすとクリア(+$2,500)")
    check(ev("SC.G.wanted") == 0, "どろぼうをたおしても★は上がらない")
    away()

    # ---------- 秘伝の材料 ----------
    a = F["spice"]
    tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(pg.is_visible("#offer") and "秘伝の材料" in pg.inner_text("#offerName") and "$3,000" in pg.inner_text("#offerReward"), "おやじの前の紫の光で「秘伝の材料」(ほうび $3,000)")
    check("夕方と夜だけ" in pg.inner_text("#offerNote") and pg.is_disabled("#offerYes"), "昼は受けられない(夕方と夜だけ)")
    pg.click("#offerNo"); away()
    ev("(()=>{ SC.setClock(350); return 0 })()"); tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(not pg.is_disabled("#offerYes"), "夕方は受けられる")
    pg.click("#offerYes"); pg.wait_for_timeout(300)
    items = ev("SC.MX.items.map(i => ({ x: i.x, z: i.z }))")
    check(len(items) == 4 and all(not ev(f"SC.pointBlocked({i['x']}, {i['z']})") and inner["x0"] < i["x"] < inner["x1"] for i in items), "市場の中に、材料のつぼが4つ(かべの中ではない)")
    check(min(math.hypot(i["x"] - f[0], i["z"] - f[1]) for i in items for f in ev("SC.FOODS.map(f => [f.x, f.z])")) > 3, "つぼは、屋台の黄色い光とはなれている")
    check("のこり 4こ" in pg.inner_text("#mission") and 57 <= ev("SC.G.timeLeft") <= 60, "「タレの材料を集めろ(のこり 4こ)」・60秒")
    pg.screenshot(path=SHOTS + "/mm_spice.png")
    # 時間切れで失敗
    tp(items[0]["x"], items[0]["z"]); pg.wait_for_timeout(300)
    check("材料をひろった" in pg.inner_text("#toast") and "のこり 3こ" in pg.inner_text("#mission"), "近づくと拾える(「材料をひろった！」)")
    ev("(()=>{ SC.G.timeLeft = 0.05; return 0 })()"); pg.wait_for_timeout(300)
    check("時間切れ" in pg.inner_text("#toast") and ev("SC.G.free === null") and ev("SC.MX.items.length") == 0, "60秒たつと失敗(つぼは消える)")
    # もう一度受けて、4つ集めて届ける
    away(); ev("(()=>{ SC.setClock(560); return 0 })()"); tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    check(not pg.is_disabled("#offerYes"), "夜も受けられる")
    pg.click("#offerYes"); pg.wait_for_timeout(300)
    for it in ev("SC.MX.items.map(i => ({ x: i.x, z: i.z }))"):
        tp(it["x"], it["z"]); pg.wait_for_timeout(250)
    check("おやじに届けよう" in pg.inner_text("#mission") and ev("SC.G.timeLeft") > 0, "4つ集めると「材料を、屋台のおやじに届けよう」(時間はそのまま続く)")
    tp(a["x"], a["z"]); pg.wait_for_timeout(400)
    check(ev("SC.G.done.spice === 1") and ev("SC.G.money") == 5500, "おやじの前に着くとクリア(+$3,000)")
    check(ev("SC.readSave().done.includes('spice') && SC.readSave().done.includes('thief')"), "2つのクリアはセーブに残る")
    # 塔の対決のあとは出ない
    ev("(()=>{ SC.G.done.spice = 0; SC.G.done.tower = 1; return 0 })()")
    check(not ev("SC.freeOpen(SC.FREE.find(f => f.id === 'spice'))"), "塔の対決のあと(おやじがいない)は、秘伝の材料は出ない")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))

    # ---------- 英語 ----------
    pg = open_page("en"); ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    a = F["thief"]; tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    t = pg.inner_text("#offer")
    check("Thief in the Maze" in t and not any('぀' <= ch <= 'ヿ' for ch in t), "英語: 迷路のどろぼうの画面に日本語が残っていない")
    pg.click("#offerNo"); away(); a = F["spice"]; tp(a["x"], a["z"]); pg.wait_for_timeout(300)
    t = pg.inner_text("#offer")
    check("Secret Ingredients" in t and "Evening and night only" in t and not any('぀' <= ch <= 'ヿ' for ch in t), "英語: 秘伝の材料の画面(夕方と夜だけ)に日本語が残っていない")
    check(not errs, "エラーなし(英語)" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
