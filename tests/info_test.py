"""v=18 のテスト(Claude 用): python3 tests/info_test.py . <画像フォルダ>
にせ Three.js で、⑥前半を確かめる:
白の手下(外の街の黒を着せかえ・大きな仕事のあとから・ピストル多め)・黒と白のケンカ・ヒントのこり6つ・
情報屋(貸したあとの夜だけ公園にいる)・聞きこみ・火をつけろ・幹部の車をいただけ・セーブ・英語"""
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
    shown = lambda sel: pg.evaluate("s => getComputedStyle(document.querySelector(s)).display !== 'none'", sel)
    txt = lambda sel: pg.inner_text(sel)
    saved = lambda: json.loads(pg.evaluate("localStorage.getItem('sc-save')") or 'null')
    def quiet(clock=500): do(f"SC.DAY.speed=0; SC.setClock({clock}); SC.TUNE.gang.turf=0; SC.gangs.forEach(g=>{{ g.per.g.visible=false; g.hp=0; g.dead=-1e9; }})")
    def tp(x, z, w=250): do(f"const c=P.car; if(c){{c.x={x};c.z={z};c.v=0;}} P.x={x}; P.z={z}"); pg.wait_for_timeout(w)
    def foot():
        if ev("SC.player.mode") == 'car': pg.keyboard.press("KeyE"); pg.wait_for_timeout(150)
    def incar(pick="SC.cars.find(c=>c.kind==='parked')"):
        foot(); do(f"const c={pick}; P.x=c.x+1.8; P.z=c.z"); pg.wait_for_timeout(120); pg.keyboard.press("KeyE"); pg.wait_for_timeout(150)
    F = lambda i: ev(f"(()=>{{const f=SC.FREE.find(f=>f.id==='{i}'); return {{x:f.at.x,z:f.at.z,open:SC.freeOpen(f),vis:f.g.visible,steps:f.steps.map(s=>({{x:(s.pos||{{}}).x,z:(s.pos||{{}}).z}}))}}}})()")
    def take(i, yes=True):
        foot(); f = F(i); tp(f['x'] + 8, f['z']); tp(f['x'], f['z'])
        if yes: pg.click("#offerYes"); pg.wait_for_timeout(250)
        return f
    def cont(save, clock=500):
        pg.evaluate("s => localStorage.setItem('sc-save', s)", json.dumps(save)); pg.reload(); pg.wait_for_timeout(1200); pg.click("#goCont"); pg.wait_for_timeout(800); do(f"SC.DAY.speed=0; SC.setClock({clock})")
    opened = lambda: ev("SC.FREE.filter(f=>SC.freeOpen(f)).map(f=>f.id).join()")
    BASE = {"v":1,"money":50000,"mi":5,"done":[],"inv":["fist"],"play":60}
    LENT = dict(BASE, lent=1, done=["debt"])
    teams = "(()=>{ const a=SC.gangs.filter(g=>!g.temp); return { w:a.filter(g=>g.white).length, b:a.filter(g=>!g.white).length, wIn:a.filter(g=>g.white&&SC.inCT(g.home.x,g.home.z)).length, bOut:a.filter(g=>!g.white&&!SC.inCT(g.home.x,g.home.z)).length } })()"

    # ---------- 場所 ----------
    pg.goto(URL); pg.wait_for_timeout(1200)
    bad = ev("""(()=>{ const B=(x,z)=>SC.pointBlocked(x,z), L=SC.LURE, K=SC.BOSSCAR, gz=K.z-3, pts=[SC.INFO, L.from, L.to, {x:L.from.x,z:L.from.z-3}, {x:L.from.x,z:L.from.z+3}, {x:L.to.x,z:L.to.z-4}, {x:L.to.x,z:L.to.z-6.5}, {x:L.to.x+2.5,z:L.to.z-6.8}, K, K.to, {x:K.x-4,z:gz}, {x:K.x,z:gz}, {x:K.x+4,z:gz}, {x:SC.INFO.x-3.1,z:SC.INFO.z}]; return pts.filter(q=>B(q.x,q.z)).map(q=>Math.round(q.x)+','+Math.round(q.z)).join(' ') })()""")
    check(bad == "", "情報屋・手下・白い車・駐車場の場所は、かべの中ではない " + bad)
    check(ev("SC.inCT(SC.LURE.from.x, SC.LURE.from.z)") and not ev("SC.inCT(SC.LURE.to.x, SC.LURE.to.z)"), "火をつけろ: 黒の手下はチャイナタウンの中、連れていく所は外")

    # ---------- 白の手下: お使いの間は全員黒、大きな仕事のあとは外の街が白 ----------
    pg.click("#goSolo"); pg.wait_for_timeout(800); do("SC.DAY.speed=0; SC.setClock(500)"); pg.wait_for_timeout(400)
    t = ev(teams); check(t['w'] == 0, f"お使いの間は、マフィアは全員黒(黒 {t['b']}人)")
    do("G.mi=5; G.failWait=0; SC.setClock(500)"); pg.wait_for_timeout(400)
    t = ev(teams); check(t['w'] >= 8 and t['wIn'] == 0 and t['bOut'] == 0 and t['b'] >= 3, f"大きな仕事のあと: 外の街は白、チャイナタウンの中は黒(白 {t['w']}人・黒 {t['b']}人)")
    w = ev("(()=>{ const a=SC.gangs.filter(g=>g.white&&!g.temp); return { p:a.filter(g=>g.weapon==='pistol').length, n:a.length, tie:a.every(g=>g.tie&&g.tie.visible) } })()")
    check(w['p'] / w['n'] > 0.35 and w['tie'], f"白はピストルが多い({w['p']}/{w['n']})。ネクタイをつけている")
    check(ev("SC.gangs.filter(g=>!g.white&&!g.temp).every(g=>!g.tie||!g.tie.visible)"), "黒にはネクタイがない")
    # 黒と白のケンカ(主人公は遠くにいる)
    tp(150, -150)
    do("const w=SC.gangs.find(g=>g.white&&!g.temp&&!g.off&&g.hp>0), k=SC.gangs.find(g=>!g.white&&!g.temp&&!g.off&&g.hp>0); window.__w=w; window.__k=k; w.weapon='knife'; k.weapon='knife'; w.state=k.state='idle'; k.x=w.x+3; k.z=w.z; w.foe=k.foe=null; w.hp=k.hp=100")
    pg.wait_for_timeout(2500)
    check(ev("(window.__w.foe===window.__k||window.__k.foe===window.__w)") and ev("window.__w.hp<100||window.__k.hp<100") and ev("SC.player.hp") == 100, "黒と白が近くで出会うと、ケンカする(主人公はねらわない)")
    pg.wait_for_timeout(9000)
    check(ev("window.__w.hp<=0||window.__k.hp<=0") and ev("SC.G.wanted") == 0 and ev("SC.pickups.length") == 0, "ケンカでたおれても、★は上がらない・何も落とさない")
    # ヒントのこり6つ
    do("SC.TALK.qa=0")
    got = set(); later = ev("SC.LINES.filter(l=>l.later).map(l=>l.text)")
    for k in range(80): got.add(ev("SC.pickLine({}).text"))
    check(len([l for l in later if l in got]) >= 4, f"大きな仕事のあとは、幹部・白いスーツ・ケンカなどのヒントも言う({len([l for l in later if l in got])}/{len(later)})")
    do("G.mi=0"); got = set()
    for k in range(80): got.add(ev("SC.pickLine({}).text"))
    check(not [l for l in later if l in got], "お使いの間は、まだ言わない")

    # ---------- 情報屋: 貸したあとの夜だけ ----------
    cont(BASE)
    check("info1" not in opened() and not ev("SC.infoPer.g.visible"), "貸していないときは、情報屋はいない")
    cont(LENT, 350)
    check("info1" not in opened() and not ev("SC.infoPer.g.visible"), "貸していても、夕方はいない")
    do("SC.setClock(500)"); pg.wait_for_timeout(300)
    check("info1" in opened() and "info2" not in opened() and ev("SC.infoPer.g.visible") and ev("SC.FREE.find(f=>f.id==='info1').g.visible"), "貸したあとの夜は、公園に情報屋とだいだい色の光が出る(" + opened() + ")")

    # ---------- 聞きこみ ----------
    quiet(); do("SC.TALK.qa=0"); f = take('info1')
    check(ev("SC.G.free.id") == "info1" and "のこり 3人" in txt("#mission") and txt("#subName") == "情報屋" and "イヤーよ" in txt("#subText"), "聞きこみ: 受けると、情報屋のひとこと。のこり3人")
    pg.screenshot(path=SHOTS + "/i1_ask.png")
    def talkTo(i):
        do(f"const p=SC.peds.filter(p=>!p.off&&!p.angry&&p.down<=0)[{i}]; window.__p=p; p.speed=0; P.x=p.x+1.2; P.z=p.z"); pg.wait_for_timeout(150); do("SC.startTalk()"); pg.wait_for_timeout(150)
    rumors = ev("SC.RUMORS.map(r=>r.text)")
    talkTo(0); check(txt("#bubble") in rumors and "のこり 2人" in txt("#mission"), "話しかけると、幹部のうわさを言う(のこり2人)")
    pg.screenshot(path=SHOTS + "/i2_rumor.png")
    do("SC.startTalk()"); pg.wait_for_timeout(150); check("のこり 2人" in txt("#mission"), "同じ人は2回数えない")
    talkTo(1); check("のこり 1人" in txt("#mission"), "ちがう人に話すと、のこり1人")
    do("SC.TALK.qa=1"); talkTo(2); i = ev("SC.getTalk().opts.findIndex(o=>o.ng)"); pg.click("#qa" + str(i)); pg.wait_for_timeout(200)
    check("のこり 3人" in txt("#mission") and "やり直し" in txt("#toast"), "Q&A でおこらせると、集めた数が0にもどる(のこり3人)")
    do("SC.npcs.slice().forEach(n=>{ n.hp=0 })"); pg.wait_for_timeout(200)
    talkTo(0); i = ev("SC.getTalk().opts.findIndex(o=>!o.ng)"); pg.click("#qa" + str(i)); pg.wait_for_timeout(200)
    check("のこり 2人" in txt("#mission") and txt("#bubble") in rumors, "やり直しのあとは、前に聞いた人にもまた聞ける。Q&A でいいこたえだと、うわさを言う")
    do("SC.TALK.qa=0"); m0 = ev("SC.G.money"); talkTo(1); talkTo(3); pg.wait_for_timeout(300)
    check(ev("!!SC.G.done.info1") and ev("SC.G.money") == m0 and "ミッション完了！" in txt("#toast") and "+$" not in txt("#toast"), "3人聞くとクリア。お金は出ない")
    check("info2" in opened(), "次は「火をつけろ」が出る(" + opened() + ")")

    # ---------- 火をつけろ ----------
    do("SC.TUNE.gang.turf=15"); f = take('info2')
    nb, nw = ev("SC.MX.foes.filter(g=>g.lure).length"), ev("SC.MX.foes.filter(g=>g.white).length")
    check(nb == 3 and nw == 3 and ev("SC.MX.foes.every(g=>g.temp)") and "赤い光" in txt("#mission"), "火をつけろ: 黒の手下3人(門の中)と、白の手下3人(門の外)が出る")
    L = ev("({fx:SC.LURE.from.x,fz:SC.LURE.from.z,tx:SC.LURE.to.x,tz:SC.LURE.to.z})")
    tp(L['fx'] + 2, L['fz'] + 1, 600)
    check(ev("SC.G.si") == 1 and ev("SC.MX.foes.filter(g=>g.lure).every(g=>g.state==='chase')") and "ついてきている 3人" in txt("#mission"), "近づくと気づかれて、3人とも追ってくる")
    do("const c=SC.cars.find(c=>c.kind==='parked'&&c!==SC.MX.mcar); c.x=P.x+3; c.z=P.z; c.v=0"); pg.wait_for_timeout(100); pg.keyboard.press("KeyE"); pg.wait_for_timeout(300)
    check(ev("SC.G.free") is None and "車に乗った" in txt("#toast") and F('info2')['open'], "車に乗ると、手下があきらめて失敗。光がもどる")
    foot(); f = take('info2'); tp(L['fx'] + 2, L['fz'] + 1, 500); do("SC.MX.foes.filter(g=>g.lure).slice(0,2).forEach(g=>{ g.hp=0 })"); pg.wait_for_timeout(300)
    check(ev("SC.G.free") is None and "たおしすぎた" in txt("#toast"), "手下をたおして1人になると失敗")
    f = take('info2'); tp(L['fx'] + 2, L['fz'] + 1, 500); tp(L['fx'] + 60, L['fz'] + 1, 400)
    check(ev("SC.G.free") is None and "あきらめて帰った" in txt("#toast"), "はなれすぎると、手下があきらめて帰って失敗")
    f = take('info2'); tp(L['fx'] + 2, L['fz'] + 1, 500)
    do(f"P.hp=100; P.x={L['tx']}; P.z={L['tz']}+2; SC.MX.foes.filter(g=>g.lure).forEach((g,k)=>{{ g.x={L['tx']}+1+k; g.z={L['tz']}+5; }})"); pg.wait_for_timeout(500)
    check(ev("!!SC.G.done.info2") and "ケンカが始まった" in txt("#toast"), "2人以上連れて白のなわばりに着くとクリア。ケンカが始まる")
    br = ev("SC.gangs.filter(g=>g.brawl&&g.hp>0)").__len__() if False else ev("SC.gangs.filter(g=>g.brawl).length")
    check(br >= 5 and ev("SC.gangs.filter(g=>g.brawl&&g.hp>0&&!g.white).every(g=>g.foe&&g.foe.white)"), f"黒は白をねらってケンカする({br}人)")
    pg.screenshot(path=SHOTS + "/i3_brawl.png")
    pg.wait_for_timeout(3000); check(ev("SC.gangs.filter(g=>g.brawl).some(g=>g.hp<100)"), "ケンカで体力がへっていく")
    tp(150, -150, 400); do("SC.gangs.filter(g=>g.brawl).forEach(g=>{ g.brawlT=0 })"); pg.wait_for_timeout(600)
    check(ev("SC.gangs.filter(g=>g.brawl).length") == 0, "残った人は、しばらくして見えない所で消える")
    check("info3" in opened(), "次は「幹部の車をいただけ」が出る(" + opened() + ")")

    # ---------- 幹部の車をいただけ ----------
    quiet(); f = take('info3')
    check(ev("!!SC.MX.mcar") and ev("SC.MX.foes.length") == 3 and ev("SC.MX.foes.every(g=>g.white)") and ev("SC.MX.mcar.color") == 0xf4f4f4, "幹部の車: 白い車と、白の手下3人が出る")
    incar("SC.MX.mcar"); pg.wait_for_timeout(200)
    check(ev("SC.G.si") == 1 and "5回まで" in txt("#mission") and ev("SC.MX.foes.length") == 3, "乗ると次の段へ。見はりは残る")
    pg.wait_for_timeout(2600)
    check(ev("SC.MX.hunters.length") >= 1 and ev("SC.MX.hunters.every(c=>c.kind==='hunter')"), "少しすると、追っ手の車が来る")
    pg.wait_for_timeout(4200); check(ev("SC.MX.hunters.length") == 2, "追っ手の車は2台")
    pg.screenshot(path=SHOTS + "/i4_hunt.png")
    do("SC.MX.hunters.forEach(h=>{ h.rev=5; h.turn=false })"); pg.wait_for_timeout(900); do("G.bumps=0")
    do("const h=SC.MX.hunters[0], c=P.car; c.h=Math.PI/2; h.h=Math.PI/2; h.x=c.x-7; h.z=c.z; h.v=20; h.rev=0; h.node=null"); pg.wait_for_timeout(350)
    check(ev("SC.G.bumps") == 1 and "ぶつけられた" in txt("#toast") and "あと5回" in txt("#toast"), "追っ手にぶつけられても数える(あと5回)")
    do("SC.MX.hunters.forEach(h=>{ h.gone=true }); SC.MX.hunters.length=0; SC.TUNE.hunt.wait=999; G.huntT=999")
    for k in range(5): pg.wait_for_timeout(900); do("SC.bump()")
    pg.wait_for_timeout(200)
    check(ev("SC.G.free") is None and "きずだらけ" in txt("#toast") and ev("SC.MX.hunters.length") == 0 and ev("!SC.MX.mcar"), "6回目で失敗。追っ手と見はりは消える")
    do("SC.TUNE.hunt.wait=4"); foot(); f = take('info3'); incar("SC.MX.mcar"); do("G.huntT=999"); K = ev("({x:SC.BOSSCAR.to.x,z:SC.BOSSCAR.to.z})")
    for k in range(5): pg.wait_for_timeout(900); do("SC.bump()")
    check(ev("SC.G.free.id") == "info3", "5回までは大丈夫")
    tp(K['x'], K['z'], 300); check(ev("SC.G.si") == 2 and "降りよう" in txt("#mission"), "駐車場に着いたら、降りる段")
    foot(); pg.wait_for_timeout(300); car = ev("SC.cars.filter(c=>c.color===0xf4f4f4&&Math.hypot(c.x-SC.BOSSCAR.to.x,c.z-SC.BOSSCAR.to.z)<8).length")
    check(ev("!!SC.G.done.info3") and ev("SC.MX.hunters.length") == 0 and car == 1, "降りるとクリア。白い車は駐車場に残る。追っ手は消える")
    d = saved(); check(all(i in d['done'] for i in ['info1', 'info2', 'info3']), "3つともセーブに残る")
    cont(d); check(not [i for i in ['info1', 'info2', 'info3'] if i in opened()], "つづきからでも、クリアした情報屋のミッションは出ない")

    # ---------- 英語 ----------
    pg.evaluate("localStorage.setItem('muddys-lang','en')")
    cont(LENT); jp = re.compile(r'[ぁ-んァ-ヶ一-龥]'); quiet(); do("SC.TALK.qa=0"); t = ""
    take('info1', yes=False); t += txt("#offer"); pg.click("#offerYes"); pg.wait_for_timeout(300); t += txt("#mission") + txt("#subName") + txt("#subText")
    talkTo(0); t += txt("#bubble") + txt("#toast") + txt("#mission")
    pg.screenshot(path=SHOTS + "/i5_en.png")
    check(not jp.search(t), "en: 聞きこみに日本語が残っていない " + "".join(jp.findall(t))[:20])
    pg.evaluate("localStorage.removeItem('muddys-lang')")
    check(not errs, "エラーなし " + "; ".join(errs[:3]))
    b.close()
print("\n" + ("全部OK" if not fails else "NG " + str(len(fails)) + "こ: " + " / ".join(fails)))
sys.exit(1 if fails else 0)
