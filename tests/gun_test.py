"""ピストル・マシンガンのテスト(Claude 用): python3 tests/gun_test.py . <画像フォルダ>
にせ Three.js で、こうげきボタンを倒してねらう・離して撃つ・タップは前へ・マシンガンは押している間ずっと撃つ・武器屋で買う を確かめる"""
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
    pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める(マフィア・警察の数がふつうの時間)
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    # ほかのギャングは見えなくして、おそってこないようにする。的のギャングは主人公の東10m(道路の上)
    def setup(wk, ammo, mg):
        ev(f"""(()=>{{ SC.TUNE.gang.turf=0; SC.player.hp=100; SC.player.inv=['fist','{wk}']; SC.player.wi=1; SC.player.ammo={ammo}; SC.player.mg={mg};
          SC.gangs.forEach((g,i)=>{{ if(i>0) g.per.g.visible=false; }});
          const g=SC.gangs[0]; g.hp=100; g.dead=-1; g.per.g.visible=true; g.state='idle'; g.x=SC.player.x+10; g.z=SC.player.z; g.home={{x:g.x,z:g.z}}; g.tx=g.x; g.tz=g.z;
          SC.player.h=0; SC.G.camYaw=Math.PI; SC.G.camDrag=0; return 0 }})()""")
        pg.wait_for_timeout(150)
    box = lambda: pg.locator("#atkBtn").bounding_box()
    def drag_right(hold_ms, release=True):
        bb = box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 15, cy, steps=2); pg.mouse.move(cx + 40, cy, steps=3)
        pg.wait_for_timeout(hold_ms)
        if release: pg.mouse.up()
        return cx, cy
    # 主人公とギャングの間に壁がないか(道路の上なので、ないはず)
    ev("(()=>{SC.player.x=Math.round(SC.player.x); return 0})()")

    # ---------- ピストル ----------
    setup('pistol', 12, 0)
    check("ピストル" in pg.inner_text("#wpnBtn") and "12" in pg.inner_text("#wpnBtn"), "武器のボタンにピストルと弾の数が出る")
    pg.click("#atkBtn"); pg.wait_for_timeout(300)
    check(ev("SC.player.ammo") == 11 and ev("SC.gangs[0].hp") == 100, "軽くタップすると、向いている方(北)へ撃つ。横の敵には当たらない")
    setup('pistol', 11, 0)
    cx, cy = drag_right(250, release=False)
    st = pg.evaluate("document.getElementById('atkBtn').style.transform")
    h = ev("SC.player.h")
    check("translate" in st and ev("SC.player.ammo") == 11, "ボタンを倒すと、ボタンが動く(まだ撃たない)")
    check(abs(math.atan2(math.sin(h - math.pi / 2), math.cos(h - math.pi / 2))) < 0.05, f"倒している間、主人公はねらう方(東)を向く(向き {h:.2f})")
    pg.screenshot(path=SHOTS + "/g1_aim.png")
    pg.mouse.up(); pg.wait_for_timeout(300)
    check(ev("SC.player.ammo") == 10 and ev("SC.gangs[0].hp") == 75, f"離すと、ねらった方へ1発。ギャングに25ダメージ(体力 {ev('SC.gangs[0].hp')})")
    check(pg.evaluate("document.getElementById('atkBtn').style.transform") == "", "離すと、ボタンがもとにもどる")
    setup('pistol', 0, 0)
    drag_right(100); pg.wait_for_timeout(200)
    check("弾がない" in pg.inner_text("#toast") and ev("SC.gangs[0].hp") == 100, "弾がないと撃てない(「弾がない！」)")

    # ---------- 武器屋でマシンガン ----------
    ev("(()=>{SC.G.money=3000; SC.player.inv=['fist']; SC.player.wi=0; SC.player.ammo=0; SC.player.mg=0; const s=SC.SHOPS.find(s=>s.kind==='gun'); SC.player.x=s.x; SC.player.z=s.z; return 0})()")
    pg.wait_for_timeout(500)
    names = pg.locator(".shopItem").all_inner_texts()
    check(any("マシンガン(弾50発つき)" in n and "$1,500" in n for n in names) and any("マシンガンの弾 50発" in n and "$250" in n for n in names), "武器屋にマシンガン $1,500 と弾50発 $250 がある")
    mg_i = next(i for i, n in enumerate(names) if "マシンガン(弾50発つき)" in n); am_i = next(i for i, n in enumerate(names) if "マシンガンの弾" in n)
    check(pg.locator(".shopItem").nth(am_i).is_disabled(), "マシンガンがないと、弾は買えない")
    pg.locator(".shopItem").nth(mg_i).click(); pg.wait_for_timeout(100); pg.locator(".shopItem").nth(am_i).click(); pg.wait_for_timeout(100)
    check(ev("SC.player.inv.includes('mg')") and ev("SC.player.mg") == 100 and ev("SC.G.money") == 1250, "マシンガン(弾50)と弾50発を買える")
    check(pg.locator(".shopItem").nth(mg_i).is_disabled(), "持っているマシンガンは、もう買えない")
    pg.click("#shopExit"); pg.wait_for_timeout(100)
    ev("(()=>{const s=SC.SHOPS.find(s=>s.kind==='gun'); SC.player.x=s.x; SC.player.z=s.z+12; return 0})()"); pg.wait_for_timeout(300)

    # ---------- マシンガン ----------
    # 道路の上にもどる
    ev("(()=>{SC.player.x=SC.P(3,3).x+20; SC.player.z=SC.P(3,3).z+2.5; return 0})()"); pg.wait_for_timeout(200)
    setup('mg', 0, 50)
    check("マシンガン" in pg.inner_text("#wpnBtn") and "50" in pg.inner_text("#wpnBtn"), "武器のボタンにマシンガンと弾の数が出る")
    drag_right(1000, release=False)
    used = 50 - ev("SC.player.mg"); hp = ev("SC.gangs[0].hp")
    check(5 <= used <= 11, f"押している間、ずっと撃つ(1秒で {used} 発)")
    check(hp < 100, f"倒した方のギャングに当たる(体力 {hp})")
    pg.mouse.up(); pg.wait_for_timeout(100); a1 = ev("SC.player.mg"); pg.wait_for_timeout(400)
    check(ev("SC.player.mg") == a1, "離すと止まる")
    setup('mg', 0, 50)
    bb = box(); pg.mouse.move(bb["x"] + 47, bb["y"] + 47); pg.mouse.down(); pg.wait_for_timeout(600); pg.mouse.up(); pg.wait_for_timeout(100)
    check(ev("SC.player.mg") < 50 and ev("SC.gangs[0].hp") == 100, "倒さずに押しっぱなしだと、向いている方(北)へ撃ちつづける")
    setup('mg', 0, 3)
    drag_right(800); pg.wait_for_timeout(100)
    check(ev("SC.player.mg") == 0 and "弾がない" in pg.inner_text("#toast"), "弾がなくなると止まる(「弾がない！」)")
    pg.screenshot(path=SHOTS + "/g2_mg.png")

    # ---------- 素手は今のまま ----------
    ev("(()=>{SC.player.inv=['fist']; SC.player.wi=0; const g=SC.gangs[0]; g.hp=100; g.x=SC.player.x+1.2; g.z=SC.player.z; return 0})()"); pg.wait_for_timeout(100)
    pg.click("#atkBtn"); pg.wait_for_timeout(200)
    check(ev("SC.gangs[0].hp") == 85, "素手は、押したらすぐなぐる(15ダメージ)")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
