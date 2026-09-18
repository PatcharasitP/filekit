import os, sys, time, statistics
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("FK_BASE", "http://localhost:8899")  # ตั้ง FK_BASE เพื่อยิงใส่เว็บจริง
# ‼️ ห้ามใช้ค่านี้เพื่อ "ให้ผ่าน" — มีไว้พิสูจน์ว่าเทสแดงเป็นเท่านั้น (ดู tests/README.md หัวข้อพิสูจน์)
# ค่าที่รับ: "" (ปกติ) | "fcp" | "lib" | "longtask" | "all"
POISON = os.environ.get("FK_PERF_POISON", "").strip().lower()

# ── สภาพมือถือมาตรฐานที่ใช้วัด (ล็อกตามที่พี่ปอนด์กำหนด — ห้ามขยับ) ──────────
MOBILE_VIEWPORT = {"width": 390, "height": 780}
NET_COND = {  # CDP Network.emulateNetworkConditions
    "offline": False, "latency": 150,
    "downloadThroughput": int(1.6 * 1024 * 1024 / 8),
    "uploadThroughput": int(750 * 1024 / 8),
}
CPU_RATE = 4  # CDP Emulation.setCPUThrottlingRate

# ── งบ (ตั้งใหม่ 16/09/2026 จากค่าจริงที่ "ผู้ใช้เจอ" ไม่ใช่ค่าบนเซิร์ฟเวอร์ที่ไม่บีบอัด) ──
# ‼️ ทำไมต้องตั้งใหม่ ไม่ใช่การขยายงบให้ผ่าน
#    งบชุดเดิมตั้ง 08/09 จากการวัดบน `python3 -m http.server` ซึ่ง **ไม่บีบอัดอะไรเลย**
#    แต่ที่อยู่จริงของเว็บคือ GitHub Pages ซึ่งส่ง gzip ทุกไฟล์ข้อความ วัดเทียบกันตรง ๆ แล้วได้
#         เซิร์ฟเวอร์ทดสอบเดิม  299,825 bytes · FCP 596ms
#         เว็บจริงที่ผู้ใช้เปิด  154,895 bytes  (บีบได้ 61%)
#    คือเทสเก่าวัดตัวเลขที่ไม่มีผู้ใช้คนไหนเจอ ทั้งขนาดและเวลาวาดจอแรก
#    ตอนนี้เทสเสิร์ฟผ่าน tests/gzip_server.py ซึ่งบีบอัดแบบเดียวกับของจริง งบจึงตั้งใหม่ทั้งชุด
#    ‼️ งบใหม่ "เข้มกว่าเดิมเมื่อเทียบหน่วยเดียวกัน" เพราะวัดของจริง ไม่ได้ปล่อยให้หลวมลง
#
# ① FCP: มัธยฐาน 7 รอบ = 316ms (ค่าจริง 308-372ms) → งบ 420ms (~33% เผื่อ เท่าอัตราเดิม)
FCP_ROUNDS = 7            # ≥5 ตามข้อกำหนด — ใช้เลขคี่ให้มัธยฐานเป็นค่าจริงตัวหนึ่งเสมอ
FCP_BUDGET_MS = 420

# ② ไลบรารีหนักห้ามหลุดเข้าหน้าแรกเด็ดขาด ไม่มีงบเผื่อ
BANNED_LIBS = ["pdf-lib", "pdf.min", "xlsx", "docx", "mammoth", "jspdf", "jszip", "tesseract"]

# ③④ วัดจริงหลังบีบอัด: 12 request รวม 127,430 bytes (นับจาก Resource Timing API)
#    → งบขนาด 165,000 bytes (~+30%) · งบจำนวน 16 request (12*1.3=15.6 ปัดขึ้น)
#    ‼️ เทียบกับของเดิมที่ 280,000 bytes บนหน่วยไม่บีบอัด งบใหม่นี้เข้มกว่ามาก
SIZE_BUDGET_BYTES = 165_000
REQUEST_COUNT_BUDGET = 16

# ⑥ หน้าเครื่องมือหนักสุด 3 ตัว — วัดจริงตอนเปิดผ่านสภาพมือถือ throttle ข้างบน:
#    pdf-ocr ~4.15s · pdf-compress ~6.28s · word-mailmerge ~7.17s (โหลดไลบรารีหนักจริงตอนนั้น)
#    เพดานนี้ไว้กัน "ค้างไม่รู้จบ" ไม่ใช่งบความเร็ว จึงเผื่อกว้างกว่าจุดอื่น
HEAVY_TOOLS = ["pdf-ocr", "word-mailmerge", "pdf-compress"]
TOOL_OPEN_BUDGET_MS = 12_000

