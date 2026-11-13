"""v=19 のテスト(Claude 用): python3 tests/boss_test.py . <画像フォルダ>
にせ Three.js で、⑥後半を確かめる:
幹部2人(好きな順番・手下3人・体力300・少し速い)・たおしたチームはおそってこない(なぐると逃げる・話せる)・
塔でのネタばらし・大ボス(ピストルと刀・手下6人)・やられたら塔の光からやり直し・終わり 3・4・セーブ・英語"""
import sys, os, json, re
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
    ctx = b.new_context(viewport={"width":844,"height":390}, device_scale_factor=2)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/",1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    do = lambda js: pg.evaluate("(() => { const SC = window.SC, G = SC.G, P = SC.player; " + js + "; return 0; })()")
    shown = lambda sel: pg.evaluate("s => { const e = document.querySelector(s); return !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' }", sel)
    txt = lambda sel: pg.inner_text(sel)
    saved = lambda: json.loads(pg.evaluate("localStorage.getItem('sc-save')") or 'null')
    ends = lambda: json.loads(pg.evaluate("localStorage.getItem('sc-ends')") or '[]')
    # マフィアを全部ねかせる(なわばりの広さは、そのまま)
    def quiet(clock=500): do(f"SC.DAY.speed=0; SC.setClock({clock}); SC.gangs.forEach(g=>{{ if(g.temp) return; g.per.g.visible=false; g.hp=0; g.dead=-1e9; }})")
    def tp(x, z, w=250): do(f"const c=P.car; if(c){{c.x={x};c.z={z};c.v=0;}} P.x={x}; P.z={z}"); pg.wait_for_timeout(w)
    F = lambda i: ev(f"(()=>{{const f=SC.FREE.find(f=>f.id==='{i}'); return {{x:f.at.x,z:f.at.z,open:SC.freeOpen(f),vis:f.g.visible}}}})()")
    def take(i, yes=True):
        f = F(i); tp(f['x'] + 8, f['z']); tp(f['x'], f['z'])
        if yes: pg.click("#offerYes"); pg.wait_for_timeout(250)
        return f
    def cont(save, clock=500):
        pg.evaluate("s => localStorage.setItem('sc-save', s)", json.dumps(save)); pg.reload(); pg.wait_for_timeout(1200); pg.click("#goCont"); pg.wait_for_timeout(800); do(f"SC.DAY.speed=0; SC.setClock({clock})"); pg.wait_for_timeout(200)
    opened = lambda: ev("SC.FREE.filter(f=>SC.freeOpen(f)).map(f=>f.id).join()")
    story = lambda: ev("SC.G.story ? { n: SC.G.story.lines.length, i: SC.G.story.i, t: SC.G.story.lines[SC.G.story.i] } : null")
    def nxt(n=1):
        for k in range(n): pg.mouse.click(300, 150); pg.wait_for_timeout(60)
    def skip(): pg.click("#storySkip"); pg.wait_for_timeout(200)
    boss = lambda: ev("SC.MX.boss ? { k: SC.MX.boss.boss, hp: SC.MX.boss.hp, w: SC.MX.boss.weapon, st: SC.MX.boss.state, x: SC.MX.boss.x, z: SC.MX.boss.z, white: SC.MX.boss.white } : null")
    # マフィアを1人おこして、主人公のそばに立たせる
    #   白は外の街(150,-150)、黒はチャイナタウンの中(塔の広場のはし)に立たせる(なわばりの外に出すと、着せかえられるので)
    def wake(white, dx=2):
        if white: tp(150, -150, 100)
        else: tp(ev("SC.PGD.x") + 8, ev("SC.PGD.z") + 16, 100)
        do(f"const g=SC.gangs.find(g=>!g.temp&&!g.off&&g.white==={str(white).lower()}); window.__g=g; g.hp=100; g.dead=-1; g.state='idle'; g.foe=null; g.per.g.visible=true; g.per.g.rotation.x=0; g.x=P.x+{dx}; g.z=P.z; g.home={{x:g.x,z:g.z}}; g.wt=99; g.tx=g.x; g.tz=g.z; g.cd=0")
    DONE3 = ["debt", "info1", "info2", "info3"]
    S3 = {"v":1,"money":50000,"mi":5,"done":DONE3,"inv":["fist"],"play":60,"lent":1}
    S5 = dict(S3, done=DONE3 + ["info4", "info5"], bosses=["B", "W"])
    ST = dict(S5, done=S5["done"] + ["sailor1", "sailor2", "sailor3", "sailor3t"], tru=1, sis=1)

    # ---------- 場所 ----------
    pg.goto(URL); pg.wait_for_timeout(1200)
    bad = ev("""(()=>{ const B=(x,z)=>SC.pointBlocked(x,z), T=SC.TOWER, pts=[SC.BOSS_AT.B(), SC.BOSS_AT.W(), SC.BOSS_AT.O(), T, T.info, SC.INFO2, {x:162.5,z:151}, {x:SC.PGD.x-12,z:SC.PGD.z+12}, {x:SC.PGD.x+16,z:SC.PGD.z+2}, {x:SC.PGD.x+6,z:SC.PGD.z+17}]; return pts.filter(q=>B(q.x,q.z)).map(q=>Math.round(q.x)+','+Math.round(q.z)).join(' ') })()""")
    check(bad == "", "幹部・大ボス・塔の光・手下の場所は、かべの中ではない " + bad)
    check(ev("SC.inCT(SC.BOSS_AT.B().x, SC.BOSS_AT.B().z)") and not ev("SC.inCT(SC.BOSS_AT.W().x, SC.BOSS_AT.W().z)") and ev("SC.inCT(SC.TOWER.x, SC.TOWER.z)"), "黒の幹部と塔はチャイナタウンの中、白の幹部は外")

    # ---------- 幹部2人: 車のミッションのあと、好きな順番で ----------
    cont(dict(S3, done=["debt", "info1", "info2"]))
    check("info4" not in opened() and "info5" not in opened(), "「幹部の車をいただけ」の前は、幹部のミッションは出ない")
    cont(S3, 350); check("info4" not in opened(), "夕方は出ない")
    do("SC.setClock(500)"); pg.wait_for_timeout(300)
    check("info4" in opened() and "info5" in opened() and "tower" not in opened() and ev("SC.infoPer.g.visible"), "夜、情報屋の所に光が2つ出る(" + opened() + ")")
    a, c = F('info4'), F('info5'); check(abs(a['z'] - c['z']) >= 4 and a['vis'] and c['vis'], "2つの光は、はなれている(好きなほうをえらべる)")
    pg.screenshot(path=SHOTS + "/b1_two.png")

    # 白の幹部を先に(順番は自由)。やられると失敗して、光がもどる
    quiet(); take('info5'); B = boss()
    check(B and B['k'] == 'W' and B['hp'] == 300 and B['w'] == 'mg' and B['white'] and ev("SC.MX.foes.length") == 4 and ev("SC.MX.foes.filter(g=>!g.boss).every(g=>g.white&&g.temp)"), "白の幹部: 体力300・マシンガン・白の手下3人")
    check("幹部の体力 300" in txt("#mission") and txt("#subName") == "ミーチャン" and "フレー" in txt("#subText"), "受けると、情報屋のひとこと。幹部の体力が出る")
    check(B['st'] == 'idle' and ev("SC.G.tp && Math.hypot(SC.G.tp.x-SC.MX.boss.x, SC.G.tp.z-SC.MX.boss.z) < 1"), "はなれている間は、おそってこない。赤い光は幹部の所")
    do("P.hp=1e6"); tp(B['x'] + 6, B['z'] + 8, 2600)
    check(boss()['st'] == 'chase' and ev("SC.MX.foes.every(g=>g.state==='chase')") and ev("SC.player.hp") < 1e6, "近づくと、幹部と手下がおそってくる(マシンガンで体力がへる)")
    check(ev("SC.TUNE.boss.speed > SC.TUNE.gang.speed") and ev("SC.TUNE.boss.speed < SC.TUNE.gang.speed * 1.3"), "幹部は、手下より少し速い")
    pg.screenshot(path=SHOTS + "/b2_white.png")
    do("P.hp=100; SC.hurtPlayer(999)"); pg.wait_for_timeout(3200)
    check(ev("SC.G.free") is None and ev("SC.MX.foes.length") == 0 and ev("SC.G.bosses.length") == 0, "やられると失敗(幹部と手下は消える)")
    do("SC.setClock(500)"); pg.wait_for_timeout(200); check("info5" in opened(), "光がもどる")
    quiet(); take('info5'); do("P.hp=1e6; P.x=SC.MX.boss.x; P.z=SC.MX.boss.z+40; SC.damageGang(SC.MX.boss, 100)"); pg.wait_for_timeout(300)
    check("幹部の体力 200" in txt("#mission") and boss()['st'] == 'chase', "遠くから撃っても、体力がへって、おそってくる")
    do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300)
    check(ev("!!SC.G.done.info5") and ev("SC.G.bosses.join()") == "W" and "シラサギをたおした" in txt("#toast") and "ワンダウン" in txt("#subText"), "白の幹部をたおすとクリア。情報屋「ワンダウン！」")
    check(ev("SC.G.wanted") == 0 and "info4" in opened() and "tower" not in opened() and ev("SC.infoPer.g.visible"), "★は上がらない。次は黒の幹部(塔は、まだ)")

    # ---------- たおしたチームは、おそってこない ----------
    do("P.hp=100"); wake(True); pg.wait_for_timeout(1500)
    check(ev("window.__g.state") == 'idle' and ev("SC.player.hp") == 100 and ev("SC.isCalm(window.__g)"), "白のマフィアは、近くにいてもおそってこない")
    do("SC.TALK.qa=0; SC.startTalk()"); pg.wait_for_timeout(200); calm = ev("SC.CALM_LINES.map(l=>l.text)")
    check(shown("#bubble") and txt("#bubble") in calm, "話しかけると、おとなしいひとこと: " + txt("#bubble"))
    pg.screenshot(path=SHOTS + "/b3_calm.png")
    do("SC.damageGang(window.__g, 10)"); d0 = ev("Math.hypot(window.__g.x-SC.player.x, window.__g.z-SC.player.z)"); pg.wait_for_timeout(1200)
    check(ev("window.__g.state") == 'flee' and ev("Math.hypot(window.__g.x-SC.player.x, window.__g.z-SC.player.z)") > d0 + 2 and ev("SC.player.hp") == 100, "なぐっても、やり返さずに逃げる")

    # ---------- おとなしくなったマフィアの Q&A(v=25) ----------
    qa = lambda: ev("(()=>{ const t=SC.getTalk(); return t&&t.qa ? { q: t.qa.text, who: t.qa.who, o: t.opts.map(o=>[o.text, o.ng]) } : null })()")
    pick = lambda t, ng: [i for i, o in enumerate(t['o']) if o[1] == ng][0]
    wake(True); do("window.__g.mad=0; P.hp=100; P.armor=0; SC.TALK.qa=1"); pg.wait_for_timeout(300)
    do("SC.startTalk()"); pg.wait_for_timeout(200); t = qa()
    check(t and t['who'] == 'mobW' and shown("#qa"), "白のマフィアに話しかけると、白の Q&A: " + (t['q'] if t else ''))
    pg.screenshot(path=SHOTS + "/b3_mobqa.png")
    pg.click("#qa%d" % pick(t, False)); pg.wait_for_timeout(200)
    check(txt("#bubble") in ["わかってるじゃねぇか", "だろ？ 毎朝アイロンかけてんだ"] and ev("SC.player.hp") == 100 and ev("window.__g.state") == 'idle', "いいこたえ: ひとことを返す(" + txt("#bubble") + ")")
    pg.wait_for_timeout(2900)
    do("SC.startTalk()"); pg.wait_for_timeout(200); t2 = qa()
    check(t2 and t2['who'] == 'mobW' and t2['q'] != t['q'], "2回目は、もう1つの白の Q&A")
    pg.click("#qa%d" % pick(t2, True)); pg.wait_for_timeout(200)
    check(ev("SC.player.hp") == 90 and ev("window.__g.state") == 'flee' and ev("SC.G.wanted") == 0 and txt("#bubble") == '💢', "まちがえると、1発なぐって去る(体力-10・★なし)")
    pg.wait_for_timeout(3500)
    check(ev("window.__g.state") == 'idle' and ev("SC.player.hp") == 90, "追ってこない")
    do("P.x=window.__g.x+1.5; P.z=window.__g.z"); pg.wait_for_timeout(300)
    check(not shown("#talkBtn"), "なぐられたあとは、しばらく話せない")
    do("SC.G.play += 31"); pg.wait_for_timeout(300)
    check(shown("#talkBtn"), "30秒たつと、また話せる")
    do("P.hp=5; SC.startTalk()"); pg.wait_for_timeout(200); t3 = qa(); pg.click("#qa%d" % pick(t3, True)); pg.wait_for_timeout(200)
    check(ev("SC.player.hp") == 1 and ev("SC.G.downT") <= 0, "体力が少なくても、なぐられて、やられることはない")
    do("window.__g.hp=0; window.__g.dead=-1e9; window.__g.per.g.visible=false; P.hp=100; SC.G.bosses.push('B')"); wake(False); do("window.__g.mad=0"); pg.wait_for_timeout(300)
    seen = set()
    for k in range(6):
        do("SC.startTalk()"); pg.wait_for_timeout(100); t4 = qa()
        if t4: seen.add((t4['who'], t4['q']))
        do("SC.answerTalk(" + str(pick(t4, False) if t4 else 0) + ")"); pg.wait_for_timeout(2700)
    check(len(seen) == 2 and all(w == 'mobB' for w, q in seen) and any("サングラス" in q for w, q in seen), "黒のマフィアは、黒の Q&A(どっちが強い・サングラス)")
    do("SC.G.bosses.pop(); SC.TALK.qa=0.3; window.__g.hp=0; window.__g.dead=-1e9; window.__g.per.g.visible=false; P.hp=100")
    pg.wait_for_timeout(300)
    do("window.__g.hp=0; window.__g.dead=-1e9; window.__g.per.g.visible=false"); wake(False); pg.wait_for_timeout(1500)
    check(ev("window.__g.state") == 'chase' and not ev("SC.isCalm(window.__g)"), "黒のマフィアは、まだおそってくる")
    do("window.__g.hp=0; window.__g.dead=-1e9; window.__g.per.g.visible=false; P.hp=100")

    # ---------- 黒の幹部 ----------
    quiet(); take('info4'); B = boss()
    check(B and B['k'] == 'B' and B['hp'] == 300 and B['w'] == 'dao' and not B['white'] and ev("SC.MX.foes.length") == 4 and ev("SC.MX.foes.filter(g=>!g.boss).every(g=>!g.white&&g.temp)"), "黒の幹部: 体力300・青龍刀・黒の手下3人(市場の奥)")
    do("P.hp=1e6"); tp(B['x'] + 2, B['z'] + 1, 2200)
    check(boss()['st'] == 'chase' and ev("SC.player.hp") < 1e6, "近づくと、青龍刀で切ってくる")
    do("const c=SC.cars.find(c=>c.kind==='parked'); window.__c=c; P.car=c; P.mode='car'; c.kind='player'; c.x=SC.MX.boss.x; c.z=SC.MX.boss.z; c.v=30; SC.MX.boss.hitCd=0"); pg.wait_for_timeout(120)
    hp = boss()['hp']; check(250 < hp < 300, f"車でひいても、あまりへらない(のこり {round(hp)})")
    do("const c=window.__c; c.v=0; P.mode='foot'; P.car=null; c.kind='parked'; P.per.g.visible=true; P.hp=100; SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300)
    check(ev("!!SC.G.done.info4") and ev("SC.G.bosses.slice().sort().join()") == "B,W" and "オールクリア" in txt("#subText"), "黒の幹部をたおすとクリア。情報屋「オールクリアよ〜！」")
    check("tower" in opened() and not ev("SC.infoPer.g.visible") and ev("SC.twrInfo.g.visible") and ev("SC.twrInfo.g.rotation.x") == 0, "塔の広場に、だいだい色の光と情報屋が出る(公園には、もういない)")
    d = saved(); check(sorted(d['bosses']) == ["B", "W"] and "info4" in d['done'] and "info5" in d['done'], "たおした幹部はセーブに残る")
    wake(False); pg.wait_for_timeout(1200); check(ev("window.__g.state") == 'idle' and ev("SC.player.hp") == 100, "黒のマフィアも、おそってこなくなる")

    # ---------- 塔: ネタばらし → 大ボス ----------
    cont(d, 350); check("tower" not in opened() and not ev("SC.twrInfo.g.visible"), "つづきから: 夕方は、塔の光は出ない")
    do("SC.setClock(500)"); pg.wait_for_timeout(300); check("tower" in opened() and ev("SC.twrInfo.g.visible") and ev("SC.gangs.filter(g=>!g.temp).every(g=>SC.isCalm(g))"), "夜は出る。黒も白もおとなしいまま")
    quiet(); take('tower', yes=False); pg.screenshot(path=SHOTS + "/b4_offer.png"); pg.click("#offerYes"); pg.wait_for_timeout(250)
    s = story(); check(s and s['n'] == 11 and "ユーちゃ" in s['t'] and shown("#story"), "受けると、ネタばらしのお話(11行)")
    check(not ev("SC.G.twrDown") and not ev("SC.twrOyaji.g.visible") and ev("SC.MX.boss") is None, "情報屋は立っている。大ボスは、まだいない")
    nxt(8); check("銃声" in story()['t'] and not ev("SC.G.twrDown"), "「銃声。」")
    nxt(1); check("ミーチャンのほう" in story()['t'] and ev("SC.G.twrDown") and ev("SC.twrInfo.g.rotation.x") < -1 and ev("SC.twrOyaji.g.visible"), "情報屋がたおれて、うしろに大ボス(屋台のおやじ)が立っている")
    pg.screenshot(path=SHOTS + "/b5_shot.png")
    nxt(2); s = story(); check(s and s['n'] == 6 and "口の軽い" in s['t'], "大ボスのセリフ(6行。龍頭の名乗りつき)")
    nxt(6); pg.wait_for_timeout(250); B = boss()
    check(story() is None and B and B['k'] == 'O' and B['hp'] == 500 and B['st'] == 'chase' and not ev("SC.twrOyaji.g.visible") and "大ボスの体力 500" in txt("#mission"), "お話が終わると、大ボス戦(体力500)")
    check(ev("SC.vendors[0].oyaji && SC.vendors[0].off && !SC.vendors[0].per.g.visible"), "屋台のおやじは、屋台からいなくなる")
    do("P.hp=1e6"); tp(B['x'], B['z'] + 14, 1800); check(boss()['w'] == 'pistol', "遠いと、ピストル")
    do("P.x=SC.MX.boss.x+1.5; P.z=SC.MX.boss.z"); pg.wait_for_timeout(1800); check(boss()['w'] == 'katana' and ev("SC.player.hp") < 1e6, "近いと、刀")
    do("SC.damageGang(SC.MX.boss, 240)"); pg.wait_for_timeout(300); check(ev("SC.MX.foes.length") == 1, "体力が半分より多い間は、手下を呼ばない")
    do("SC.damageGang(SC.MX.boss, 20)"); pg.wait_for_timeout(300); m = ev("({ n: SC.MX.foes.length-1, w: SC.MX.foes.filter(g=>!g.boss&&g.white).length, c: SC.MX.foes.filter(g=>!g.boss).every(g=>g.state==='chase'&&g.temp&&g.nofeud) })")
    check(m['n'] == 6 and m['w'] == 3 and m['c'] and "手下を呼んだ" in txt("#toast"), "体力が半分になると、手下を6人呼ぶ(黒3・白3)")
    pg.screenshot(path=SHOTS + "/b6_boss.png")
    do("SC.damageGang(SC.MX.boss, 10)"); pg.wait_for_timeout(300); check(ev("SC.MX.foes.length") == 7, "手下を呼ぶのは1回だけ")
    pg.wait_for_timeout(2500); check(ev("SC.MX.foes.filter(g=>!g.boss).every(g=>g.hp===100)"), "呼ばれた黒と白は、たがいにケンカしない")
    # やられると、病院 → 塔の光からやり直し
    do("P.hp=100; SC.hurtPlayer(999)"); pg.wait_for_timeout(3200)
    check(ev("SC.G.free") is None and ev("SC.MX.foes.length") == 0 and ev("Math.hypot(SC.player.x-SC.HOSPITAL.x, SC.player.z-SC.HOSPITAL.z)") < 3, "やられると、病院で目がさめる")
    do("SC.setClock(500)"); pg.wait_for_timeout(300)
    check("tower" in opened() and ev("SC.twrInfo.g.visible") and ev("SC.twrInfo.g.rotation.x") == 0 and not ev("SC.vendors[0].off"), "塔の光がもどる(情報屋はまた立っている。おやじは屋台にもどる)")
    quiet(); take('tower'); skip(); s = story(); check(s and "口の軽い" in s['t'] and ev("SC.G.twrDown"), "やり直し: お話は「とばす」で飛ばせる")
    skip(); B = boss(); check(B and B['hp'] == 500, "大ボスの体力は、元にもどっている")
    # 終わり 3
    do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300); s = story()
    check(s and s['n'] == 1 and "鍋は" in s['t'], "たおすと、大ボスの最後のひとこと")
    nxt(1); pg.wait_for_timeout(200); s = story()
    check(s and s['n'] == 5 and "静かになった" in s['t'] and ev("SC.END.scene") == 3 and ev("SC.G.phase") == 'night' and ev("SC.END.crowd.length") == 12, "終わり 3 のお話: 夜、塔の上から。下で黒と白が頭を下げている")
    pg.screenshot(path=SHOTS + "/b7_end3.png")
    nxt(4); check("倉庫" in story()['t'] and ev("SC.END.scene") == 5, "最後の行は、港の倉庫")
    nxt(1); pg.wait_for_timeout(300)
    check(shown("#clear") and "3/4" in txt("#clear") and "てっぺん" in txt("#clear") and saved() is None and 3 in ends(), "終わりの画面(3/4)。セーブは消える。見た終わりは残る")
    pg.screenshot(path=SHOTS + "/b8_clear3.png")

    # ---------- 裏のトゥルー: 倉庫で妹を見ていると、終わらずに「かぎ」→ 倉庫のとびら ----------
    cont(ST); quiet(); take('tower'); s = story()
    check(s and s['n'] == 13 and ev("SC.G.story.lines.some(l=>l.indexOf('妹は生きている')>=0)"), "妹を見たあとだと、ネタばらしに2行ふえる(13行)")
    skip(); skip(); do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300); s = story()
    check(s and s['n'] == 2 and "かぎ" in ev("SC.G.story.lines[1]"), "たおすと「おやじの手から、かぎが落ちた。」")
    nxt(2); pg.wait_for_timeout(300)
    check(story() is None and not shown("#clear") and ev("!!SC.G.done.tower") and "かぎを手に入れた" in txt("#toast") and ev("SC.G.free") is None, "ゲームは終わらない。塔の対決はクリア")
    do("SC.setClock(100)"); pg.wait_for_timeout(300)
    check(opened().split(",").count("rescue") == 1 and F('rescue')['vis'] and "倉庫" in txt("#mission") and not ev("SC.twrInfo.g.visible"), "港の倉庫に光が出る(昼でも)。" + opened())
    d = saved(); check("tower" in d['done'], "セーブに残る")
    cont(d, 100); check("rescue" in opened() and ev("SC.vendors[0].off"), "つづきからでも、倉庫の光は出る")
    take('rescue', yes=False); check("開ける" in txt("#offerYes") and "倉庫のとびら" in txt("#offer"), "光に入ると「倉庫のとびら」→「開ける」")
    pg.click("#offerNo"); pg.wait_for_timeout(200); check(story() is None and not shown("#clear"), "やめると、何も起きない")
    tp(150, 151); take('rescue'); s = story()
    check(s and s['n'] == 6 and "とびらが開く" in s['t'] and ev("SC.G.phase") == 'day' and ev("SC.END.scene") == 4 and ev("SC.END.sis.g.visible"), "開けると、終わり 4 のお話(朝・妹が出てくる)")
    pg.screenshot(path=SHOTS + "/b9_end4.png")
    nxt(3); check("船が出ていく" in story()['t'] and ev("SC.END.scene") == 6, "4行目で、港の場面に変わる")
    nxt(3); pg.wait_for_timeout(300)
    check(shown("#clear") and "4/4" in txt("#clear") and "ふたりのもの" in txt("#clear") and saved() is None and 4 in ends(), "終わりの画面(4/4)。セーブは消える")

    # ---------- 貸していない人には、何も出ない ----------
    cont(dict(S5, lent=2)); check(not [i for i in ['info4', 'info5', 'tower', 'rescue'] if i in opened()] and not ev("SC.twrInfo.g.visible"), "貸していないときは、幹部も塔も出ない")

    # ---------- 英語・韓国語 ----------
    jp = re.compile(r'[ぁ-んァ-ヶ一-龥]')
    for lang in ['en', 'ko']:
        pg.evaluate("l => localStorage.setItem('muddys-lang', l)", lang); t = ""
        cont(S3); quiet(); take('info4', yes=False); t += txt("#offer"); pg.click("#offerYes"); pg.wait_for_timeout(300); t += txt("#mission") + txt("#subName") + txt("#subText")
        do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300); t += txt("#toast") + txt("#subText")
        wake(False); pg.wait_for_timeout(300); do("SC.startTalk()"); pg.wait_for_timeout(200); t += txt("#bubble")
        do("window.__g.hp=0; window.__g.dead=-1e9"); take('info5'); t += txt("#mission"); do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300); t += txt("#toast") + txt("#subText")
        cont(ST); quiet(); take('tower', yes=False); t += txt("#offer"); pg.click("#offerYes"); pg.wait_for_timeout(300)
        for k in range(13): t += txt("#storyLines"); nxt(1)
        for k in range(6): t += txt("#storyLines"); nxt(1)
        pg.wait_for_timeout(300); t += txt("#mission"); do("SC.damageGang(SC.MX.boss, 260)"); pg.wait_for_timeout(300); t += txt("#toast")
        do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300)
        for k in range(2): t += txt("#storyLines"); nxt(1)
        pg.wait_for_timeout(300); t += txt("#toast") + txt("#mission"); do("SC.setClock(100)"); take('rescue', yes=False); t += txt("#offer"); pg.click("#offerYes"); pg.wait_for_timeout(300)
        for k in range(6): t += txt("#storyLines"); nxt(1)
        pg.wait_for_timeout(300); t += txt("#clear")
        if lang == 'en': pg.screenshot(path=SHOTS + "/b10_en.png")
        check(shown("#clear") and not jp.search(t), lang + ": 幹部・塔・終わり 4 に日本語が残っていない " + "".join(jp.findall(t))[:20])
        cont(S5); quiet(); take('tower'); skip(); skip(); do("SC.damageGang(SC.MX.boss, 999)"); pg.wait_for_timeout(300); t = ""
        nxt(1); pg.wait_for_timeout(200)
        for k in range(5): t += txt("#storyLines"); nxt(1)
        pg.wait_for_timeout(300); t += txt("#clear")
        check(shown("#clear") and not jp.search(t), lang + ": 終わり 3 に日本語が残っていない " + "".join(jp.findall(t))[:20])
    pg.evaluate("localStorage.removeItem('muddys-lang')")
    check(not errs, "エラーなし " + "; ".join(errs[:3]))
    b.close()
print("\n" + ("全部OK" if not fails else "NG " + str(len(fails)) + "こ: " + " / ".join(fails)))
sys.exit(1 if fails else 0)
