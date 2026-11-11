"""市場の武器のテスト(Claude 用): python3 tests/market_test.py . <画像フォルダ>
にせ Three.js で、市場で拾う・3つまで・60秒でまた出る・豚の頭(ダメージと、前が見えない4秒)・ヘビ(5秒止まる)・青龍刀・没収されない を確かめる"""
import sys, os, math
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
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    ev("(()=>{ SC.TUNE.gang.turf=0; SC.gangs.forEach((g,i)=>{ g.per.g.visible=false; g.hp=0; g.dead=-1e9; }); return 0 })()")  # ギャングはいったん全部消す
    road = ev("({x:Math.round(SC.player.x), z:SC.player.z})")

    # ---------- 置き場所 ----------
    kinds = ev("SC.MKW.map(w=>w.kind).sort().join(',')")
    check(kinds == "dao,pig,pig,pig,snake,snake", "市場に、豚の頭3か所・ヘビ2か所・青龍刀1か所(" + kinds + ")")
    def goto(kind, n=0):
        ev(f"(()=>{{ const w=SC.MKW.filter(w=>w.kind==='{kind}')[{n}]; SC.player.x=w.x; SC.player.z=w.z; return 0 }})()"); pg.wait_for_timeout(250)
    def away():
        ev(f"(()=>{{ SC.player.x={road['x']}; SC.player.z={road['z']}; return 0 }})()"); pg.wait_for_timeout(150)
    px0 = None
    goto('pig', 0); px0 = ev("({x:SC.player.x, z:SC.player.z})"); w0 = ev("(()=>{const w=SC.MKW.filter(w=>w.kind==='pig')[0]; return {x:w.x,z:w.z,t:w.t}})()")
    check(abs(px0['x'] - w0['x']) < 0.6 and abs(px0['z'] - w0['z']) < 0.6, "置き場所は、かべの中ではない(歩いて行ける)")
    check(ev("SC.player.pigs") == 1 and ev("SC.player.inv.includes('pig')") and "豚の頭" in pg.inner_text("#toast"), "豚の頭を拾える(「豚の頭をひろった！」)")
    check(w0['t'] > 55, f"拾った場所は、60秒たつまで出てこない(あと {w0['t']:.0f} 秒)")
    pg.wait_for_timeout(300); check(ev("SC.player.pigs") == 1, "同じ場所に立っていても、2つ目は拾えない")
    check("豚の頭" in pg.inner_text("#wpnBtn") and "1" in pg.inner_text("#wpnBtn"), "武器のボタンに豚の頭と数が出る")
    ev("(()=>{ SC.MKW.filter(w=>w.kind==='pig')[0].t=0.2; return 0 })()"); pg.wait_for_timeout(500)
    check(ev("SC.player.pigs") == 2, "時間がたつと、同じ場所にまた出てくる")
    goto('pig', 1); goto('pig', 2)
    check(ev("SC.player.pigs") == 3, "豚の頭は3つまで持てる")
    check(ev("SC.MKW.filter(w=>w.kind==='pig')[2].t") <= 0 or ev("SC.player.pigs") == 3, "3つ持っているときは拾わない")
    ev("(()=>{ SC.MKW.filter(w=>w.kind==='pig')[0].t=0; return 0 })()"); goto('pig', 0)
    check(ev("SC.player.pigs") == 3 and ev("SC.MKW.filter(w=>w.kind==='pig')[0].t") <= 0, "4つ目は拾えない(置いたまま)")
    goto('snake', 0); goto('snake', 1)
    check(ev("SC.player.snakes") == 2 and ev("SC.player.inv.includes('snake')"), "ヘビを拾える")
    goto('dao')
    check(ev("SC.player.inv.includes('dao')") and "青龍刀" in pg.inner_text("#wpnBtn"), "青龍刀を拾える")
    pg.screenshot(path=SHOTS + "/m1_pick.png")

    # ---------- 投げる ----------
    away()
    def setup(wk, dist=8):
        ev(f"""(()=>{{ SC.player.hp=100; SC.player.wi=SC.player.inv.indexOf('{wk}'); SC.player.atkCd=0;
          const g=SC.gangs[0]; g.hp=100; g.dead=-1; g.per.g.visible=true; g.state='idle'; g.blind=0; g.frozen=0; g.x=SC.player.x+{dist}; g.z=SC.player.z; g.home={{x:g.x,z:g.z}}; g.tx=g.x; g.tz=g.z; g.wt=99;
          SC.player.h=0; SC.G.camYaw=Math.PI; SC.G.camDrag=0; return 0 }})()""")
        pg.wait_for_timeout(150)
    box = lambda: pg.locator("#atkBtn").bounding_box()
    def drag_right(hold_ms, release=True):
        bb = box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 15, cy, steps=2); pg.mouse.move(cx + 40, cy, steps=3)
        pg.wait_for_timeout(hold_ms)
        if release: pg.mouse.up()
    setup('pig')
    drag_right(250, release=False)
    h = ev("SC.player.h")
    check(ev("SC.player.pigs") == 3 and abs(math.atan2(math.sin(h - math.pi / 2), math.cos(h - math.pi / 2))) < 0.05, "ボタンを倒すと、ねらう方(東)を向く(まだ投げない)")
    pg.mouse.up(); pg.wait_for_timeout(120)
    check(ev("SC.player.pigs") == 2 and ev("SC.shots.length") == 1, "離すと、豚の頭を投げる(飛んでいる)")
    pg.wait_for_timeout(700)
    g = ev("({hp:SC.gangs[0].hp, blind:SC.gangs[0].blind, n:SC.shots.length})")
    check(g['hp'] == 60 and g['blind'] > 2.5 and g['n'] == 0, f"当たると40ダメージで、頭にかぶさる(体力 {g['hp']}、のこり {g['blind']:.1f} 秒)")
    hp0 = ev("SC.player.hp"); ev("(()=>{ const g=SC.gangs[0]; g.weapon='fist'; g.x=SC.player.x+1; g.z=SC.player.z; g.state='chase'; return 0 })()")
    pg.wait_for_timeout(1500)
    check(ev("SC.player.hp") == hp0 and ev("SC.gangs[0].blind") > 0, "かぶっている間は、こうげきしてこない")
    pg.screenshot(path=SHOTS + "/m2_pig.png")
    pg.wait_for_timeout(2600)
    check(ev("SC.gangs[0].blind") <= 0 and ev("!SC.gangs[0].pigM"), "4秒たつと、豚の頭が落ちて元にもどる")
    # ヘビ
    setup('snake')
    drag_right(150); pg.wait_for_timeout(800)
    g = ev("({hp:SC.gangs[0].hp, fr:SC.gangs[0].frozen, x:SC.gangs[0].x})")
    check(ev("SC.player.snakes") == 1 and g['hp'] == 100 and g['fr'] > 3.5, f"ヘビが当たると、ダメージなしで止まる(のこり {g['fr']:.1f} 秒)")
    ev("(()=>{ SC.gangs[0].state='chase'; return 0 })()"); pg.wait_for_timeout(1200)
    check(abs(ev("SC.gangs[0].x") - g['x']) < 0.05, "止まっている間は動かない")
    pg.wait_for_timeout(3600)
    check(ev("SC.gangs[0].frozen") <= 0, "5秒たつと動けるようになる")
    # 遠すぎる(15mより先)は当たらない
    setup('snake', 22); drag_right(150); pg.wait_for_timeout(1300)
    check(ev("SC.player.snakes") == 0 and not ev("SC.gangs[0].frozen > 0"), "15mより遠い敵には、とどかない")
    check(not ev("SC.player.inv.includes('snake')"), "なくなったら、持ち物から消える")
    # 警察官にも効く
    setup('pig', 30)
    ev("(()=>{ SC.gangs[0].per.g.visible=false; SC.gangs[0].hp=0; SC.gangs[0].dead=-1e9; SC.G.wanted=1; const n=SC.newNpc('cop', SC.player.x+7, SC.player.z, 0); window.__cop=n; return 0 })()")
    drag_right(150); pg.wait_for_timeout(700)
    check(pg.evaluate("window.__cop.blind > 0 && window.__cop.hp === 40"), "警察官にも豚の頭が効く")
    ev("(()=>{ window.__cop.x=SC.player.x+1; window.__cop.z=SC.player.z; return 0 })()"); pg.wait_for_timeout(1200)
    check(ev("SC.G.bust") < 0.3, "かぶっている警察官には、逮捕されない")
    ev("(()=>{ window.__cop.hp=0; window.__cop.dead=5.9; SC.G.wanted=0; SC.G.bust=0; return 0 })()"); pg.wait_for_timeout(400)
    # タップは前へ(パソコンの J も同じ)
    away(); setup('pig', 8)
    ev("(()=>{ SC.player.h=Math.PI/2; return 0 })()"); pg.click("#atkBtn"); pg.wait_for_timeout(900)
    check(ev("SC.player.pigs") == 0 and ev("SC.gangs[0].hp") == 60, "軽くタップすると、向いている方へ投げる")
    # ---------- 青龍刀 ----------
    setup('dao', 1.5); pg.click("#atkBtn"); pg.wait_for_timeout(200)
    check(ev("SC.gangs[0].hp") == 45, "青龍刀は55ダメージ")
    pg.click("#atkBtn"); pg.wait_for_timeout(100)
    check(ev("SC.gangs[0].hp") == 45, "青龍刀は、ふるのが少しおそい(すぐには2回目が出ない)")
    # ---------- 没収 ----------
    ev("(()=>{ SC.player.pigs=2; SC.player.snakes=1; SC.player.inv=['fist','pistol','dao','pig','snake']; SC.player.ammo=5; SC.confiscate(); return 0 })()")
    check(ev("SC.player.inv.join(',')") == "fist,pig,snake" and ev("SC.player.pigs") == 2 and ev("SC.player.snakes") == 1, "没収されても、豚の頭とヘビは残る(青龍刀・ピストルはなくなる)")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
