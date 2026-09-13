"""ฟอนต์ที่วาดจริงของหน้าแรกต้องเป็น Sarabun เหมือนกันทุกวิธีโหลด (แท็บใหม่, reload, hard reload, กลับมาเปิดซ้ำ)

‼️ ที่มา 13/09/2026 พี่ปอนด์ทัก "พอ REFRESH ขนาดตัวอักษรไม่เท่ากันแบบสัมผัสได้"
   วินิจฉัยด้วย CDP 75 ตัวอย่างบนเว็บสด: font-display:optional ของ Chrome ใช้ฟอนต์ก็ต่อเมื่อไฟล์อยู่ใน
   memory cache ของแท็บเดิม หรือโหลดเสร็จก่อนวาดเฟรมแรก จึงสลับระหว่าง Sarabun กับ Leelawadee UI ตามวิธีกด
   แก้ด้วย preload 3 ไฟล์เฉพาะเมื่อ SW คุมหน้า + font-display:fallback + หน้า Bold ของฟอนต์สำรอง + ฟอนต์ใน PRECACHE
   (preload คงที่ทำ FCP บนเน็ตมือถือจำลองช้าลง 536 เป็น 824 ms จึงไม่ใช้)

‼️ ห้ามตัดสินด้วย getComputedStyle().fontFamily (มันบอกแค่ที่ CSS ขอ) ต้องถาม CDP CSS.getPlatformFontsForNode
   ว่าวาดด้วยฟอนต์อะไรจริง และ document.fonts.status ก็บอกไม่ได้ (loaded ทั้งที่วาดด้วย fallback)

เทสนี้ตรวจ
   ① ตัวตรวจแดงเป็น: บล็อก .woff2 แล้ว CDP ต้องตอบ Leelawadee UI
   ② 6 สถานการณ์ (โหลดแรกใน context ใหม่, reload ครั้งที่ 1, reload ครั้งที่ 2, hard reload, goto ซ้ำ, แท็บใหม่)
      หลังหน้านิ่งแล้ว (1.2 วิ) ต้องเป็น Sarabun ทั้งหมด (fallback สลับให้ภายใน 3 วิ ถ้ามาช้า)
   ③ ตอน fallback จริง (บล็อกฟอนต์) หัวเรื่องหนาต้องกว้างต่างจาก Sarabun ไม่เกิน 3% (ไม่ใช่ 16% แบบก่อนแก้)

รัน: tests/run.sh browser_fontrace   (ตั้ง FK_BASE ชี้เว็บสดได้)
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []
def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok: fails.append(label)

def platform_font(pg, selector):
    c = pg.context.new_cdp_session(pg)
    c.send("DOM.enable"); c.send("CSS.enable")
    root = c.send("DOM.getDocument")["root"]["nodeId"]
    nid = c.send("DOM.querySelector", {"nodeId": root, "selector": selector})["nodeId"]
    fonts = c.send("CSS.getPlatformFontsForNode", {"nodeId": nid})["fonts"]
    c.detach()
    fonts.sort(key=lambda f: -f["glyphCount"])
    return fonts[0]["familyName"] if fonts else "?"

def h1_width(pg):
    # ‼️ วัดความกว้างของตัวอักษรจริงด้วย Range ไม่ใช่กล่อง h1 (h1 มี max-width จึงกว้างเท่ากันเสมอ วัดกล่องแล้วได้ 0% หลอก)
    return pg.evaluate("""() => { const h = document.querySelector('.hero h1');
        const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let n, best = 0;
        while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n);
          for (const b of r.getClientRects()) best = Math.max(best, b.width); }
        return best; }""")

def wait_home(pg):
    # รอให้หน้านิ่ง: font-display:fallback ยอมสลับได้ภายใน 3 วิ ผู้ใช้เห็นผลสุดท้ายหลังจากนั้น
    pg.wait_for_selector(".hero h1"); pg.wait_for_selector(".pill"); pg.wait_for_timeout(1200)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    print("\n① ตัวตรวจต้องแดงเป็น")
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.route("**/*.woff2", lambda r: r.abort())
    pg.goto(BASE + "/", wait_until="networkidle"); wait_home(pg)
    blocked_font = platform_font(pg, ".hero h1"); blocked_w = h1_width(pg)
    ck(f"บล็อกฟอนต์แล้ว CDP ตอบฟอนต์สำรอง ({blocked_font})", "Sarabun" not in blocked_font, blocked_font)
    ctx.close()

    print("\n② ทุกวิธีโหลดต้องได้ Sarabun")
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/", wait_until="networkidle"); wait_home(pg)
    pg.evaluate("navigator.serviceWorker.ready.then(() => true)"); pg.wait_for_timeout(800)
    results = {}
    results["โหลดแรก (context ใหม่)"] = platform_font(pg, ".hero h1")
    pg.reload(wait_until="networkidle"); wait_home(pg); results["reload ครั้งที่ 1"] = platform_font(pg, ".hero h1")
    pg.reload(wait_until="networkidle"); wait_home(pg); results["reload ครั้งที่ 2"] = platform_font(pg, ".hero h1")
    c = pg.context.new_cdp_session(pg); c.send("Page.enable"); c.send("Page.reload", {"ignoreCache": True}); c.detach()
    pg.wait_for_load_state("networkidle"); wait_home(pg); results["hard reload (ignoreCache)"] = platform_font(pg, ".hero h1")
    pg.goto(BASE + "/?again=1", wait_until="networkidle"); wait_home(pg); results["goto ซ้ำ"] = platform_font(pg, ".hero h1")
    pg2 = ctx.new_page(); pg2.goto(BASE + "/", wait_until="networkidle"); wait_home(pg2); results["แท็บใหม่"] = platform_font(pg2, ".hero h1")
    sarabun_w = h1_width(pg2)
    for k, v in results.items():
        ck(f"{k}: {v}", "Sarabun" in v, v)
    # ‼️ โหลดแรกสุดจากเน็ตช้า (ฟอนต์มาถึงหลังวาด) ยังเป็น fallback ได้ตามธรรมชาติของ optional ไม่ถือว่าตก
    #    แต่บันทึกไว้ให้เห็น
    ctx2 = br.new_context(viewport={"width": 1440, "height": 900}); pg3 = ctx2.new_page()
    def slow(route):
        import time; time.sleep(0.3); route.continue_()
    pg3.route("**/*.woff2", slow)
    pg3.goto(BASE + "/", wait_until="networkidle"); wait_home(pg3)
    ck(f"โหลดแรกสุดบนเน็ตช้า 300ms หลังหน้านิ่งก็ต้องสลับเป็น Sarabun: {platform_font(pg3, '.hero h1')}", "Sarabun" in platform_font(pg3, '.hero h1'))
    ctx2.close(); ctx.close()

    print("\n③ ตอนต้องใช้ฟอนต์สำรอง หัวเรื่องต้องกว้างใกล้ Sarabun")
    # ‼️ ค่าอ้างอิงต้องมาจากหน้าที่ CDP ยืนยันว่าเป็น Sarabun จริง ไม่งั้นเทียบ fallback กับ fallback ได้ 0% หลอก (เจอตอนรันกับโค้ดเดิม)
    if "Sarabun" not in results["แท็บใหม่"]:
        ck("ค่าอ้างอิง Sarabun วัดไม่ได้ เพราะแท็บใหม่ยังวาดด้วยฟอนต์สำรอง", False, results["แท็บใหม่"])
    else:
        diff = abs(blocked_w - sarabun_w) / sarabun_w * 100
        ck(f"หัวเรื่องหนาด้วยฟอนต์สำรองกว้างต่างจาก Sarabun {diff:.1f}% (ต้อง <= 3%, ก่อนแก้ 16%)", diff <= 3.0, [blocked_w, sarabun_w])
    br.close()

print(f"\nผ่าน {0 if fails else 'ครบ'} ตก {len(fails)}")
sys.exit(1 if fails else 0)
