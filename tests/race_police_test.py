"""配達競争の警察と時間えらびのテスト(v=20): にせ Firebase と、にせ Three.js で、スマホ3台ぶんを同時に動かす
使い方(Claude 用): python3 tests/race_police_test.py . <スクリーンショットを置くフォルダ>
時間えらび・人をひくと追われる・★がみんなに見える・パトカーと警察官がみんなに見える・ほかの人のパトカーにぶつけると手配・
つかまると観戦(荷物が落ちる)・逃げ切る・のこり1人で勝ち・もう一度・引き分けの決め方・英語。"""
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
    def open_phone(name, lang=None):
        ctx = browser.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda route: route.fulfill(
            content_type="text/javascript", body=FAKE[route.request.url.rsplit("/", 1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda route: route.fulfill(content_type="text/javascript", body=STUB))
        uid = "uid_" + name
        ctx.expose_function("__db", handler_for(uid))
        ctx.add_init_script('window.SC_NO_INTRO = 1' + (f'; localStorage.setItem("muddys-lang", "{lang}")' if lang else ''))
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        pg.on("console", lambda m: m.type == "error" and errors.append(f"{name}: {m.text}"))
        pg.goto(URL); pg.wait_for_timeout(300)
        phones[name] = (ctx, pg, uid)
        return pg
    wait = lambda pg, ms=700: pg.wait_for_timeout(ms)
    ev = lambda pg, js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    def warp(pg, x, z):
        pg.evaluate(f"(() => {{ const p = SC.player; if (p.car) {{ p.car.x = {x}; p.car.z = {z}; p.car.v = 0; }} p.x = {x}; p.z = {z}; }})()")
    def hit_ped(pg):
        # 走っている人を1人えらんで、そこに速い車を置く(人をひく)
        # 交差点から北へ走らせて、2m 前に立ち止まっている人を置く
        pg.evaluate("""(() => { const p = SC.peds.find(q => !q.off && !q.down && !q.angry), c = SC.player.car, q = SC.P(2, 2);
            c.x = q.x + 3; c.z = q.z; c.h = 0; c.v = 15; p.talkT = 3; p.x = c.x; p.z = c.z + 2; })()""")
    def bust(pg):
        # 降りて、警察官を2人そばに立たせる(つかまるまで約2秒)
        pg.evaluate("""(() => { const P = SC.player; if (P.mode === 'car') document.getElementById('enterBtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            for (const s of [1, -1]) { const n = SC.newNpc('cop', P.x + s * 0.9, P.z, 0); n.state = 'chase'; } })()""")

    # ---------- 待合室で時間をえらぶ ----------
    a, b, c = open_phone("A"), open_phone("B"), open_phone("C")
    a.click("#goOnline"); a.fill("#lbName", "みつる"); a.click("#lbCreate"); wait(a, 600)
    code = a.inner_text("#lbRoomCode"); rp = f"sc-rooms/{code}"
    for pg, n in ((b, "たろう"), (c, "はなこ")):
        pg.click("#goOnline"); pg.fill("#lbName", n); pg.fill("#lbCode", code); pg.click("#lbJoin"); wait(pg, 600)
    wait(a, 400)
    check(a.is_visible("#lbTday") and a.is_enabled("#lbTday") and "on" in a.get_attribute("#lbTnight", "class"), "ホストには時間のボタン3つ。はじめは夜")
    check(b.is_visible("#lbTday") and not b.is_enabled("#lbTday"), "ホスト以外は押せない")
    a.click("#lbTday"); wait(a, 600)
    check(get_at(rp + "/meta/time") == "day" and "on" in b.get_attribute("#lbTday", "class"), "ホストが「昼」を押すと、みんなの画面で昼にかわる")
    a.screenshot(path=f"{SHOTS}/rp1_lobby.png")
    a.click("#lbStart"); wait(a, 1000)
    g = get_at(rp + "/game")
    check(g["time"] == "day", "試合に時間が入る(昼)")
    check(all(ev(pg, "SC.G.mode") == "race" and ev(pg, "SC.G.clock") == 150 and ev(pg, "SC.G.phase") == "day" for pg in (a, b, c)), "3人とも昼の街で始まる")
    wait(a, 1200)
    check(ev(a, "SC.G.clock") == 150, "配達競争では時間が流れない")
    check(ev(a, "SC.G.wanted") == 0 and ev(a, "SC.cars.filter(c => c.kind === 'police').length") == 0, "はじめは警察に追われていない")

    # ---------- B が荷物を取って、人をひく ----------
    pk = get_at(rp + "/game/pkg"); warp(b, pk["x"], pk["z"]); wait(b, 800)
    check(get_at(rp + "/game/pkg/holder") == "uid_B", "B が荷物を持つ")
    for _ in range(5):
        if ev(b, "SC.G.wanted"): break
        hit_ped(b); wait(b, 150)
    check(ev(b, "SC.G.wanted") == 1 and "追われている" in b.inner_text("#toast"), "人をひくと、ひいた人だけ追われる(★1)")
    check(ev(a, "SC.G.wanted") == 0 and ev(c, "SC.G.wanted") == 0, "ほかの人は追われない")
    b.evaluate("SC.player.car.v = 0"); wait(b, 2600)
    check(ev(b, "SC.cars.filter(c => c.kind === 'police').length") == 1, "B を追うパトカーは1台")
    check(ev(b, "SC.cars.find(c => c.kind === 'police').crew + SC.npcs.filter(n => n.kind === 'cop').length") == 2, "中の警察官は2人")
    for _ in range(4): hit_ped(b); wait(b, 150)
    b.evaluate("SC.player.car.v = 0"); wait(b, 400)
    check(ev(b, "SC.G.wanted") == 1 and ev(b, "SC.cars.filter(c => c.kind === 'police').length") == 1, "もっとひいても★とパトカーはふえない")
    check("★" in b.inner_text("#stars"), "B の画面に★が1つ出る")
    pos = get_at(rp + "/pos/uid_B")
    check(pos.get("w") == 1 and pos.get("p"), "B の位置といっしょに、手配のしるしとパトカーの位置が送られる")
    wait(a, 400)
    check(ev(a, "SC.R.avatars.uid_B.star.visible") is True, "A の画面で、B の頭の上に★が出る")
    check(ev(a, "!!(SC.R.avatars.uid_B.cop && SC.R.avatars.uid_B.cop.seen)"), "A の画面に、B を追うパトカーが出る")
    check(ev(a, "SC.cars.filter(c => c.kind === 'police').length") == 0, "A の画面では、そのパトカーは A を追わない(見せるだけ)")
    b.screenshot(path=f"{SHOTS}/rp2_wanted.png")

    # ---------- B がつかまる → 観戦。荷物は落ちる ----------
    bx, bz = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    bust(b); wait(b, 400)
    check("捕まるぞ" in b.inner_text("#warn"), "警察官がくっつくと「逃げろ！ 捕まるぞ！」")
    wait(b, 2600)
    check(ev(b, "SC.G.out") is True and "つかまった" in b.inner_text("#toast"), "2秒くっつかれると、つかまる")
    wait(a, 600)
    g = get_at(rp + "/game")
    check((g.get("out") or {}).get("uid_B") is True, "ホストが「B はつかまった」と書く")
    check(g["pkg"]["state"] == "free" and abs(g["pkg"]["x"] - ev(b, "SC.player.x")) < 3 and abs(g["pkg"]["z"] - ev(b, "SC.player.z")) < 3, "B が持っていた荷物は、その場に落ちる")
    check(g["phase"] == "play", "のこり2人なので、試合は続く")
    check("つかまった" in a.inner_text("#toast") and "荷物が落ちた" in a.inner_text("#toast"), "A に「B がつかまった！ 荷物が落ちたぞ」")
    check(ev(b, "SC.cars.filter(c => c.kind === 'police').length") == 0 and ev(b, "SC.npcs.filter(n => n.kind === 'cop').length") == 0, "つかまったらパトカーと警察官は消える")
    check("観戦" in b.inner_text("#mission") and "を見ている" in b.inner_text("#mission"), "B の画面は「観戦中 ○○ を見ている」")
    x0, z0 = ev(b, "SC.player.x"), ev(b, "SC.player.z")
    b.dispatch_event("#accBtn", "pointerdown"); wait(b, 600); b.dispatch_event("#accBtn", "pointerup"); b.dispatch_event("#enterBtn", "pointerdown"); wait(b, 300)
    check(abs(ev(b, "SC.player.x") - x0) + abs(ev(b, "SC.player.z") - z0) < 0.1 and ev(b, "SC.player.mode") == "foot", "観戦中は動けない・車に乗れない")
    wait(a, 400)
    check(not ev(a, "SC.R.avatars.uid_B.seen") and not ev(a, "SC.R.avatars.uid_B.cop.seen"), "A の画面から B とパトカーが消える")
    check("つかまった" in a.inner_text("#scores"), "点数の所に「つかまった」")
    pk = get_at(rp + "/game/pkg"); warp(b, pk["x"], pk["z"]); wait(b, 700)
    check(get_at(rp + "/game/pkg/state") == "free", "観戦中の人は荷物を取れない")
    b.screenshot(path=f"{SHOTS}/rp3_watch.png")

    # ---------- C が人をひく → A が C のパトカーにぶつける → A も手配 ----------
    for _ in range(5):
        if ev(c, "SC.G.wanted"): break
        hit_ped(c); wait(c, 150)
    c.evaluate("SC.player.car.v = 0"); wait(c, 2600)
    check(ev(c, "SC.G.wanted") == 1 and ev(c, "SC.cars.filter(k => k.kind === 'police').length") == 1, "C も人をひいて追われる")
    c.evaluate("(() => { const k = SC.cars.find(k => k.kind === 'police'); k.x = -120; k.z = 150; k.v = 0; k.crew = 2; SC.TUNE.police.speed = 0; })()")  # パトカーを止めておく
    warp(c, 120, 150); wait(a, 900)
    kx, kz = ev(a, "SC.R.avatars.uid_C.cop.x"), ev(a, "SC.R.avatars.uid_C.cop.z")
    a.evaluate(f"(() => {{ const car = SC.player.car; car.h = 0; car.x = {kx}; car.z = {kz} - 5; car.v = 20; }})()"); wait(a, 500)
    check(ev(a, "SC.G.wanted") == 1 and "パトカーにぶつけた" in a.inner_text("#toast"), "ほかの人のパトカーに速くぶつけると、その人も追われる")
    k2x, k2z = ev(c, "SC.cars.find(k => k.kind === 'police').x"), ev(c, "SC.cars.find(k => k.kind === 'police').z")
    check(abs(k2x - kx) < 1 and abs(k2z - kz) < 1, "パトカーは押されても動かない(ぶつけた人がはね返る)")
    check(abs(ev(a, "SC.player.z") - kz) >= 3.4, "ぶつけた車は、パトカーに重ならない")

    # ---------- A が逃げ切る ----------
    a.evaluate("SC.TUNE.police.evadeTime = 0.6"); a.evaluate("SC.player.car.v = 0")
    warp(a, 150, -150); wait(a, 300)
    a.evaluate("(() => { for (const k of SC.cars) if (k.kind === 'police') { k.x = -150; k.z = 150; k.v = 0; } for (const n of SC.npcs) if (n.kind === 'cop') { n.x = -150; n.z = 150; } })()")
    wait(a, 1600)
    check(ev(a, "SC.G.wanted") == 0 and ev(a, "SC.cars.filter(k => k.kind === 'police').length") == 0, "パトカーからはなれてしばらくすると、逃げ切れる")
    wait(a, 400)
    check(not get_at(rp + "/pos/uid_A").get("w"), "逃げ切ると、手配のしるしも消える")
    a.evaluate("SC.TUNE.police.evadeTime = 10")

    # ---------- C がつかまる → のこり1人の A の勝ち ----------
    bust(c); wait(c, 3200); wait(a, 600)
    g = get_at(rp + "/game")
    check(g["phase"] == "end" and g["winner"] == "uid_A" and g.get("how") == "last", "のこり1人になった A の勝ち")
    check(a.is_visible("#result") and "あなたの勝ち" in a.inner_text("#resTitle") and "みんな警察につかまった" in a.inner_text("#resNote"), "A の結果画面: 「あなたの勝ち！」「ほかの人がみんな警察につかまった」")
    check(c.is_visible("#result") and "つかまった" in c.inner_text("#resList"), "結果の表に「つかまった」")
    a.screenshot(path=f"{SHOTS}/rp4_result.png")

    # ---------- もう一度 ----------
    a.click("#resAgain"); wait(a, 1000)
    g = get_at(rp + "/game")
    check(g["phase"] == "play" and not g.get("out") and g["time"] == "day", "もう一度: つかまった人がもどって、時間はそのまま")
    check(all(ev(pg, "SC.G.out") is False and ev(pg, "SC.G.wanted") == 0 and ev(pg, "SC.player.mode") == "car" for pg in (a, b, c)), "みんな車に乗って、また走れる")
    check(not b.is_visible("#result") and "観戦" not in b.inner_text("#mission"), "観戦の文字が消える")

    # ---------- 引き分け・点の多い人(同時につかまったとき) ----------
    j = lambda g: a.evaluate("g => import('./online.js?v=19').then(m => m.judge(g))", g)
    P3 = {"A": {}, "B": {}, "C": {}}
    check(j({"players": P3, "out": {"A": True}}) is None, "のこり2人なら続く")
    check(j({"players": P3, "out": {"A": True, "B": True}}) == {"winner": "C", "how": "last"}, "のこり1人ならその人の勝ち")
    check(j({"players": P3, "out": {"A": True, "B": True, "C": True}, "scores": {"B": 2, "C": 1}}) == {"winner": "B", "how": "caught"}, "同時に全員つかまったら、点の多い人の勝ち")
    check(j({"players": P3, "out": {"A": True, "B": True, "C": True}, "scores": {"B": 1, "C": 1}}) == {"winner": None, "how": "draw"}, "同じ点なら引き分け")
    check(j({"players": {"A": {}}, "out": {}}) is None, "だれもつかまっていなければ、1人でも続く(今までどおり)")

    # ---------- 夜・夕方 ----------
    a.click("#quitBtn"); wait(a, 900)
    a.click("#lbTeve"); wait(a, 500); a.click("#lbStart"); wait(a, 1000)
    check(ev(b, "SC.G.clock") == 350 and ev(b, "SC.G.phase") == "eve", "夕方をえらぶと、夕方(夕やけ)の街")
    a.click("#quitBtn"); wait(a, 900)
    check(ev(a, "SC.G.clock") == 560, "やめると、うしろの街は夜にもどる")

    # ---------- 英語 ----------
    e = open_phone("E", "en")
    e.click("#goOnline"); e.fill("#lbName", "eve"); e.fill("#lbCode", code); e.click("#lbJoin"); wait(e, 700)
    check("Time" in e.inner_text("#lbRoom") and "Evening" in e.inner_text("#lbRoom") and "夕方" not in e.inner_text("#lbRoom"), "英語: 時間のボタンも英語")

    check(not errors, "エラーなし" + ("" if not errors else ": " + " / ".join(errors[:5])))
    browser.close()

print("\n" + ("全部OK" if not fails else f"NG が {len(fails)} こ"))
sys.exit(1 if fails else 0)
