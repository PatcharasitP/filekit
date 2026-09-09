"""
งบประมาณ perf ของหน้าแรก FileKit (lazy-first) — วัดค่าจริงแล้วเทียบเพดาน

เว็บนี้ออกแบบแนว "lazy-first": หน้าแรกโหลดเบามาก โค้ดเครื่องมือ+ไลบรารีหนักดึงทีหลัง
เมื่อผู้ใช้แสดงเจตนา (hover/focus/touch/คลิก) เท่านั้น ไฟล์นี้เกิดมาเพราะ **ไม่เคยมีเทส
ที่ตั้งเพดานตัวเลขไว้เลย** — ของหนักแอบไหลเข้าหน้าแรกเมื่อไรก็ไม่มีใครรู้

‼️ ไฟล์นี้ "เสริม" tests/browser_perf.py ไม่ใช่แทนที่ — ของเดิมคุม FCP/ขนาด/banned-libs/
long-task-ตอนสกอลล์/เวลาเปิด 3 เครื่องมือหนักสุด ภายใต้ "สภาพมือถือ throttle คงที่" (ล็อกไว้
ห้ามแก้ตามคอมเมนต์ในไฟล์นั้น) ไฟล์นี้เพิ่มมุมที่ยังไม่มีใครวัด:
  ① DOMContentLoaded/load + ขนาดแยกประเภท (JS/CSS/ฟอนต์/รูป) บนเน็ตปกติ (ไม่ throttle)
  ② Cumulative Layout Shift (CLS) ของหน้าแรก
  ③ Long task ระหว่าง "โหลดหน้าแรก" จริง (ของเดิมวัดเฉพาะตอนสกอลล์) + Total Blocking Time
  ④ เช็ค lazy แบบเข้มที่สุด: ไม่มี src/tools/*.js หรือไลบรารี (local/CDN) หลุดมาแม้ตัวเดียว
  ⑤ เวลาเปิดครบทั้ง 29 เครื่องมือ (ของเดิมวัดแค่ 3 ตัวที่หนักสุด) เรียงช้า→เร็ว
  ⑥ ขนาดไฟล์ในโปรเจกต์ (index.html + inline CSS + ไฟล์ใหญ่ผิดปกติ)
  ⑦ จำลอง Slow 3G (คนละเงื่อนไขกับ "มือถือ" ของเดิม) วัด FCP ซ้ำ

รัน (จากโฟลเดอร์ FileKit/):
    python3 -m http.server 8930 &
    ../.venv/bin/python tests/browser_perfbudget.py
    FK_BASE=https://patcharasitp.github.io/filekit ../.venv/bin/python tests/browser_perfbudget.py

หมายเหตุความถูกต้อง: python http.server ไม่ทำ gzip/brotli ตัวเลข transferSize ที่วัดได้ตรงนี้
จึงเป็น "ขนาดไฟล์ดิบ" ไม่ใช่ขนาดที่ส่งจริงตอนขึ้น GitHub Pages (ซึ่งบีบอัดให้เล็กลงอีก) — ใช้
เทียบงบ "โค้ดที่ต้องโหลด/parse" ได้ตรง แต่ตัวเลข "byte บนเน็ตจริง" จะดีกว่านี้ในโปรดักชัน
"""
import os, re, sys, time, pathlib, statistics
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8930")

# ── เพดานที่เสนอ (พี่ปอนด์ brief ①③) — วัดจริงบนเน็ตปกติ ไม่ throttle ─────────────
JS_BYTES_BUDGET = 60_000          # JS ที่โหลดจริงตอนอยู่หน้าแรก (ไม่รวมฟอนต์) ≤ 60 KB
REQUEST_COUNT_BUDGET = 15         # จำนวน request ของหน้าแรก ≤ 15
FCP_NORMAL_BUDGET_MS = 1200       # FCP บนเน็ตปกติ ≤ 1.2 วินาที
CLS_BUDGET = 0.05                 # CLS ≤ 0.05
# lazy = ต้องเป็น 0 เด็ดขาด ไม่มีงบเผื่อ (ไม่ใช่ตัวเลขที่ปรับได้)

