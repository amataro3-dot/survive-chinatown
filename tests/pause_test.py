"""一時停止・中断・画面の並び・通りの名前のテスト(Claude 用): python3 tests/pause_test.py . <画像フォルダ>
にせ Three.js で、⚙ で止まる・つづける・中断して同じ場所からもどる・ほかのアプリに切りかえると自動で中断・やめる・体力バーが右上・通りの名前 を確かめる(v=23)"""
import sys, os
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
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def boot():
        pg.wait_for_timeout(1200)
    pg.goto(URL); boot()
    check(not pg.is_visible("#goSusp"), "はじめは「中断したところから」は出ない")
    pg.click("#goSolo"); pg.wait_for_timeout(800)
    ev("(()=>{ SC.DAY.speed=0; SC.setClock(350); SC.TUNE.peace=true; return 0 })()")

    # ---------- 画面の並び ----------
    hp = pg.locator("#hpBar").bounding_box(); mo = pg.locator("#money").bounding_box(); ob = pg.locator("#optBtn").bounding_box()
    check(pg.is_visible("#optBtn") and ob["x"] < 30 and ob["y"] < 30, "左上に ⚙ が出る")
    check(not pg.is_visible("#quitBtn"), "ひとり用では「やめる」ボタンは出ない")
    check(hp["x"] > 600 and mo["y"] > hp["y"] + hp["height"], f"体力バーは右上で、お金はその下(体力バー y={hp['y']:.0f}・お金 y={mo['y']:.0f})")
    mi = pg.locator("#mission").bounding_box()
    check(mi["x"] > ob["x"] + ob["width"] - 1, "ミッションの文は ⚙ の右")

    # ---------- 通りの名前 ----------
    ev("(()=>{ SC.player.x=20; SC.player.z=2; return 0 })()"); pg.wait_for_timeout(300)
    check(pg.inner_text("#street") == "塔前通り", f"塔前通りの上にいると「塔前通り」({pg.inner_text('#street')})")
    ev("(()=>{ SC.player.x=0; SC.player.z=-30; return 0 })()"); pg.wait_for_timeout(300)
    check(pg.inner_text("#street") == "中央通り", f"南北の道に入ると「中央通り」({pg.inner_text('#street')})")
    ev("(()=>{ SC.player.x=0; SC.player.z=-1; return 0 })()"); pg.wait_for_timeout(300)
    check(pg.inner_text("#street") == "中央通り", "交差点では、前の通りのまま")
    ev("(()=>{ SC.player.x=26; SC.player.z=-26; return 0 })()"); pg.wait_for_timeout(300)
    check(pg.inner_text("#street") == "", "区画の中では、通りの名前は出ない")
    check(ev("SC.streetAt(-130, 104, null)") is None, "駐車場(つなげた区画)の中は、通りではない")

    # ---------- ⚙ で一時停止 ----------
    pg.dispatch_event("#optBtn", "pointerdown"); pg.wait_for_timeout(200)
    t0 = ev("SC.G.play"); pg.wait_for_timeout(500)
    check(pg.is_visible("#pause") and ev("SC.G.pause") and ev("SC.G.play") == t0, "⚙ を押すと、窓が開いてゲームが止まる")
    check(pg.is_visible("#pResume") and pg.is_visible("#pSusp") and pg.is_visible("#pQuit"), "「つづける」「中断する」「ゲームをやめる」がある")
    pg.screenshot(path=SHOTS + "/p1_pause.png")
    pg.click("#pResume"); pg.wait_for_timeout(400)
    check(not pg.is_visible("#pause") and ev("SC.G.play") > t0, "「つづける」でもどる")

    # ---------- ゲームをやめる(確認) ----------
    pg.dispatch_event("#optBtn", "pointerdown"); pg.wait_for_timeout(200); pg.click("#pQuit"); pg.wait_for_timeout(200)
    check(pg.is_visible("#pYes") and "最後にセーブ" in pg.inner_text("#pAsk"), "「ゲームをやめる」は、確かめてくる")
    pg.click("#pNo"); pg.wait_for_timeout(200)
    check(pg.is_visible("#pResume") and ev("SC.G.pause"), "「もどる」で一時停止の窓にもどる")
    pg.click("#pResume"); pg.wait_for_timeout(200)

    # ---------- 中断して、同じ所からもどる ----------
    ev("""(()=>{ const x=60, z=2.5; SC.G.money=1234; SC.player.hp=60; SC.setClock(500); SC.player.x=x; SC.player.z=z;
      const c=SC.newCar('parked', x, z, Math.PI/2, 0, 'taxi'); SC.enterCar(c); return 0 })()""")
    pg.wait_for_timeout(300); money = ev("SC.G.money")
    pg.dispatch_event("#optBtn", "pointerdown"); pg.wait_for_timeout(200); pg.click("#pSusp"); pg.wait_for_timeout(300); boot()
    check(pg.is_visible("#goSusp") and f"${money:,}" in pg.inner_text("#goSusp"), f"スタート画面に「中断したところから」が出る({pg.inner_text('#goSusp') if pg.is_visible('#goSusp') else ''})")
    pg.screenshot(path=SHOTS + "/p2_start.png")
    pg.click("#goSusp"); pg.wait_for_timeout(800)
    st = ev("({ x: SC.player.x, z: SC.player.z, mode: SC.player.mode, t: SC.player.car && SC.player.car.type, clock: SC.G.clock, hp: SC.player.hp, money: SC.G.money, rec: !!SC.readSuspend() })")
    check(abs(st["x"] - 60) < 2 and abs(st["z"] - 2.5) < 2, f"中断した場所にもどる({st['x']:.1f}, {st['z']:.1f})")
    check(st["mode"] == "car" and st["t"] == "taxi", "乗っていたタクシーに乗ったまま")
    check(abs(st["clock"] - 500) < 3 and st["hp"] == 60 and st["money"] == money, f"時間・体力・お金ももどる(時間 {st['clock']:.0f}・体力 {st['hp']})")
    check(not st["rec"], "再開すると、中断の記録は消える")

    # ---------- ほかのアプリに切りかえると、自動で一時停止+中断 ----------
    ev("(()=>{ SC.DAY.speed=0; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return 0 })()")
    pg.wait_for_timeout(200)
    check(ev("SC.G.pause") and ev("!!SC.readSuspend()"), "ほかのアプリに切りかえると、一時停止して中断の記録もする")
    ev("(()=>{ Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); return 0 })()")
    pg.click("#pResume"); pg.wait_for_timeout(200)
    check(not ev("SC.G.pause") and not ev("!!SC.readSuspend()"), "帰ってきて「つづける」を押すと、中断の記録は消える")
    # 切りかえたまま、ページが閉じられた(読みこみ直し)
    ev("(()=>{ SC.exitCar(); SC.player.x=-52; SC.player.z=-80; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return 0 })()")
    pg.wait_for_timeout(200); pg.reload(); boot()
    check(pg.is_visible("#goSusp"), "切りかえたままページが閉じられても、「中断したところから」で遊べる")
    pg.click("#goSusp"); pg.wait_for_timeout(800)
    check(abs(ev("SC.player.z") + 80) < 2 and ev("SC.player.mode") == "foot", "歩いていた場所にもどる")

    # ---------- やめる ----------
    pg.dispatch_event("#optBtn", "pointerdown"); pg.wait_for_timeout(200); pg.click("#pQuit"); pg.wait_for_timeout(200); pg.click("#pYes"); pg.wait_for_timeout(300); boot()
    check(pg.is_visible("#start") and not pg.is_visible("#goSusp"), "「やめる」でスタート画面へ。中断の記録は残らない")
    # はじめから・つづきからで始めると、古い中断の記録は消える
    ev("(()=>{ localStorage.setItem('sc-susp', JSON.stringify({ v: 1, susp: 1, money: 5, x: 0, z: 0 })); SC.initStart(); return 0 })()")
    check(pg.is_visible("#goSusp"), "(中断の記録があると出る)")
    pg.click("#goSolo"); pg.wait_for_timeout(300)
    if pg.is_visible("#goSolo"): pg.click("#goSolo"); pg.wait_for_timeout(500)
    check(not ev("!!SC.readSuspend()"), "「はじめから」で始めると、中断の記録は消える")

    real = [e for e in errs if "favicon" not in e]
    check(not real, "エラーなし " + str(real[:3]))
    b.close()
print("全部OK" if not fails else "NG: " + str(len(fails)))
sys.exit(1 if fails else 0)