def assert_compressed(page):
    """‼️ กันเทสวัดผิดหน่วยแบบเงียบ ๆ

    ถ้าเซิร์ฟเวอร์ที่เสิร์ฟไม่บีบอัด ตัวเลขทุกตัวในเทสนี้จะใหญ่เกินจริงราวเท่าตัว
    แล้วคนอ่านผลจะไปไล่หา "ของที่โตขึ้น" ทั้งที่ไม่มีอะไรโตเลย (เสียเวลาไปแล้วจริงเมื่อ 13/09)
    จึงต้องหยุดทันทีพร้อมบอกวิธีแก้ ไม่ใช่รายงานตัวเลขที่เชื่อไม่ได้
    """
    ratio = page.evaluate("""() => { var n = performance.getEntriesByType('navigation')[0];
        return n.decodedBodySize ? n.transferSize / n.decodedBodySize : 1; }""")
    if ratio > 0.9:
        print(f"\n  ‼️ เซิร์ฟเวอร์ที่เสิร์ฟหน้านี้ไม่บีบอัด (ส่งมา {ratio*100:.0f}% ของขนาดจริง)")
        print("     งบในเทสนี้ตั้งจากค่าที่บีบอัดแล้วเหมือนเว็บจริง ตัวเลขที่ได้จะเชื่อไม่ได้")
        print("     ให้เปิดเซิร์ฟเวอร์ด้วย  python3 tests/gzip_server.py 8901")
        print("     แล้วรันเทสด้วย         FK_BASE=http://localhost:8901 ...")
        sys.exit(2)


P, F = 0, []
def ck(n, got, want):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{n}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {n}")

def ck_le(n, got, budget):
    global P
    ok = got <= budget
    if ok: P += 1
    else: F.append(f"{n}\n      ได้    : {got!r}\n      งบ     : ≤{budget!r}")
    print(f"  {'✅' if ok else '❌'} {n} (ได้ {got:,.1f} / งบ ≤{budget:,})" if isinstance(got, float)
          else f"  {'✅' if ok else '❌'} {n} (ได้ {got:,} / งบ ≤{budget:,})")

# ── ตัวฉีดของหนักชั่วคราว — ใช้พิสูจน์ว่าเทส "แดงเป็น" เท่านั้น (DoD ①) ────────
# ห้ามเปิดตอนรันจริง (ค่า default POISON="" ไม่ทำอะไรเลย)
def apply_poison(page):
    if POISON in ("fcp", "all"):
        # จำลอง regression แบบ animation-timeline/filter ในอดีต: บล็อก main thread
        # ก่อนวาดจอครั้งแรกด้วย busy-wait synchronous — ต้องดัน FCP เกินงบ 500ms แน่นอน
        page.add_init_script("""(() => {
            const end = performance.now() + 450;
            while (performance.now() < end) {}  // จำลองงานหนักก่อนเพนต์แรก
        })();""")
    if POISON in ("lib", "all"):
        # จำลอง "ไลบรารีหนักหลุดเข้าหน้าแรก" — แทรกสคริปต์ที่อยู่ในบัญชีดำตั้งแต่ก่อนพาร์สหน้า
        # ‼️ ตอนแรกลอง appendChild ทันทีแล้วพัง (document.documentElement ยังเป็น null ตอน
        #    init script รัน — จับได้จาก pageerror จริงตอนพิสูจน์ ไม่ใช่เดา) ต้อง retry จนกว่าจะมี
        page.add_init_script("""(() => {
            const inject = () => {
                if (!document.documentElement) { setTimeout(inject, 0); return; }
                const s = document.createElement('script');
                s.src = 'vendor/xlsx.full.min.js'; s.setAttribute('data-poison','1');
                document.documentElement.appendChild(s);
            };
            inject();
        })();""")
    if POISON in ("longtask", "all"):
        # จำลอง long task ระหว่างสกอลล์ — ค้าง main thread เป็นช่วง ๆ หลังโหลดเสร็จ
        page.add_init_script("""(() => {
            addEventListener('load', () => {
                setInterval(() => {
                    const end = performance.now() + 90;
                    while (performance.now() < end) {}
                }, 250);
            });
        })();""")

def throttled_context(browser, viewport):
    """เปิด context ใหม่ (กัน cache/SW ข้ามรอบ) + ตั้งสภาพมือถือมาตรฐาน + ปิด cache เพื่อวัดแบบ cold ทุกรอบ"""
    ctx = browser.new_context(viewport=viewport)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Network.enable")
    cdp.send("Network.emulateNetworkConditions", NET_COND)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": CPU_RATE})
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    apply_poison(pg)
    return ctx, pg

def measure_fcp_ms(browser):
    ctx, pg = throttled_context(browser, MOBILE_VIEWPORT)
    pg.goto(BASE, wait_until="commit")
    pg.wait_for_function(
        "() => performance.getEntriesByType('paint').some(p => p.name === 'first-contentful-paint')",
        timeout=20000)
    fcp = pg.evaluate(
        "() => performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint').startTime")
    ctx.close()
    return fcp