TOOL_SLOW_FLAG_MS = 2000          # เวลาเปิดเครื่องมือเกินนี้บนเครื่องเร็ว = ต้องรายงาน (ไม่ใช่ hard-fail)
BIG_FILE_FLAG_BYTES = 100_000     # ไฟล์โปรเจกต์ใหญ่กว่านี้ = ชี้ให้ดู (ไม่ใช่ hard-fail)

COLD_ROUNDS = 5                   # รอบวัด ①②③④ (เลขคี่ให้มัธยฐานตรงค่าจริงตัวหนึ่งเสมอ)
SLOW3G_ROUNDS = 5                 # รอบวัด ⑦

DESKTOP_VIEWPORT = {"width": 1440, "height": 900}

# "Slow 3G" — คนละเงื่อนไขกับ NET_COND (มือถือ/Fast-4G-ish) ใน browser_perf.py โดยตั้งใจ
# ‼️ ตัวเลขนี้เป็นค่าจำลอง "3G ช้า" ที่ฟ้ากำหนดเอง (latency 400ms, 400Kbps ทั้งสองทาง) ไม่ได้อ้างอิง
#    preset ทางการตัวใดตัวหนึ่งแบบยืนยันได้ 100% — จงใจให้ช้ากว่าเงื่อนไข "มือถือ" เดิมชัดเจน
#    เพื่อดูว่าเว็บไหวไหมในสภาพเน็ตที่แย่กว่าปกติมาก
SLOW3G_COND = {
    "offline": False, "latency": 400,
    "downloadThroughput": int(400 * 1024 / 8),
    "uploadThroughput": int(400 * 1024 / 8),
}

# ── รายชื่อเครื่องมือ 29 ตัว (ตรงกับ src/registry.js ณ 09/09/2026) ──────────────
TOOLS = [
    "pdf-pages", "pdf-merge", "pdf-split", "pdf-compress", "pdf-sign", "pdf-watermark",
    "pdf-ocr", "pdf-to-images", "pdf-to-text", "pdf-to-word", "pdf-to-excel",
    "word-to-pdf", "excel-to-pdf", "images-to-pdf", "image-convert", "image-resize",
    "word-join", "word-replace", "word-clean", "word-mailmerge",
    "powerpoint-to-word", "powerpoint-to-pdf", "excel-csv",
    "thai-encoding", "thai-date", "thai-id", "thai-name", "thai-address", "thai-number",
]

# ── ของหนักที่ห้ามหลุดมาตอนอยู่หน้าแรกเฉย ๆ (0 tolerance) ───────────────────────
VENDOR_BASENAMES = [
    "pdf.min.js", "pdf-lib.min.js", "xlsx.full.min.js", "docx.umd.js", "jszip.min.js",
    "mammoth.browser.min.js", "jspdf.umd.min.js", "jspdf.plugin.autotable.min.js",
    "tesseract.min.js", "pdf.worker.min.js",
]
CDN_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net"]
TOOL_JS_RE = re.compile(r"/tools/[a-z0-9-]+\.js", re.I)

def is_banned(url):
    low = url.lower()
    if TOOL_JS_RE.search(low):
        return "src/tools/*.js"
    for vb in VENDOR_BASENAMES:
        if vb in low:
            return f"ไลบรารีหนัก ({vb})"
    for h in CDN_HOSTS:
        if h in low:
            return f"CDN ({h})"
    return None

# ── รู้อยู่แล้วจากอ่านซอร์ส (ไม่ใช่ banned แต่โหลดอัตโนมัติโดยไม่ต้องมีคนโต้ตอบ) ───────
KNOWN_AUTO = {
    "assets/css/tool.css": "app.js:525 — appendChild ทันทีตอนโมดูลรันจบ (ไม่รอ idle) แม้เป็น CSS ของหน้าเครื่องมือ",
    "src/offline.js":      "app.js:529-533 — รอ requestIdleCallback (fallback setTimeout 600ms)",
    "sw.js":                "app.js:540 — รอ window 'load' event ก่อน register",
}

# ══════════════════════════════════════════════════════════════════════════
P, F, WARN = 0, [], []
def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f"  — {detail}" if (detail and not ok) else ""))

