"""ことばのテスト(Claude 用): python3 tests/lang_test.py . <画像フォルダ>
ホームページで英語・韓国語をえらんだとき(localStorage の muddys-lang)、画面に日本語が残っていないかを確かめる。
何もえらんでいなければ日本語のまま。"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from fakefb import serve, handler_for, FAKE
ROOT, SHOTS = sys.argv[1], sys.argv[2]
URL = serve(ROOT); THREE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'three-stub.js')).read()
JP = re.compile(r'[ぁ-んァ-ヶ一-龥]')
fails = []
def check(c, what):
    print(('OK  ' if c else 'NG  ') + what)
    if not c: fails.append(what)
with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in ('en', 'ko', 'ja'):
        errs = []
        ctx = b.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
        ctx.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(content_type="text/javascript", body=FAKE[r.request.url.rsplit("/", 1)[1]]))
        ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(content_type="text/javascript", body=THREE))
        ctx.expose_function("__db", handler_for("u_" + lang))
        if lang != 'ja': ctx.add_init_script(f"localStorage.setItem('muddys-lang', '{lang}')")
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto(URL); pg.wait_for_timeout(1000)
        ev = lambda js: pg.evaluate("(() => { const SC = window.SC; return " + js + "; })()")
        seen = []
        def look(where):
            txt = pg.evaluate("document.body.innerText")
            left = sorted(set(m for line in txt.splitlines() for m in [line] if JP.search(line)))
            seen.append((where, left))
        look('スタート画面'); pg.screenshot(path=f"{SHOTS}/l_{lang}_start.png")
        pg.click("#goOnline"); pg.wait_for_timeout(500); pg.click("#lbCreate"); pg.wait_for_timeout(300); look('ロビー(名前なし)')
        pg.fill("#lbName", "Mike"); pg.click("#lbCreate"); pg.wait_for_timeout(800); look('待合室'); pg.screenshot(path=f"{SHOTS}/l_{lang}_room.png")
        pg.click("#lbLeave"); pg.wait_for_timeout(500); pg.click("#lbBack"); pg.wait_for_timeout(300)
        pg.click("#goSolo"); pg.wait_for_timeout(1500); look('ひとり用'); pg.screenshot(path=f"{SHOTS}/l_{lang}_solo.png")
        pg.click("#enterBtn"); pg.wait_for_timeout(500); look('車の中')
        pg.click("#enterBtn"); pg.wait_for_timeout(300)
        ev("(()=>{SC.G.money=900; SC.player.heals=1; const s=SC.SHOPS.find(s=>s.kind==='gun'); SC.player.x=s.x; SC.player.z=s.z; return 0})()"); pg.wait_for_timeout(400)
        look('武器屋'); pg.screenshot(path=f"{SHOTS}/l_{lang}_shop.png")
        pg.click("#shopExit"); ev("(()=>{SC.player.x+=8; SC.G.wanted=1; return 0})()"); pg.wait_for_timeout(600); look('回復ボタン・警察')
        if lang == 'ja':
            check(all(any(JP.search(l) for l in left) for w, left in seen[:1]) and pg.inner_text("#atkBtn") == "こうげき", "ja: 何もえらんでいなければ日本語のまま")
        else:
            bad = [(w, l) for w, l in seen if l]
            check(not bad, f"{lang}: 画面に日本語が残っていない" + ("" if not bad else " " + str(bad)[:600]))
            check(pg.evaluate("document.documentElement.lang") == lang, f"{lang}: ページの言語が {lang} になる")
        check(not errs, f"{lang}: エラーなし" + (" " + str(errs) if errs else ""))
        ctx.close()
    b.close()
print("\n全部OK" if not fails else f"\nNG が {len(fails)} こ"); sys.exit(1 if fails else 0)
