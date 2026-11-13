"""市場の使いみちのテスト(v=31。Claude 用): python3 tests/market2_test.py . <画像フォルダ>
にせ Three.js で、屋台の食べ物(黄色い光・買う・満タンでは買えない・ラーメンではやく走れる)・中華なべ(前からの弾が半分)・棒(大きくふっとぶ)・
市場のかくれ場所(★が2倍の速さでへる)・没収・セーブ・英語 を確かめる"""
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
    def open_page(lang=None):
        ctx = b.new_context(viewport={"width":844,"height":390}, device_scale_factor=2)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/",1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
        ctx.expose_function("__db", handler_for("u"))
        ctx.add_init_script('window.SC_NO_INTRO = 1' + (f'; localStorage.setItem("muddys-lang", "{lang}")' if lang else ''))
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
        pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
        pg.evaluate("(()=>{ SC.DAY.speed=0; SC.setClock(350); })()")  # 時間は夕方で止める
        return pg
    pg = open_page()
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    ev("(()=>{ SC.TUNE.gang.turf=0; SC.gangs.forEach(g=>{ g.per.g.visible=false; g.hp=0; g.dead=-1e9; }); return 0 })()")  # ギャングはいったん全部消す
    road = ev("({x:Math.round(SC.player.x), z:SC.player.z})")
    def away():
        ev(f"(()=>{{ SC.player.x={road['x']}; SC.player.z={road['z']}; return 0 }})()"); pg.wait_for_timeout(250)

    # ---------- 屋台の食べ物 ----------
    n = ev("SC.FOODS.length")
    check(n == 5, f"屋台の黄色い光が5つ(おやじ以外の屋台の人のよこ)({n})")
    check(ev("SC.FOODS.every(f => !f.v.oyaji) && new Set(SC.FOODS.map(f => f.v)).size === SC.FOODS.length"), "おやじの屋台にはない・1人に1つ")
    check(ev("SC.FOODS.every(f => Math.hypot(f.x - f.v.x, f.z - f.v.z) < 2.6)"), "光は屋台の人のすぐよこ")
    check(ev("SC.FOODS.every(f => SC.MKW.every(w => Math.hypot(w.x - f.x, w.z - f.z) >= 2.5))"), "市場の武器の置き場所とは、はなれている")
    marks = ev("[SC.HOME, SC.BOAT.at, ...SC.FREE.map(f => f.at), ...SC.SHOPS].map(m => [m.x, m.z])")
    foods = ev("SC.FOODS.map(f => [f.x, f.z])")
    near = min(math.hypot(a[0]-c[0], a[1]-c[1]) for a in foods for c in marks)
    check(near > 5, f"ほかの光るマーク(ミッション・店・家)と5m以上はなれている(いちばん近くて {near:.1f}m)")
    pg.wait_for_timeout(200); check(ev("SC.FOODS.every(f => f.g.visible)"), "ひとり用では光が見える")
    # 歩いて行けるか: 光の場所に置いて、かべに押し出されない
    ok = True
    for i in range(n):
        ev(f"(()=>{{ SC.G.shopLock=null; const f=SC.FOODS[{i}]; SC.player.x=f.x; SC.player.z=f.z; return 0 }})()"); pg.wait_for_timeout(250)
        pos = ev(f"(()=>{{ const f=SC.FOODS[{i}]; return Math.hypot(SC.player.x-f.x, SC.player.z-f.z) }})()")
        opened = not ev("document.getElementById('shop').classList.contains('hidden')")
        if pos > 0.3 or not opened: ok = False
        pg.click("#shopExit"); pg.wait_for_timeout(100); away()
    check(ok, "5つとも、光に入ると買い物の画面が出る(かべの中ではない)")
    ev("(()=>{ SC.G.money=1000; SC.player.hp=50; SC.G.shopLock=null; const f=SC.FOODS[0]; SC.player.x=f.x; SC.player.z=f.z; return 0 })()"); pg.wait_for_timeout(300)
    check(pg.inner_text("#shopName") == "屋台" and pg.locator("#shopList .shopItem").count() == 3, "名前は「屋台」・メニューは3つ")
    txt = pg.inner_text("#shopList")
    check("小籠包" in txt and "肉まん" in txt and "ラーメン" in txt and "$50" in txt and "$80" in txt and "$100" in txt, "小籠包 $50・肉まん $80・ラーメン $100")
    pg.screenshot(path=SHOTS + "/m2_food.png")
    pg.locator("#shopList .shopItem").nth(0).click(); pg.wait_for_timeout(150)
    check(ev("SC.player.hp") == 75 and ev("SC.G.money") == 950, "小籠包: 体力+25、$50")
    pg.locator("#shopList .shopItem").nth(1).click(); pg.wait_for_timeout(150)
    check(ev("SC.player.hp") == 100 and ev("SC.G.money") == 870, "肉まん: 体力+40(100より上にはならない)、$80")
    check(pg.locator("#shopList .shopItem").nth(0).is_disabled() and "満タン" in pg.inner_text("#shopList"), "体力が満タンのときは、小籠包・肉まんは買えない")
    pg.locator("#shopList .shopItem").nth(2).click(); pg.wait_for_timeout(150)
    check(abs(ev("SC.G.ramenT") - 10) < 0.01 and ev("SC.G.money") == 770, "ラーメン: 10秒はやく走れる、$100")
    check(pg.locator("#shopList .shopItem").nth(2).is_disabled() and "おなかいっぱい" in pg.inner_text("#shopList"), "ラーメンの間は、もう1杯は買えない")
    check(abs(ev("SC.G.ramenT") - 10) < 0.01, "買い物の画面の間は、ラーメンの時間はへらない")
    pg.click("#shopExit"); pg.wait_for_timeout(1100)
    rt = ev("SC.G.ramenT")
    check(7.5 < rt < 9.5 and "はやく走れる" in pg.inner_text("#speed"), f"出ると、のこりの秒がへって、画面に「はやく走れる」(のこり {rt:.1f}秒)")
    # 走る速さ: スティックを倒して、1秒で進む距離をくらべる
    def run_dist():
        away(); ev("(()=>{ SC.G.camYaw=0; return 0 })()")
        x0 = ev("({x:SC.player.x, z:SC.player.z})")
        pg.dispatch_event("#touch", "pointerdown", {"pointerId": 7, "clientX": 80, "clientY": 310}); pg.dispatch_event("#touch", "pointermove", {"pointerId": 7, "clientX": 80, "clientY": 250}); pg.wait_for_timeout(600); pg.dispatch_event("#touch", "pointerup", {"pointerId": 7, "clientX": 80, "clientY": 250})
        x1 = ev("({x:SC.player.x, z:SC.player.z})"); return math.hypot(x1['x'] - x0['x'], x1['z'] - x0['z'])
    d1 = run_dist(); ev("(()=>{ SC.G.ramenT=0; return 0 })()"); pg.wait_for_timeout(100); d0 = run_dist()
    check(d0 > 0.5 and d1 > d0 * 1.15, f"ラーメンの間は、はやく歩ける({d1:.1f}m と {d0:.1f}m)")
    ev("(()=>{ SC.G.ramenT=0.3; return 0 })()"); pg.wait_for_timeout(600)
    check(ev("SC.G.ramenT") <= 0 and "はやく走れる" not in pg.inner_text("#speed"), "時間がたつと、元にもどる")

    # ---------- 中華なべ・棒 ----------
    kinds = ev("SC.MKW.map(w=>w.kind).sort().join(',')")
    check("wok" in kinds and "pole" in kinds, "市場に中華なべと棒がある(" + kinds + ")")
    for k, name in (("wok", "中華なべ"), ("pole", "棒")):
        ev(f"(()=>{{ const w=SC.MKW.find(w=>w.kind==='{k}'); SC.player.x=w.x; SC.player.z=w.z; return 0 }})()"); pg.wait_for_timeout(300)
        at = ev(f"(()=>{{ const w=SC.MKW.find(w=>w.kind==='{k}'); return Math.hypot(SC.player.x-w.x, SC.player.z-w.z) }})()")
        check(at < 0.6 and ev(f"SC.player.inv.includes('{k}')") and name in pg.inner_text("#toast"), f"{name}を拾える(「{name}をひろった！」。かべの中ではない)")
        check(ev(f"SC.MKW.find(w=>w.kind==='{k}').t") > 55, f"{name}は、拾うと60秒は出てこない")
        ev(f"(()=>{{ SC.MKW.find(w=>w.kind==='{k}').t=0; return 0 }})()"); pg.wait_for_timeout(300)
        check(ev(f"SC.player.inv.filter(x=>x==='{k}').length") == 1 and ev(f"SC.MKW.find(w=>w.kind==='{k}').t") <= 0, f"{name}は1本だけ(2本目は拾わない)")
        away()
    check(ev("SC.vendors.length") == 6 and ev("SC.vendors.every(v => SC.MKW.filter(w => w.kind==='wok'||w.kind==='pole').every(w => Math.hypot(w.x - v.x, w.z - v.z) > 1.5))"), "屋台の人と、中華なべ・棒の置き場所は重ならない")
    def setup(wk, dist=1.5):
        ev(f"""(()=>{{ SC.player.hp=100; SC.player.armor=0; SC.player.wi=SC.player.inv.indexOf('{wk}'); SC.player.atkCd=0;
          const g=SC.gangs[0]; g.hp=100; g.dead=-1; g.per.g.visible=true; g.state='idle'; g.blind=0; g.frozen=0; g.x=SC.player.x+{dist}; g.z=SC.player.z; g.home={{x:g.x,z:g.z}}; g.tx=g.x; g.tz=g.z; g.wt=99;
          SC.player.h=Math.PI/2; return 0 }})()""")
        pg.wait_for_timeout(150)
    setup('wok'); check("中華なべ" in pg.inner_text("#wpnBtn"), "武器のボタンに「中華なべ」")
    pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup"); pg.wait_for_timeout(150)
    check(ev("SC.gangs[0].hp") == 80, "中華なべは20ダメージ")
    # 前からの弾は半分、うしろからはそのまま
    hp = lambda: ev("SC.player.hp")
    ev("(()=>{ SC.player.hp=100; SC.player.h=0; SC.hurtPlayer(20, {x:SC.player.x, z:SC.player.z+10}); return 0 })()"); check(hp() == 90, "中華なべを持っていると、前からの弾は半分(20 → 10)")
    ev("(()=>{ SC.player.hp=100; SC.player.h=0; SC.hurtPlayer(20, {x:SC.player.x+10, z:SC.player.z+6}); return 0 })()"); check(hp() == 90, "少しななめ前からでも半分")
    ev("(()=>{ SC.player.hp=100; SC.player.h=0; SC.hurtPlayer(20, {x:SC.player.x, z:SC.player.z-10}); return 0 })()"); check(hp() == 80, "うしろからの弾は、そのまま")
    ev("(()=>{ SC.player.hp=100; SC.player.h=0; SC.hurtPlayer(20); return 0 })()"); check(hp() == 80, "なぐられたとき(弾ではない)は、そのまま")
    ev("(()=>{ SC.player.hp=100; SC.player.h=0; SC.player.wi=0; SC.hurtPlayer(20, {x:SC.player.x, z:SC.player.z+10}); return 0 })()"); check(hp() == 80, "中華なべを持っていない(素手)ときは、そのまま")
    # 本当にマフィアに撃たせる(ピストル・前から)
    ev("""(()=>{ SC.TUNE.peace=false; SC.TUNE.gang.turf=15; SC.player.hp=100; SC.player.wi=SC.player.inv.indexOf('wok'); const g=SC.gangs[0]; g.hp=100; g.dead=-1; g.per.g.visible=true; g.weapon='pistol'; g.state='chase'; g.cd=0;
        g.x=SC.player.x; g.z=SC.player.z+7; g.home={x:g.x,z:g.z}; SC.player.h=0; window.__h=[]; const o=SC.hurtPlayer; return 0 })()""")
    got = []
    for i in range(14):
        ev("(()=>{ const g=SC.gangs[0]; g.x=SC.player.x; g.z=SC.player.z+7; SC.player.h=0; return 0 })()")
        h0 = hp(); pg.wait_for_timeout(250); h1 = hp()
        if h1 < h0: got.append(round(h0 - h1, 2))
        if h1 < 40: ev("(()=>{ SC.player.hp=100; return 0 })()")
    check(got and all(abs(x - 4) < 0.01 for x in got), f"前にいるマフィアのピストル(8)は4ずつ({got})")
    ev("(()=>{ SC.TUNE.peace=true; SC.TUNE.gang.turf=0; const g=SC.gangs[0]; g.hp=0; g.dead=-1e9; g.per.g.visible=false; g.weapon='fist'; SC.player.hp=100; return 0 })()"); pg.wait_for_timeout(200)
    away()
    setup('pole'); check("棒" in pg.inner_text("#wpnBtn"), "武器のボタンに「棒」")
    pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup"); pg.wait_for_timeout(20)
    kp = ev("Math.hypot(SC.gangs[0].kx, SC.gangs[0].kz)")
    check(ev("SC.gangs[0].hp") == 75, "棒は25ダメージ")
    pg.wait_for_timeout(700); setup('fist'); pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup"); pg.wait_for_timeout(20)
    kf = ev("Math.hypot(SC.gangs[0].kx, SC.gangs[0].kz)")
    check(kp > kf * 2.5, f"棒は、素手よりずっと大きくふっとぶ({kp:.1f} と {kf:.1f})")
    pg.wait_for_timeout(700); setup('pole', 2.3); pg.dispatch_event("#atkBtn", "pointerdown"); pg.dispatch_event("#atkBtn", "pointerup"); pg.wait_for_timeout(100)
    check(ev("SC.gangs[0].hp") == 75, "棒は2.3mはなれていても、とどく")
    pg.screenshot(path=SHOTS + "/m2_pole.png")
    # セーブと没収
    ev("SC.save()"); inv = ev("SC.readSave().inv.join(',')")
    check("wok" in inv and "pole" in inv, f"中華なべと棒はセーブに残る({inv})")
    ev("(()=>{ SC.confiscate(); return 0 })()")
    check("wok" not in ev("SC.player.inv.join(',')") and "pole" not in ev("SC.player.inv.join(',')"), "やられる・逮捕で、中華なべと棒は没収される")

    # ---------- かくれ場所 ----------
    ev("(()=>{ SC.G.spawnCd=1e9; SC.G.wanted=2; SC.G.evade=0; return 0 })()")
    ev("(()=>{ const w=SC.MKW.find(w=>w.kind==='pig'); SC.player.x=w.x; SC.player.z=w.z+0.01; return 0 })()"); pg.wait_for_timeout(150)
    check("市場にかくれた" in pg.inner_text("#toast"), "★のときに市場に入ると「市場にかくれた！ ★が早くへる」")
    ev("(()=>{ SC.G.evade=0; return 0 })()"); pg.wait_for_timeout(1000); e_in = ev("SC.G.evade")
    away(); ev("(()=>{ SC.player.x += 400; SC.player.z += 0; return 0 })()")
    ev("(()=>{ SC.player.x=%s; SC.player.z=%s; SC.G.evade=0; return 0 })()" % (road['x'], road['z'])); pg.wait_for_timeout(1000); e_out = ev("SC.G.evade")
    check(e_out > 0.6 and e_in > e_out * 1.7, f"市場の中では、★がへるのが2倍の速さ({e_in:.2f} と {e_out:.2f})")
    ev("(()=>{ SC.G.wanted=0; SC.G.evade=0; return 0 })()")
    check(not errs, "エラーなし" + ("" if not errs else ": " + " / ".join(errs[:3])))

    # ---------- 英語 ----------
    pg = open_page("en"); ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    ev("(()=>{ SC.G.money=1000; SC.player.hp=50; const f=SC.FOODS[0]; SC.player.x=f.x; SC.player.z=f.z; return 0 })()"); pg.wait_for_timeout(300)
    t = pg.inner_text("#shopName") + pg.inner_text("#shopList")
    check("Food Stall" in t and "Ramen" in t and not any('぀' <= ch <= 'ヿ' for ch in t), "英語: 屋台の画面に日本語が残っていない")
    check(not errs, "エラーなし(英語)" + ("" if not errs else ": " + " / ".join(errs[:3])))
    b.close()
print("\n全部OK" if not fails else "\nNG: " + " / ".join(fails))
sys.exit(1 if fails else 0)
