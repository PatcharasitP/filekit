"""แผงข้างพับเก็บได้ (รางซ้าย + คอลัมน์ขวา) กับ FAQ แบบแถวเส้นบาง

‼️ ที่มา 13/09/2026 พี่ปอนด์วงกรอบแดงที่รางซ้ายกับที่ว่างขวาบนจอกว้าง แล้วบอกว่า
   "อยากให้มีอะไรใส่ลงไป แต่กลัวจะรก ให้พวกนั้นสามารถพับซ่อนเก็บได้"
   ฟ้าฟันธง: ไม่เพิ่มของใหม่ แต่ย้าย "คำถามที่เจอบ่อย" กับ "ทำอะไรต่อดี" จากท้ายหน้า
   ขึ้นมาเป็นคอลัมน์ขวาเมื่อจอ >= 1500px แล้วให้ทั้งสองข้างพับได้ จำสถานะไว้

เทสนี้ตรวจ
   ① จอกว้าง 1920: คอลัมน์ขวาลอยอยู่ขวา มี FAQ + ทำอะไรต่อดี ไม่ทับพื้นที่ทำงาน
   ② พับคอลัมน์ขวาแล้วเหลือแถบแคบ เนื้อหาหาย aria-expanded=false และจำข้ามการโหลดหน้าใหม่
   ③ พับรางซ้ายแล้วหัวเรื่องใหญ่ต้องกลับมา (ไม่งั้นหน้าไม่มีชื่อเครื่องมือ) และจำได้เหมือนกัน
   ④ ลิงก์ข้ามไป FAQ ในราง ต้องกางคอลัมน์ขวาที่พับอยู่ให้เอง และ hash ไม่เปลี่ยน
   ⑤ ปุ่มพับกดได้ด้วยนิ้ว >= 36px และมีชื่อสำหรับ screen reader
   ⑥ จอ 1280: คอลัมน์ขวาไม่ลอย (display:contents) ปุ่มพับซ่อน FAQ ยังอยู่ท้ายหน้าใต้พื้นที่ทำงาน
   ⑦ FAQ เป็นแถวเส้นบางมีลูกศร ไม่ใช่กล่องมีขอบ และกดกางได้
   ⑧ ‼️ ตัวตรวจต้องแดงเป็น: ปิด localStorage แล้วสถานะต้องไม่ถูกจำ (พิสูจน์ว่าข้อ ② วัดของจริง)

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_sidepanel.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
TOOL = "#/pdf-merge"      # มีทั้งคำถามที่เจอบ่อยและทำอะไรต่อดี
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label + ((" | " + str(detail)) if detail else ""))

def box(pg, sel):
    return pg.evaluate(f"""() => {{ const e = document.querySelector('{sel}'); if (!e) return null;
        const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return {{ l: r.left, r: r.right, t: r.top, w: r.width, h: r.height, pos: s.position, disp: s.display }}; }}""")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    errs = []

    # ── ① จอกว้าง ────────────────────────────────────────────────────
    print("\n① จอกว้าง 1920 คอลัมน์ขวา")
    ctx = br.new_context(viewport={"width": 1920, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    pg.goto(BASE + "/" + TOOL, wait_until="networkidle"); pg.wait_for_timeout(400)
    side = box(pg, ".tool-side"); panel = box(pg, ".panel"); rail = box(pg, ".tool-rail")
    ck("คอลัมน์ขวาลอย (position fixed) อยู่ขวาของพื้นที่ทำงาน", side and side["pos"] == "fixed" and side["l"] > panel["r"], [side, panel])
    ck("คอลัมน์ขวาชิดขอบขวาโดยไม่ล้นจอ", side and 1920 - side["r"] >= 20 and side["r"] <= 1920, side)
    ck("ในคอลัมน์ขวามีคำถามที่เจอบ่อยและทำอะไรต่อดี",
       pg.locator(".tool-side .faq").count() == 1 and pg.locator(".tool-side .next-steps").count() == 1)
    ck("รางซ้ายยังอยู่ซ้ายเหมือนเดิม", rail and rail["pos"] == "fixed" and rail["r"] < panel["l"], [rail, panel])
    ck("มีปุ่มพับ 2 ปุ่ม (รางซ้าย + คอลัมน์ขวา) และมองเห็น", pg.locator(".side-toggle:visible").count() == 2, pg.locator(".side-toggle:visible").count())

    # ── ② พับคอลัมน์ขวา ───────────────────────────────────────────────
    print("\n② พับคอลัมน์ขวา")
    pg.locator(".tool-side .side-toggle").click(); pg.wait_for_timeout(250)
    c = box(pg, ".tool-side")
    ck(f"พับแล้วเหลือแถบแคบ (กว้าง {c['w']:.0f}px ต้อง <= 48)", c["w"] <= 48, c)
    ck("เนื้อหา FAQ หายไปตอนพับ", not pg.locator(".tool-side .faq").is_visible())
    ck("aria-expanded เป็น false", pg.locator(".tool-side .side-toggle").get_attribute("aria-expanded") == "false")
    lbl = pg.locator(".tool-side .st-lbl")
    ck("มีป้ายแนวตั้งบอกว่าแผงนี้คืออะไร", lbl.is_visible() and pg.evaluate("getComputedStyle(document.querySelector('.tool-side .st-lbl')).writingMode") == "vertical-rl")
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("โหลดหน้าใหม่แล้วยังพับอยู่ (จำสถานะ)", pg.locator(".tool-side.collapsed").count() == 1)
    pg.goto(BASE + "/#/pdf-split", wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("เปลี่ยนเครื่องมือแล้วก็ยังพับอยู่", pg.locator(".tool-side.collapsed").count() == 1)
    pg.goto(BASE + "/" + TOOL, wait_until="networkidle"); pg.wait_for_timeout(400)

    # ── ④ ลิงก์ข้ามไป FAQ ต้องกางคอลัมน์ให้ ─────────────────────────
    print("\n④ ลิงก์ข้ามในรางกางคอลัมน์ที่พับอยู่")
    h0 = pg.evaluate("location.hash")
    pg.locator('.rail-jump a[href="#faq-h"]').click(); pg.wait_for_timeout(500)
    ck("กดลิงก์แล้วคอลัมน์ขวากางออก", pg.locator(".tool-side.collapsed").count() == 0)
    ck("hash ไม่เปลี่ยน ยังอยู่หน้าเครื่องมือ", pg.evaluate("location.hash") == h0, pg.evaluate("location.hash"))
    ck("กางแล้วจำว่ากาง", pg.evaluate("localStorage.getItem('fk:side-collapsed')") == "0")

    # ── ③ พับรางซ้าย ─────────────────────────────────────────────────
    print("\n③ พับรางซ้าย")
    head_before = pg.evaluate("getComputedStyle(document.querySelector('.tool-head')).display")
    pg.locator(".tool-rail .side-toggle").click(); pg.wait_for_timeout(250)
    r = box(pg, ".tool-rail")
    ck(f"พับรางแล้วเหลือแถบแคบ ({r['w']:.0f}px)", r["w"] <= 48, r)
    head_after = pg.evaluate("getComputedStyle(document.querySelector('.tool-head')).display")
    ck(f"พับรางแล้วหัวเรื่องใหญ่กลับมา ({head_before} เป็น {head_after})", head_before == "none" and head_after != "none")
    ck("ชื่อเครื่องมือยังอ่านได้บนหน้า", pg.locator(".tool-head h1").is_visible())
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("โหลดใหม่แล้วรางยังพับอยู่และหัวเรื่องยังแสดง",
       pg.locator(".tool-rail.collapsed").count() == 1 and pg.locator(".tool-head h1").is_visible())
    pg.locator(".tool-rail .side-toggle").click(); pg.wait_for_timeout(250)
    ck("กางรางกลับแล้วหัวเรื่องใหญ่ซ่อนตามเดิม", pg.evaluate("getComputedStyle(document.querySelector('.tool-head')).display") == "none")

    # ── ⑤ ปุ่มพับกดได้ด้วยนิ้วและมีชื่อ ──────────────────────────────
    print("\n⑤ ปุ่มพับ")
    sizes = pg.evaluate("[...document.querySelectorAll('.side-toggle')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), b.getAttribute('aria-label')]; })")
    ck("ปุ่มพับทุกปุ่ม >= 36x36 และมี aria-label", all(w >= 36 and h >= 36 and lab for w, h, lab in sizes), sizes)
    ck("ไม่มี error หลุดตลอดทาง", not errs, errs[:2])
    ctx.close()

    # ── ⑥ จอ 1280 ────────────────────────────────────────────────────
    print("\n⑥ จอ 1280 ไม่มีคอลัมน์ลอย")
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/" + TOOL, wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("คอลัมน์ขวาเป็น display:contents (ไหลตามเดิม)", pg.evaluate("getComputedStyle(document.querySelector('.tool-side')).display") == "contents")
    ck("ปุ่มพับซ่อนอยู่ที่จอแคบ", pg.locator(".side-toggle:visible").count() == 0, pg.locator(".side-toggle:visible").count())
    faq = box(pg, ".faq"); panel = box(pg, ".panel")
    ck("FAQ อยู่ท้ายหน้าใต้พื้นที่ทำงาน", faq and panel and faq["t"] >= panel["t"] + panel["h"] - 1, [faq, panel])
    # ‼️ สถานะพับที่จำไว้จากจอกว้าง ต้องไม่ทำให้จอแคบซ่อนอะไร
    pg.evaluate("localStorage.setItem('fk:side-collapsed','1'); localStorage.setItem('fk:rail-collapsed','1')")
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("แม้จำว่าพับไว้ จอแคบก็ยังเห็น FAQ ครบ", pg.locator(".faq").is_visible())
    ctx.close()

    # ── ⑦ FAQ แถวเส้นบาง ─────────────────────────────────────────────
    print("\n⑦ FAQ แบบแถวเส้นบาง")
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/" + TOOL, wait_until="networkidle"); pg.wait_for_timeout(400)
    pg.locator(".faq > summary").click(); pg.wait_for_timeout(200)
    st = pg.evaluate("""() => { const i = document.querySelector('.faq-i'); const s = getComputedStyle(i);
        const a = getComputedStyle(i.querySelector('summary'), '::after');
        return { bb: s.borderBottomWidth, bt: s.borderTopWidth, bg: s.backgroundColor, radius: s.borderRadius, chev: a.content, chevW: a.width }; }""")
    ck("แต่ละข้อคั่นด้วยเส้นล่างบาง 1px ไม่มีกรอบรอบ", st["bb"] == "1px" and st["bt"] == "0px" and st["radius"] == "0px", st)
    ck("มีลูกศรทางขวา (::after) แทนเครื่องหมายบวก", st["chev"] not in ("none", "normal") and st["chevW"] != "auto", st)
    n = pg.locator(".faq-i").count()
    pg.locator(".faq-i summary").first.click(); pg.wait_for_timeout(200)
    ck(f"กดคำถามแล้วกางออกได้ (มี {n} ข้อ)", pg.locator(".faq-i[open]").count() == 1 and n >= 3)
    ctx.close()

    # ── ⑧ พิสูจน์ตัวตรวจ: ปิด localStorage แล้วต้องไม่จำ ────────────
    print("\n⑧ ตัวตรวจต้องแดงเป็น")
    ctx = br.new_context(viewport={"width": 1920, "height": 950})
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    pg = ctx.new_page()
    pg.goto(BASE + "/" + TOOL, wait_until="networkidle"); pg.wait_for_timeout(400)
    pg.locator(".tool-side .side-toggle").click(); pg.wait_for_timeout(200)
    was = pg.locator(".tool-side.collapsed").count() == 1
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(400)
    ck("ไม่มี localStorage: พับได้ในหน้านั้น แต่โหลดใหม่แล้วไม่จำ (ยืนยันว่าข้อ ② วัดของจริง)",
       was and pg.locator(".tool-side.collapsed").count() == 0)
    ctx.close()
    br.close()

print(f"\nผ่าน {0 if fails else 'ครบ'} ตก {len(fails)}")
if fails:
    for f in fails:
        print("  ❌ " + f)
    sys.exit(1)
print("✅ ผ่านหมด")