def ck_le(name, got, budget, unit=""):
    global P
    ok = got <= budget
    if ok: P += 1
    else: F.append(f"{name}\n      ได้    : {got:,.2f}{unit}\n      งบ     : ≤{budget:,}{unit}")
    print(f"  {'✅' if ok else '❌'} {name} (ได้ {got:,.2f}{unit} / งบ ≤{budget:,}{unit})")

def warn(msg):
    WARN.append(msg)
    print(f"  ⚠️  {msg}")

# ══════════════════════════════════════════════════════════════════════════
# เครื่องมือช่วย: ตั้ง observer ก่อนหน้าเริ่มโหลด (add_init_script รันก่อนสคริปต์ของหน้าเสมอ)
# ══════════════════════════════════════════════════════════════════════════
INIT_OBSERVERS = """(() => {
  window.__fk = { longtasks: [], cls: 0, lcp: 0, lcpN: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__fk.longtasks.push({ dur: Math.round(e.duration), start: Math.round(e.startTime) });
    }).observe({ type: "longtask", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__fk.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      const es = list.getEntries();
      const last = es[es.length - 1];
      if (last) { window.__fk.lcp = last.startTime; window.__fk.lcpN = es.length; }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {}
})();"""

COLLECT_JS = """() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fcp = paint.find(p => p.name === 'first-contentful-paint');
  const res = performance.getEntriesByType('resource').map(r => ({
    name: r.name, initiatorType: r.initiatorType,
    transferSize: r.transferSize, decodedBodySize: r.decodedBodySize,
    startTime: Math.round(r.startTime), duration: Math.round(r.duration),
  }));
  return {
    dcl: nav ? nav.domContentLoadedEventEnd : null,
    load: nav ? nav.loadEventEnd : null,
    navTransfer: nav ? nav.transferSize : 0,
    fcp: fcp ? fcp.startTime : null,
    lcp: window.__fk.lcp, lcpN: window.__fk.lcpN,
    cls: window.__fk.cls,
    longtasks: window.__fk.longtasks,
    resources: res,
    swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
  };
}"""

def fresh_ctx(browser, viewport, net_cond=None, cpu_rate=None):
    ctx = browser.new_context(viewport=viewport, reduced_motion="no-preference")
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Network.enable")
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    if net_cond:
        cdp.send("Network.emulateNetworkConditions", net_cond)
    if cpu_rate:
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": cpu_rate})
    pg.add_init_script(INIT_OBSERVERS)
    return ctx, pg

def categorize(url):
    path = urlparse(url).path.lower()
    if path.endswith((".js", ".mjs")): return "js"
    if path.endswith(".css"): return "css"
    if path.endswith((".woff2", ".woff", ".ttf", ".otf")): return "font"
    if path.endswith((".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico")): return "img"
    if path.endswith((".webmanifest",)): return "manifest"
    return "other"

def measure_cold(browser, settle_ms=1500):
    """หนึ่งรอบ: หน้าแรก cold โหลดแบบไม่มีใครโต้ตอบเลย (ไม่ hover ไม่คลิก) — ใช้กับ ①②③④"""
    ctx, pg = fresh_ctx(browser, DESKTOP_VIEWPORT)
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(BASE, wait_until="load")
    pg.wait_for_timeout(settle_ms)  # เผื่อ idle-callback (offline.js) + layout shift ท้าย ๆ + LCP นิ่ง
    data = pg.evaluate(COLLECT_JS)
    data["_requests"] = reqs
    ctx.close()
    return data

