"""
ลิงก์ย่อใต้ go/ (24/09/2026) ไม่ใช้เน็ตจริง: raw.githubusercontent.com กับ api.github.com ถูกดักด้วย route ทั้งหมด
กติกาความปลอดภัยมาจากรีวิวพี่ปริม .claude/agent-progress/golink-selfserve-security.md
หน้าพาไป
① ?ชื่อ กับ #ชื่อ พาไปปลายทางที่ถอดรหัสได้ (โฮสต์ในรายการ)
② ชื่อที่ไม่มีขึ้น ไม่พบลิงก์ ไม่มีชื่อขึ้นช่องให้พิมพ์
③ ไฟล์ข้อมูลถูกแก้ 1 บิต ขึ้น เปิดลิงก์ไม่ได้ และไม่พาไปไหน
④ service worker ของ FileKit ต้องไม่เก็บอะไรใต้ go/ ลงแคช (พิสูจน์แล้ว: เอาบรรทัดปล่อย go/ ใน sw.js ออก ข้อนี้ตก)
⑤ โฮสต์นอกรายการต้องโชว์ชื่อโดเมนก่อน ไม่พาไปเอง ชื่อที่หน้าตาคล้ายก็ไม่นับ ลิงก์ที่มีชื่อผู้ใช้ในตัวถูกปฏิเสธ
   (พิสูจน์แล้ว: ให้ trusted() ตอบจริงทุกโฮสต์ ข้อ evil.example ตก)
หน้าสร้างลิงก์ go/new/
⑥ token อยู่ในหน่วยความจำอย่างเดียว ไม่เจอใน storage ใด ๆ reload แล้วต้องวางใหม่ ประวัติลิงก์ไม่ลง storage
⑦ ย่อลิงก์ชื่อที่ตั้งเอง ไฟล์ที่ PUT ถอดได้ในเบราว์เซอร์จริง ข้อความ commit ไม่มีชื่อหรือปลายทาง ชื่อสุ่มยาว 8
⑧ ชื่อชนต้องกดซ้ำ ลิงก์ที่มีกุญแจในตัวต้องกดซ้ำ
⑨ token: รับเฉพาะ github_pat_, ปฏิเสธ token แบบเก่า (x-oauth-scopes), ตรวจว่าแคบพอ ถ้ากว้างลบไฟล์ตรวจแล้วไม่ใช้, ไปที่ api.github.com ที่เดียว
⑩ ถูกฝังในกรอบเว็บอื่นไม่แสดงฟอร์ม, ไม่ได้ใช้ 15 นาทีลืม token เอง
ไฟล์ทดสอบอยู่ tests/fixtures/golinks/l/ (selftest ไป example.com, zz-evil zz-lookalike zz-userinfo)
"""
import os, sys, json, base64, time, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899").rstrip("/")
ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures" / "golinks" / "l"
RAW = "https://raw.githubusercontent.com/PatcharasitP/golinks/main/l/"
LPATH = "https://api.github.com/repos/PatcharasitP/golinks/contents/l/"
SLUG, TARGET = "selftest", "https://example.com/filekit-go-selftest"
TOKEN = "github_pat_" + "T3stT0ken" * 4
results = []
def ok(label, cond, extra=""):
    results.append(bool(cond)); print(("  ✅ " if cond else "  ❌ ") + label + (f"  ({extra})" if extra and not cond else ""))

def view(pg):
    # หน้ากำลังถูกพาไปที่อื่นจะอ่านค่าไม่ได้ชั่วครู่ ตอบ navigating แทนการล้มทั้งชุด (เจอตอนพิสูจน์ด้วยการให้ทุกโฮสต์ผ่าน 24/09/2026)
    try: return pg.evaluate("document.body ? document.body.dataset.state || null : null")
    except Exception: return "navigating"

# ‼️ ห้ามใช้ wait_for_function กับหน้านี้ มันวนเช็คด้วย eval ซึ่ง CSP ของหน้า (script-src 'self') บล็อก เจอจริง 24/09/2026
def settle(pg, timeout=15):
    end = time.time() + timeout
    while time.time() < end and view(pg) in ("wait", "navigating"): time.sleep(0.1)
    return view(pg)

