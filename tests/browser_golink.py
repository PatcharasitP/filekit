"""
ลิงก์ย่อใต้ go/ (24/09/2026)
① ?ชื่อ กับ #ชื่อ พาไปปลายทางที่ถอดรหัสได้ (ดักหน้าปลายทางไว้ ไม่ต้องใช้เน็ตจริง)
② ชื่อที่ไม่มีขึ้น ไม่พบลิงก์ และไม่พาไปไหน
③ ไฟล์ข้อมูลถูกแก้ ขึ้น เปิดลิงก์ไม่ได้ และไม่พาไปไหน
④ service worker ของ FileKit ต้องไม่เก็บอะไรใต้ go/ ลงแคช ไม่งั้นแก้ปลายทางแล้วคนที่เคยเปิดยังถูกพาไปที่เก่า
พิสูจน์ว่าแดงเป็น (24/09/2026): เอาบรรทัดปล่อย go/ ใน sw.js ออก ข้อ ④ ตก เพราะ go.js กับไฟล์ข้อมูลถูกเก็บลงแคช
ลิงก์ selftest สงวนไว้ให้เทสนี้ ห้ามลบ (ปลายทาง example.com ไม่มีข้อมูลจริง)
"""
import os, sys, json, base64, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899").rstrip("/")
SLUG, TARGET = "selftest", "https://example.com/filekit-go-selftest"
results = []
def ok(label, cond, extra=""):
    results.append(bool(cond)); print(("  ✅ " if cond else "  ❌ ") + label + (f"  ({extra})" if extra and not cond else ""))

def dummy(route):
    route.fulfill(status=200, content_type="text/html", body="<title>target</title>target")

def view(pg):
    return pg.evaluate("document.body.dataset.state")

# ‼️ ห้ามใช้ wait_for_function กับหน้านี้ มันวนเช็คด้วย eval ซึ่ง CSP ของหน้า (script-src 'self') บล็อก เจอจริง 24/09/2026
def settle(pg, timeout=15):
    end = time.time() + timeout
    while time.time() < end and view(pg) == "wait": time.sleep(0.1)
    return view(pg)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ① พาไปปลายทาง ทั้งแบบ ?ชื่อ และ #ชื่อ ตัวพิมพ์ใหญ่ก็ได้
    for q in (f"?{SLUG}", f"#{SLUG}", f"?{SLUG.upper()}"):
        ctx = b.new_context(service_workers="block"); ctx.route("https://example.com/**", dummy)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/go/{q}")
        try: pg.wait_for_url(TARGET, timeout=15000); got = pg.url
        except Exception: got = pg.url
        ok(f"{q} พาไปปลายทาง", got == TARGET and not errs, f"ได้ {got} error {errs}")
        ctx.close()

    # ② ชื่อที่ไม่มี และหน้าแรกที่ไม่มีชื่อ
    ctx = b.new_context(service_workers="block"); pg = ctx.new_page()
    pg.goto(f"{BASE}/go/?no-such-link"); settle(pg)
    ok("ชื่อที่ไม่มีขึ้น ไม่พบลิงก์ และอยู่หน้าเดิม", view(pg) == "notfound" and "/go/" in pg.url, view(pg))
    pg.goto(f"{BASE}/go/"); pg.wait_for_timeout(300)
    ok("ไม่มีชื่อขึ้นช่องให้พิมพ์", view(pg) == "home" and pg.is_visible("#name"), view(pg))
    ctx.close()

    # ③ ไฟล์ข้อมูลถูกแก้ 1 บิต ต้องไม่พาไปไหน
    ctx = b.new_context(service_workers="block"); navs = []
    ctx.route("https://example.com/**", lambda r: (navs.append(r.request.url), dummy(r)))
    def tamper(route):
        e = route.fetch().json(); c = bytearray(base64.b64decode(e["c"])); c[0] ^= 1
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"i": e["i"], "c": base64.b64encode(bytes(c)).decode()}))
    ctx.route(f"{BASE}/go/l/*.json", tamper)
    pg = ctx.new_page(); pg.goto(f"{BASE}/go/?{SLUG}"); settle(pg)
    ok("ไฟล์ถูกแก้ขึ้น เปิดลิงก์ไม่ได้ ไม่พาไปไหน", view(pg) == "error" and not navs, f"{view(pg)} {navs}")
    ctx.close()

    # ④ มี service worker ของ FileKit คุมอยู่ แล้วเปิดลิงก์ย่อ แคชต้องไม่มีอะไรใต้ go/
    ctx = b.new_context(); ctx.route("https://example.com/**", dummy)
    pg = ctx.new_page(); pg.goto(f"{BASE}/"); pg.evaluate("navigator.serviceWorker.ready")
    pg.reload(); pg.wait_for_timeout(500)
    controlled = pg.evaluate("!!navigator.serviceWorker.controller")
    pg.goto(f"{BASE}/go/?{SLUG}")
    try: pg.wait_for_url(TARGET, timeout=15000)
    except Exception: pass
    pg.goto(f"{BASE}/"); pg.wait_for_timeout(300)
    keys = pg.evaluate("""async () => { const out = [];
        for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
        return out; }""")
    go_cached = [k for k in keys if "/go/" in k]
    ok("มี service worker คุมหน้าอยู่จริงก่อนเปิดลิงก์ย่อ", controlled)
    ok(f"แคชของ service worker มีของจริง ({len(keys)} รายการ) แต่ไม่มีอะไรใต้ go/", len(keys) > 0 and not go_cached, str(go_cached[:3]))
    ctx.close()
    b.close()

print(f"ผ่าน {sum(results)} ตก {len(results) - sum(results)}")
sys.exit(0 if all(results) else 1)
