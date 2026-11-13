"""ルールえらび・レース・鬼ごっこのテスト(v=26): にせ Firebase と、にせ Three.js で、スマホ3台ぶんを同時に動かす
使い方(Claude 用): python3 tests/rules_test.py . <スクリーンショットを置くフォルダ>"""
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
        ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page()
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
    ev = lambda pg, js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def warp(pg, x, z):
        pg.evaluate(f"(() => {{ const p = SC.player; if (p.car) {{ p.car.x = {x}; p.car.z = {z}; p.car.v = 0; }} p.x = {x}; p.z = {z}; }})()")
    import time
    on = lambda pg, sel: "on" in (pg.get_attribute(sel, "class") or "")

    # ---------- 待合室: ルールをえらぶ ----------
    a, b, c = open_phone("A"), open_phone("B"), open_phone("C")
    check("対戦" in a.inner_text("#goOnline"), "スタート画面のボタンは「みんなで対戦」")
    a.click("#goOnline"); a.fill("#lbName", "みつる"); a.click("#lbCreate"); wait(a, 600)
    code = a.inner_text("#lbRoomCode"); rp = f"sc-rooms/{code}"
    for pg, n in ((b, "たろう"), (c, "はなこ")):
        pg.click("#goOnline"); pg.fill("#lbName", n); pg.fill("#lbCode", code); pg.click("#lbJoin"); wait(pg, 600)
    wait(a, 300)
    check(on(a, "#lbRdeliver") and not a.is_disabled("#lbRrace") and b.is_disabled("#lbRrace") and "3点" in a.inner_text("#lbRuleNote"), "はじめは配達競争。ルールをえらべるのはホストだけ")
    a.click("#lbRrace"); wait(a, 500)
    check(get_at(rp + "/meta/rule") == "race" and on(b, "#lbRrace") and "8つ" in b.inner_text("#lbRuleNote"), "ホストがレースをえらぶと、みんなの画面も変わる")
    a.screenshot(path=f"{SHOTS}/r1_lobby.png")

    # ---------- レース ----------
    a.click("#lbStart"); wait(a, 900)
    g = get_at(rp + "/game")
    cps = g.get("cps") or []
    check(g["rule"] == "race" and len(cps) == 8 and not g.get("pkg") and not g.get("scores"), "レースの試合ができる(チェックポイント8つ・荷物はない)")
    apart = min(((p["x"] - q["x"]) ** 2 + (p["z"] - q["z"]) ** 2) ** 0.5 for i, p in enumerate(cps) for q in cps[i + 1:])
    check(apart > 20, f"チェックポイントどうしは、はなれている(いちばん近くて {apart:.0f}m)")
    check(all(ev(pg, "SC.G.rule") == "race" for pg in (a, b, c)) and "レース" in a.inner_text("#mission") and "1/8" in a.inner_text("#mission"), "みんなレースになる。画面に「1/8」")
    mk = ev(b, "SC.raceMarker().visible && SC.R.cp ? [SC.R.cp.x, SC.R.cp.z] : null")
    check(mk and abs(mk[0] - cps[0]["x"]) < 0.1 and abs(mk[1] - cps[0]["z"]) < 0.1, "緑の光が、1つ目のチェックポイントに出る")
    warp(b, cps[1]["x"], cps[1]["z"]); wait(b, 600)
    check(not (get_at(rp + "/game/prog") or {}).get("uid_B"), "順番をとばしても、数えない")
    for k in range(3): warp(b, cps[k]["x"], cps[k]["z"]); wait(b, 600)
    check((get_at(rp + "/game/prog") or {}).get("uid_B") == 3 and "4/8" in b.inner_text("#mission") and "3/8" in a.inner_text("#scores"), "順番に通ると数がふえる(B 3/8)")
    mk = ev(b, "[SC.R.cp.x, SC.R.cp.z]")
    check(abs(mk[0] - cps[3]["x"]) < 0.1, "緑の光は、次のチェックポイントにうつる")
    check(ev(b, "SC.G.wanted") == 0 and not ev(b, "SC.cars.some(c => c.kind === 'police')"), "レースでは警察は出ない")
    b.screenshot(path=f"{SHOTS}/r2_race.png")
    for k in range(3, 8): warp(b, cps[k]["x"], cps[k]["z"]); wait(b, 600)
    g = get_at(rp + "/game"); wait(a, 400)
    check(g["phase"] == "end" and g["winner"] == "uid_B", "8つ全部通ると、B の勝ち")
    check(a.is_visible("#result") and "たろう の勝ち" in a.inner_text("#resTitle") and "8/8" in a.inner_text("#resList") and "レース" in a.inner_text("#resNote"), "結果画面: たろうの勝ち・8/8")
    a.screenshot(path=f"{SHOTS}/r3_result.png")
    a.click("#resAgain"); wait(a, 900)
    g2 = get_at(rp + "/game")
    check(g2["rule"] == "race" and g2["phase"] == "play" and g2["cps"] != cps and not g2.get("prog"), "もう一度も、レース(チェックポイントは新しくなる)")

    # ---------- 鬼ごっこ ----------
    a.click("#quitBtn"); wait(a, 900)
    a.click("#lbRtag"); wait(a, 500)
    check(get_at(rp + "/meta/rule") == "tag" and "3分" in c.inner_text("#lbRuleNote"), "鬼ごっこをえらべる")
    a.click("#lbStart"); wait(a, 900)
    g = get_at(rp + "/game")
    check(g["rule"] == "tag" and g["oni"] in ("uid_A", "uid_B", "uid_C") and abs(g["left"] - 180) <= 2, "鬼ごっこの試合ができる(鬼は1人・のこり180秒)")
    ph = {"uid_A": a, "uid_B": b, "uid_C": c}
    oni = g["oni"]; op = ph[oni]; others = [u for u in ph if u != oni]; r1 = ph[others[0]]; r2 = ph[others[1]]
    check("あなたが鬼" in op.inner_text("#mission") and "が鬼" in r1.inner_text("#mission"), "鬼の人には「あなたが鬼」、ほかの人には「〇〇が鬼！」")
    check(ev(r1, "SC.raceMarker().visible") and not ev(op, "SC.raceMarker().visible") and ev(r1, "SC.oniMark().visible"), "ほかの人には、鬼の所に赤い光と頭の上のしるし")
    check(ev(op, "SC.G.wanted") == 0, "鬼ごっこでも警察は出ない")
    # 始まって5秒はタッチできない
    ox, oz = ev(op, "SC.player.x"), ev(op, "SC.player.z")
    warp(r1, ox + 2.5, oz); wait(r1, 800)
    check(get_at(rp + "/game/oni") == oni, "始まってすぐ(5秒)は、ぶつかっても交代しない")
    op.screenshot(path=f"{SHOTS}/r4_tag.png")
    wait(a, 4500)
    warp(r1, ev(op, "SC.player.x") + 2.5, ev(op, "SC.player.z")); wait(r1, 800)
    check(get_at(rp + "/game/oni") == others[0], "5秒たつと、ぶつかると鬼が交代する")
    wait(a, 700); same = get_at(rp + "/game/oni") == others[0]
    warp(op, -150, -150)  # はなれる(3秒たつと、またタッチされるので)
    check(same, "交代してすぐ(3秒)は、もどせない")
    check("あなたが鬼" in r1.inner_text("#mission") and ("鬼になった" in op.inner_text("#toast") or "が鬼" in op.inner_text("#mission")), "新しい鬼の画面が「あなたが鬼」に変わる")
    check("秒後にタッチできる" in r1.inner_text("#mission") or "ミニマップ" in r1.inner_text("#mission"), "鬼の画面に、タッチできるまでの秒か、ミニマップのヒント")
    wait(a, 2600)
    warp(r2, ev(r1, "SC.player.x") + 2.5, ev(r1, "SC.player.z")); wait(r2, 800)
    now_oni = get_at(rp + "/game/oni"); warp(r1, 150, 150); warp(r2, -100, 150)  # みんなはなれる(となりにいると、3秒後にまたタッチされる)
    check(now_oni == others[1], "3秒たつと、またタッチできる")
    left0 = get_at(rp + "/game/left"); wait(a, 2200)
    check(get_at(rp + "/game/left") < left0 and "のこり" in b.inner_text("#mission"), "のこり秒がへっていく")
    ot = get_at(rp + "/game/oniT") or {}
    check(ot.get(oni, 0) > 4, f"鬼だった秒を数える({ot.get(oni, 0)}秒)")
    # 時間切れ(終わる時刻を近くにする)
    set_at(rp + "/game/endAt", int(time.time() * 1000) + 1500); set_at(rp + "/game/rev", 9999); wait(a, 2500)
    g = get_at(rp + "/game")
    check(g["phase"] == "end" and g["loser"] == others[1], "時間切れのときに鬼だった人の負け")
    wait(a, 400)
    check(r2.is_visible("#result") and "あなたの負け" in r2.inner_text("#resTitle") and "の負け" in a.inner_text("#resTitle") and "最後の鬼" in a.inner_text("#resList"), "結果画面: 負けた人と「最後の鬼」")
    a.screenshot(path=f"{SHOTS}/r5_tagend.png")

    # ---------- 鬼がぬける ----------
    a.click("#resAgain"); wait(a, 900)
    oni = get_at(rp + "/game/oni")
    if oni == "uid_A":
        set_at(rp + "/game/oni", "uid_B"); set_at(rp + "/game/rev", 99999); wait(a, 600); oni = "uid_B"
    ph[oni].click("#quitBtn"); wait(a, 1200)
    check(get_at(rp + "/game/oni") not in (None, oni) and oni not in get_at(rp + "/game/players"), "鬼がやめると、ほかの人が鬼になる")

    # ---------- 配達競争にもどすと、今までどおり ----------
    a.click("#quitBtn"); wait(a, 900); a.click("#lbRdeliver"); wait(a, 400)
    left = [pg for pg in (b, c) if pg.is_visible("#lbRoom")]
    a.click("#lbStart"); wait(a, 900)
    g = get_at(rp + "/game")
    check(g.get("rule") == "deliver" and g.get("pkg") and g.get("target") == 3, "配達競争にもどすと、荷物の試合になる")

    check(not errors, "エラーなし" + ("" if not errors else ": " + " / ".join(errors[:5])))
    browser.close()

print("\n" + ("全部OK" if not fails else f"NG が {len(fails)} こ"))
sys.exit(1 if fails else 0)