def until(fn, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.1)
    return fn()

def frame_at(pg, prefix, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        fr = next((f for f in pg.frames if f.url.startswith(prefix)), None)
        if fr: return fr
        # ‼️ ต้องรอผ่าน Playwright ห้าม time.sleep pg.frames อ่านของในเครื่องเฉย ๆ ไม่ดึงเหตุการณ์ใหม่
        #    รอด้วย sleep แล้ว url ของกรอบค้างเป็นค่าว่างตลอด (เจอจริง 24/09/2026)
        pg.wait_for_timeout(100)
    return None

class Fake:
    """GitHub ปลอม เก็บไฟล์ที่ PUT แล้วเสิร์ฟต่อทาง raw จดทุก request ที่มี Authorization
    wide = token เขียนได้กว้างเกิน (ไฟล์ตรวจสิทธิ์เขียนผ่าน), classic = token แบบเก่ามี x-oauth-scopes"""
    def __init__(self, user_status=200, wide=False, classic=False):
        self.files = {p.name: p.read_text() for p in FIX.glob("*.json")}
        self.shas, self.puts, self.deletes, self.auth_to, self.user_calls = {}, [], [], [], 0
        self.user_status, self.wide, self.classic = user_status, wide, classic
    def raw(self, route):
        req = route.request
        if req.headers.get("authorization"): self.auth_to.append(req.url)
        name = req.url.split("/l/")[-1].split("?")[0]
        if name in self.files:
            route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=self.files[name], headers={"access-control-allow-origin": "*"})
        else:
            route.fulfill(status=404, body="404: Not Found", headers={"access-control-allow-origin": "*"})
    def api(self, route):
        req = route.request; h = {"access-control-allow-origin": "*", "content-type": "application/json", "access-control-expose-headers": "x-oauth-scopes"}
        if req.headers.get("authorization"): self.auth_to.append(req.url)
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers={**h, "access-control-allow-headers": "authorization, content-type, x-github-api-version, accept", "access-control-allow-methods": "GET, PUT, DELETE"})
        if req.url.endswith("/user"):
            self.user_calls += 1
            hh = {**h, "x-oauth-scopes": "repo, workflow"} if self.classic else h
            return route.fulfill(status=self.user_status, headers=hh, body=json.dumps({"login": "PatcharasitP"} if self.user_status == 200 else {"message": "Bad credentials"}))
        if not req.url.startswith(LPATH):   # ไฟล์ตรวจสิทธิ์ นอกโฟลเดอร์ l/ ของ golinks
            if req.method == "PUT":
                self.puts.append((req.url, json.loads(req.post_data)))
                return route.fulfill(status=201 if self.wide else 403, headers=h, body=json.dumps({"content": {"sha": "probe-sha"}} if self.wide else {"message": "Resource not accessible by personal access token"}))
            if req.method == "DELETE":
                self.deletes.append((req.url, json.loads(req.post_data))); return route.fulfill(status=200, headers=h, body="{}")
            return route.fulfill(status=404, headers=h, body="{}")
        name = req.url.split("/l/")[-1].split("?")[0]
        if req.method == "GET":
            if name in self.files: return route.fulfill(status=200, headers=h, body=json.dumps({"sha": self.shas.get(name, "sha-old")}))
            return route.fulfill(status=404, headers=h, body=json.dumps({"message": "Not Found"}))
        if req.method == "PUT":
            body = json.loads(req.post_data); self.puts.append((req.url, body))
            self.files[name] = base64.b64decode(body["content"]).decode(); self.shas[name] = f"sha-{len(self.puts)}"
            return route.fulfill(status=201 if "sha" not in body else 200, headers=h, body=json.dumps({"content": {"sha": self.shas[name]}}))
        route.fulfill(status=405, headers=h, body="{}")
    def link_puts(self): return [(u, b) for u, b in self.puts if u.startswith(LPATH)]

def context(b, fake, **kw):
    ctx = b.new_context(**kw)
    ctx.route(RAW + "**", fake.raw)
    ctx.route("https://api.github.com/**", fake.api)
    ctx.route("https://example.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>target</title>target"))
    return ctx