# ══════════════════════════════════════════════════════════════════════════
print(f"BASE = {BASE}\n")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ── ① ~ ④ หน้าแรก cold โหลดบนเน็ตปกติ (ไม่ throttle) ───────────────────────
    print(f"━━ ①②③④ หน้าแรก cold load (เดสก์ท็อป {DESKTOP_VIEWPORT['width']}×{DESKTOP_VIEWPORT['height']}, "
          f"ไม่ throttle, {COLD_ROUNDS} รอบ) ━━")
    rounds = [measure_cold(b) for _ in range(COLD_ROUNDS)]

    dcl_v   = [r["dcl"] for r in rounds]
    load_v  = [r["load"] for r in rounds]
    fcp_v   = [r["fcp"] for r in rounds]
    lcp_v   = [r["lcp"] for r in rounds]
    cls_v   = [r["cls"] for r in rounds]

    print(f"  DOMContentLoaded (ms) ทุกรอบ : {[round(v,1) for v in dcl_v]}")
    print(f"  load             (ms) ทุกรอบ : {[round(v,1) for v in load_v]}")
    print(f"  FCP               (ms) ทุกรอบ : {[round(v,1) for v in fcp_v]}")
    print(f"  LCP               (ms) ทุกรอบ : {[round(v,1) for v in lcp_v]}")
    print(f"  CLS                    ทุกรอบ : {[round(v,4) for v in cls_v]}")

    med_dcl, med_load = statistics.median(dcl_v), statistics.median(load_v)
    med_fcp, med_lcp = statistics.median(fcp_v), statistics.median(lcp_v)
    med_cls = statistics.median(cls_v)

    print(f"\n  มัธยฐาน: DCL {med_dcl:.1f}ms · load {med_load:.1f}ms · FCP {med_fcp:.1f}ms · "
          f"LCP {med_lcp:.1f}ms · CLS {med_cls:.4f}")

    # ── ① ขนาด+จำนวน request แยกประเภท (ใช้รอบสุดท้ายเป็นตัวแทน — ไซต์ static ต้องนิ่งทุกรอบ) ──
    ref = rounds[-1]
    total_bytes_all = [r["navTransfer"] + sum(x["transferSize"] for x in r["resources"]) for r in rounds]
    if len(set(total_bytes_all)) > 1:
        warn(f"ขนาดรวมหน้าแรกไม่นิ่งข้ามรอบ (ควรเป็น static site เท่ากันทุกรอบ): {total_bytes_all}")

    by_type = {}
    for r in ref["resources"]:
        c = categorize(r["name"])
        by_type.setdefault(c, {"bytes": 0, "count": 0, "urls": []})
        by_type[c]["bytes"] += r["transferSize"]
        by_type[c]["count"] += 1
        by_type[c]["urls"].append(r["name"])
    by_type.setdefault("html", {"bytes": 0, "count": 0, "urls": []})
    by_type["html"]["bytes"] += ref["navTransfer"]
    by_type["html"]["count"] += 1
    by_type["html"]["urls"].append(BASE + "/ (document)")

    total_bytes = ref["navTransfer"] + sum(x["transferSize"] for x in ref["resources"])
    total_count = len(ref["resources"]) + 1  # +1 = ตัว document เอง
    js_bytes = by_type.get("js", {}).get("bytes", 0)

    print("\n  ── ตารางขนาดแยกประเภท (รอบล่าสุด, ยึดเป็นตัวแทน) ──")
    print(f"  {'ประเภท':<10} {'จำนวน':>6} {'ไบต์':>10}")
    for c in sorted(by_type, key=lambda k: -by_type[k]["bytes"]):
        print(f"  {c:<10} {by_type[c]['count']:>6} {by_type[c]['bytes']:>10,}")
    print(f"  {'รวม':<10} {total_count:>6} {total_bytes:>10,}")
    for c, d in by_type.items():
        for u in d["urls"]:
            print(f"      [{c}] {u}")

    print(f"\n  python request-listener เห็น {len(ref['_requests'])} request "
          f"(Resource Timing API เห็น {total_count}) " +
          ("— ตรงกัน" if len(ref["_requests"]) == total_count else "— ไม่ตรงกัน ดูรายการด้านล่าง"))
    if len(ref["_requests"]) != total_count:
        rt_urls = {r["name"] for r in ref["resources"]} | {BASE + "/"}
        extra = [u for u in ref["_requests"] if not any(u.endswith(x.split("/")[-1]) for x in rt_urls)]
        for u in extra:
            print(f"      (listener เห็นแต่ Resource Timing ไม่เห็น) {u}")

    print(f"\n  Service Worker คุมหน้าอยู่ไหม (ควรเป็น false ตอน cold/first-visit): {ref['swController']}")

    print("\n━━ เทียบเพดาน ①②④ (เน็ตปกติ) ━━")
    ck_le(f"JS ที่โหลดจริงหน้าแรก (ไม่รวมฟอนต์)", js_bytes, JS_BYTES_BUDGET, " B")
    ck_le(f"จำนวน request หน้าแรก", total_count, REQUEST_COUNT_BUDGET)
    ck_le(f"FCP มัธยฐาน (เน็ตปกติ, {COLD_ROUNDS} รอบ)", med_fcp, FCP_NORMAL_BUDGET_MS, " ms")
    ck_le(f"CLS มัธยฐาน ({COLD_ROUNDS} รอบ)", med_cls, CLS_BUDGET)

    print("\n━━ เทียบเพดาน ④ lazy ต้องเป็น 0 (ทุก request ทุกรอบ ไม่มีงบเผื่อ) ━━")
    leaks = []
    for i, r in enumerate(rounds):
        urls = {x["name"] for x in r["resources"]} | set(r["_requests"])
        for u in urls:
            why = is_banned(u)
            if why:
                leaks.append((i + 1, u, why))
    ck(f"ไม่มีของหนัก (tools/*.js, vendor lib, CDN) หลุดเข้าหน้าแรกใน {COLD_ROUNDS} รอบ (พบ {len(leaks)})", len(leaks) == 0)
    for rnd, u, why in leaks:
        print(f"      ❌ รอบ {rnd}: {u}  ← {why}")

    print("\n  request ที่โหลดอัตโนมัติโดยไม่มีใครโต้ตอบ (ไม่ใช่ tools/CDN แต่ควรรู้ไว้ — อ้างอิงจากอ่านซอร์ส):")
    seen_known = set()
    for u in ref["_requests"]:
        for key, why in KNOWN_AUTO.items():
            if key in u and key not in seen_known:
                seen_known.add(key)
                print(f"      • {u}\n        {why}")
    if not seen_known:
        print("      (ไม่พบ — เว็บอาจเปลี่ยนพฤติกรรมไปจากตอนอ่านซอร์สครั้งล่าสุด ควรตรวจ KNOWN_AUTO ในไฟล์นี้ใหม่)")

    # ── ③ Long task ระหว่างโหลดหน้าแรกจริง (รายงานอย่างเดียว ไม่มีงบใน brief) ─────
    print("\n━━ ③ Long task ระหว่าง 'โหลดหน้าแรก' จริง (>50ms บล็อก main thread) — รายงานเท่านั้น ━━")
    for i, r in enumerate(rounds):
        lts = r["longtasks"]
        tbt = sum(max(0, lt["dur"] - 50) for lt in lts)
        print(f"  รอบ {i+1}: {len(lts)} ครั้ง · TBT = {tbt} ms" + (f"  รายละเอียด: {lts}" if lts else ""))
    all_counts = [len(r["longtasks"]) for r in rounds]
    all_tbt = [sum(max(0, lt["dur"] - 50) for lt in r["longtasks"]) for r in rounds]
    print(f"  มัธยฐาน: {statistics.median(all_counts):.0f} ครั้ง · TBT {statistics.median(all_tbt):.0f} ms "
          f"(อ้างอิง web.dev: TBT ≤200ms = ดี, 200-600ms = ต้องปรับ, >600ms = แย่ — ไม่ใช่เพดานที่ brief กำหนด)")

    # ══════════════════════════════════════════════════════════════════════
    # ⑤ เวลาเปิดครบทั้ง 29 เครื่องมือ — จากหน้าแรก คลิกป้าย จนกว่า .tool-head จะขึ้น
    # ══════════════════════════════════════════════════════════════════════
    print(f"\n━━ ⑤ เวลาเปิดเครื่องมือทั้ง {len(TOOLS)} ตัว (คลิกป้ายจากหน้าแรก, context ใหม่ทุกตัว, ไม่ throttle) ━━")
    # ‼️ พบระหว่างพิสูจน์ (ไม่ใช่เดา): หน้าแรกเรนเดอร์ #tools สองรอบทุกครั้งที่โหลดแบบไม่มี hash
    #    (bootstrap เรียก renderHome(q0) ที่ app.js:495 แล้ว route() ที่บรรทัด 497 เจอ hash ว่าง
    #    เลยเรียก goHome() ที่ห่อด้วย swap()/startViewTransition ซ้ำอีกรอบ — ดูหัวข้อ ①②
    #    "จุดที่ควรปรับ" ในรายงาน) ทำให้ปุ่มที่ locate ไว้ตอน DOM รอบแรกหลุดมือกลางอากาศเป็นบางครั้ง
    #    (Element is not attached to the DOM) — เผื่อเวลาให้เรนเดอร์รอบสองนิ่งก่อนค่อยคลิก เหมือน
    #    ผู้ใช้จริงที่มีเวลาตอบสนองก่อนกดเสมอ ไม่ใช่คลิกในมิลลิวินาทีที่ load ยิง
    tool_times = []  # (id, ms, ok)
    for tid in TOOLS:
        ctx, pg = fresh_ctx(b, DESKTOP_VIEWPORT)
        pg.goto(BASE, wait_until="load")
        pg.wait_for_timeout(600)
        pill = pg.locator(f'button.pill[data-id="{tid}"]')
        ok = True
        t0 = time.time()
        try:
            pill.scroll_into_view_if_needed(timeout=5000)
            pill.click(timeout=5000)
            pg.wait_for_selector(".tool-head", timeout=15000)
        except PWTimeout:
            ok = False
        dt_ms = (time.time() - t0) * 1000
        tool_times.append((tid, dt_ms, ok))
        print(f"  {'✅' if ok else '❌'} {tid:<20} {dt_ms:>8.0f} ms")
        ctx.close()

    tool_times_sorted = sorted(tool_times, key=lambda x: -x[1])
    print("\n  ── ตารางเรียงช้า→เร็ว ──")
    print(f"  {'#':>3} {'เครื่องมือ':<20} {'เวลา (ms)':>10} {'สถานะ':<10}")
    for i, (tid, dt, ok) in enumerate(tool_times_sorted, 1):
        flag = "  ⚠️ >2s" if dt > TOOL_SLOW_FLAG_MS else ""
        print(f"  {i:>3} {tid:<20} {dt:>10.0f} {'พร้อมใช้' if ok else 'timeout!':<10}{flag}")

    slow = [(tid, dt) for tid, dt, ok in tool_times if dt > TOOL_SLOW_FLAG_MS or not ok]
    if slow:
        warn(f"{len(slow)}/{len(TOOLS)} เครื่องมือเปิดช้ากว่า {TOOL_SLOW_FLAG_MS}ms บนเครื่องเร็ว (ไม่ throttle): "
             + ", ".join(f"{tid}={dt:.0f}ms" for tid, dt in slow))
    ck(f"ทุกเครื่องมือเปิดสำเร็จ (ไม่ timeout)", all(ok for _, _, ok in tool_times))

    # ══════════════════════════════════════════════════════════════════════
    # ⑦ จำลอง Slow 3G แล้ววัด FCP อีกรอบ
    # ══════════════════════════════════════════════════════════════════════
    print(f"\n━━ ⑦ จำลอง Slow 3G (latency {SLOW3G_COND['latency']}ms, "
          f"{SLOW3G_COND['downloadThroughput']*8//1024}Kbps down/up) — วัด FCP ซ้ำ, {SLOW3G_ROUNDS} รอบ ━━")
    slow3g_fcp = []
    for i in range(SLOW3G_ROUNDS):
        ctx, pg = fresh_ctx(b, DESKTOP_VIEWPORT, net_cond=SLOW3G_COND)
        pg.goto(BASE, wait_until="commit")
        try:
            pg.wait_for_function(
                "() => performance.getEntriesByType('paint').some(p => p.name === 'first-contentful-paint')",
                timeout=30000)
            fcp = pg.evaluate(
                "() => performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint').startTime")
        except PWTimeout:
            fcp = None
        slow3g_fcp.append(fcp)
        print(f"  รอบ {i+1}/{SLOW3G_ROUNDS}: {fcp:.1f} ms" if fcp is not None else f"  รอบ {i+1}: timeout (>30s)")
        ctx.close()

    ok_vals = [v for v in slow3g_fcp if v is not None]
    if ok_vals:
        med3g = statistics.median(ok_vals)
        print(f"\n  มัธยฐาน FCP บน Slow 3G จำลอง: {med3g:.1f} ms "
              f"({med3g/1000:.2f} วินาที) — ไม่มีเพดานบังคับใน brief (รายงานอย่างเดียว)")
        if med3g <= 3000:
            print("  ประเมิน: ใช้ได้บนเน็ตช้า (FCP ≤3s)")
        elif med3g <= 6000:
            print("  ประเมิน: พอทนบนเน็ตช้า แต่ผู้ใช้จะรู้สึกหน่วง (FCP 3-6s)")
        else:
            print("  ประเมิน: ช้าเกินไปบนเน็ตช้า ผู้ใช้จะคิดว่าเว็บค้าง (FCP >6s)")
    else:
        warn("Slow 3G: ทุกรอบ timeout ก่อนถึง FCP (>30s) — เว็บอาจใช้งานไม่ได้จริงบนเน็ตช้ามาก")

    b.close()

