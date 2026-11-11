"""昼と夜のテスト(Claude 用): python3 tests/daynight_test.py . <画像フォルダ>
にせ Three.js で、昼から始まる・時間が流れる・昼/夕方/夜でマフィア・街の人・パトカーの数が変わる・配達競争は夜のまま を確かめる"""
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
    pg.goto(URL); pg.wait_for_timeout(1200)
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    check(ev("SC.G.phase") == "night", "スタート画面のうしろの街は夜")
    pg.click("#goSolo"); pg.wait_for_timeout(800)
    ev("(()=>{ SC.TUNE.gang.turf=0; return 0 })()")
    on = lambda: ev("({g:SC.gangs.filter(g=>!g.off).length, p:SC.peds.filter(p=>!p.off).length})")
    c0 = ev("SC.G.clock")
    check(ev("SC.G.phase") == "day" and "昼" in pg.inner_text("#clock"), "ひとり用は昼から始まる(右上に「昼」)")
    pg.wait_for_timeout(1000)
    check(0.6 < ev("SC.G.clock") - c0 < 1.6, "時間が流れる")
    check(ev("SC.DAY.len") == 720 and ev("SC.DAY.eve") == 300 and ev("SC.DAY.night") == 420, "1日は12分(昼5分・夕方2分・夜5分)")
    n = on(); check(n['g'] == 11 and n['p'] == 22, f"昼: マフィアは半分(街8+市場3 = {n['g']}人)、街の人は22人({n['p']})")
    # 時間が流れて夕方になる
    pg.wait_for_timeout(1500)  # ミッションの文字が消えるのを待つ(ほかの文字が出ている間は、時間の文字は出さない)
    ev("(()=>{ SC.G.clock=299.5; return 0 })()"); pg.wait_for_timeout(1200)
    check(ev("SC.G.phase") == "eve" and "夕方" in pg.inner_text("#clock"), "昼の5分がすぎると夕方になる")
    check("夕方になった" in pg.inner_text("#toast"), "「夕方になった」と出る")
    ev("SC.setClock(350)"); n = on()
    check(n['g'] == 19 and n['p'] == 33, f"夕方: マフィアは19人({n['g']})、街の人は1.5倍の33人({n['p']})")
    ev("SC.setClock(500)"); n = on()
    pg.wait_for_timeout(300)
    check("夜" in pg.inner_text("#clock") and n['g'] == 27 and n['p'] == 22, f"夜: マフィアは1.5倍(街24+市場3 = {n['g']}人)、街の人は22人({n['p']})")
    ev("(()=>{ SC.G.clock=719.5; return 0 })()"); pg.wait_for_timeout(1200)
    check(ev("SC.G.phase") == "day" and ev("SC.G.clock") < 5, "夜がすぎると朝になって、また昼(12分で1日)")
    # 近くの人は、目の前で急に消えない
    ev("(()=>{ SC.DAY.speed=0; SC.setClock(500); const g=SC.gangs.find(g=>g.tier===2); SC.player.x=g.x+20; SC.player.z=g.z; window.__g=g; SC.G.clock=100; return 0 })()"); pg.wait_for_timeout(800)
    check(pg.evaluate("!window.__g.off") and ev("SC.G.phase") == "day", "近く(60mより近い)にいるマフィアは、時間が変わってもすぐには消えない")
    ev("(()=>{ SC.player.x=window.__g.x+90; return 0 })()"); pg.wait_for_timeout(800)
    check(pg.evaluate("window.__g.off === true"), "はなれると、いなくなる")
    # パトカーの数(★2 のとき): 昼3台・夕方2台・夜1台
    def police(clock):
        ev(f"(()=>{{ SC.G.wanted=0; return 0 }})()"); pg.wait_for_timeout(200)
        ev(f"(()=>{{ SC.setClock({clock}); const q=SC.P(3,3); SC.player.x=q.x+20; SC.player.z=q.z+2.5; SC.player.hp=100; SC.G.wanted=2; SC.G.evade=0; SC.G.spawnCd=0; SC.TUNE.police.speed=0; SC.TUNE.police.evadeDist=1; return 0 }})()")
        mx = 0
        for _ in range(12):
            pg.wait_for_timeout(1000); mx = max(mx, ev("SC.cars.filter(c=>c.kind==='police').length + 0"))
            ev("(()=>{ SC.G.evade=0; SC.G.wanted=2; return 0 })()")
        return mx
    ev("(()=>{ SC.gangs.forEach(g=>{g.home.x=g.x=900; g.home.z=g.z=900;}); return 0 })()")
    d, e, nt = police(100), police(350), police(500)
    check((d, e, nt) == (3, 2, 1), f"★2 のパトカー: 昼は1台多い・夜は1台少ない(昼{d}・夕方{e}・夜{nt})")
    # ★がへるまでの時間: 昼は1.5倍
    def evade(clock):
        ev(f"(()=>{{ SC.setClock({clock}); SC.TUNE.police.maxCars=0; SC.TUNE.police.evadeDist=1; SC.G.wanted=1; SC.G.evade=0; return 0 }})()")
        t = 0
        while t < 20 and ev("SC.G.wanted") > 0: pg.wait_for_timeout(500); t += 0.5
        return t
    ev("(()=>{ SC.G.wanted=0; SC.TUNE.police.evadeTime=4; return 0 })()"); pg.wait_for_timeout(300)
    te, td = evade(350), evade(100)
    check(3 <= te <= 5.5 and 5.5 <= td <= 8, f"★がへるまで: 昼は1.5倍かかる(夕方 {te} 秒・昼 {td} 秒)")
    pg.screenshot(path=SHOTS + "/d1.png")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
