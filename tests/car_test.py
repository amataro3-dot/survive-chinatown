"""車の種類のテスト(Claude 用): python3 tests/car_test.py . <画像フォルダ>
にせ Three.js で、8種類の車が街に出る・種類ごとの速さと曲がりやすさ・長い車のぶつかり・トラックがはね飛ばす・配達競争で車の種類を送る/見せる を確かめる(v=21)"""
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
    ctx = b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2)
    ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
    ctx.expose_function("__db", handler_for("u"))
    ctx.add_init_script('window.SC_NO_INTRO = 1'); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e) + " " + (e.stack or "")[:400])); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(1200); pg.click("#goSolo"); pg.wait_for_timeout(800)
    ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
    ev("(()=>{ SC.DAY.speed=0; SC.setClock(350); SC.TUNE.peace=true; SC.TUNE.gang.turf=0; SC.gangs.forEach(g=>g.per.g.visible=false); return 0 })()")

    # ---------- 街に出る車 ----------
    cnt = ev("(()=>{ const n={}; for (const c of SC.cars) if (c.kind!=='police') n[c.type]=(n[c.type]||0)+1; return n })()")
    print("  街の車:", cnt)
    check(all(cnt.get(k, 0) > 0 for k in ["sedan", "taxi", "sports", "rally", "wagon", "van", "truck", "bus"]), "8種類の車が、みんな街にいる")
    check(cnt.get("sedan", 0) == max(cnt.values()) and cnt.get("sports", 0) < cnt.get("wagon", 0), "セダンがいちばん多く、スポーツカーは少なめ")
    check(ev("SC.cars.filter(c=>c.type==='taxi').every(c=>c.color===0xf2c418) && SC.cars.filter(c=>c.type==='bus').every(c=>c.color===0xe07a20)"), "タクシーは黄色、バスはオレンジ")
    lot = ev("(()=>{ const m=SC.cars.filter(c=>c.kind==='parked' && c.x<-100 && c.z>60 && (c.type==='truck'||c.type==='bus')); return m.length })()")
    check(lot == 0, "駐車場には、トラックとバスは止まっていない")
    check(ev("SC.cars.filter(c=>c.kind==='police').every(c=>c.type==='sedan')"), "パトカーは今までどおり")
    p0 = ev("SC.cars.filter(c=>c.kind==='traffic').map(c=>[c.a[0],c.a[1],c.p])"); pg.wait_for_timeout(1500)
    p1 = ev("SC.cars.filter(c=>c.kind==='traffic').map(c=>[c.a[0],c.a[1],c.p])")
    check(sum(1 for a, b2 in zip(p0, p1) if a != b2) >= len(p0) - 2, "街の車は走っている")
    bv = ev("(()=>{ const b=SC.cars.find(c=>c.kind==='traffic'&&c.type==='bus'); return b ? b.v : -1 })()")
    check(bv == -1 or bv <= 9.05, f"バスはゆっくり走る(速さ {bv:.1f})")

    # 道路の上の空いた所で試す(ほかの車は消す)
    ev("(()=>{ for (let i=SC.cars.length-1;i>=0;i--) SC.removeCar(SC.cars[i]); SC.G.wanted=0; return 0 })()")
    X0, Z0 = ev("SC.player.x"), ev("SC.player.z")
    def put(t, kind="parked", x=None, z=None, h=math.pi / 2, col=0x3c6fd3):
        x = X0 if x is None else x; z = Z0 if z is None else z
        return ev(f"(()=>{{ const c=SC.newCar('{kind}', {x}, {z}, {h}, {col}, '{t}'); return SC.cars.indexOf(c) }})()")
    def drive(t, ms):
        ev("(()=>{ if (SC.player.car) SC.exitCar(); for (let i=SC.cars.length-1;i>=0;i--) SC.removeCar(SC.cars[i]); return 0 })()")
        i = put(t); ev(f"(()=>{{ SC.player.x={X0}; SC.player.z={Z0}; SC.enterCar(SC.cars[{i}]); return 0 }})()")
        pg.dispatch_event("#accBtn", "pointerdown"); pg.wait_for_timeout(ms); pg.dispatch_event("#accBtn", "pointerup")
        return ev("SC.player.car.v")
    sp = {t: drive(t, 1500) for t in ["sedan", "sports", "truck", "bus"]}
    print("  1.5秒後の速さ:", {k: round(v, 1) for k, v in sp.items()})
    check(sp["sports"] > sp["sedan"] > sp["truck"] > sp["bus"] > 3, "加速は スポーツカー > セダン > トラック > バス")
    # 最高速度: 速すぎる所から、アクセルで最高速度に近づく
    def topv(t):
        drive(t, 50); ev("(()=>{ SC.player.car.v = SC.CAR_TYPES[SC.player.car.type].max + 0.0; return 0 })()")
        pg.dispatch_event("#accBtn", "pointerdown"); pg.wait_for_timeout(300); pg.dispatch_event("#accBtn", "pointerup")
        return ev("SC.player.car.v")
    tb, ts = topv("bus"), topv("sports")
    check(20 < tb <= 22.05 and 39 < ts <= 42.05, f"最高速度: バス 約79km/h({tb * 3.6:.0f})、スポーツカー 約151km/h({ts * 3.6:.0f})")
    def turn(t):
        drive(t, 50); ev("(()=>{ SC.player.car.v=12; SC.player.car.h=Math.PI/2; return 0 })()")
        pg.dispatch_event("#touch", "pointerdown", {"pointerId": 7, "clientX": 80, "clientY": 310}); pg.dispatch_event("#touch", "pointermove", {"pointerId": 7, "clientX": 140, "clientY": 310}); pg.wait_for_timeout(400); pg.dispatch_event("#touch", "pointerup", {"pointerId": 7, "clientX": 140, "clientY": 310})  # スティックを右へ
        return abs(ev("SC.player.car.h") - math.pi / 2)
    tu = {t: turn(t) for t in ["sports", "sedan", "bus"]}
    print("  曲がった角度:", {k: round(v, 2) for k, v in tu.items()})
    check(tu["sports"] > tu["sedan"] > tu["bus"] > 0, "曲がりやすさは スポーツカー > セダン > バス")

    # キーボードでは動かない(スマホだけ。2026-11-13)
    drive("sedan", 50); ev("(()=>{ SC.player.car.v=0; return 0 })()"); pg.keyboard.down("KeyW"); pg.wait_for_timeout(400); pg.keyboard.up("KeyW"); pg.keyboard.press("KeyE"); pg.wait_for_timeout(200)
    check(abs(ev("SC.player.car.v")) < 0.5 and ev("SC.player.mode") == "car", "キーボード(W・E)では動かない・降りない")
    # ---------- 長い車のぶつかり ----------
    ev("(()=>{ if (SC.player.car) SC.exitCar(); for (let i=SC.cars.length-1;i>=0;i--) SC.removeCar(SC.cars[i]); return 0 })()")
    bi = put("bus", x=X0 + 20, z=Z0, h=math.pi / 2)
    check(ev(f"SC.carSeg(SC.cars[{bi}])") > 3, "バスは長いので、ぶつかり判定もまん中の線で見る")
    check(ev(f"SC.carDist(SC.cars[{bi}], {X0 + 25}, {Z0 + 1})") < 2.4 and ev(f"SC.carDist(SC.cars[{bi}], {X0 + 28}, {Z0})") > 2.4, "バスの前のはしでも人をひける(遠すぎる所はひかない)")
    si = put("sedan", x=X0 + 16, z=Z0 + 3)  # バスのうしろのほうの横(まん中からは遠い)
    ev(f"(()=>{{ SC.player.x={X0 + 16}; SC.player.z={Z0 + 3}; SC.enterCar(SC.cars[{si}]); return 0 }})()"); pg.wait_for_timeout(200)
    d = ev(f"(()=>{{ const [a,b]=SC.segPair(SC.player.car, SC.cars[{bi}]); return Math.hypot(a.x-b.x,a.z-b.z) }})()")
    check(d >= 3.5, f"バスのうしろのはしに重なった車は、押し出される(はなれた距離 {d:.2f})")
    # セダンでバスにぶつかると、大きくはじかれる
    ev(f"(()=>{{ const c=SC.player.car; c.x={X0 + 8}; c.z={Z0}; c.h=Math.PI/2; c.v=15; return 0 }})()")
    bx0 = ev(f"SC.cars[{bi}].x")
    pg.wait_for_timeout(700)
    check(ev("SC.player.car.v") < 0 and abs(ev(f"SC.cars[{bi}].x") - bx0) < 1.0, "セダンでバスにぶつかると、はじかれる(バスはほとんど動かない)")
    # トラックで走っている車にぶつかると、はね飛ばして進む
    ev("(()=>{ if (SC.player.car) SC.exitCar(); for (let i=SC.cars.length-1;i>=0;i--) SC.removeCar(SC.cars[i]); return 0 })()")
    ti = put("truck"); ev(f"(()=>{{ SC.player.x={X0}; SC.player.z={Z0}; SC.enterCar(SC.cars[{ti}]); return 0 }})()")
    vi = put("sedan", x=X0 + 9, z=Z0, h=math.pi / 2)
    ev("(()=>{ SC.player.car.v=14; return 0 })()")
    pg.wait_for_timeout(500)
    o = ev(f"(()=>{{ const o=SC.cars.find(c=>c.type==='sedan'); return {{kind:o.kind, v:o.v, x:o.x}} }})()")
    check(o["v"] > 4 and ev("SC.player.car.v") > 3, f"トラックでぶつかると、止まっている車をはね飛ばして、そのまま進む({o})")
    check(ev("SC.player.car.type") == "truck", "乗っているのはトラック")
    pg.screenshot(path=SHOTS + "/car1.png")

    # ---------- 配達競争: 車の種類を送る・見せる ----------
    ev("(()=>{ if (SC.player.car) SC.exitCar(); for (let i=SC.cars.length-1;i>=0;i--) SC.removeCar(SC.cars[i]); return 0 })()")
    me = ev("SC.getMe()")
    check("t" not in me and "cc" not in me, "歩いているときは、車の種類を送らない")
    bi = put("bus"); ev(f"(()=>{{ SC.player.x={X0}; SC.player.z={Z0}; SC.enterCar(SC.cars[{bi}]); return 0 }})()")
    me = ev("SC.getMe()")
    check(me.get("c") == 1 and me.get("t") == 7 and me.get("cc") == 0xe07a20, f"バスに乗ると、種類と色を送る({me})")
    ev("(()=>{ SC.exitCar(); return 0 })()")
    ev("(()=>{ SC.startRace('me', 0, 0xff3030, 'night'); SC.R.state = { players: { me: { color: 0xff3030, name: 'A', slot: 0 }, you: { color: 0x3060ff, name: 'B', slot: 1 } }, pkg: { state: 'free', x: 0, z: 0 } }; return 0 })()")
    pg.wait_for_timeout(300)
    ev(f"(()=>{{ SC.setRemotes({{ you: {{ x: SC.player.x + 30, z: SC.player.z, h: 0, c: 1, v: 0 }} }}); return 0 }})()"); pg.wait_for_timeout(300)
    check(ev("SC.R.avatars.you && SC.R.avatars.you.type") == "sedan", "ほかの人がはじめの車のときは、セダン")
    ev(f"(()=>{{ SC.setRemotes({{ you: {{ x: SC.player.x + 30, z: SC.player.z, h: 0, c: 1, v: 0, t: 3, cc: 0x2f9e5a }} }}); return 0 }})()"); pg.wait_for_timeout(300)
    av = ev("({ t: SC.R.avatars.you.type, cc: SC.R.avatars.you.cc, vis: !!SC.R.avatars.you.carM.g.visible })")
    check(av["t"] == "rally" and av["cc"] == 0x2f9e5a, f"ほかの人がラリー車に乗りかえると、ラリー車の形と色で見える({av})")
    ev(f"(()=>{{ SC.setRemotes({{ you: {{ x: SC.player.x + 30, z: SC.player.z, h: 0, c: 1, v: 0 }} }}); return 0 }})()"); pg.wait_for_timeout(300)
    check(ev("SC.R.avatars.you.type") == "sedan" and ev("SC.R.avatars.you.cc") == 0x3060ff, "セダンにもどると、その人の色のセダン")
    pg.screenshot(path=SHOTS + "/car2.png")

    real = [e for e in errs if "favicon" not in e]
    check(not real, "エラーなし " + str(real[:3]))
    b.close()
print("全部OK" if not fails else "NG: " + str(len(fails)))
sys.exit(1 if fails else 0)