if POISON:
    print(f"‼️  FK_PERF_POISON={POISON!r} — โหมดพิสูจน์ว่าเทสแดงเป็น ห้ามใช้ผลรอบนี้ตัดสินว่าเว็บช้าจริง\n")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ‼️ เช็คการบีบอัด "ก่อน" วัดอะไรทั้งสิ้น (ย้ายมาจากท้าย 18/09/2026)
    #    เดิมเช็คทีหลัง คนจึงเห็นบรรทัดแดง "FCP เกินงบ" ก่อนแล้วค่อยเจอคำอธิบาย
    #    ซึ่งเป็นเลขที่เชื่อไม่ได้ตั้งแต่ต้น แล้วไปไล่หาของที่ช้าลงทั้งที่ไม่มีอะไรช้าลง
    _c, _pg = throttled_context(b, MOBILE_VIEWPORT)
    _pg.goto(BASE, wait_until="load")
    assert_compressed(_pg)
    _c.close()

    print(f"━━ ① FCP หน้าแรก (มือถือ 390×780, latency 150ms, 1.6Mbps/750Kbps, CPU 4x) — งบ ≤{FCP_BUDGET_MS}ms ━━")
    vals = []
    for i in range(FCP_ROUNDS):
        fcp = measure_fcp_ms(b)
        vals.append(fcp)
        print(f"  รอบ {i+1}/{FCP_ROUNDS}: {fcp:.1f} ms")
    med = statistics.median(vals)
    print(f"  ค่าทุกรอบ: {[round(v,1) for v in vals]}")
    ck_le(f"FCP มัธยฐาน {med:.1f}ms", med, FCP_BUDGET_MS)

    print("\n━━ ② ไลบรารีหนักห้ามหลุดเข้าหน้าแรก (เด็ดขาด ไม่มีงบเผื่อ) ━━")
    ctx, pg = throttled_context(b, MOBILE_VIEWPORT)
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(BASE, wait_until="networkidle")
    leaked = [(u, lib) for u in reqs for lib in BANNED_LIBS if lib in u.lower()]
    ck(f"ไม่มีไลบรารีหนักปนใน {len(reqs)} request ของหน้าแรก", leaked, [])
    for u, lib in leaked: print(f"      ⚠️ พบ '{lib}' ใน {u}")
    ctx.close()

    print("\n━━ ③④ ขนาดรวม + จำนวน request ของหน้าแรก ━━")
    ctx, pg = throttled_context(b, MOBILE_VIEWPORT)
    pg.goto(BASE, wait_until="networkidle")
    assert_compressed(pg)          # ‼️ ต้องวัดบนหน่วยเดียวกับที่ผู้ใช้เจอ ไม่งั้นตัวเลขเชื่อไม่ได้
    data = pg.evaluate("""() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        return { count: res.length + 1,
                 total: nav.transferSize + res.reduce((a, r) => a + r.transferSize, 0) };
    }""")
    ck_le(f"ขนาดรวมหน้าแรก {data['total']:,} bytes ({data['total']/1024:.1f} KB)", data["total"], SIZE_BUDGET_BYTES)
    ck_le(f"จำนวน request หน้าแรก = {data['count']}", data["count"], REQUEST_COUNT_BUDGET)
    ctx.close()

    print("\n━━ ⑤ Long task ตอนสกอลล์ (เริ่มดักฟังหลังโหลดเสร็จเท่านั้น — buffered:false) ━━")
    ctx, pg = throttled_context(b, MOBILE_VIEWPORT)
    pg.goto(BASE, wait_until="networkidle")   # โหลดให้เสร็จก่อน กันติด long task ตอนโหลดหน้ามาปน
    pg.evaluate("""() => {
        window.__fkLT = [];
        window.__fkObs = new PerformanceObserver(list => {
            for (const e of list.getEntries()) window.__fkLT.push({dur: Math.round(e.duration), start: Math.round(e.startTime)});
        });
        window.__fkObs.observe({type: 'longtask', buffered: false});
    }""")
    h = pg.evaluate("document.documentElement.scrollHeight")
    step = max(1, h // 12)
    for y in range(0, h + step, step):
        pg.evaluate(f"window.scrollTo(0, {y})")
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(300)
    longtasks = pg.evaluate("window.__fkLT")
    ck(f"ไม่มี long task ระหว่างสกอลล์ (พบ {len(longtasks)})", longtasks, [])
    for lt in longtasks[:6]: print(f"      ⚠️ {lt}")
    ctx.close()

    print(f"\n━━ ⑥ หน้าเครื่องมือหนักสุด 3 ตัว เปิดแล้วต้องไม่ค้าง (เพดาน {TOOL_OPEN_BUDGET_MS:,}ms) ━━")
    for tool in HEAVY_TOOLS:
        ctx, pg = throttled_context(b, MOBILE_VIEWPORT)
        t0 = time.time()
        ok = True
        pg.goto(f"{BASE}/#/{tool}", wait_until="commit")
        try:
            pg.wait_for_selector(".dz, .tool-head", timeout=TOOL_OPEN_BUDGET_MS)
        except PWTimeout:
            ok = False
        dt = (time.time() - t0) * 1000
        ck(f"{tool} เปิดจนกดใช้งานได้ (ใช้จริง {dt:.0f}ms)", ok, True)
        ctx.close()

    b.close()

print("\n" + "━" * 56)
print(f"ผ่าน {P} · ตก {len(F)}")
if F:
    print("\nรายการที่ตก:")
    for i, x in enumerate(F, 1): print(f"  {i}. {x}")
    sys.exit(1)
