# -*- coding: utf-8 -*-
"""
จัดการหน้า PDF (pdf-pages) งานรอบ 18/11/2026 ที่พี่ปอนด์ขอ ถามแต่ "ผู้ใช้เห็นอะไร กดแล้วเกิดอะไร"
─────────────────────────────────────────────────────────────────────────────
① ไฟล์ที่ไม่เหลือหน้า ต้องหายจากรายการไฟล์ และ Ctrl+Z หรือปุ่มย้อนการลบ คืนกลับมาที่เดิม
② คีย์ลัด (พี่ปอนด์: "ไม่เห็นกดได้เลย") red loop จับจริงกับโค้ดเดิม 18/11/2026 ได้ว่า
   ก ยังไม่คลิกอะไรแล้วกด Del เงียบสนิท ไม่บอกอะไร
   ค คลิกพื้นที่ว่างแล้วกด Del [ ] Ctrl+Z ไม่ทำงานเลย (ตัวฟังติดที่ ws.body โฟกัสอยู่ที่ body)
   ฉ เลือกหน้า 1 แล้วกดปุ่มบนการ์ดใบอื่น แล้ว Del หายไปสองหน้า (ตัวฟังของการ์ดกับของ ws.body ลบซ้ำ)
   ช โฟกัสอยู่ที่ปุ่มบนแถบบนแล้วกด ] ไม่หมุน
   หลักฐาน .claude/evidence/2026-11-18-filekit-pdfpages/01_keyboard_redloop_old.log
③ แถบคีย์ลัดบอกปุ่มตามเครื่อง (Mac ขึ้น ⌘Z) และหน้าตาไม่ใช่ปุ่ม
④ ปุ่มบนการ์ดเหลือ ดูใหญ่ หมุน ลบ ไม่ซ้ำกับแถบบน และมีแถบเลือกหลายหน้าเมื่อเลือกตั้งแต่ 2 หน้า
⑤ ลากย้ายหน้า: ม่าน "ปล่อยไฟล์ได้เลย" ต้องไม่ขึ้น , เห็นว่าจะไปเป็นหน้าไหน , เลขหน้าเปลี่ยนสด , ผลตรงที่เห็น , ใช้นิ้วได้
⑥ ดูหน้าใหญ่: ชี้ค้างแล้วภาพใหญ่ลอยขึ้น , แว่นขยายเปิดเต็มจอ , ซูมแล้วเรนเดอร์ใหม่ให้คม , ลูกศร Esc ทำงาน

รันปกติ:   FK_BASE=http://127.0.0.1:8899 ../.venv/bin/python tests/browser_pdfpages_ux.py
พิสูจน์แดง: ชี้ FK_BASE ไปที่เว็บรุ่นก่อนแก้ (git worktree ของ 45ea8e2) ต้องแดงทุกหมวด
"""
import os
import sys
import tempfile
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0
reds = []


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def make_pdf(path, label, n):
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    for i in range(1, n + 1):
        c.setFont("Helvetica-Bold", 150)
        c.drawString(110, 430, f"{label}{i}")
        c.setFont("Helvetica", 8)
        for y in range(90, 380, 10):
            c.drawString(60, y, f"small print {y} abcdefghijklmnopqrstuvwxyz")
        c.showPage()
    c.save()


JS_STATE = """() => {
  const v = [...document.querySelectorAll('.pages .pg')].filter(e => e.offsetParent);
  const sig = c => ((c.querySelector('.src')||{}).textContent||'').trim() + ':' +
                   ((c.querySelector('img')||{}).getAttribute ? (c.querySelector('img')||{getAttribute:()=>''}).getAttribute('alt') : '');
  const rot = c => { const e = [...c.querySelectorAll('*')].find(x => /rotate/.test(x.style.transform || ''));
                     return e ? e.style.transform.replace(/[^0-9]/g, '') : '0'; };
  return {n: v.length, sig: v.map(sig), rot: v.map(rot),
          sel: v.map((c, i) => c.classList.contains('selected') ? i : -1).filter(i => i >= 0),
          status: (document.querySelector('.status') || {}).textContent || ''};
}"""
JS_ROWS = """() => [...document.querySelectorAll('.file-row')].filter(r => r.offsetParent)
   .map(r => (r.querySelector('.f-name') || {}).textContent || '')"""
JS_VEIL = """() => { const v = document.querySelector('.dropveil');
   return !!v && v.classList.contains('on') && parseFloat(getComputedStyle(v).opacity) > 0.05; }"""
