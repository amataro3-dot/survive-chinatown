"""ケイドロのテスト(v=27): にせ Firebase と、にせ Three.js で、スマホ3台ぶんを同時に動かす
使い方(Claude 用): python3 tests/cops_test.py . <スクリーンショットを置くフォルダ>"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from fakefb import get_at, set_at, serve, handler_for, FAKE, ondis

ROOT, SHOTS = sys.argv[1], sys.argv[2]
URL = serve(ROOT)
STUB = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "three-stub.js")).read()
fails, errors = [], []
def check(cond, what):
    print(("OK  " if cond else "NG  ") + what)
    if not cond: fails.append(what)

with sync_playwright() as p:
    browser = p.chromium.launch()
    def open_phone(name):
        ctx = browser.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda route: route.fulfill(
            content_type="text/javascript", body=FAKE[route.request.url.rsplit("/", 1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda route: route.fulfill(content_type="text/javascript", body=STUB))
        ctx.expose_function("__db", handler_for("uid_" + name))
        ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        pg.on("console", lambda m: m.type == "error" and errors.append(f"{name}: {m.text}"))
        pg.goto(URL); pg.wait_for_timeout(300)
        return pg
    wait = lambda pg, ms=700: pg.wait_for_timeout(ms)
    ev = lambda pg, js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def warp(pg, x, z):
        pg.evaluate(f"(() => {{ const p = SC.player; if (p.car) {{ p.car.x = {x}; p.car.z = {z}; p.car.v = 0; }} p.x = {x}; p.z = {z}; }})()")
    pos = lambda pg: (ev(pg, "SC.player.x"), ev(pg, "SC.player.z"))
    on = lambda pg, sel: "on" in (pg.get_attribute(sel, "class") or "")

    # ---------- 待合室 ----------
    a, b, c = open_phone("A"), open_phone("B"), open_phone("C")
    a.click("#goOnline"); a.fill("#lbName", "みつる"); a.click("#lbCreate"); wait(a, 600)
    code = a.inner_text("#lbRoomCode"); rp = f"sc-rooms/{code}"
    for pg, n in ((b, "たろう"), (c, "はなこ")):
        pg.click("#goOnline"); pg.fill("#lbName", n); pg.fill("#lbCode", code); pg.click("#lbJoin"); wait(pg, 600)
    wait(a, 300)
    check(a.is_visible("#lbRcops") and b.is_disabled("#lbRcops"), "待合室に「ケイドロ」のボタン(えらべるのはホストだけ)")
    a.click("#lbRcops"); wait(a, 500)
    check(get_at(rp + "/meta/rule") == "cops" and on(c, "#lbRcops") and "4分" in c.inner_text("#lbRuleNote"), "ケイドロをえらぶと、みんなの画面に説明が出る")
    a.screenshot(path=f"{SHOTS}/k1_lobby.png")

    # ---------- 始まり ----------
    a.click("#lbStart"); wait(a, 1000)
    g = get_at(rp + "/game")
    ph = {"uid_A": a, "uid_B": b, "uid_C": c}
    cops = list((g.get("cop") or {}).keys())
    check(g["rule"] == "cops" and len(cops) == 1 and g.get("first") == cops[0] and abs(g["left"] - 240) <= 2, "ケイドロの試合ができる(警察は1人・のこり240秒)")
    first = cops[0]; cp = ph[first]; runners = [u for u in ph if u != first]; r1, r2 = ph[runners[0]], ph[runners[1]]
    check(ev(cp, "SC.player.mode === 'car' && SC.player.car.cop") and not ev(r1, "!!SC.player.car.cop"), "警察はパトカーから始まる(逃げる人はふつうの車)")
    check("あなたが警察" in cp.inner_text("#mission") and "秒後に動ける" in cp.inner_text("#mission"), "警察の画面に「あなたが警察」「〇秒後に動ける」")
    check("警察から逃げろ" in r1.inner_text("#mission") and "秒後に動き出す" in r1.inner_text("#mission"), "逃げる人の画面に「警察から逃げろ」")
    wait(r1, 500)
    check(ev(r1, f"!!(SC.R.avatars['{first}'] && SC.R.avatars['{first}'].pol)"), "ほかの人の画面でも、警察の車はパトカーの形")
    check(not ev(cp, "SC.cars.some(c => c.kind === 'police')") and ev(r1, "SC.G.wanted") == 0, "街のパトカー(コンピューターの警察)は出ない")
    # 最初の10秒は動けない
    cp.dispatch_event("#accBtn", "pointerdown"); wait(cp, 1000); v = ev(cp, "SC.player.car.v"); cp.dispatch_event("#accBtn", "pointerup")
    check(abs(v) < 0.5, f"最初の10秒、警察はアクセルを押しても動かない(速さ {v:.1f})")
    x, z = pos(cp); warp(r1, x + 2.5, z); wait(r1, 800)
    check(not (get_at(rp + "/game/cop") or {}).get(runners[0]), "最初の10秒は、ぶつかってもつかまらない")
    warp(r1, x + 60, z)
    cp.screenshot(path=f"{SHOTS}/k2_start.png")
    wait(a, 8500)
    cp.dispatch_event("#accBtn", "pointerdown"); wait(cp, 800); v = ev(cp, "SC.player.car.v"); cp.dispatch_event("#accBtn", "pointerup")
    check(v > 3, f"10秒たつと、警察は動ける(速さ {v:.1f})")
    # つかまえる
    x, z = pos(cp); warp(r1, x + 2.5, z); wait(r1, 900)
    check((get_at(rp + "/game/cop") or {}).get(runners[0]) is True, "10秒たつと、ぶつかった人がつかまる")
    wait(r1, 300)
    check(ev(r1, "SC.player.mode === 'car' && SC.player.car.cop") and "あなたが警察" in r1.inner_text("#mission"), "つかまった人の車がパトカーに変わって、警察の仲間になる")
    check("秒後につかまえられる" in r1.inner_text("#mission"), "つかまってすぐは「〇秒後につかまえられる」")
    check("警察" in a.inner_text("#scores"), "点数のところに「警察」")
    warp(cp, -150, -150)  # 最初の警察ははなれる
    x, z = pos(r1); warp(r2, x + 2.5, z); wait(r2, 900)
    check(not (get_at(rp + "/game/cop") or {}).get(runners[1]), "つかまって3秒は、ほかの人をつかまえられない")
    warp(r2, x + 80, z); wait(a, 2600)
    x, z = pos(r1); warp(r2, x + 2.5, z); wait(r2, 1000)
    g = get_at(rp + "/game")
    check((g.get("cop") or {}).get(runners[1]) is True and g["phase"] == "end" and g.get("how") == "cops", "3秒たつと、つかまえられる。みんなつかまったら終わり")
    wait(a, 400)
    check(a.is_visible("#result") and "警察の勝ち" in a.inner_text("#resTitle") and "最初の警察" in a.inner_text("#resList"), "結果画面:「警察の勝ち！」「最初の警察」")
    lst = a.inner_text("#resList").split("\n")
    check("逃げ" in lst[0] and "最初の警察" in lst[-1], "結果は、逃げた時間が長い順")
    a.screenshot(path=f"{SHOTS}/k3_copswin.png")

    # ---------- 逃げ切り ----------
    a.click("#resAgain"); wait(a, 1000)
    g = get_at(rp + "/game")
    first = list(g["cop"].keys())[0]; runners = [u for u in ph if u != first]
    check(g["phase"] == "play" and len(g["cop"]) == 1 and not g.get("caughtT"), "もう一度も、ケイドロ(警察は1人にもどる)")
    check(ev(ph[runners[0]], "!SC.player.car.cop"), "もう一度のときは、逃げる人はふつうの車にもどる")
    set_at(rp + "/game/endAt", int(time.time() * 1000) + 1500); set_at(rp + "/game/rev", 9999); wait(a, 2600)
    g = get_at(rp + "/game")
    check(g["phase"] == "end" and g.get("how") == "escape", "時間切れで、逃げ切った人がいれば終わり")
    wait(a, 400); rp1 = ph[runners[0]]
    check("あなたの勝ち" in rp1.inner_text("#resTitle") and "逃げ切った" in rp1.inner_text("#resList") and "負け" not in ph[first].inner_text("#resTitle"), "結果画面: 逃げ切った人は「あなたの勝ち！」")
    check("勝ち" in ph[first].inner_text("#resTitle"), "警察の画面には、逃げ切った人の勝ちが出る")
    rp1.screenshot(path=f"{SHOTS}/k4_escape.png")

    # ---------- 警察がぬける ----------
    a.click("#resAgain"); wait(a, 1000)
    first = list(get_at(rp + "/game/cop").keys())[0]
    if first == "uid_A":
        set_at(rp + "/game/cop", {"uid_B": True}); set_at(rp + "/game/first", "uid_B"); set_at(rp + "/game/rev", 99999); wait(a, 600); first = "uid_B"
    ph[first].click("#quitBtn"); wait(a, 1200)
    g = get_at(rp + "/game"); cops = [k for k in (g.get("cop") or {}) if k in g["players"]]
    check(first not in g["players"] and len(cops) == 1 and g["phase"] == "play", "警察がやめると、ほかの人が警察になる")

    check(not errors, "エラーなし" + ("" if not errors else ": " + " / ".join(errors[:5])))
    browser.close()

print("\n" + ("全部OK" if not fails else f"NG が {len(fails)} こ"))
sys.exit(1 if fails else 0)
