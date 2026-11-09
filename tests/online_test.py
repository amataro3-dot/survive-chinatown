"""配達競争のテスト: にせ Firebase と、にせ Three.js で、スマホ3台ぶんを同時に動かす
使い方(Claude 用): python3 tests/online_test.py . <スクリーンショットを置くフォルダ>
動かす人をワープさせて(SC.player.car.x = …)、荷物を取る・届ける・奪う・勝ち・やめるを確かめる。"""
import sys, os
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
    phones = {}
    def open_phone(name):
        ctx = browser.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda route: route.fulfill(
            content_type="text/javascript", body=FAKE[route.request.url.rsplit("/", 1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda route: route.fulfill(content_type="text/javascript", body=STUB))
        uid = "uid_" + name
        ctx.expose_function("__db", handler_for(uid))
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        pg.on("console", lambda m: m.type == "error" and errors.append(f"{name}: {m.text}"))
        pg.goto(URL); pg.wait_for_timeout(300)
        phones[name] = (ctx, pg, uid)
        return pg
    def disconnect(name):
        ctx, pg, uid = phones.pop(name)
        for path, v in ondis.pop(uid, {}).items(): set_at(path, v)
        ctx.close()
    wait = lambda pg, ms=700: pg.wait_for_timeout(ms)  # 街が重くなったので、待ち時間を長めに
    ev = lambda pg, js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def warp(pg, x, z):
        pg.evaluate(f"(() => {{ const p = SC.player; if (p.car) {{ p.car.x = {x}; p.car.z = {z}; p.car.v = 0; }} p.x = {x}; p.z = {z}; }})()")

    # ---------- 3人でルームに入ってスタート ----------
    a, b, c = open_phone("A"), open_phone("B"), open_phone("C")
    check(a.is_visible("#start") and a.is_visible("#goOnline") and a.is_visible("#goSolo"), "スタート画面に「配達競争」「ひとりで遊ぶ」が出る")
    a.click("#goOnline"); a.fill("#lbName", "みつる"); a.click("#lbCreate"); wait(a, 600)
    code = a.inner_text("#lbRoomCode")
    check(len(code) == 4 and code.isdigit(), f"ルームができる(コード {code})")
    rp = f"sc-rooms/{code}"
    for pg, n in ((b, "たろう"), (c, "はなこ<b>")):
        pg.click("#goOnline"); pg.fill("#lbName", n); pg.fill("#lbCode", code); pg.click("#lbJoin"); wait(pg, 600)
    wait(a, 400)
    check("3 / 4人" in a.inner_text("#lbCount") and "はなこ<b>" in a.inner_text("#lbPlayers"), "3人が待合室にそろう(名前の記号もそのまま出る)")
    check(a.is_visible("#lbStart") and not b.is_visible("#lbStart"), "スタートボタンはホストだけ")
    a.screenshot(path=f"{SHOTS}/o1_lobby.png")
    a.click("#lbStart"); wait(a, 900)
    game = get_at(rp + "/game")
    check(game and game["phase"] == "play" and len(game["players"]) == 3 and game["target"] == 3, "スタートで試合ができる(3人・3点先取)")
    check([game["players"][u]["slot"] for u in ("uid_A", "uid_B", "uid_C")] == [0, 1, 2], "並ぶ場所は入った順")
    check(all(ev(pg, "SC.G.mode") == "race" and ev(pg, "SC.player.mode") == "car" for pg in (a, b, c)), "3人とも配達競争モードで、車に乗って始まる")
    check(not a.is_visible("#lobby") and a.is_visible("#scores"), "ロビーが消えて、点数が出る")
    wait(a, 500)
    pos = get_at(rp + "/pos") or {}
    check(set(pos.keys()) == {"uid_A", "uid_B", "uid_C"}, f"みんなの位置が送られる({len(pos)}人)")
    check(ev(a, "Object.values(SC.R.avatars).filter(v => v.seen).length") == 2, "A の画面に、ほかの2人が見える")

    # ---------- 動く・同じ場所に見える ----------
    x0 = ev(b, "SC.player.x"); z0 = ev(b, "SC.player.z")
    b.keyboard.down("ArrowUp"); wait(b, 900); b.keyboard.up("ArrowUp"); b.keyboard.down("Space"); wait(b, 1500); b.keyboard.up("Space"); wait(b, 500)
    x1 = ev(b, "SC.player.x"); z1 = ev(b, "SC.player.z")
    check(abs(x1 - x0) + abs(z1 - z0) > 3, f"B が運転して動く(({x0:.0f},{z0:.0f})→({x1:.0f},{z1:.0f}))")
    ax = ev(a, "SC.R.avatars.uid_B.x"); az = ev(a, "SC.R.avatars.uid_B.z")
    check(abs(ax - x1) < 1.5 and abs(az - z1) < 1.5, f"A の画面でも B が同じ場所に見える(B:{x1:.1f},{z1:.1f} A側:{ax:.1f},{az:.1f})")

    # ---------- 荷物を取る ----------
    pk = get_at(rp + "/game/pkg")
    warp(b, pk["x"], pk["z"]); wait(b, 800)
    g = get_at(rp + "/game")
    check(g["pkg"]["state"] == "held" and g["pkg"]["holder"] == "uid_B" and g.get("dest"), "B が荷物の場所に行くと、B が荷物を持つ。届け先が決まる")
    d = ((g["dest"]["x"] - pk["x"]) ** 2 + (g["dest"]["z"] - pk["z"]) ** 2) ** 0.5
    check(120 <= d <= 260, f"届け先は荷物から120〜260はなれている({d:.0f})")
    check("届け先" in b.inner_text("#mission") and "から荷物を奪え" in a.inner_text("#mission"), "B には「届け先へ」、A には「B から奪え」と出る")
    b.screenshot(path=f"{SHOTS}/o2_holding.png")

    # ---------- 奪う(3秒は守られる) ----------
    bx, bz = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    warp(c, bx + 2.5, bz); wait(c, 700)
    check(get_at(rp + "/game/pkg/holder") == "uid_B", "取った直後(3秒以内)は、ぶつかっても奪えない")
    wait(c, 2600)
    warp(c, ev(b, "SC.player.x") + 2.5, ev(b, "SC.player.z")); wait(c, 700)
    check(get_at(rp + "/game/pkg/holder") == "uid_C", "3秒たつと、C がぶつかって奪える")
    check("奪った" in c.inner_text("#toast") or "奪" in c.inner_text("#mission") or "届け先" in c.inner_text("#mission"), "C の画面が「届け先へ」に変わる")
    # C を遠くへ
    warp(c, -150, -150); wait(c, 400)

    # ---------- 届ける → 1点 ----------
    dest = get_at(rp + "/game/dest")
    warp(c, dest["x"], dest["z"]); wait(c, 1300)
    g = get_at(rp + "/game")
    check((g.get("scores") or {}).get("uid_C") == 1 and g["pkg"]["state"] == "free" and not g.get("dest"), "C が届け先に着くと1点。荷物は新しい場所へ")
    check("1点" in a.inner_text("#scores"), "点数の表示が変わる")

    # ---------- 3点取ったら勝ち ----------
    for k in range(2):
        pk = get_at(rp + "/game/pkg"); warp(c, pk["x"], pk["z"]); wait(c, 1100)
        dest = get_at(rp + "/game/dest"); warp(c, dest["x"], dest["z"]); wait(c, 1300)
    g = get_at(rp + "/game")
    check(g["phase"] == "end" and g["winner"] == "uid_C" and g["scores"]["uid_C"] == 3, "C が3点で勝ち")
    wait(a, 400)
    check(a.is_visible("#result") and "はなこ<b> の勝ち" in a.inner_text("#resTitle") and a.is_visible("#resAgain"), "結果画面: ホストに「もう一度」が出る")
    check(c.is_visible("#result") and "あなたの勝ち" in c.inner_text("#resTitle") and c.is_visible("#resWait") and not c.is_visible("#resAgain"), "勝った人には「あなたの勝ち」。ホスト以外は待つ")
    a.screenshot(path=f"{SHOTS}/o3_result.png")

    # ---------- もう一度 ----------
    old = g["id"]
    a.click("#resAgain"); wait(a, 900)
    g = get_at(rp + "/game")
    check(g["id"] != old and g["phase"] == "play" and not g.get("scores"), "もう一度で、点数0から新しい試合")
    check(not b.is_visible("#result") and ev(b, "SC.G.mode") == "race", "みんなの結果画面が消えて、また走れる")

    # ---------- B がやめる ----------
    b.click("#quitBtn"); wait(b, 900)
    check(ev(b, "SC.G.mode") != "race" and b.is_visible("#lbRoom") and "試合中" in b.inner_text("#lbRoomMsg"), "B が「やめる」→ B だけ待合室へ")
    check("uid_B" not in get_at(rp + "/game/players") and ev(a, "SC.G.mode") == "race", "A と C の試合は続く")
    wait(a, 400)
    check(not ev(a, "!!(SC.R.avatars.uid_B && SC.R.avatars.uid_B.seen)"), "A の画面から B が消える")

    # ---------- ホストが切れる → C が引きつぐ ----------
    pk = get_at(rp + "/game/pkg"); disconnect("A"); wait(c, 900)
    check(get_at(rp + "/meta/host") == "uid_C", "ホスト(A)が切れたら、C がホストになる")
    warp(c, pk["x"], pk["z"]); wait(c, 800)
    check(get_at(rp + "/game/pkg/holder") == "uid_C", "新しいホストのもとで、試合が続く(荷物を取れる)")

    # ---------- ロビーにもどす ----------
    c.click("#quitBtn"); wait(c, 900)
    check(not get_at(rp + "/meta/started") and get_at(rp + "/game") is None and get_at(rp + "/pos") is None, "ホストの「やめる」で、全員ロビーにもどる(試合と位置が消える)")
    check(c.is_visible("#lbRoom") and c.is_visible("#lbStart"), "ホストの画面は待合室にもどる")
    c.screenshot(path=f"{SHOTS}/o4_back.png")

    # ---------- ひとり用 ----------
    s = open_phone("S")
    s.click("#goSolo"); wait(s, 500)
    check(ev(s, "SC.G.mode") == "solo" and "ミッション1" in s.inner_text("#mission"), "ひとりで遊ぶ → ミッション1が始まる")
    s.keyboard.press("e"); wait(s, 300)
    check(ev(s, "SC.player.mode") == "car", "E で近くの車に乗れる")
    s.screenshot(path=f"{SHOTS}/o5_solo.png")

    check(not errors, "エラーなし" + ("" if not errors else ": " + " / ".join(errors[:5])))
    browser.close()

print("\n" + ("全部OK" if not fails else f"NG が {len(fails)} こ"))
sys.exit(1 if fails else 0)