# ข้อความที่มองเห็นได้จริงบนจอ (ไม่นับของที่ซ่อน)
# ปุ่มที่มองเห็นและข้อความตรงตัว (แถวคีย์ลัดมีคำว่า ยกเลิกเลือก อยู่ด้วย ต้องแยกให้ออก)
JS_SEEN_BTN = """(t) => [...document.querySelectorAll('button')].some(b =>
   (b.textContent || '').trim() === t && b.checkVisibility({opacityProperty: true, visibilityProperty: true}))"""
JS_SEEN_TEXT = """(t) => [...document.querySelectorAll('body *')].some(n =>
   n.childElementCount === 0 && (n.textContent || '').includes(t) &&
   n.checkVisibility({opacityProperty: true, visibilityProperty: true}))"""


def open_tool(pg, files):
    pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_selector(".dz", state="attached", timeout=30000)   # มือถือ กล่องไฟล์อยู่ในแผงที่ยังไม่กาง
    pg.wait_for_timeout(1500)
    pg.set_input_files(".dz input[type=file]", [str(f) for f in files])
    total = {"alpha": 2, "bravo": 3, "charlie": 1}
    want = sum(total[Path(f).stem] for f in files)
    pg.wait_for_function(f"() => document.querySelectorAll('.pages .pg').length === {want}", timeout=60000)
    pg.wait_for_timeout(600)


def state(pg):
    return pg.evaluate(JS_STATE)


def card(pg, i):
    return pg.locator(".pages .pg:visible").nth(i)


def section(name, fn):
    print(f"\n{name}")
    try:
        fn()
    except Exception as e:  # หมวดพังกลางทาง = แดงพร้อมเหตุผล ไม่กลบ
        ck(f"{name} ทำได้ครบจนจบ", False, f"{type(e).__name__}: {str(e).splitlines()[0][:160]}")
        traceback.print_exc(limit=1)


