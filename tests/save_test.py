"""ホーム・セーブ・自由なミッションのテスト(Claude 用): python3 tests/save_test.py . <画像フォルダ>
にせ Three.js で、ホームの青い光(セーブ・全回復)・「つづきから」「はじめから」・紫のマーク(受ける/やめる/クリア/失敗でもどる)・逮捕でホームの前 を確かめる"""
import sys, os, json
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
    shown = lambda sel: pg.evaluate("s => getComputedStyle(document.querySelector(s)).display !== 'none'", sel)
    def quiet():  # 時間は夕方で止める。ギャングは消す
        ev("(()=>{ SC.DAY.speed=0; SC.setClock(350); SC.TUNE.gang.turf=0; SC.gangs.forEach(g=>{ g.per.g.visible=false; g.hp=0; g.dead=-1e9; }); return 0 })()")
    def tp(x, z): ev(f"(()=>{{ SC.player.x={x}; SC.player.z={z}; return 0 }})()"); pg.wait_for_timeout(250)
    saved = lambda: json.loads(pg.evaluate("localStorage.getItem('sc-save')") or 'null')

    # ---------- はじめて ----------
    pg.goto(URL); pg.wait_for_timeout(1200)
    check(not shown("#goCont") and pg.inner_text("#goSolo") == "ひとりで遊ぶ(ミッション)", "セーブがないときは「つづきから」は出ない")
    H = ev("({x:SC.HOME.x,z:SC.HOME.z,sx:SC.HOME.sx,sz:SC.HOME.sz})"); F = ev("SC.FREE.map(f=>({id:f.id,x:f.at.x,z:f.at.z,r:f.reward,steps:f.steps.map(s=>({x:(s.pos||{}).x,z:(s.pos||{}).z}))}))")
    check(not ev("SC.pointBlocked(SC.HOME.x,SC.HOME.z)||SC.pointBlocked(SC.HOME.sx,SC.HOME.sz)"), "ホームの光と、その前は、かべの中ではない")
    check(ev("SC.FREE.every(f=>!SC.pointBlocked(f.at.x,f.at.z)&&f.steps.every(s=>!s.pos||!SC.pointBlocked(s.pos.x,s.pos.z)))"), "紫のマークと行き先は、かべの中ではない")
    check(ev("SC.FREE.every(f=>SC.SHOPS.every(s=>Math.hypot(s.x-f.at.x,s.z-f.at.z)>5)&&Math.hypot(SC.HOME.x-f.at.x,SC.HOME.z-f.at.z)>5)&&SC.SHOPS.every(s=>Math.hypot(s.x-SC.HOME.x,s.z-SC.HOME.z)>5)"), "光るマークどうしは重なっていない")
    pg.click("#goSolo"); pg.wait_for_timeout(800); quiet()
    check(ev("SC.G.mi") == 0 and "車に乗ろう" in pg.inner_text("#mission"), "はじめからは、ミッション1「車に乗ろう」")
    check(ev("SC.HOME.g.visible") and not ev("SC.FREE.some(f=>f.g.visible)"), "ホームの光は出ている。お使いの間は紫のマークは出ない")
    tp(F[0]['x'], F[0]['z']); check(not shown("#offer"), "お使いの間は、紫のマークの所に立っても何も出ない")

    # ---------- ホームでセーブ ----------
    ev("(()=>{ SC.G.money=1234; SC.player.hp=40; SC.player.inv=['fist','pistol','katana']; SC.player.ammo=7; SC.player.heals=2; SC.player.armor=50; return 0 })()")
    tp(H['x'], H['z']); d = saved()
    check(d and d['money'] == 1234 and d['inv'] == ['fist','pistol','katana'] and d['ammo'] == 7 and d['heals'] == 2 and d['armor'] == 50, "ホームの青い光に入るとセーブ(お金・武器・弾・回復薬・チョッキ)")
    check(ev("SC.player.hp") == ev("SC.TUNE.hp") and "セーブ" in pg.inner_text("#toast"), "体力が全回復して「セーブした！」と出る")
    pg.screenshot(path=SHOTS + "/s1_home.png")
    ev("(()=>{ SC.G.money=1; return 0 })()"); pg.wait_for_timeout(600); check(saved()['money'] == 1234, "光の中に立ったままでは、何回もセーブしない")
    tp(H['x'] + 8, H['z']); tp(H['x'], H['z']); check(saved()['money'] == 1, "一度はなれてもう一度入ると、またセーブ")
    ev("(()=>{ SC.G.money=1234; return 0 })()"); tp(H['x'] + 8, H['z']); tp(H['x'], H['z'])

    # ---------- クリアで自動セーブ ----------
    tp(H['sx'], H['sz']); ev("(()=>{ const c=SC.cars.find(c=>c.kind==='parked'); SC.player.x=c.x+1.6; SC.player.z=c.z; return 0 })()"); pg.wait_for_timeout(200)
    pg.dispatch_event("#enterBtn", "pointerdown"); pg.wait_for_timeout(500)
    check(ev("SC.G.mi") == 1 and saved()['mi'] == 1 and saved()['money'] == 1534, "ミッションをクリアすると自動でセーブ")

    # ---------- つづきから ----------
    pg.reload(); pg.wait_for_timeout(1200)
    check(shown("#goCont") and "つづきから" in pg.inner_text("#goCont") and "$1,534" in pg.inner_text("#goCont") and pg.inner_text("#goSolo") == "はじめから(ひとり用)", "セーブがあると「つづきから」と「はじめから」が出る(" + pg.inner_text("#goCont").replace("\n", " / ") + ")")
    pg.screenshot(path=SHOTS + "/s2_start.png")
    pg.click("#goCont"); pg.wait_for_timeout(800); quiet()
    check(ev("SC.G.money") == 1534 and ev("SC.G.mi") == 1 and ev("SC.player.inv.join()") == "fist,pistol,katana" and ev("SC.player.ammo") == 7 and ev("SC.player.heals") == 2 and ev("SC.player.armor") == 50, "つづきから: お金・ミッション・武器・弾・回復薬・チョッキがもどる")
    check(ev("Math.hypot(SC.player.x-SC.HOME.sx,SC.player.z-SC.HOME.sz)") < 1 and "はじめての配達" in pg.inner_text("#mission"), "ホームの前から、次のミッションで始まる")

    # ---------- 逮捕されたらホームの前 ----------
    tp(100, 100); ev("(()=>{ SC.G.wanted=2; SC.G.bust=99; return 0 })()"); pg.wait_for_timeout(1500)
    ev("(()=>{ const n=SC.newNpc('cop',SC.player.x+1,SC.player.z); n.state='chase'; SC.G.wanted=2; SC.G.bust=99; return 0 })()"); pg.wait_for_timeout(600)
    check(ev("Math.hypot(SC.player.x-SC.HOME.sx,SC.player.z-SC.HOME.sz)") < 3 and "逮捕" in pg.inner_text("#toast"), "逮捕されたら、ホームの前にもどる")

    # ---------- 紫のマーク ----------
    ev("(()=>{ SC.G.mi=SC.MISSIONS.length-1; SC.G.failWait=0; SC.G.si=SC.MISSIONS[SC.G.mi].steps.length-1; SC.G.wanted=0; SC.G.timeLeft=-1; const s=SC.MISSIONS[SC.G.mi].steps[SC.G.si]; SC.player.x=s.pos.x; SC.player.z=s.pos.z; return 0 })()"); pg.wait_for_timeout(500)
    check(ev("SC.G.mi") == 5 and saved()['mi'] == 5, "お使い(大きな仕事まで)が終わった")
    check(shown("#story"), "大きな仕事のあとに、お話が出る"); pg.click("#storySkip"); pg.wait_for_timeout(200)
    ev("(()=>{ SC.G.wanted=0; for(const c of SC.cars.slice()) if(c.kind==='police') c.gone=true; return 0 })()")
    pg.wait_for_timeout(3600)
    check("紫の光" in pg.inner_text("#toast") and "紫の光" in pg.inner_text("#mission") and ev("SC.FREE[0].g.visible"), "紫のマークが出て「好きなミッションを受けよう」と出る")
    tp(F[0]['x'], F[0]['z'])
    check(shown("#offer") and pg.inner_text("#offerName") == "市場のおつかい" and "$2,000" in pg.inner_text("#offerReward"), "紫のマークに入ると、名前とほうびが出る")
    pg.screenshot(path=SHOTS + "/s3_offer.png")
    x0 = ev("SC.G.play"); pg.wait_for_timeout(500); check(ev("SC.G.play") == x0, "えらんでいる間は、ゲームが止まる")
    pg.click("#offerNo"); pg.wait_for_timeout(500)
    check(not shown("#offer") and ev("SC.G.free") is None and ev("SC.FREE[0].g.visible"), "「やめる」で閉じる。マークは残る。立ったままでは、もう一度出ない")
    tp(F[0]['x'] + 8, F[0]['z']); tp(F[0]['x'], F[0]['z']); check(shown("#offer"), "一度はなれて、もう一度入ると出る")
    pg.click("#offerYes"); pg.wait_for_timeout(400)
    check(not shown("#offer") and ev("SC.G.free.id") == "market" and "市場のおつかい" in pg.inner_text("#mission") and not ev("SC.FREE[0].g.visible"), "「受ける」でミッションが始まる。紫のマークは消える")
    pg.screenshot(path=SHOTS + "/s4_mission.png")
    # 失敗(逮捕)でマークがもどる
    ev("(()=>{ const n=SC.newNpc('cop',SC.player.x+1,SC.player.z); n.state='chase'; SC.G.wanted=2; SC.G.bust=99; return 0 })()"); pg.wait_for_timeout(600)
    check(ev("SC.G.free") is None and "ミッション失敗" in pg.inner_text("#toast") and ev("SC.FREE[0].g.visible") and 'market' not in saved()['done'], "失敗すると、紫のマークがもどる(何度でもやり直せる)")
    # クリア
    m0 = ev("SC.G.money"); tp(F[0]['x'], F[0]['z']); pg.click("#offerYes"); pg.wait_for_timeout(300)
    tp(F[0]['steps'][0]['x'], F[0]['steps'][0]['z']); check(ev("SC.G.si") == 1 and "品物ゲット" in pg.inner_text("#toast"), "市場の奥で品物を受け取る")
    tp(F[0]['steps'][1]['x'], F[0]['steps'][1]['z'])
    check(ev("SC.G.money") == m0 + 2000 and ev("SC.G.free") is None and ev("!!SC.G.done.market") and saved()['done'] == ['market'], "店に届けるとクリア。ほうび +$2,000、自動でセーブ")
    tp(F[0]['x'], F[0]['z']); check(not shown("#offer") and not ev("SC.FREE[0].g.visible"), "クリアしたミッションのマークは、もう出ない")

    # ---------- つづきから(クリアしたミッションも覚えている)・こわれたセーブ ----------
    pg.reload(); pg.wait_for_timeout(1200); check("6/22" in pg.inner_text("#goCont"), "スタート画面にクリアした数が出る(" + pg.inner_text("#goCont").replace("\n", " / ") + ")")
    pg.click("#goCont"); pg.wait_for_timeout(800)
    check(ev("SC.G.mi") == 5 and ev("!!SC.G.done.market") and not ev("SC.FREE[0].g.visible") and "フリー走行" in pg.inner_text("#mission"), "つづきから: クリアしたミッションを覚えている")
    pg.evaluate("localStorage.setItem('sc-save', JSON.stringify({v:1,money:'x',mi:99,done:'a',inv:['fist','nuke','pig','mg'],ammo:-5,mg:1e12,heals:99,armor:-1,play:null}))")
    pg.reload(); pg.wait_for_timeout(1200); pg.click("#goCont"); pg.wait_for_timeout(800)
    check(ev("SC.G.money") == 0 and ev("SC.G.mi") == 5 and ev("SC.player.inv.join()") == "fist,mg" and ev("SC.player.ammo") == 0 and ev("SC.player.mg") == 9999 and ev("SC.player.heals") == ev("SC.TUNE.maxHeal") and ev("SC.player.armor") == 0, "こわれた数字のセーブでも、止まらずに動く")
    pg.evaluate("localStorage.setItem('sc-save', '{こわれた')"); pg.reload(); pg.wait_for_timeout(1200)
    check(not shown("#goCont"), "読めないセーブは、ないものとして始まる")

    # ---------- はじめから(2回押す) ----------
    pg.evaluate("localStorage.setItem('sc-save', JSON.stringify({v:1,money:500,mi:2,done:[],inv:['fist'],play:130}))"); pg.reload(); pg.wait_for_timeout(1200)
    pg.click("#goSolo"); pg.wait_for_timeout(300)
    check(shown("#start") and "もう一度押す" in pg.inner_text("#goSolo") and saved() is not None, "セーブがあるとき「はじめから」は、1回目は確かめるだけ")
    pg.screenshot(path=SHOTS + "/s5_new.png")
    pg.click("#goSolo"); pg.wait_for_timeout(800)
    check(not shown("#start") and saved() is None and ev("SC.G.mi") == 0 and ev("SC.G.money") == 0, "2回目で、セーブを消して、はじめから")

    # ---------- 英語 ----------
    pg.evaluate("localStorage.setItem('muddys-lang','en'); localStorage.setItem('sc-save', JSON.stringify({v:1,money:500,mi:5,done:[],inv:['fist'],play:130}))"); pg.reload(); pg.wait_for_timeout(1200)
    import re
    jp = re.compile(r'[ぁ-んァ-ヶ一-龥]')
    t = pg.inner_text("#start"); check(not jp.search(t) and "Continue" in t, "英語: スタート画面に日本語が残っていない")
    pg.click("#goCont"); pg.wait_for_timeout(800); quiet(); tp(F[0]['x'], F[0]['z'])
    t = pg.inner_text("#offer"); check(shown("#offer") and not jp.search(t) and "Market Errand" in t, "英語: ミッションをえらぶ画面に日本語が残っていない")
    pg.screenshot(path=SHOTS + "/s6_en.png")
    check(not errs, "エラーなし " + "; ".join(errs[:3]))
    b.close()
print("\n" + ("全部OK" if not fails else "NG " + str(len(fails)) + "こ: " + " / ".join(fails)))
sys.exit(1 if fails else 0)
