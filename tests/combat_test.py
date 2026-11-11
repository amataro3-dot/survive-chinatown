"""ひとり用の戦いのテスト(Claude 用): python3 tests/combat_test.py . <画像フォルダ>
にせ Three.js で、ギャングにおそわれる・なぐってたおす・お金と武器を拾う・やられて病院で目がさめる(武器没収)を確かめる"""
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
    ctx = b.new_context(viewport={"width":844,"height":390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/",1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める(マフィア・警察の数がふつうの時間)
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    # 素手のギャングの近くへ
    i = ev("SC.gangs.findIndex(g => g.weapon === 'fist')")
    ev(f"(()=>{{const g=SC.gangs[{i}]; SC.player.x=g.x+1.2; SC.player.z=g.z; SC.player.h=-Math.PI/2; return 0}})()")
    pg.wait_for_timeout(2500)
    check(ev("SC.gangs.length") == 27 and ev("SC.gangs.filter(g=>!g.off).length") == 19, "ギャングが19人いる(街16・市場3。ほかに夜だけの8人)")
    check(ev("SC.player.hp") < 100 and ev(f"SC.gangs[{i}].state") == "chase", "なわばりに入ると、ギャングがおそってきて体力が減る")
    pg.screenshot(path=SHOTS + "/c1_fight.png")
    m0 = ev("SC.G.money")
    for k in range(10):
        pg.click("#atkBtn"); pg.wait_for_timeout(500)
        if ev(f"SC.gangs[{i}].hp") <= 0: break
    check(ev(f"SC.gangs[{i}].hp") <= 0 and ev("SC.G.wanted") >= 1, "こうげきボタンでなぐってたおせる。手配度が上がる")
    pg.wait_for_timeout(300); pg.screenshot(path=SHOTS + "/c2_down.png")
    check(ev("SC.G.money") > m0, "落としたお金を拾える")
    # ピストルのギャング: 武器を落とすか
    j = ev("SC.gangs.findIndex(g => g.weapon === 'pistol')")
    ev(f"(()=>{{const g=SC.gangs[{j}]; SC.player.x=g.x+1.5; SC.player.z=g.z; g.hp=10; return 0}})()")
    pg.wait_for_timeout(300); pg.click("#atkBtn"); pg.wait_for_timeout(400)
    check("pistol" in ev("JSON.stringify(SC.pickups.map(p=>p.kind))"), "ピストルのギャングはピストルを落とす")
    ev("(()=>{const p=SC.pickups.find(p=>p.kind==='pistol'); if(p){SC.player.x=p.x; SC.player.z=p.z;} return 0})()"); pg.wait_for_timeout(400)
    check(ev("SC.player.inv.includes('pistol')") and ev("SC.player.ammo") == 12 and "ピストル" in pg.inner_text("#wpnBtn"), "ピストルを拾える(弾12)。ボタンに出る")
    pg.screenshot(path=SHOTS + "/c3_pistol.png")
    # やられる → 病院
    ev("(()=>{SC.player.hp=3; return 0})()")
    k = ev("SC.gangs.findIndex(g => g.hp > 0 && g.weapon === 'knife')")
    ev(f"(()=>{{const g=SC.gangs[{k}]; SC.player.x=g.x+1.2; SC.player.z=g.z; return 0}})()")
    pg.wait_for_timeout(2000); check(ev("SC.G.downT>0") and ev("SC.player.hp") == 0, "体力が0になると、たおれる")
    m1 = ev("SC.G.money")
    for t in range(20):
        pg.wait_for_timeout(500)
        if ev("SC.G.downT") <= 0: break
    me = ev("SC.getMe()")
    check(ev("SC.player.hp") == 100 and ev("JSON.stringify(SC.player.inv)") == '["fist"]' and abs(me["x"] - ev("SC.HOSPITAL.x")) < 1 and ev("SC.G.money") < m1, "病院の場所で目がさめる(体力100・武器没収・お金が減る)")
    pg.screenshot(path=SHOTS + "/c4_hospital.png")
    # 逮捕でも武器没収
    ev("(()=>{SC.player.inv=['fist','knife']; SC.player.wi=1; SC.G.wanted=2; return 0})()")
    for t in range(40):
        pg.wait_for_timeout(500)
        if ev("SC.G.wanted") == 0: break
        pol = ev("(()=>{const c=SC.cars.find(c=>c.kind==='police'); if(c){SC.player.x=c.x+3; SC.player.z=c.z;} return !!c})()")
    check(ev("JSON.stringify(SC.player.inv)") == '["fist"]', "逮捕されると武器も没収される")
    check(not errs, "エラーなし" + (" " + str(errs) if errs else ""))
    b.close()
print("\n全部OK" if not fails else f"\nNG が {len(fails)} こ"); sys.exit(1 if fails else 0)