STORAGE = """async () => {
  const out = [];
  for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const k = s.key(i); out.push(k + '=' + s.getItem(k)); }
  try { for (const d of await indexedDB.databases()) out.push('idb:' + d.name); } catch (e) {}
  out.push('cookie:' + document.cookie);
  return out.join('\\n'); }"""

def open_link(ctx, q, expect_url=None):
    pg = ctx.new_page(); navs = []
    pg.on("framenavigated", lambda f: navs.append(f.url) if f == pg.main_frame else None)
    pg.goto(f"{BASE}/go/{q}")
    if expect_url:
        try: pg.wait_for_url(expect_url, timeout=15000)
        except Exception: pass
    else:
        settle(pg); pg.wait_for_timeout(500)
    return pg, navs

with sync_playwright() as p:
    b = p.chromium.launch()

    # ① พาไปปลายทาง ทั้งแบบ ?ชื่อ และ #ชื่อ ตัวพิมพ์ใหญ่ก็ได้
    for q in (f"?{SLUG}", f"#{SLUG}", f"?{SLUG.upper()}"):
        fk = Fake(); ctx = context(b, fk, service_workers="block")
        pg, _ = open_link(ctx, q, TARGET)
        ok(f"{q} พาไปปลายทาง", pg.url == TARGET, f"ได้ {pg.url}")
        ctx.close()

    # ② ชื่อที่ไม่มี และหน้าแรกที่ไม่มีชื่อ
    fk = Fake(); ctx = context(b, fk, service_workers="block")
    pg, _ = open_link(ctx, "?no-such-link")
    ok("ชื่อที่ไม่มีขึ้น ไม่พบลิงก์ และอยู่หน้าเดิม", view(pg) == "notfound" and "/go/" in pg.url, view(pg))
    pg.goto(f"{BASE}/go/"); pg.wait_for_timeout(300)
    ok("ไม่มีชื่อขึ้นช่องให้พิมพ์", view(pg) == "home" and pg.is_visible("#name"), view(pg))
    ctx.close()

    # ③ ไฟล์ข้อมูลถูกแก้ 1 บิต ต้องไม่พาไปไหน
    fk = Fake(); name = "c42f8ce3da8cfddf9c667baa.json"; e = json.loads(fk.files[name])
    c = bytearray(base64.b64decode(e["c"])); c[0] ^= 1; fk.files[name] = json.dumps({"i": e["i"], "c": base64.b64encode(bytes(c)).decode()})
    ctx = context(b, fk, service_workers="block"); pg, navs = open_link(ctx, f"?{SLUG}")
    ok("ไฟล์ถูกแก้ขึ้น เปิดลิงก์ไม่ได้ ไม่พาไปไหน", view(pg) == "error" and not any("example.com" in u for u in navs), f"{view(pg)} {navs}")
    ctx.close()

    # ④ มี service worker ของ FileKit คุมอยู่ แล้วเปิดลิงก์ย่อกับหน้าสร้าง แคชต้องไม่มีอะไรใต้ go/
    fk = Fake(); ctx = context(b, fk)
    pg = ctx.new_page(); pg.goto(f"{BASE}/"); pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
    pg.reload(); pg.wait_for_timeout(500)
    controlled = pg.evaluate("!!navigator.serviceWorker.controller")
    pg.goto(f"{BASE}/go/?{SLUG}")
    try: pg.wait_for_url(TARGET, timeout=15000)
    except Exception: pass
    pg.goto(f"{BASE}/go/new/"); pg.wait_for_timeout(500)
    pg.goto(f"{BASE}/"); pg.wait_for_timeout(300)
    keys = pg.evaluate("""async () => { const out = [];
        for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
        return out; }""")
    go_cached = [k for k in keys if "/go/" in k]
    ok("มี service worker คุมหน้าอยู่จริงก่อนเปิดลิงก์ย่อ", controlled)
    ok(f"แคชของ service worker มีของจริง ({len(keys)} รายการ) แต่ไม่มีอะไรใต้ go/", len(keys) > 0 and not go_cached, str(go_cached[:3]))
    ctx.close()

    # ⑤ โฮสต์นอกรายการ
    fk = Fake(); ctx = context(b, fk, service_workers="block")
    evil_navs = []
    ctx.route("https://evil.example/**", lambda r: (evil_navs.append(r.request.url), r.fulfill(status=200, body="evil")))
    ctx.route("https://example.com.evil.example/**", lambda r: (evil_navs.append(r.request.url), r.fulfill(status=200, body="evil")))
    pg, _ = open_link(ctx, "?zz-evil")
    st = view(pg) if "/go/" in pg.url else pg.url   # ถ้าหลุดไปเว็บปลายทางแล้ว ไม่มีช่องให้อ่าน ต้องไม่ค้างรอจนหมดเวลา
    ok("โฮสต์นอกรายการ ไม่พาไปเอง โชว์ชื่อโดเมน", st == "confirm" and pg.inner_text("#host") == "evil.example" and not evil_navs, f"{st} {evil_navs}")
    ok("ปุ่ม ไปต่อ ชี้ปลายทางเต็ม", st == "confirm" and pg.get_attribute("#goOn", "href") == "https://evil.example/login")
    pg2, _ = open_link(ctx, "?zz-lookalike")
    st = view(pg2) if "/go/" in pg2.url else pg2.url
    ok("ชื่อที่หน้าตาคล้าย example.com.evil.example ไม่นับว่าอยู่ในรายการ", st == "confirm" and pg2.inner_text("#host") == "example.com.evil.example" and not evil_navs, f"{st} {evil_navs}")
    pg3, _ = open_link(ctx, "?zz-userinfo")
    st = view(pg3) if "/go/" in pg3.url else pg3.url
    ok("ลิงก์ที่มีชื่อผู้ใช้ในตัว example.com@evil.example ถูกปฏิเสธ", st == "error" and not evil_navs, f"{st} {evil_navs}")
    ctx.close()

    # ⑥ ถึง ⑨ หน้าสร้างลิงก์
    fk = Fake(); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/go/new/"); pg.wait_for_timeout(300)
    ok("ยังไม่มี token ขึ้นหน้าวาง token และซ่อนช่องย่อลิงก์", pg.is_visible("#setup") and not pg.is_visible("#maker"))
    pg.fill("#token", TOKEN); pg.click("#save")
    ok("วาง token แล้วขึ้นช่องย่อลิงก์", until(lambda: pg.is_visible("#maker")))
    probes = [u for u, _ in fk.puts if not u.startswith(LPATH)]
    ok("ตรวจความกว้างของ token 2 จุด (รีโป filekit และ workflow)", any("/filekit/contents/" in u for u in probes) and any("/.github/workflows/" in u for u in probes), str(probes))

    long_url = "https://example.com/made-by-test?q=1&th=ไทย"
    pg.fill("#url", long_url); pg.fill("#slug", "zz-made"); pg.click("#make")
    ready = until(lambda: pg.inner_text("#readyMsg") == "พร้อมใช้แล้ว")
    short = pg.inner_text("#shortUrl")
    ok("ย่อชื่อที่ตั้งเองได้ลิงก์สั้นและพร้อมใช้", ready and short.endswith("/go/?zz-made"), f"{short} {pg.inner_text('#readyMsg')}")
    url0, body = fk.link_puts()[-1] if fk.link_puts() else ("", {})
    ok("PUT ไปที่ l/<24 ตัว>.json ข้อความ commit ไม่มีชื่อหรือปลายทาง",
       len(url0.split("/l/")[-1]) == 29 and body.get("message") == "เพิ่มลิงก์" and "zz-made" not in json.dumps(body) and "made-by-test" not in json.dumps(body), str(body)[:120])
    pg2, _ = open_link(ctx, "?zz-made", "https://example.com/made-by-test**")
    ok("ลิงก์ที่หน้าสร้างทำ เปิดแล้วพาไปปลายทางเดิมทุกตัวอักษร", pg2.evaluate("location.href") == "https://example.com/made-by-test?q=1&th=%E0%B9%84%E0%B8%97%E0%B8%A2", pg2.url)
    pg2.close()

    pg.fill("#url", "https://example.com/random-one"); pg.fill("#slug", ""); pg.click("#make")
    until(lambda: pg.inner_text("#readyMsg") == "พร้อมใช้แล้ว" and "zz-made" not in pg.inner_text("#shortUrl"))
    rnd = pg.inner_text("#shortUrl").split("?")[-1]
    ok("ไม่ใส่ชื่อได้ชื่อสุ่ม 8 ตัว", len(rnd) == 8 and rnd.isalnum(), rnd)
    pg2, _ = open_link(ctx, f"?{rnd}", "https://example.com/random-one")
    ok("ลิงก์ชื่อสุ่มพาไปปลายทางถูก", pg2.url == "https://example.com/random-one", pg2.url); pg2.close()

    dump = pg.evaluate(STORAGE)
    ok("หลังใช้งาน ไม่มี token ชื่อลิงก์ หรือปลายทาง ใน storage ใด ๆ", "github_pat_" not in dump and "zz-made" not in dump and rnd not in dump and "example.com" not in dump, dump[:200])

    # ⑧ ชื่อชน และลิงก์ที่มีกุญแจในตัว ต้องกดซ้ำ
    n_put = len(fk.link_puts())
    pg.fill("#url", "https://example.com/replaced"); pg.fill("#slug", "zz-made"); pg.click("#make")
    until(lambda: "มีอยู่แล้ว" in pg.inner_text("#makeMsg"))
    ok("ชื่อชนครั้งแรกไม่เขียนทับ บอกให้กดซ้ำ", len(fk.link_puts()) == n_put and "มีอยู่แล้ว" in pg.inner_text("#makeMsg"), pg.inner_text("#makeMsg"))
    pg.click("#make"); until(lambda: pg.inner_text("#makeMsg") == "แทนที่ลิงก์เดิมแล้ว")
    last = fk.link_puts()[-1][1] if len(fk.link_puts()) > n_put else {}
    ok("กดซ้ำแล้วแทนที่ด้วย sha ของเดิม ข้อความ commit แก้ลิงก์", last.get("sha", "").startswith("sha-") and last.get("message") == "แก้ลิงก์", str(last)[:80])
    n_put = len(fk.link_puts())
    pg.fill("#url", "https://contoso.sharepoint.com/:x:/g/personal/abc?e=Xy12"); pg.fill("#slug", ""); pg.click("#make")
    until(lambda: "กุญแจในตัว" in pg.inner_text("#makeMsg"))
    ok("ลิงก์ที่มีกุญแจในตัว ครั้งแรกเตือนและยังไม่ PUT", len(fk.link_puts()) == n_put and "กุญแจในตัว" in pg.inner_text("#makeMsg"))
    pg.click("#make"); until(lambda: pg.inner_text("#makeMsg") == "ย่อเสร็จแล้ว")
    ok("กดซ้ำแล้วย่อได้", len(fk.link_puts()) == n_put + 1)

    # ⑨ token ไป api.github.com ที่เดียว แล้ว reload ต้องวางใหม่
    ok("token ถูกส่งไปที่ api.github.com เท่านั้น", fk.auth_to and all(u.startswith("https://api.github.com/") for u in fk.auth_to), str([u for u in fk.auth_to if not u.startswith('https://api.github.com/')][:2]))
    pg.reload(); pg.wait_for_timeout(400)
    ok("reload แล้ว token หาย ต้องวางใหม่ และรายการลิงก์หาย", pg.is_visible("#setup") and not pg.is_visible("#maker") and not pg.is_visible("#history"))
    ok("หน้าสร้างลิงก์ไม่มี error ใน console", not errs, str(errs[:2]))
    ctx.close()

    fk = Fake(); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page()
    pg.goto(f"{BASE}/go/new/"); pg.fill("#token", "ghp_" + "a" * 36); pg.click("#save"); pg.wait_for_timeout(400)
    ok("token แบบ ghp_ ถูกปฏิเสธโดยไม่ยิง GitHub", "github_pat_" in pg.inner_text("#setupMsg") and fk.user_calls == 0 and not pg.is_visible("#maker"), pg.inner_text("#setupMsg"))
    ctx.close()
    fk = Fake(classic=True); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page()
    pg.goto(f"{BASE}/go/new/"); pg.fill("#token", TOKEN); pg.click("#save")
    until(lambda: "แบบเก่า" in pg.inner_text("#setupMsg"))
    ok("GitHub บอกว่ามี scope แบบ token เก่า ถูกปฏิเสธ", "แบบเก่า" in pg.inner_text("#setupMsg") and not pg.is_visible("#maker"), pg.inner_text("#setupMsg"))
    ctx.close()
    fk = Fake(wide=True); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page()
    pg.goto(f"{BASE}/go/new/"); pg.fill("#token", TOKEN); pg.click("#save")
    until(lambda: "กว้างเกิน" in pg.inner_text("#setupMsg"))
    ok("token กว้างเกิน ลบไฟล์ตรวจที่เพิ่งเขียน แล้วไม่ใช้", "กว้างเกิน" in pg.inner_text("#setupMsg") and len(fk.deletes) == 1 and fk.deletes[0][1].get("sha") == "probe-sha" and not pg.is_visible("#maker"), f"{pg.inner_text('#setupMsg')} {fk.deletes}")
    ctx.close()
    fk = Fake(user_status=401); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page()
    pg.goto(f"{BASE}/go/new/"); pg.fill("#token", TOKEN); pg.click("#save")
    until(lambda: "ไม่รับ" in pg.inner_text("#setupMsg"))
    ok("token ที่ GitHub ไม่รับ ขึ้นข้อความ", "ไม่รับ" in pg.inner_text("#setupMsg") and not pg.is_visible("#maker"), pg.inner_text("#setupMsg"))
    ctx.close()

    # ⑩ ถูกฝังในกรอบเว็บอื่น และไม่ได้ใช้ 15 นาที
    # เว็บอื่น = หน้ารายการไฟล์ของเซิร์ฟเวอร์ทดสอบเปิดด้วยชื่อเครื่องอีกแบบ (localhost กับ 127.0.0.1 คนละ origin) ไม่มี CSP จึงฝังกรอบได้
    # ‼️ ใช้หน้าที่ route ปลอมขึ้นมาไม่ได้ Chromium ถือว่าเป็นเว็บสาธารณะแล้วบล็อกการฝังหน้าในเครื่อง (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS เจอจริง 24/09/2026)
    # ‼️ ห้ามทำเป็นไฟล์ fixture ที่รับ src จาก query ไฟล์ใน tests/ ขึ้นเว็บจริงด้วย จะกลายเป็นหน้าฝังอะไรก็ได้บนโดเมนของพี่ปอนด์
    framer = BASE.replace("127.0.0.1", "localhost") if "127.0.0.1" in BASE else BASE.replace("localhost", "127.0.0.1")
    fk = Fake(); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page()
    pg.goto(framer + "/tests/")
    pg.evaluate("src => { const f = document.createElement('iframe'); f.src = src; document.body.appendChild(f); }", BASE + "/go/new/")
    fr = frame_at(pg, BASE + "/go/new/")
    ok("ถูกฝังในกรอบเว็บอื่นไม่แสดงฟอร์ม", fr is not None and until(lambda: "เปิดหน้านี้ตรง" in fr.inner_text("main")) and fr.query_selector("#token") is None,
       f"{[f.url for f in pg.frames]}")
    ctx.close()
    fk = Fake(); ctx = context(b, fk, service_workers="block"); pg = ctx.new_page(); pg.clock.install()
    pg.goto(f"{BASE}/go/new/"); pg.fill("#token", TOKEN); pg.click("#save"); until(lambda: pg.is_visible("#maker"))
    pg.clock.fast_forward("15:01"); pg.wait_for_timeout(300)
    ok("ไม่ได้ใช้ 15 นาทีลืม token เอง", pg.is_visible("#setup") and "หมดเวลา" in pg.inner_text("#setupMsg"), pg.inner_text("#setupMsg"))
    ctx.close()
    b.close()

print(f"ผ่าน {sum(results)} ตก {len(results) - sum(results)}")
sys.exit(0 if all(results) else 1)
