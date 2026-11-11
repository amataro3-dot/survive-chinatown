"""v=7 のテスト(Claude 用): python3 tests/police_test.py . <画像フォルダ>
にせ Three.js で、車の3つのボタン・車を奪うと運転手が出る・パトカーから警察官が降りて引きずり出す・逮捕・
警察官をたおす・店で買う・防弾チョッキ・回復ボタン、を確かめる"""
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
    ctx = b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800); pg.evaluate("SC.TUNE.peace=false")  # お使いの間もおそってくるようにする(v=15)
    pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める(マフィア・警察の数がふつうの時間)
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    # ギャングをどけておく(テストのじゃまにならないように)
    ev("(()=>{SC.gangs.forEach(g=>{g.home.x=g.x=900; g.home.z=g.z=900;}); return 0})()")

    # ---------- 車の3つのボタン ----------
    pg.click("#enterBtn"); pg.wait_for_timeout(300)
    check(ev("SC.player.mode") == "car" and pg.is_visible("#accBtn") and pg.is_visible("#brkBtn") and pg.is_visible("#revBtn"), "車に乗ると、アクセル・ブレーキ・バックのボタンが出る")
    check(not pg.is_visible("#atkBtn") and not pg.is_visible("#dashBtn") and pg.is_visible("#enterBtn"), "車では、こうげき・ダッシュが消えて、降りるは残る")
    pg.screenshot(path=SHOTS + "/p1_carbtns.png")
    # スティックを前に倒しても進まない
    pg.mouse.move(80, 310); pg.mouse.down(); pg.mouse.move(80, 262, steps=4); pg.wait_for_timeout(900)
    check(abs(ev("SC.player.car.v")) < 0.5, "スティックを前に倒しても進まない")
    pg.mouse.up()
    def hold(sel, ms):
        bx = pg.locator(sel).bounding_box(); pg.mouse.move(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2); pg.mouse.down(); pg.wait_for_timeout(ms); pg.mouse.up()
    ev("(()=>{const c=SC.player.car; c.h=Math.PI/2; return 0})()")
    hold("#accBtn", 1200); v1 = ev("SC.player.car.v")
    check(v1 > 5, f"アクセルを押すと進む(速さ {v1:.1f})")
    hold("#brkBtn", 1500); v2 = ev("SC.player.car.v")
    check(abs(v2) < 1, f"ブレーキで止まる(速さ {v2:.1f})")
    hold("#revBtn", 1500); v3 = ev("SC.player.car.v")
    check(v3 < -2, f"バックでうしろに進む(速さ {v3:.1f})")
    pg.click("#enterBtn"); pg.wait_for_timeout(300)
    check(ev("SC.player.mode") == "foot" and pg.is_visible("#atkBtn") and not pg.is_visible("#accBtn"), "降りると、いつものボタンにもどる")

    # ---------- 車を奪うと運転手が出る ----------
    ev("(()=>{SC.TUNE.driver.angry=1; return 0})()")  # テストでは、必ずおそってくる人にする
    # 横に置くのと「乗る」を同じ瞬間にやる(待っている間に車が進んで、別の車に乗ってしまわないように)
    ev("(()=>{const c=SC.cars.find(c=>c.kind==='traffic'); SC.player.x=c.x+1.5; SC.player.z=c.z; document.getElementById('enterBtn').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); return 0})()"); pg.wait_for_timeout(200)
    check(ev("SC.npcs.filter(n=>n.kind==='driver').length") == 1, "走っている車を奪うと、運転手が車から出てくる")
    ev("(()=>{SC.G.wanted=0; return 0})()")  # ここは運転手のテスト。パトカーが来て逮捕されないように、★を0にしておく
    pg.click("#enterBtn"); pg.wait_for_timeout(200)
    hp0 = ev("SC.player.hp")
    ev("(()=>{const n=SC.npcs.find(n=>n.kind==='driver'); SC.player.x=n.x+1.2; SC.player.z=n.z; return 0})()")
    pg.wait_for_timeout(2500)
    check(ev("SC.npcs.find(n=>n.kind==='driver').state") == "angry" and ev("SC.player.hp") < hp0, "おこった運転手は、なぐりかかってくる")
    pg.screenshot(path=SHOTS + "/p2_driver.png")
    for k in range(12):
        pg.click("#atkBtn"); pg.wait_for_timeout(480)
        if ev("SC.npcs.filter(n=>n.kind==='driver'&&n.hp>0).length") == 0: break
    check(ev("SC.npcs.filter(n=>n.kind==='driver'&&n.hp>0).length") == 0, "運転手もなぐってたおせる")
    ev("(()=>{SC.TUNE.driver.angry=0; SC.G.wanted=0; SC.player.hp=100; return 0})()")
    ev("(()=>{const c=SC.cars.find(c=>c.kind==='traffic'); SC.player.x=c.x+1.5; SC.player.z=c.z; document.getElementById('enterBtn').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); return 0})()"); pg.wait_for_timeout(200); pg.click("#enterBtn")
    ev("(()=>{SC.G.wanted=0; return 0})()")
    n = ev("(()=>{const n=SC.npcs.filter(n=>n.kind==='driver'&&n.hp>0).pop(); return [n.x,n.z]})()"); pg.wait_for_timeout(2500)
    d = ev(f"(()=>{{const n=SC.npcs.filter(n=>n.kind==='driver'&&n.hp>0).pop(); return n? Math.hypot(n.x-SC.player.x,n.z-SC.player.z):99}})()")
    check(d > 8, f"ふつうの運転手は逃げていく(はなれた距離 {d:.0f})")

    # ---------- パトカーから警察官 ----------
    ev("(()=>{SC.G.wanted=2; SC.G.spawnCd=0; return 0})()")
    pg.click("#enterBtn"); pg.wait_for_timeout(200)  # 近くの車(運転手のいない車)に乗る
    if ev("SC.player.mode") != "car":
        ev("(()=>{const c=SC.cars.find(c=>c.kind==='parked'); SC.player.x=c.x+1.5; SC.player.z=c.z; return 0})()"); pg.click("#enterBtn"); pg.wait_for_timeout(200)
    pulled = False
    for t in range(40):
        pg.wait_for_timeout(400)
        ev("(()=>{const c=SC.cars.find(c=>c.kind==='police'); if(c&&Math.hypot(c.x-SC.player.x,c.z-SC.player.z)>20){c.x=SC.player.x+12; c.z=SC.player.z; c.h=-Math.PI/2;} return 0})()")
        if ev("SC.npcs.some(n=>n.kind==='cop')") and ev("SC.player.mode") == "foot": pulled = True; break
    check(ev("SC.npcs.filter(n=>n.kind==='cop').length") >= 1, "パトカーが近くで止まって、警察官が降りる")
    check(pulled, "止まっている車から、警察官が主人公を引きずり出す")
    pg.screenshot(path=SHOTS + "/p3_pulled.png")
    # 歩いているところにくっつかれると逮捕
    m0 = ev("SC.G.money"); busted = False
    for t in range(20):
        pg.wait_for_timeout(300)
        if ev("SC.G.wanted") == 0: busted = True; break
    check(busted and "逮捕" in pg.inner_text("#toast"), "警察官にくっつかれると逮捕される")
    # 警察官をたおすと ★+1
    ev("(()=>{SC.G.wanted=1; SC.G.spawnCd=0; SC.player.inv=['fist','katana']; SC.player.wi=1; return 0})()")
    got = False
    for t in range(40):
        pg.wait_for_timeout(300)
        ev("(()=>{const c=SC.cars.find(c=>c.kind==='police'); if(c&&c.crew>0&&Math.hypot(c.x-SC.player.x,c.z-SC.player.z)>18){c.x=SC.player.x+12; c.z=SC.player.z; c.v=0;} return 0})()")
        if ev("SC.npcs.some(n=>n.kind==='cop'&&n.hp>0)"): got = True; break
    if got:
        ev("(()=>{const n=SC.npcs.find(n=>n.kind==='cop'&&n.hp>0); n.hp=10; n.x=SC.player.x-1.5; n.z=SC.player.z; SC.G.bust=0; return 0})()")  # 警察官を主人公のそばへ(パトカーのそばだと、主人公が車に押し出されて刀がとどかないことがある)
        w0 = ev("SC.G.wanted"); pg.wait_for_timeout(100); pg.click("#atkBtn"); pg.wait_for_timeout(200)
        check(ev("SC.npcs.filter(n=>n.kind==='cop'&&n.hp<=0).length") >= 1 and ev("SC.G.wanted") == w0 + 1, "警察官はたおせる。たおすと★+1")
    else: check(False, "警察官はたおせる。たおすと★+1(警察官が出なかった)")
    ev("(()=>{SC.G.wanted=0; return 0})()"); pg.wait_for_timeout(300)

    # ---------- パトカーを奪う(v=10) ----------
    ev("(()=>{SC.player.hp=100; SC.G.wanted=1; SC.G.spawnCd=0; SC.G.bust=0; return 0})()")
    for t in range(30):
        pg.wait_for_timeout(200)
        if ev("SC.cars.some(c=>c.kind==='police')"): break
    ev("(()=>{SC.npcs.filter(n=>n.kind==='cop').forEach(n=>{n.hp=0}); const c=SC.cars.find(c=>c.kind==='police'); c.x=SC.player.x+2.5; c.z=SC.player.z; c.v=0; c.crew=2; c.h=0; SC.G.wanted=1; return 0})()")
    pg.click("#enterBtn"); pg.wait_for_timeout(300)
    car = "SC.player.car"
    check(ev("SC.player.mode") == "car" and ev(car + " && " + car + ".cop"), "止まっているパトカーに乗れる")
    check(ev("SC.G.wanted") == 3, f"パトカーを奪うと★+2(★{ev('SC.G.wanted')})")
    check(ev("SC.npcs.filter(n=>n.kind==='cop'&&n.hp>0).length") >= 1 and ev("SC.npcs.filter(n=>n.kind==='cop'&&n.hp>0).every(n=>!n.car||n.car.kind==='police')"), "中にいた警察官は出てきて、奪われたパトカーにはもどらない")
    check(ev("SC.TUNE.copCarMax") > ev("SC.TUNE.carMax"), "パトカーは、ふつうの車より速い")
    pg.screenshot(path=SHOTS + "/p_copcar.png")
    ev("(()=>{SC.npcs.filter(n=>n.kind==='cop').forEach(n=>{n.hp=0}); return 0})()")
    pg.click("#enterBtn"); pg.wait_for_timeout(200)
    check(ev("SC.player.mode") == "foot" and ev("SC.cars.some(c=>c.cop&&c.kind==='parked')"), "降りると、パトカーはその場に置いたまま")
    w = ev("SC.G.wanted"); pg.click("#enterBtn"); pg.wait_for_timeout(200)
    check(ev("SC.player.mode") == "car" and ev("SC.G.wanted") == w, "置いたパトカーには、もう一度乗れる(★はふえない)")
    pg.click("#enterBtn"); pg.wait_for_timeout(200)
    ev("(()=>{SC.G.wanted=0; SC.npcs.filter(n=>n.kind==='cop').forEach(n=>{n.hp=0}); for(const c of SC.cars) if(c.kind==='police') c.gone=true; SC.player.x+=8; return 0})()"); pg.wait_for_timeout(400)

    # ---------- 店 ----------
    check(ev("SC.SHOPS.length") == 3 and ev("SC.SHOPS.filter(s=>s.kind==='gun').length") == 1, "店が3つ(武器屋1・薬屋2)")
    ev("(()=>{SC.G.money=2000; SC.player.inv=['fist']; SC.player.wi=0; SC.player.ammo=0; const s=SC.SHOPS.find(s=>s.kind==='gun'); SC.player.x=s.x; SC.player.z=s.z; return 0})()")
    pg.wait_for_timeout(300)
    check(pg.is_visible("#shop") and "武器屋" in pg.inner_text("#shopName"), "武器屋のマークに入ると、買い物の画面が出る")
    t0 = ev("SC.G.play"); pg.wait_for_timeout(500)
    check(ev("SC.G.play") == t0, "買い物中はゲームが止まる")
    items = pg.locator(".shopItem")
    check(items.nth(1).is_disabled(), "ピストルがないと、弾は買えない")
    items.nth(0).click(); pg.wait_for_timeout(100)
    check(ev("SC.player.inv.includes('pistol')") and ev("SC.player.ammo") == 12 and ev("SC.G.money") == 1500, "ピストルを買える($500、弾12)")
    pg.locator(".shopItem").nth(1).click(); pg.locator(".shopItem").nth(2).click(); pg.wait_for_timeout(100)
    check(ev("SC.player.ammo") == 24 and ev("SC.player.inv.includes('katana')") and ev("SC.G.money") == 1100, "弾($100)と日本刀($300)を買える")
    pg.screenshot(path=SHOTS + "/p4_gunshop.png")
    pg.click("#shopExit"); pg.wait_for_timeout(400)
    check(not pg.is_visible("#shop"), "「出る」で閉じる(その場にいても、また開かない)")
    ev("(()=>{SC.G.money=1000; SC.player.hp=40; const s=SC.SHOPS.find(s=>s.name==='漢方薬局'); SC.player.x=s.x; SC.player.z=s.z; return 0})()")
    pg.wait_for_timeout(300)
    check(pg.is_visible("#shop") and "漢方" in pg.inner_text("#shopName"), "チャイナタウンの中の薬屋(漢方薬局)")
    pg.locator(".shopItem").nth(0).click(); pg.locator(".shopItem").nth(1).click(); pg.locator(".shopItem").nth(2).click(); pg.wait_for_timeout(100)
    check(ev("SC.player.hp") == 100 and ev("SC.player.heals") == 1 and ev("SC.player.armor") == 50 and ev("SC.G.money") == 250, "全回復($150)・回復薬($200)・防弾チョッキ($400)を買える")
    check(pg.locator(".shopItem").nth(2).is_disabled(), "チョッキを着ていると、もう買えない")
    pg.screenshot(path=SHOTS + "/p5_drugshop.png")
    pg.click("#shopExit"); pg.wait_for_timeout(300)
    ev("(()=>{SC.player.x+=6; return 0})()"); pg.wait_for_timeout(300)
    check(pg.is_visible("#armorBar") and pg.is_visible("#healBtn") and "×1" in pg.inner_text("#healBtn"), "チョッキのゲージと「回復 ×1」ボタンが出る")
    pg.screenshot(path=SHOTS + "/p6_hud.png")
    # チョッキから先に減る
    ev("(()=>{const g=SC.gangs[0]; g.x=SC.player.x+1.2; g.z=SC.player.z; g.home.x=g.x; g.home.z=g.z; g.weapon='knife'; g.hp=100; g.state='idle'; g.dead=-1; return 0})()")
    pg.wait_for_timeout(1600)
    check(ev("SC.player.armor") < 50 and ev("SC.player.hp") == 100, "ダメージは防弾チョッキから先に減る")
    ev("(()=>{const g=SC.gangs[0]; g.home.x=g.x=900; g.home.z=g.z=900; SC.player.hp=30; return 0})()")
    pg.click("#healBtn"); pg.wait_for_timeout(200)
    check(ev("SC.player.hp") == 80 and ev("SC.player.heals") == 0 and not pg.is_visible("#healBtn"), "回復ボタンで体力+50。なくなるとボタンが消える")
    check(ev("Math.abs(SC.HOSPITAL.x-130)<1"), "病院は東側")
    check(not errs, "エラーなし" + (" " + str(errs) if errs else ""))
    b.close()
print("\n全部OK" if not fails else f"\nNG が {len(fails)} こ"); sys.exit(1 if fails else 0)