# ══════════════════════════════════════════════════════════════════════════
# ⑥ ขนาดไฟล์ในโปรเจกต์ (ไม่ต้องเปิดเบราว์เซอร์)
# ══════════════════════════════════════════════════════════════════════════
print("\n━━ ⑥ ขนาดไฟล์ในโปรเจกต์ ━━")
index_html = ROOT / "index.html"
html_bytes = index_html.stat().st_size
style_text = index_html.read_text(encoding="utf-8")
m = re.search(r"<style>.*?</style>", style_text, re.S)
inline_css_bytes = len(m.group(0).encode("utf-8")) if m else 0
print(f"  index.html รวม: {html_bytes:,} bytes ({html_bytes/1024:.1f} KB)")
print(f"  ในนั้นเป็น <style>...</style> ฝังตัว: {inline_css_bytes:,} bytes ({inline_css_bytes/1024:.1f} KB) "
      f"= {inline_css_bytes/html_bytes*100:.0f}% ของไฟล์")

SCAN_DIRS = ["src", "assets", "vendor", "samples"]
all_files = []
for d in SCAN_DIRS:
    dp = ROOT / d
    if not dp.exists(): continue
    for f in dp.rglob("*"):
        if f.is_file():
            all_files.append((str(f.relative_to(ROOT)), f.stat().st_size))
