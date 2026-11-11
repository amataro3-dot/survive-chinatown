"""街の人との会話のテスト(Claude 用): python3 tests/talk_test.py . <画像フォルダ>
にせ Three.js で、「話す」ボタン・ひとこと・Q&A(いいこたえ/おこらせる)・はなれると終わる・手配中は話せない・屋台の人とおやじ を確かめる"""
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
    ctx = b.new_context(viewport={"width":844,"height":390}, device_scale_factor=2)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/",1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    ev("(()=>{ SC.TUNE.gang.turf=0; SC.gangs.forEach(g=>{ g.per.g.visible=false; g.hp=0; g.dead=-1e9; }); return 0 })()")  # ギャングは消す
    shown = lambda sel: pg.evaluate("s => getComputedStyle(document.querySelector(s)).display !== 'none'", sel)
    def near_ped(i):  # i 番目の街の人のそばへ行く
        ev(f"(()=>{{ const p=SC.peds.filter(p=>!p.off&&!(p.down>0)&&!p.angry)[{i}]; window.__p=p; SC.player.x=p.x+1.2; SC.player.z=p.z+0.4; return 0 }})()"); pg.wait_for_timeout(200)
    def near_vendor(js):
        ev(f"(()=>{{ const v={js}; window.__p=v; SC.player.x=v.x+Math.sin(v.h0)*1.5; SC.player.z=v.z+Math.cos(v.h0)*1.5; return 0 }})()"); pg.wait_for_timeout(200)
    P = lambda js: pg.evaluate("(() => { const p = window.__p, SC = window.SC; return " + js + "; })()")
    lines = ev("SC.LINES.map(l=>l.text)"); later = ev("SC.LINES.filter(l=>l.later).map(l=>l.text)")

    # ---------- 屋台の人 ----------
    v = ev("SC.vendors.map(v=>({x:v.x,z:v.z,o:v.oyaji,k:v.per.kind}))")
    check(len(v) == 6 and sum(1 for q in v if q['o']) == 1 and v[0]['k'] == 'oyaji', f"市場に屋台の人が6人、そのうち1人がおやじ({len(v)}人)")
    ok = True
    for i in range(len(v)):
        ev(f"(()=>{{ const v=SC.vendors[{i}]; SC.player.x=v.x; SC.player.z=v.z; return 0 }})()"); pg.wait_for_timeout(120)
        d = ev(f"Math.hypot(SC.player.x-SC.vendors[{i}].x, SC.player.z-SC.vendors[{i}].z)"); ok = ok and d < 0.3
    check(ok, "屋台の人は、かべや屋台の中に立っていない")
    check(ev("Math.min(...SC.vendors.map(v=>Math.min(...SC.MKW.map(w=>Math.hypot(w.x-v.x,w.z-v.z)))))") >= 2, "市場の武器の置き場所と重なっていない")

    # ---------- ひとこと ----------
    ev("(()=>{ SC.player.x=SC.P(3,3).x; SC.player.z=SC.P(3,3).z; return 0 })()"); pg.wait_for_timeout(200)
    check(not shown("#talkBtn") and not shown("#bubble"), "近くにだれもいないときは「話す」ボタンは出ない")
    ev("(()=>{ SC.TALK.qa=0; return 0 })()"); near_ped(0)
    check(shown("#talkBtn") and pg.inner_text("#talkBtn") == "話す", "街の人に近づくと「話す」ボタンが出る")
    x0 = P("p.x"); pg.click("#talkBtn"); pg.wait_for_timeout(250)
    txt = pg.inner_text("#bubble")
    check(shown("#bubble") and txt in lines and txt not in later, "押すと、頭の上のふきだしにひとこと(" + txt[:16] + "…)")
    pg.screenshot(path=SHOTS + "/t1_line.png")
    pg.wait_for_timeout(1200); check(abs(P("p.x") - x0) < 0.05 and P("p.talkT") > 0, "話している間、その人は立ち止まる")
    check(not shown("#qa"), "ひとことのときは、こたえのボタンは出ない")
    pg.wait_for_timeout(2400); check(not shown("#bubble") and ev("SC.getTalk()") is None, "3秒くらいで、ふきだしが消える")
    pg.wait_for_timeout(1500); check(abs(P("p.x") - x0) + abs(P("p.z")) > 0 and P("!(p.talkT>0)"), "そのあと、また歩きだす")
    got = ev("(()=>{ const s=new Set(); for(let k=0;k<400;k++) s.add(SC.pickLine({}).text); return [...s] })()")
    check(not [g for g in got if g in later] and len(got) >= 14, f"まだ出てこない物(幹部・白いスーツなど)の話はしない({len(got)}種類)")
    self_ = ev("SC.LINES.filter(l=>l.self).map(l=>l.text)")
    got = ev("(()=>{ const s=new Set(); for(let k=0;k<400;k++) s.add(SC.pickLine({oyaji:true}).text); return [...s] })()")
    check(not [g for g in got if g in self_], "おやじは、自分のうわさ話はしない")

    # ---------- 手配中・車 ----------
    near_ped(1); ev("(()=>{ SC.G.wanted=1; return 0 })()"); pg.wait_for_timeout(200)
    check(not shown("#talkBtn"), "手配中(★あり)は話せない")
    ev("(()=>{ SC.G.wanted=0; return 0 })()"); pg.wait_for_timeout(300)

    # ---------- Q&A ----------
    ev("(()=>{ SC.TALK.qa=1; return 0 })()"); near_ped(1); hp0 = ev("SC.player.hp")
    pg.click("#talkBtn"); pg.wait_for_timeout(250)
    t = ev("(()=>{ const t=SC.getTalk(); return t&&t.qa ? {q:t.qa.text, who:t.qa.who||'', o:t.opts.map(o=>[o.text,o.ng])} : null })()")
    check(t is not None and shown("#qa") and pg.inner_text("#bubble") == t['q'] and t['who'] != 'oyaji', "Q&A: ふきだしに質問が出る(" + (t['q'][:14] if t else '') + "…)")
    check(t and pg.inner_text("#qa0") == t['o'][0][0] and pg.inner_text("#qa1") == t['o'][1][0] and sorted(o[1] for o in t['o']) == [False, True], "こたえのボタンが2つ出る")
    check(not shown("#talkBtn"), "こたえを待っている間は「話す」ボタンは出ない")
    pg.screenshot(path=SHOTS + "/t2_qa.png")
    pg.wait_for_timeout(3600); check(shown("#qa") and P("p.talkT") > 0, "こたえるまで、相手は待っている")
    good = 0 if not t['o'][0][1] else 1
    pg.click(f"#qa{good}"); pg.wait_for_timeout(250)
    check(not shown("#qa") and pg.inner_text("#bubble") == "😊" and ev("SC.npcs.length") == 0, "いいこたえ: 相手はよろこぶ(おそってこない)")
    pg.wait_for_timeout(2200); check(ev("SC.player.hp") == hp0 and ev("SC.G.money") == 0, "いいこたえでも、ごほうびはなし")
    # おこらせる
    near_ped(2); pg.click("#talkBtn"); pg.wait_for_timeout(250)
    bad = ev("SC.getTalk().opts[0].ng ? 0 : 1"); pg.click(f"#qa{bad}"); pg.wait_for_timeout(300)
    n = ev("SC.npcs.map(n=>({k:n.kind,s:n.state}))")
    check(len(n) == 1 and n[0]['s'] == 'angry' and P("!!p.angry"), "★のこたえ: 相手がおこる")
    check(pg.inner_text("#bubble") == "💢", "おこったしるしが出る")
    pg.screenshot(path=SHOTS + "/t3_angry.png")
    pg.wait_for_timeout(2600); check(ev("SC.player.hp") < hp0, f"おこった人は、なぐってくる(体力 {ev('SC.player.hp')})")
    ev("(()=>{ const n=SC.npcs[0]; n.hp=0; n.dead=5.9; SC.player.hp=100; return 0 })()"); pg.wait_for_timeout(500)
    check(ev("SC.npcs.length") == 0 and P("!p.angry"), "いなくなったら、元の街の人にもどる")
    # はなれると終わる
    near_ped(3); pg.click("#talkBtn"); pg.wait_for_timeout(250); ok1 = shown("#qa")
    ev("(()=>{ SC.player.x+=10; return 0 })()"); pg.wait_for_timeout(300)
    check(ok1 and not shown("#qa") and not shown("#bubble") and ev("SC.getTalk()") is None and ev("SC.npcs.length") == 0, "こたえずにはなれると、会話は終わる(おそってこない)")
    # 車に乗っているときは話せない
    near_ped(4); ev("(()=>{ const c=SC.cars.find(c=>c.kind==='parked'); c.x=SC.player.x+2.5; c.z=SC.player.z; return 0 })()"); pg.wait_for_timeout(150)
    pg.click("#enterBtn"); pg.wait_for_timeout(250)
    check(ev("SC.player.mode") == 'car' and not shown("#talkBtn"), "車に乗っているときは話せない")
    pg.click("#enterBtn"); pg.wait_for_timeout(250)

    # ---------- 屋台のおやじ ----------
    near_vendor("SC.vendors[0]"); check(shown("#talkBtn"), "屋台のおやじに近づくと「話す」ボタンが出る")
    pg.click("#talkBtn"); pg.wait_for_timeout(250)
    check(ev("SC.getTalk().qa.who") == 'oyaji' and "秘伝のタレ" in pg.inner_text("#bubble"), "おやじは「秘伝のタレ」の質問をする")
    pg.screenshot(path=SHOTS + "/t4_oyaji.png")
    bad = ev("SC.getTalk().opts[0].ng ? 0 : 1"); pg.click(f"#qa{bad}"); pg.wait_for_timeout(300)
    check(pg.inner_text("#bubble") == "…" and ev("SC.npcs.length") == 0 and P("!p.angry"), "おやじは★のこたえでも、おそってこない(だまって見るだけ)")
    pg.wait_for_timeout(3000); ev("(()=>{ SC.TALK.oyajiQa=0; return 0 })()")
    pg.click("#talkBtn"); pg.wait_for_timeout(250)
    check(pg.inner_text("#bubble") in lines and not shown("#qa"), "おやじには何度でも話しかけられる(2回目はひとこと)")
    pg.wait_for_timeout(3500)
    # 屋台の人をおこらせる
    near_vendor("SC.vendors[1]"); pg.click("#talkBtn"); pg.wait_for_timeout(250)
    bad = ev("SC.getTalk().opts[0].ng ? 0 : 1"); pg.click(f"#qa{bad}"); pg.wait_for_timeout(300)
    check(ev("SC.npcs.length") == 1 and P("!!p.angry"), "屋台の人は、★のこたえでおこる")
    ev("(()=>{ const n=SC.npcs[0]; n.hp=0; n.dead=5.9; return 0 })()"); pg.wait_for_timeout(500)
    check(P("!p.angry") and P("p.x") == v[1]['x'], "しばらくすると、屋台にもどる")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
