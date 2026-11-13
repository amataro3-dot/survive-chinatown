"""撃ち合いのテスト(v=28): にせ Firebase と、にせ Three.js で、スマホ2〜3台ぶんを同時に動かす
使い方(Claude 用): python3 tests/shoot_test.py . <スクリーンショットを置くフォルダ>"""
import sys, os, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from fakefb import get_at, set_at, serve, handler_for, FAKE

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
    def place(pg, x, z, h=0):  # 車を降りて、その場所に立つ
        pg.evaluate(f"(() => {{ const p = SC.player; if (p.mode === 'car') SC.exitCar(); p.x = {x}; p.z = {z}; p.h = {h}; }})()")
    def tap(pg):
        pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup")
    on = lambda pg, sel: "on" in (pg.get_attribute(sel, "class") or "")
    hp = lambda pg: ev(pg, "SC.player.hp")

    a, b = open_phone("A"), open_phone("B")
    ev(a, "(SC.player.inv = ['fist', 'pistol'], SC.player.ammo = 7, 0)")  # ひとり用の持ち物(あとで元にもどるか確かめる)
    a.click("#goOnline"); a.fill("#lbName", "みつる"); a.click("#lbCreate"); wait(a, 600)
    code = a.inner_text("#lbRoomCode"); rp = f"sc-rooms/{code}"
    b.click("#goOnline"); b.fill("#lbName", "たろう"); b.fill("#lbCode", code); b.click("#lbJoin"); wait(b, 600)
    check(a.is_visible("#lbRshoot") and b.is_disabled("#lbRshoot"), "待合室に「撃ち合い」のボタン")
    a.click("#lbRshoot"); wait(a, 500)
    check(get_at(rp + "/meta/rule") == "shoot" and "3分" in b.inner_text("#lbRuleNote"), "撃ち合いをえらぶと、説明が出る")
    a.screenshot(path=f"{SHOTS}/s1_lobby.png")

    # ---------- 始まり ----------
    a.click("#lbStart"); wait(a, 1000)
    g = get_at(rp + "/game"); items = g.get("items") or []
    check(g["rule"] == "shoot" and len(items) == 22 and abs(g["left"] - 180) <= 2, "撃ち合いの試合ができる(アイテム22こ・のこり180秒)")
    kinds = {}
    for it in items: kinds[it["k"]] = kinds.get(it["k"], 0) + 1
    check(kinds == {"pistol": 4, "mg": 2, "knife": 2, "katana": 1, "pig": 2, "snake": 2, "ammo": 3, "vest": 2, "heal": 2, "speed": 2}, "アイテムの数(ピストル4・マシンガン2・刀2・日本刀1・豚の頭2・ヘビ2・弾の箱3・チョッキ2・回復薬2・スピード2)")
    apart = min(math.hypot(p_["x"] - q["x"], p_["z"] - q["z"]) for i, p_ in enumerate(items) for q in items[i + 1:])
    check(apart > 20, f"アイテムどうしは、はなれている(いちばん近くて {apart:.0f}m)")
    check(ev(a, "SC.player.inv.join()") == "fist" and ev(a, "SC.player.hp") == 100 and a.is_visible("#hpBar"), "素手・体力100で始まる。体力バーが出る")
    ev(a, "(SC.exitCar(), 0)"); wait(a, 300)
    check(a.is_visible("#atkBtn") and a.is_visible("#wpnBtn") and "素手" in a.inner_text("#wpnBtn"), "車を降りると、こうげきボタンが出る(素手)")
    check(ev(b, "SC.itemMeshes().filter(m => m && m.g.visible).length") == 22, "アイテムが街に見える")
    check("撃ち合い" in a.inner_text("#mission") and "武器を拾って" in a.inner_text("#mission"), "画面に「撃ち合い」「武器を拾って、たおせ！」")
    check(not ev(a, "SC.cars.some(c => c.kind === 'police')"), "街のパトカーは出ない")

    # ---------- 拾う ----------
    pi = next(i for i, it in enumerate(items) if it["k"] == "pistol")
    place(a, items[pi]["x"], items[pi]["z"]); wait(a, 900)
    g = get_at(rp + "/game")
    check("pistol" in (g.get("got") or {}).get("uid_A", []) and not g["items"][pi]["on"], "近づくとピストルを拾う(アイテムは消える)")
    check(ev(a, "SC.player.inv.includes('pistol') && SC.player.ammo") == 12 and "ピストル 12" in a.inner_text("#wpnBtn"), "ピストルと弾12発が手に入る")
    wait(b, 300)
    check(not ev(b, f"SC.itemMeshes()[{pi}].g.visible"), "ほかの人の画面からも消える")
    ai = next(i for i, it in enumerate(items) if it["k"] == "ammo")
    place(b, items[ai]["x"], items[ai]["z"]); wait(b, 900)
    check(get_at(rp + "/game/items")[ai]["on"] is True, "銃を持っていないと、弾の箱は拾わない")
    old = (items[pi]["x"], items[pi]["z"])
    its = get_at(rp + "/game/items"); its[pi]["at"] = int(time.time() * 1000); set_at(rp + "/game/items", its); set_at(rp + "/game/rev", 9999); wait(a, 900)
    it = get_at(rp + "/game/items")[pi]
    check(it["on"] and it["g"] == 1 and math.hypot(it["x"] - old[0], it["z"] - old[1]) > 30, "時間がたつと、別の場所にまた出る")

    # ---------- 撃つ ----------
    place(a, 0, 0, 0); place(b, 0, 8); wait(a, 900)
    tap(a); wait(a, 900)
    check(hp(b) == 75, f"ピストルが当たると、撃たれた人の体力が25へる(体力 {hp(b)})")
    check(ev(a, "SC.player.ammo") == 11, "弾が1発へる")
    for _ in range(3): tap(a); wait(a, 850)
    wait(a, 400)
    check(ev(b, "SC.G.shDown > 0") and hp(b) <= 0, "体力が0になると、やられる")
    check("みつるにやられた" in b.inner_text("#mission") or "みつるにやられた" in b.inner_text("#toast"), "やられた人の画面に「みつるにやられた…」")
    g = get_at(rp + "/game")
    check((g.get("kills") or {}).get("uid_A") == 1 and (g.get("deaths") or {}).get("uid_B") == 1, "ホストが、たおした数・やられた数を数える")
    check("たおした 1" in a.inner_text("#scores"), "画面の点数に「たおした 1」")
    b.screenshot(path=f"{SHOTS}/s2_down.png")
    wait(b, 3000)
    bx, bz = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    check(hp(b) == 100 and ev(b, "SC.G.shDown") <= 0 and ev(b, "SC.player.inv.join()") == "fist", "3秒で、素手・体力100で復活")
    check(math.hypot(bx, bz) > 50, f"ほかの人からはなれた所に復活({math.hypot(bx, bz):.0f}m)")
    place(a, bx, bz - 8, 0); wait(a, 700)
    if ev(b, "SC.G.shInv > 0 && performance.now() > 0"):
        tap(a); wait(a, 500)
    check(hp(b) == 100, "復活して2秒は、撃たれても平気")
    wait(a, 1500)

    # ---------- 車でひく ----------
    ev(a, "(() => { const c = SC.newCar('parked', SC.player.x, SC.player.z - 6, 0, 0xff0000); SC.enterCar(c); return 0; })()")
    bx, bz = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    ev(a, f"(() => {{ const c = SC.player.car; c.x = {bx}; c.z = {bz} - 1.5; c.v = 12; return 0; }})()"); wait(a, 900)
    check(hp(b) == 50, f"車でひくと50へる(体力 {hp(b)})")
    ev(a, "(SC.player.car.v = 0, SC.exitCar(), 0)")

    # ---------- 豚の頭・アイテムの効き目 ----------
    ev(a, "SC.applyItem('pig')")
    bx, bz = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    place(a, bx, bz - 7, 0); ev(a, "(SC.player.wi = SC.player.inv.indexOf('pig'), 0)"); wait(a, 600)
    tap(a); wait(a, 1300)
    check(ev(b, "SC.player.blind > 0") and float(b.evaluate("getComputedStyle(document.getElementById('blindFx')).opacity")) > 0.3, "豚の頭が当たると、前が見えなくなる")
    check(hp(b) == 10, f"豚の頭は40へる(体力 {hp(b)})")
    check(ev(a, "SC.R.avatars['uid_B'] && SC.R.avatars['uid_B'].st") == 1, "ほかの人の画面でも、豚の頭をかぶって見える")
    ev(b, "SC.applyItem('heal')"); check(hp(b) == 50, "回復薬で体力+40")
    ev(b, "SC.applyItem('vest')"); check(ev(b, "SC.player.armor") == 50 and not ev(b, "SC.canTake('vest')"), "チョッキは50。満タンだともう拾わない")
    ev(b, "SC.applyItem('speed')"); wait(b, 300); check(ev(b, "SC.G.spdT > 0") and "スピードアップ" in b.inner_text("#mission"), "スピードアップが出る")
    ev(b, "SC.applyItem('mg')"); ev(b, "SC.applyItem('ammo')")
    check(ev(b, "SC.player.mg") == 60, "マシンガン30発+弾の箱30発")
    b.screenshot(path=f"{SHOTS}/s3_items.png")

    # ---------- 時間切れ ----------
    set_at(rp + "/game/endAt", int(time.time() * 1000) + 1200); set_at(rp + "/game/rev", 99999); wait(a, 2500)
    g = get_at(rp + "/game")
    check(g["phase"] == "end" and g["winner"] == "uid_A", "時間切れで、たおした数がいちばん多い人の勝ち")
    wait(a, 400)
    check(a.is_visible("#result") and "あなたの勝ち" in a.inner_text("#resTitle") and "たおした 1・やられた 0" in a.inner_text("#resList") and "撃ち合い" in a.inner_text("#resNote"), "結果画面: たおした数・やられた数")
    check("みつる の勝ち" in b.inner_text("#resTitle"), "負けた人の画面に「みつる の勝ち！」")
    a.screenshot(path=f"{SHOTS}/s4_result.png")

    # ---------- 同じ数なら引き分け・もう一度 ----------
    a.click("#resAgain"); wait(a, 1000)
    g = get_at(rp + "/game")
    check(g["phase"] == "play" and not g.get("kills") and ev(a, "SC.player.inv.join()") == "fist", "もう一度: 数は0、素手にもどる")
    set_at(rp + "/game/endAt", int(time.time() * 1000) + 1200); set_at(rp + "/game/rev", 99999); wait(a, 2500)
    check(get_at(rp + "/game/winner") is None and "引き分け" in a.inner_text("#resTitle"), "だれもたおしていなければ引き分け")

    # ---------- 配達競争にもどすと、ひとり用の持ち物ももどる ----------
    a.click("#resLobby"); wait(a, 900)
    check(ev(a, "SC.player.ammo") == 7 and ev(a, "SC.player.inv.join()") == "fist,pistol" and not ev(a, "document.body.classList.contains('shoot')"), "撃ち合いが終わると、ひとり用の持ち物にもどる")
    a.click("#lbRdeliver"); wait(a, 400); a.click("#lbStart"); wait(a, 900)
    check(get_at(rp + "/game/rule") == "deliver" and not a.is_visible("#atkBtn") and not ev(a, "SC.itemMeshes().some(m => m && m.g.visible)"), "配達競争では、こうげきボタンもアイテムも出ない")

    check(not errors, "エラーなし" + ("" if not errors else ": " + " / ".join(errors[:5])))
    browser.close()

print("\n" + ("全部OK" if not fails else f"NG が {len(fails)} こ"))
sys.exit(1 if fails else 0)