all_files.append(("index.html", html_bytes))
all_files.append(("sw.js", (ROOT / "sw.js").stat().st_size))
all_files.sort(key=lambda x: -x[1])

print(f"\n  ── ไฟล์ใหญ่สุด 20 อันดับ (จาก {', '.join(SCAN_DIRS)}, index.html, sw.js) ──")
for path, size in all_files[:20]:
    flag = "  ⚠️ ใหญ่ผิดปกติ" if size > BIG_FILE_FLAG_BYTES else ""
    print(f"  {size:>10,} B  {path}{flag}")

big = [x for x in all_files if x[1] > BIG_FILE_FLAG_BYTES]
print(f"\n  ไฟล์ที่เกิน {BIG_FILE_FLAG_BYTES:,} bytes ({BIG_FILE_FLAG_BYTES/1024:.0f}KB): {len(big)} ไฟล์")

by_dir_totals = {}
for d in SCAN_DIRS:
    dp = ROOT / d
    if dp.exists():
        by_dir_totals[d] = sum(f.stat().st_size for f in dp.rglob("*") if f.is_file())
print("\n  ── รวมตามโฟลเดอร์ ──")
for d, t in sorted(by_dir_totals.items(), key=lambda x: -x[1]):
    print(f"  {d:<10} {t:>12,} bytes ({t/1024/1024:.2f} MB)")

# ══════════════════════════════════════════════════════════════════════════
print("\n" + "━" * 60)
print(f"ผ่าน {P} · ตก {len(F)} · คำเตือน {len(WARN)}")
if F:
    print("\nรายการที่ตกเพดาน:")
    for i, x in enumerate(F, 1): print(f"  {i}. {x}")
if WARN:
    print("\nคำเตือน (ไม่กระทบผลรวม แต่ควรอ่าน):")
    for i, x in enumerate(WARN, 1): print(f"  {i}. {x}")
if F:
    sys.exit(1)