def main():
    td = Path(tempfile.mkdtemp())
    A, B, C = td / "alpha.pdf", td / "bravo.pdf", td / "charlie.pdf"
    make_pdf(A, "A", 2)
    make_pdf(B, "B", 3)
    make_pdf(C, "C", 1)
    with sync_playwright() as p:
        br = p.chromium.launch()
        errs = []

        def desk(**kw):
            ctx = br.new_context(viewport={"width": 1440, "height": 950}, **kw)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            return ctx, pg

        # ── ① ไฟล์ว่างหายจากรายการ ────────────────────────────────────────
        def s1():
            ctx, pg = desk()
            open_tool(pg, [A, B, C])
            ck("เริ่มต้นเห็นไฟล์ 3 แถว", pg.evaluate(JS_ROWS) == ["alpha.pdf", "bravo.pdf", "charlie.pdf"], str(pg.evaluate(JS_ROWS)))
            card(pg, 5).click()                     # หน้าเดียวของ C
            pg.wait_for_timeout(250)
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(500)
            rows = pg.evaluate(JS_ROWS)
            ck("ลบหน้าเดียวของ C แล้ว แถวไฟล์ C หายจากรายการ", rows == ["alpha.pdf", "bravo.pdf"], str(rows))
            cnt = pg.evaluate("() => (document.querySelector('.dz-count') || {}).textContent || ''")
            ck("ตัวนับไฟล์บอก 2 ไฟล์ ไม่ใช่ 3", cnt.startswith("2 ไฟล์"), cnt)
            st = state(pg)["status"]
            ck("ข้อความบอกว่าไฟล์ C ไม่เหลือหน้าแล้ว และย้อนได้", "ไฟล์ C" in st and "Ctrl+Z" in st, st)
            pg.keyboard.press("Control+z")
            pg.wait_for_timeout(500)
            rows = pg.evaluate(JS_ROWS)
            ck("Ctrl+Z แล้วแถว C กลับมาที่เดิม (แถวที่ 3)", rows == ["alpha.pdf", "bravo.pdf", "charlie.pdf"], str(rows))
            ck("และหน้าของ C กลับมาด้วย", state(pg)["n"] == 6, str(state(pg)["n"]))
            # ทางปุ่ม ย้อนการลบ
            card(pg, 5).click()
            pg.wait_for_timeout(200)
            if not card(pg, 5).evaluate("n => n.classList.contains('selected')"):
                card(pg, 5).click()
                pg.wait_for_timeout(200)
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(400)
            pg.locator(".ws-toolbar button, .s2-tbar button").filter(has_text="ย้อนการลบ").first.click()
            pg.wait_for_timeout(500)
            rows = pg.evaluate(JS_ROWS)
            ck("ปุ่มย้อนการลบก็คืนแถว C ที่เดิม", rows == ["alpha.pdf", "bravo.pdf", "charlie.pdf"], str(rows))
            # ลบหน้าทั้งหมดของ A (2 หน้า) แล้วบันทึก ได้ไฟล์ที่ไม่มี A และชื่อไม่หลอก
            card(pg, 0).click(); pg.wait_for_timeout(150)
            card(pg, 1).click(modifiers=["Control"]); pg.wait_for_timeout(150)
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(500)
            rows = pg.evaluate(JS_ROWS)
            ck("ลบสองหน้าของ A พร้อมกัน แถว A หาย เหลือ B C", rows == ["bravo.pdf", "charlie.pdf"], str(rows))
            ctx.close()
        section("① ไฟล์ที่ไม่เหลือหน้า หายจากรายการ ย้อนแล้วกลับที่เดิม", s1)

        # ── ② คีย์ลัด ─────────────────────────────────────────────────────
        def s2():
            ctx, pg = desk()
            open_tool(pg, [A, B])
            s0 = state(pg)
            # ก ยังไม่คลิกอะไร
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(300)
            st = state(pg)
            ck("ก ยังไม่เลือกหน้าแล้วกด Del ไม่ลบอะไร", st["n"] == s0["n"], f"{s0['n']} -> {st['n']}")
            ck("ก และบอกให้คลิกเลือกหน้าก่อน (ไม่เงียบ)", "เลือกหน้า" in st["status"], st["status"])
            # ค เลือกหน้า แล้วคลิกพื้นที่ว่าง (โฟกัสตกไปที่ body) แล้วกด
            card(pg, 1).click()
            pg.wait_for_timeout(200)
            pg.evaluate("() => document.activeElement && document.activeElement.blur()")
            pg.mouse.click(5, 940)
            pg.wait_for_timeout(200)
            act = pg.evaluate("() => document.activeElement.tagName")
            pg.keyboard.press("]")
            pg.wait_for_timeout(300)
            ck("ค คลิกที่ว่างแล้วกด ] หน้าที่เลือกหมุน 90", state(pg)["rot"][1] == "90", f"โฟกัส {act} มุม {state(pg)['rot']}")
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(300)
            ck("ค คลิกที่ว่างแล้วกด Del หน้าที่เลือกหาย", state(pg)["n"] == s0["n"] - 1, f"{state(pg)['n']}")
            pg.keyboard.press("Control+z")
            pg.wait_for_timeout(300)
            ck("ค คลิกที่ว่างแล้วกด Ctrl+Z หน้ากลับมา", state(pg)["n"] == s0["n"], f"{state(pg)['n']}")
            # ง Backspace แทน Del (โน้ตบุ๊ก) , จ Cmd+Z (Mac)
            pg.mouse.click(5, 940)
            pg.keyboard.press("Backspace")
            pg.wait_for_timeout(300)
            ck("ง Backspace ลบหน้าที่เลือกได้เหมือน Del", state(pg)["n"] == s0["n"] - 1, f"{state(pg)['n']}")
            pg.keyboard.press("Meta+z")
            pg.wait_for_timeout(300)
            ck("จ Cmd+Z ย้อนได้", state(pg)["n"] == s0["n"], f"{state(pg)['n']}")
            # ฉ เลือกหน้า 1 แล้วกดปุ่มบนการ์ดหน้า 3 แล้ว Del ต้องหายหน้าเดียว และเป็นหน้าที่เลือก
            card(pg, 0).click()
            pg.wait_for_timeout(200)
            if state(pg)["sel"] != [0]:
                card(pg, 0).click(); pg.wait_for_timeout(200)
            want_gone = state(pg)["sig"][0]
            c2 = card(pg, 2)
            c2.hover()
            pg.wait_for_timeout(150)
            rot_btn = [b for b in c2.locator(".tools button").all() if "หมุน" in (b.get_attribute("aria-label") or "")]
            rot_btn[0].click()
            pg.wait_for_timeout(300)
            before = state(pg)
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(400)
            after = state(pg)
            ck("ฉ หลังกดปุ่มบนการ์ดอื่น Del ลบหน้าเดียว ไม่ใช่สองหน้า", after["n"] == before["n"] - 1, f"{before['n']} -> {after['n']}")
            ck("ฉ และหน้าที่หายคือหน้าที่เลือกไว้ (ขอบไฮไลต์)", want_gone not in after["sig"], f"เลือก {want_gone} เหลือ {after['sig']}")
            pg.keyboard.press("Control+z")
            pg.wait_for_timeout(300)
            # ช โฟกัสอยู่บนปุ่มแถบบน
            if state(pg)["sel"] == []:
                card(pg, 0).click(); pg.wait_for_timeout(200)
            r0 = state(pg)["rot"][state(pg)["sel"][0]]
            pg.locator(".ws-toolbar button, .s2-tbar button").filter(has_text="ครอบทุกหน้า").first.evaluate("n => n.focus()")
            pg.keyboard.press("]")
            pg.wait_for_timeout(300)
            s = state(pg)
            ck("ช โฟกัสอยู่บนปุ่มแถบบนแล้วกด ] ยังหมุนหน้าที่เลือก",
               bool(s["sel"]) and s["rot"][s["sel"][0]] != r0, f"{r0} -> {s['rot']}")
            # พิมพ์ในช่องช่วงหน้า กด Backspace ต้องลบตัวอักษร ไม่ใช่ลบหน้า
            n0 = state(pg)["n"]
            pg.evaluate("() => { const r = document.querySelector('.ws-rail-right'); if (r && r.offsetParent) r.click(); }")
            pg.wait_for_timeout(300)
            inp = pg.locator("input[placeholder*='1-3']").first
            if inp.is_visible():
                inp.fill("1-2")
                inp.press("Backspace")
                pg.wait_for_timeout(200)
                ck("พิมพ์ในช่องช่วงหน้าแล้ว Backspace ไม่ลบหน้า", state(pg)["n"] == n0 and inp.input_value() == "1-", inp.input_value())
            ctx.close()
        section("② คีย์ลัดทำงานทุกจุดในเครื่องมือ", s2)

        # ── ③ แถบคีย์ลัด ──────────────────────────────────────────────────
        def s3():
            ctx, pg = desk()
            open_tool(pg, [A])
            keys = pg.evaluate("() => [...document.querySelectorAll('.keyhints .kbd')].map(e => e.textContent.trim())")
            ck("เครื่อง Windows Linux บอกทั้ง Del และ Backspace", "Del" in keys and "Backspace" in keys, str(keys))
            ck("บอก Ctrl+Z", "Ctrl+Z" in keys, str(keys))
            look = pg.evaluate("""() => { const k = document.querySelector('.keyhints .kbd'); const cs = getComputedStyle(k);
               return {bw: parseFloat(cs.borderTopWidth), bg: cs.backgroundColor}; }""")
            ck("ป้ายคีย์ไม่มีกรอบและพื้น (ไม่ดูเหมือนปุ่มให้คลิก)",
               look["bw"] == 0 and look["bg"] in ("rgba(0, 0, 0, 0)", "transparent"), str(look))
            ctx.close()
            ctx, pg = desk()
            pg.add_init_script("""Object.defineProperty(navigator, 'platform', {get: () => 'MacIntel'});
               try { Object.defineProperty(navigator, 'userAgentData', {get: () => undefined}); } catch (e) {}""")
            open_tool(pg, [A])
            keys = pg.evaluate("() => [...document.querySelectorAll('.keyhints .kbd')].map(e => e.textContent.trim())")
            ck("เครื่อง Mac ขึ้น ⌘Z ไม่ขึ้น Ctrl+Z", "⌘Z" in keys and "Ctrl+Z" not in keys, str(keys))
            ctx.close()
        section("③ แถบคีย์ลัดตรงกับเครื่อง และเป็นคำแนะนำ ไม่ใช่ปุ่ม", s3)

        # ── ④ ปุ่มบนการ์ดกับแถบเลือกหลายหน้า ────────────────────────────────
        def s4():
            ctx, pg = desk()
            open_tool(pg, [A, B])
            labels = card(pg, 0).locator(".tools button").evaluate_all("ns => ns.map(n => n.getAttribute('aria-label') || '')")
            ck("การ์ดมีปุ่ม 3 ปุ่ม ดูใหญ่ หมุน ลบ",
               len(labels) == 3 and any("ใหญ่" in l for l in labels) and any("หมุน" in l for l in labels)
               and any("ลบ" in l for l in labels), str(labels))
            ck("การ์ดไม่มีปุ่มหมุนซ้ายแยกอีกปุ่ม", not any("ซ้าย" in l for l in labels), str(labels))
            bar = pg.evaluate("""() => [...document.querySelectorAll('.ws-toolbar button, .s2-tbar button')]
               .filter(b => b.offsetParent).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim())""")
            dup = [b for b in bar if any(w in b for w in ("หมุนซ้าย", "หมุนขวา", "ลบหน้านี้"))]
            ck("แถบบนไม่มีปุ่ม หมุนซ้าย หมุนขวา ลบ ซ้ำกับการ์ด", not dup, str(dup))
            pg.mouse.move(5, 940)
            pg.wait_for_timeout(300)
            op = card(pg, 3).locator(".tools").evaluate("n => getComputedStyle(n).opacity")
            ck("ปุ่มบนการ์ดไม่โชว์ค้างทุกใบ ตอนไม่ได้ชี้", float(op) < 0.1, op)
            card(pg, 3).hover()
            pg.wait_for_timeout(300)
            op = card(pg, 3).locator(".tools").evaluate("n => getComputedStyle(n).opacity")
            ck("ชี้การ์ดแล้วปุ่มโผล่", float(op) > 0.9, op)
            # เลือกหลายหน้า
            card(pg, 0).click(); pg.wait_for_timeout(200)
            seen = pg.evaluate(JS_SEEN_TEXT, "เลือก 2 หน้า")
            ck("เลือกหน้าเดียว ไม่มีแถบเลือกหลายหน้า", not pg.evaluate(JS_SEEN_BTN, "ยกเลิกเลือก"))
            card(pg, 2).click(modifiers=["Control"]); pg.wait_for_timeout(250)
            ck("Ctrl+คลิกใบที่สอง แถบขึ้นว่า เลือก 2 หน้า", pg.evaluate(JS_SEEN_TEXT, "เลือก 2 หน้า"))
            pg.locator(".pp-bulk button, [role=toolbar] button").filter(has_text="หมุน").first.click()
            pg.wait_for_timeout(300)
            r = state(pg)["rot"]
            ck("ปุ่มหมุนบนแถบหมุนทั้งสองหน้า", r[0] == "90" and r[2] == "90" and r[1] == "0", str(r))
            n0 = state(pg)["n"]
            pg.locator(".pp-bulk button, [role=toolbar] button").filter(has_text="ลบ").first.click()
            pg.wait_for_timeout(300)
            ck("ปุ่มลบบนแถบลบทั้งสองหน้า", state(pg)["n"] == n0 - 2, str(state(pg)["n"]))
            pg.keyboard.press("Control+z")
            pg.wait_for_timeout(300)
            ck("Ctrl+Z ครั้งเดียวคืนทั้งสองหน้า", state(pg)["n"] == n0, str(state(pg)["n"]))
            card(pg, 4).click(modifiers=["Shift"]); pg.wait_for_timeout(250)
            ck("Shift+คลิกเลือกเป็นช่วง", len(state(pg)["sel"]) >= 3, str(state(pg)["sel"]))
            pg.locator(".pp-bulk button").filter(has_text="ยกเลิกเลือก").first.click()
            pg.wait_for_timeout(250)
            ck("ยกเลิกเลือกแล้วแถบหาย", not pg.evaluate(JS_SEEN_BTN, "ยกเลิกเลือก") and not state(pg)["sel"])
            ctx.close()
        section("④ ปุ่มบนการ์ดไม่ซ้ำแถบบน และมีแถบเลือกหลายหน้า", s4)

        # ── ⑤ ลากย้ายหน้า ─────────────────────────────────────────────────
        def drag_mouse(pg, src_i, dst_i, frac=0.75, probe=None):
            card(pg, 0).scroll_into_view_if_needed()
            pg.wait_for_timeout(200)
            a, b = card(pg, src_i).bounding_box(), card(pg, dst_i).bounding_box()
            pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
            pg.mouse.down()
            pg.mouse.move(b["x"] + b["width"] * frac, b["y"] + b["height"] / 2, steps=14)
            pg.wait_for_timeout(450)
            got = probe() if probe else None
            pg.mouse.up()
            pg.wait_for_timeout(700)
            return got

        def s5():
            ctx, pg = desk()
            open_tool(pg, [A, B])
            before = state(pg)["sig"]
            # ‼️ ม่าน "ปล่อยไฟล์ได้เลย" ขึ้นเมื่อการลากมีชนิด "Files" ซึ่ง Chrome จริงใส่มาเองตอนลากรูป <img>
            #    (การ์ดหน้าเป็นรูป) แต่ตัวลากของ Playwright ไม่ใส่ จึงจำลองข้อมูลเดียวกับ Chrome จริงที่ dragstart
            #    ถ้าการลากภายในยังใช้ native drag ม่านจะขึ้นแบบที่พี่ปอนด์เห็น , ถ้าไม่ใช้ ไม่มี dragstart ให้เติม = ไม่มีม่าน
            pg.evaluate("""() => { window.__ds = 0; document.addEventListener('dragstart', e => { window.__ds++;
               try { e.dataTransfer.items.add(new File(['x'], 'page.jpg', {type: 'image/jpeg'})); } catch (_) {} }, true); }""")

            def mid():
                nums = pg.evaluate("""() => [...document.querySelectorAll('.pages .pg')].filter(e => e.offsetParent)
                    .map(c => ((c.querySelector('.num') || {}).textContent || '').trim())""")
                orig3 = pg.evaluate(f"""() => {{ const c = [...document.querySelectorAll('.pages .pg')].find(c =>
                    ((c.querySelector('.src')||{{}}).textContent||'').trim() + ':' + ((c.querySelector('img')||{{getAttribute:()=>''}}).getAttribute('alt')) === {before[3]!r});
                    return c ? ((c.querySelector('.num') || {{}}).textContent || '').trim() : null; }}""")
                return {"veil": pg.evaluate(JS_VEIL), "ds": pg.evaluate("() => window.__ds"),
                        "label": pg.evaluate(JS_SEEN_TEXT, "ย้ายไปเป็นหน้า 4"),
                        "nums": nums, "orig3": orig3}

            m = drag_mouse(pg, 0, 3, probe=mid)
            ck("ระหว่างลากหน้าภายใน ม่าน ปล่อยไฟล์ได้เลย ไม่ขึ้น", not m["veil"], f"ม่าน {m['veil']}")
            # ‼️ Playwright ลากแบบ native แล้วไม่ส่งชนิด Files ต่อ (ลองเติมที่ dragstart แล้วก็ยังไม่ขึ้นม่าน 18/11/2026)
            #    ข้อบนจึงจับม่านของเบราว์เซอร์จริงไม่ได้ ข้อนี้คือตัวกันจริง: ลากภายในต้องไม่เกิด native drag เลย
            #    เพราะม่านขึ้นจาก dragenter ที่มี Files เท่านั้น ไม่มี native drag = ไม่มี dragenter ให้ม่านขึ้น
            ck("ลากหน้าภายในไม่ใช้ native drag ของเบราว์เซอร์ (ต้นทางของม่าน)", m["ds"] == 0, f"dragstart {m['ds']} ครั้ง")
            ck("ระหว่างลากเห็นป้าย ย้ายไปเป็นหน้า 4", m["label"])
            ck("ระหว่างลาก เลขหน้าการ์ดเปลี่ยนสด (หน้าเดิมที่ 4 ตอนนี้ขึ้นเลข 3)", m["orig3"] == "3", str(m))
            after = state(pg)["sig"]
            ck("ปล่อยแล้วหน้าไปอยู่ตำแหน่งที่ 4 ตามป้าย", after.index(before[0]) == 3, f"{before} -> {after}")
            nums = pg.evaluate("""() => [...document.querySelectorAll('.pages .pg')].filter(e => e.offsetParent)
                .map(c => ((c.querySelector('.num') || {}).textContent || '').trim())""")
            ck("หลังวาง เลขหน้าเรียง 1 ถึง 5", nums == ["1", "2", "3", "4", "5"], str(nums))
            # ลากกลับ แล้วกด Esc กลางทาง = ยกเลิก
            a, b = card(pg, 3).bounding_box(), card(pg, 0).bounding_box()
            pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
            pg.mouse.down()
            pg.mouse.move(b["x"] + b["width"] * 0.3, b["y"] + b["height"] / 2, steps=10)
            pg.wait_for_timeout(300)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(600)
            pg.mouse.up()
            pg.wait_for_timeout(400)
            ck("กด Esc ระหว่างลาก ลำดับไม่เปลี่ยน", state(pg)["sig"] == after, str(state(pg)["sig"]))
            # ลดการเคลื่อนไหว ยังลากได้ และการ์ดลอยไม่เอียง
            pg.emulate_media(reduced_motion="reduce")
            def tilt():
                return pg.evaluate("""() => { const g = document.querySelector('.pp-ghost');
                    return g ? getComputedStyle(g).rotate : 'none'; }""")
            t = drag_mouse(pg, 0, 2, probe=tilt)
            ck("โหมดลดการเคลื่อนไหว การ์ดลอยไม่เอียง", t in ("none", "0deg"), t)
            ck("โหมดลดการเคลื่อนไหวยังย้ายได้", state(pg)["sig"].index(after[0]) == 2, str(state(pg)["sig"]))
            ctx.close()
            # นิ้ว: กดค้างแล้วลาก
            mctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
            mp = mctx.new_page()
            mp.on("pageerror", lambda e: errs.append(str(e)[:160]))
            open_tool(mp, [A, B])
            b0 = state(mp)["sig"]
            cdp = mctx.new_cdp_session(mp)
            card(mp, 0).scroll_into_view_if_needed()
            a, b = card(mp, 0).bounding_box(), card(mp, 2).bounding_box()
            x0, y0 = a["x"] + a["width"] / 2, a["y"] + a["height"] / 2
            x1, y1 = b["x"] + b["width"] * 0.6, b["y"] + b["height"] / 2
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
            mp.wait_for_timeout(450)
            for k in range(1, 13):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove",
                         "touchPoints": [{"x": x0 + (x1 - x0) * k / 12, "y": y0 + (y1 - y0) * k / 12}]})
                mp.wait_for_timeout(30)
            mp.wait_for_timeout(300)
            label = mp.evaluate(JS_SEEN_TEXT, "ย้ายไปเป็นหน้า 3")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            mp.wait_for_timeout(800)
            ck("มือถือ กดค้างแล้วลาก เห็นป้าย ย้ายไปเป็นหน้า 3", label)
            ck("มือถือ ลากด้วยนิ้วแล้วหน้าย้ายจริง", state(mp)["sig"].index(b0[0]) == 2, f"{b0} -> {state(mp)['sig']}")
            mctx.close()
        section("⑤ ลากย้ายหน้า เห็นว่าจะไปลงหน้าไหน ไม่มีม่านไฟล์", s5)

        # ── ⑥ ดูหน้าใหญ่ ────────────────────────────────────────────────────
        def s6():
            ctx, pg = desk()
            open_tool(pg, [A, B])
            card(pg, 1).hover()
            pg.wait_for_timeout(900)
            big = pg.evaluate("""() => [...document.querySelectorAll('img, canvas')].filter(n => !n.closest('.pg'))
               .map(n => n.getBoundingClientRect()).filter(r => r.width >= 300 && r.height >= 300).length""")
            ck("ชี้ค้างบนการ์ดแล้วมีภาพใหญ่ (กว้าง 300px ขึ้นไป) ลอยขึ้น", big >= 1, str(big))
            pg.mouse.move(5, 940)
            pg.wait_for_timeout(400)
            ck("เลื่อนเมาส์ออกแล้วภาพลอยหายไป", pg.evaluate("""() => [...document.querySelectorAll('img, canvas')]
               .filter(n => !n.closest('.pg') && n.getBoundingClientRect().width >= 300).length""") == 0)
            card(pg, 1).hover()
            zoom = [b for b in card(pg, 1).locator(".tools button").all() if "ใหญ่" in (b.get_attribute("aria-label") or "")]
            ck("การ์ดมีปุ่มแว่นขยายสำหรับดูใหญ่", bool(zoom))
            zoom[0].click()
            pg.wait_for_selector("[role=dialog]", timeout=5000)
            pg.wait_for_timeout(700)
            dlg = pg.locator("[role=dialog]").first
            title0 = dlg.inner_text()
            ck("เปิดดูเต็มจอที่หน้า 2", "หน้า 2" in title0, title0[:60])
            px0 = int(pg.evaluate("() => +(document.querySelector('.pz-paper') || {dataset: {}}).dataset.px || 0"))
            pct0 = pg.locator(".pz-pct").inner_text()
            pg.keyboard.press("+"); pg.keyboard.press("+"); pg.keyboard.press("+")
            pg.wait_for_timeout(900)
            px1 = int(pg.evaluate("() => +(document.querySelector('.pz-paper') || {dataset: {}}).dataset.px || 0"))
            pct1 = pg.locator(".pz-pct").inner_text()
            ck("กด + แล้วซูมเข้า (ตัวเลข % ขึ้น)", int(pct1.rstrip('%')) > int(pct0.rstrip('%')), f"{pct0} -> {pct1}")
            ck("ซูมแล้วเรนเดอร์ใหม่ให้คม ภาพจริงละเอียดขึ้นตามซูม (ไม่ใช่ขยายภาพย่อ)",
               px0 > 0 and px1 > px0 * 1.6, f"กว้างจริง {px0} -> {px1} px")
            st = pg.locator(".pz-stage").bounding_box()
            pg.mouse.move(st["x"] + st["width"] / 2, st["y"] + st["height"] / 2)
            pg.mouse.wheel(0, 400)
            pg.wait_for_timeout(300)
            pct2 = pg.locator(".pz-pct").inner_text()
            ck("ล้อเมาส์ลงแล้วซูมออก", int(pct2.rstrip('%')) < int(pct1.rstrip('%')), f"{pct1} -> {pct2}")
            pg.get_by_role("button", name="พอดีจอ").first.click()
            pg.wait_for_timeout(200)
            pct_fit = pg.locator(".pz-pct").inner_text()
            pg.get_by_role("button", name="ขนาดจริง 100%").click()
            pg.wait_for_timeout(200)
            ck("ปุ่ม 100% ได้ 100%", pg.locator(".pz-pct").inner_text() == "100%", pg.locator(".pz-pct").inner_text())
            pg.mouse.dblclick(st["x"] + st["width"] / 2, st["y"] + st["height"] / 2)
            pg.wait_for_timeout(300)
            ck("ดับเบิลคลิกแล้วระดับซูมเปลี่ยน", pg.locator(".pz-pct").inner_text() != "100%", pg.locator(".pz-pct").inner_text())
            pg.keyboard.press("ArrowRight")
            pg.wait_for_timeout(400)
            ck("ลูกศรขวาไปหน้า 3", "หน้า 3" in dlg.inner_text(), dlg.inner_text()[:40])
            pg.keyboard.press("ArrowLeft")
            pg.wait_for_timeout(300)
            ck("ลูกศรซ้ายกลับหน้า 2", "หน้า 2" in dlg.inner_text(), dlg.inner_text()[:40])
            n0 = state(pg)["n"]
            pg.keyboard.press("Delete")
            pg.wait_for_timeout(200)
            ck("กด Del ระหว่างดูภาพใหญ่ ไม่ลบหน้าข้างหลัง", state(pg)["n"] == n0)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(300)
            ck("Esc ปิดหน้าดูเต็มจอ", pg.locator("[role=dialog]").count() == 0)
            ctx.close()
            # มือถือ บีบนิ้วซูม
            mctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
            mp = mctx.new_page()
            open_tool(mp, [A])
            card(mp, 0).tap()
            mp.wait_for_timeout(300)
            zb = [b for b in card(mp, 0).locator(".tools button").all() if "ใหญ่" in (b.get_attribute("aria-label") or "")]
            ck("มือถือ แตะเลือกการ์ดแล้วเห็นปุ่มแว่นขยาย", bool(zb) and zb[0].is_visible())
            zb[0].tap()
            mp.wait_for_selector("[role=dialog]", timeout=5000)
            mp.wait_for_timeout(500)
            p0 = int(mp.locator(".pz-pct").inner_text().rstrip('%'))
            cdp = mctx.new_cdp_session(mp)
            cx, cy = 195, 420
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cx - 30, "y": cy, "id": 1}, {"x": cx + 30, "y": cy, "id": 2}]})
            for k in range(1, 11):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [
                    {"x": cx - 30 - 8 * k, "y": cy, "id": 1}, {"x": cx + 30 + 8 * k, "y": cy, "id": 2}]})
                mp.wait_for_timeout(25)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            mp.wait_for_timeout(400)
            p1 = int(mp.locator(".pz-pct").inner_text().rstrip('%'))
            ck("มือถือ บีบนิ้วแล้วซูมเข้า", p1 > p0 * 1.5, f"{p0}% -> {p1}%")
            mctx.close()
        section("⑥ ดูหน้าใหญ่ ภาพลอย แว่นขยาย ซูมคม", s6)

        ck("ไม่มี error หลุดออกมาจากหน้าเว็บ", not errs, str(errs[:3]))
        br.close()

    print(f"\nผ่าน {ok} , ตก {fail}")
    for r in reds:
        print("   ❌", r)
    sys.exit(1 if fail else 0)


main()
