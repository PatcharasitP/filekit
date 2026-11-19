#!/usr/bin/env python3
"""จัดการหน้า PDF: แก้ไขบนหน้าในตัวดูหน้าใหญ่ ปิดทับ ข้อความ ไฮไลต์ ลายเซ็น รูป โดยไม่ออกจากเครื่องมือ

ที่มา 19/11/2026 พี่ปอนด์: "ไม่อยากให้เราลิงก์ไปเครื่องมืออื่นเลย อยากทำให้มันแก้ไขได้ตั้งแต่หน้านี้เลย ... ครบจบในเครื่องมือเดียว"
แผน .claude/plans/2026-11-18-merge-edit-into-pages.md เฟส 2 (ข้อ 2.0 แก้ในตัวดูหน้าใหญ่)
ของเดิม v244 ปุ่ม แก้ข้อความบนหน้า พาไปอีกเครื่องมือ พาไปได้แค่ไฟล์ต้นฉบับ งานที่จัดไว้หายหมด

ทุกข้ออ่านไฟล์ผลลัพธ์จริงด้วย PyMuPDF ไม่เชื่อหน้าจอ ตำแหน่งวัดจากภาพที่ PyMuPDF วาดหน้า (คิด /Rotate กับ CropBox เอง)
  ①  กดปุ่ม แก้ข้อความบนหน้า แล้วตัวดูเปิดพร้อมแผงแก้ไข ไม่ออกจากเครื่องมือ
  ②  ของตามหน้า: วางบนหน้า 2 เปลี่ยนหน้าในตัวดูแล้ววางบนหน้า 3 ลบหน้า 1 แล้วของตามหน้าเดิมไป และการ์ดเห็นของที่วาง
  ③  หมุนหลังวาง: ของหมุนตามกระดาษ กึ่งกลางคลาดไม่เกิน 0.5%
  ④  วางบนหน้าที่หมุนแล้ว: ของตั้งตรงตามที่เห็นตอนวาง กึ่งกลางคลาดไม่เกิน 0.5%
  ⑤⑥ ครอบหลังวาง: กรอบครอบต้องคลุมของที่วาง ทั้งโหมดหน้าเท่ากันและพอดีเนื้อหา ตำแหน่งตรงกับที่คิดจากกรอบครอบ ไม่เกิน 0.5%
  ⑦  คีย์: Delete บนของที่วาง ลบของ ไม่ลบหน้า , Ctrl+Z ย้อนของที่วาง , Esc ปิดตัวดู ไม่ออกจากเครื่องมือ
  ⑧  คลิกทับของเดิมวางชิ้นใหม่ได้
  ⑨  หลายไฟล์: วางบนหน้าของไฟล์ B แล้วสลับไฟล์ทีละหน้า ของยังอยู่กับหน้าเดิมของ B
  ⑩  หน้าว่าง: วางข้อความบนหน้าว่างได้
  ⑪  มือถือ 390: ตัวดูกางแผงแล้วยังเห็นหน้ากระดาษพอใช้ และปุ่มแก้ไขบนหน้าอยู่ในจอ
  ⑫  รีเซ็ตทั้งหมด หรือเอาไฟล์ออก ตอนมีของที่วาง ต้องถามก่อน ตอบไม่ = ของยังอยู่
  ⑬  ครบ 5 เครื่องมือบนหน้าเดียว ปิดทับ ไฮไลต์ ข้อความ ลายเซ็นที่วาดบนกระดาน รูป แล้วไฟล์มีครบ

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_edit.py [--shots <โฟลเดอร์>]
"""
import os
import re
import sys
import tempfile
import traceback
from pathlib import Path

import fitz
from PIL import Image

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
TOL = 0.005
ok = fail = 0
measures = []


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def color_box(page, want, zoom=2):
    """กึ่งกลางและกรอบของพิกเซลสีที่ต้องการ (r แดง b น้ำเงิน) เป็นสัดส่วนของหน้าที่เห็น ไม่เจอคืน None"""
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    px = img.load()
    sx = sy = n = 0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for y in range(0, pix.height, 2):
        for x in range(0, pix.width, 2):
            r, g, b = px[x, y]
            hit = (r > 200 and g < 70 and b < 70) if want == "r" else (b > 200 and r < 70 and g < 70)
            if hit:
                sx += x; sy += y; n += 1
                x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    if not n:
        return None
    W, H = pix.width, pix.height
    return {"c": ((sx / n + 0.5) / W, (sy / n + 0.5) / H), "box": (x0 / W, y0 / H, (x1 + 2) / W, (y1 + 2) / H)}


def make_files(tmp):
    a = tmp / "a.pdf"
    d = fitz.open()
    for i in range(4):
        p = d.new_page(width=595, height=842)
        p.insert_text((80, 100), f"Page {i + 1}", fontsize=20)
    p = d.new_page(width=595, height=842)                       # หน้า 5 สแกนครึ่งบน ครอบได้
    p.draw_rect(fitz.Rect(40, 40, 555, 400), color=(0, 0, 0), width=1)
    p.insert_text((60, 80), "Page 5 short scan", fontsize=20)
    d.save(a)
    d.close()
    b = tmp / "b.pdf"
    d = fitz.open()
    for i in range(2):
        d.new_page(width=595, height=842).insert_text((80, 100), f"Bfile {i + 1}", fontsize=20)
    d.save(b)
    d.close()
    red = tmp / "red.png"
    Image.new("RGB", (80, 40), (255, 0, 0)).save(red)
    return a, b, red


def page_with(doc, text):
    for i, p in enumerate(doc):
        if text in p.get_text():
            return i
    return -1


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_ppedit_"))
    A, B, RED = make_files(tmp)
    n_save = [0]

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        dialogs = []

        def on_dialog(dg):
            dialogs.append(dg.message)
            dg.dismiss()
        pg.on("dialog", on_dialog)

        def fresh(files):
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2200)
            pg.set_input_files("input[type=file]", [str(f) for f in files])
            pg.wait_for_selector(".pg", timeout=60000)
            pg.wait_for_timeout(1800)

        bar = lambda: pg.locator(".s2-tbar button:visible, .s2-canvas button:visible")

        def pick(i):
            """เลือกการ์ดเดียว (คลิกการ์ดที่เลือกอยู่แล้ว = ยกเลิกเลือก จึงคลิกเฉพาะตอนยังไม่ได้เลือก)"""
            if pg.locator(".pg.selected").count() == 1 and "selected" in (pg.locator(".pg").nth(i).get_attribute("class") or ""):
                return
            pg.locator(".pg").nth(i).click()
            pg.wait_for_timeout(300)

        def open_edit(card_i=None):
            if card_i is not None:
                pick(card_i)
            bar().filter(has_text="แก้ข้อความบนหน้า").first.click()
            pg.wait_for_selector(".pz.editing", timeout=8000)
            pg.wait_for_timeout(1200)

        def paper_at(fx, fy):
            r = pg.locator(".pz-paper").bounding_box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def stamp_at(fx, fy):
            # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
            pg.click(".pz-edit button[data-mode=sign]")
            if not pg.evaluate("() => !!document.querySelector('.pz-edit .pe-saved figure.on')"):
                pg.locator(".pz-edit input[type=file]").last.set_input_files(str(RED))
                pg.wait_for_timeout(700)
            pg.mouse.click(*paper_at(fx, fy))
            pg.wait_for_timeout(300)

        def close_viewer():
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(1000)

        def save(name):
            out = tmp / name
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible, .ws-footer button").filter(has_text="บันทึก").first.click()
                pg.wait_for_timeout(2500)
                pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
            dl.value.save_as(str(out))
            return fitz.open(str(out))

        def section(name, fn):
            print(f"\n── {name}")
            try:
                fn()
            except Exception as e:
                ck(False, f"{name}: ทำจนจบไม่ได้", f"{type(e).__name__}: {str(e).splitlines()[0][:160]}")
                if os.environ.get("FK_TRACE"):
                    traceback.print_exc()

        # ① ปุ่มเปิดตัวดูพร้อมแผงแก้ไข ไม่ออกจากเครื่องมือ
        def s1():
            fresh([A])
            n0 = pg.locator(".pg").count()
            bar().filter(has_text="แก้ข้อความบนหน้า").first.click()
            pg.wait_for_timeout(2500)
            h = pg.evaluate("location.hash")
            ck(h.lstrip("#/").startswith("pdf-pages"), f"① กดปุ่มแล้วยังอยู่ในเครื่องมือจัดการหน้า (hash {h})", h)
            ck(pg.locator(".pz.editing .pz-edit").count() == 1, "① ตัวดูหน้าใหญ่เปิดพร้อมแผงแก้ไข")
            # รอบ 6 (19/11/2026) ลายเซ็นกับรูปรวมเป็นปุ่มเดียว เหลือ 4 ปุ่ม
            ck(pg.locator(".pz-edit button[data-mode]").count() == 4, "① แผงมีเครื่องมือครบ 4 อย่าง ปิดทับ ข้อความ ไฮไลต์ ลายเซ็นและรูป",
               str(pg.locator(".pz-edit button[data-mode]").count()))
            ck(pg.locator(".pg").count() == n0, "① การ์ดหน้ายังครบเท่าเดิม")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "viewer_edit_1440.png"))
        section("① เปิดแก้ไขในหน้าเดิม", s1)

        # ② ของตามหน้า
        def s2():
            fresh([A])
            open_edit(1)
            stamp_at(0.5, 0.5)
            pg.locator(".pz-bar button[aria-label^='หน้าถัดไป']").click()      # เปลี่ยนหน้าในตัวดูแล้ววางต่อ
            pg.wait_for_timeout(1500)
            ck("หน้า 3" in pg.locator(".pz-title").inner_text(), "② กดหน้าถัดไปในตัวดู ไปหน้า 3 แผงแก้ไขยังกางอยู่",
               pg.locator(".pz-title").inner_text())
            ck(pg.locator(".pz .pe-box").count() == 0, "② หน้าใหม่ในตัวดูไม่มีของของหน้าก่อนติดมา")
            stamp_at(0.3, 0.6)
            close_viewer()
            ck(pg.evaluate("location.hash").lstrip("#/").startswith("pdf-pages"), "② Esc ปิดตัวดูแล้วยังอยู่ในเครื่องมือ")
            red = pg.evaluate("""() => { const im = document.querySelectorAll('.pg')[1].querySelector('img');
              const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
              const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
              let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] < 80 && d[i+2] < 80) n++; return n; }""")
            ck(red > 20, f"② ปิดตัวดูแล้วการ์ดหน้า 2 เห็นของที่วาง (พิกเซลแดง {red})", str(red))
            pick(0)
            pg.keyboard.press("Delete"); pg.wait_for_timeout(600)
            doc = save("follow.pdf")
            i2 = page_with(doc, "Page 2")
            imgs = [len(p.get_images()) for p in doc]
            ck(doc.page_count == 4 and i2 == 0 and imgs[:2] == [1, 1] and sum(imgs) == 2,
               f"② ลบหน้า 1 แล้ว ของอยู่กับหน้า 2 และ 3 เดิม ซึ่งกลายเป็นหน้า 1 และ 2 (ภาพต่อหน้า {imgs})", f"{doc.page_count} {i2} {imgs}")
            f3 = color_box(doc[page_with(doc, "Page 3")], "r")
            ck(f3 is not None and abs(f3["c"][0] - 0.3) <= TOL and abs(f3["c"][1] - 0.6) <= TOL,
               "② ของที่วางหลังเปลี่ยนหน้า อยู่ตรงจุดคลิกบนหน้า 3", str(f3 and f3["c"]))
        section("② ของตามหน้า", s2)

        # ③ หมุนหลังวาง
        def s3():
            fresh([A])
            open_edit(2)
            stamp_at(0.25, 0.2)
            close_viewer()
            pick(2)
            pg.keyboard.press("]"); pg.wait_for_timeout(600)
            doc = save("rot_after.pdf")
            f = color_box(doc[page_with(doc, "Page 3")], "r")
            want = (1 - 0.2, 0.25)          # หมุนตามเข็ม 90: (u, v) -> (1 - v, u)
            if not f:
                return ck(False, "③ เห็นของที่วางในหน้าที่หมุน", "ไม่เจอ")
            dx, dy = f["c"][0] - want[0], f["c"][1] - want[1]
            measures.append(("③ หมุนหลังวาง", dx, dy))
            ck(abs(dx) <= TOL and abs(dy) <= TOL, f"③ หมุนหน้าหลังวาง ของหมุนตามกระดาษ คลาด ({dx:+.4f}, {dy:+.4f})", f"{f['c']} ควรได้ {want}")
            bx = f["box"]
            ck((bx[3] - bx[1]) > (bx[2] - bx[0]), "③ รูปแนวนอนกลายเป็นแนวตั้งตามกระดาษที่หมุน")
        section("③ หมุนหลังวาง", s3)

        # ④ วางบนหน้าที่หมุนแล้ว
        def s4():
            fresh([A])
            pick(3)
            pg.keyboard.press("]"); pg.wait_for_timeout(600)
            open_edit()
            stamp_at(0.7, 0.7)
            pg.click(".pz-edit button[data-mode=text]")
            pg.fill(".pz-edit input[type=text]", "TEST")
            pg.evaluate("""() => { const c = [...document.querySelectorAll('.pz-edit input[type=color]')].find((n) => n.offsetParent);
              c.value = '#0000ff'; c.dispatchEvent(new Event('input', {bubbles: true})); c.dispatchEvent(new Event('change', {bubbles: true})); }""")
            pg.select_option(".pz-edit select >> nth=0", "28")
            pg.mouse.click(*paper_at(0.3, 0.4)); pg.wait_for_timeout(300)
            close_viewer()
            doc = save("rot_before.pdf")
            p = doc[page_with(doc, "Page 4")]
            f = color_box(p, "r")
            if not f:
                return ck(False, "④ เห็นรูปที่วางบนหน้าที่หมุน", "ไม่เจอ")
            dx, dy = f["c"][0] - 0.7, f["c"][1] - 0.7
            measures.append(("④ วางบนหน้าหมุน รูป", dx, dy))
            ck(abs(dx) <= TOL and abs(dy) <= TOL, f"④ รูปบนหน้าที่หมุนอยู่ตรงจุดคลิก คลาด ({dx:+.4f}, {dy:+.4f})", str(f["c"]))
            bx = f["box"]
            ck((bx[2] - bx[0]) > (bx[3] - bx[1]), "④ รูปตั้งตรงตามที่เห็น (กว้างมากกว่าสูง)", str(bx))
            t = color_box(p, "b")
            if not t:
                return ck(False, "④ เห็นข้อความบนหน้าที่หมุน", "ไม่เจอ")
            tb = t["box"]
            mid = (tb[1] + tb[3]) / 2
            measures.append(("④ วางบนหน้าหมุน ข้อความ (ขอบซ้าย, กึ่งกลางสูง)", tb[0] - 0.3, mid - 0.4))
            ck((tb[2] - tb[0]) > (tb[3] - tb[1]), "④ ข้อความตั้งตรง อ่านจากซ้ายไปขวา", str(tb))
            ck(abs(tb[0] - 0.3) <= 0.012 and abs(mid - 0.4) <= TOL,
               f"④ ข้อความเริ่มที่จุดคลิก ขอบซ้ายคลาด {tb[0] - 0.3:+.4f} กึ่งกลางสูงคลาด {mid - 0.4:+.4f}", str(tb))
        section("④ วางบนหน้าที่หมุนแล้ว", s4)

        # ⑤⑥ ครอบหลังวาง
        def s5():
            fresh([A])
            open_edit(4)
            stamp_at(0.5, 0.85)
            close_viewer()
            pick(4)
            bar().filter(has_text="ครอบขอบขาว").first.click(); pg.wait_for_timeout(2500)
            style = pg.evaluate("() => (document.querySelectorAll('.pg')[4].querySelector('.pg-crop img') || {}).getAttribute?.('style') || ''")
            num = lambda k: float(re.search(rf"(?:^|;)\s*{k}:\s*(-?[\d.e+-]+)%", style).group(1))
            c = {"w": 100 / num("width"), "h": 100 / num("height")}
            c["x"] = -num("inset-inline-start") / 100 * c["w"]; c["y"] = -num("top") / 100 * c["h"]
            ck(c["y"] + c["h"] >= 0.86, f"⑤ กรอบครอบคลุมรูปที่วางในที่ว่างท้ายหน้า (ขอบล่างครอบ {c['y'] + c['h']:.3f})", str(c))
            doc = save("crop_after.pdf")
            f = color_box(doc[page_with(doc, "Page 5")], "r")
            ck(f is not None, "⑤ ไฟล์ผลลัพธ์ยังมีรูปที่วาง ไม่โดนตัดหาย")
            if not f:
                return
            k = min(1 / c["w"], 1 / c["h"])
            ox, oy = (1 - c["w"] * k) / 2, (1 - c["h"] * k) / 2
            want = (ox + (0.5 - c["x"]) * k, oy + (0.85 - c["y"]) * k)
            dx, dy = f["c"][0] - want[0], f["c"][1] - want[1]
            measures.append(("⑥ ครอบหน้าเท่ากัน", dx, dy))
            ck(abs(dx) <= TOL and abs(dy) <= TOL, f"⑥ โหมดหน้าเท่ากัน รูปอยู่ตรงตำแหน่งที่คิดจากกรอบครอบ คลาด ({dx:+.4f}, {dy:+.4f})", f"{f['c']} ควรได้ {want}")
            # โหมดตัดหน้าให้พอดีเนื้อหา (ปุ่มอยู่ในแผงตัวเลือก กดผ่านสคริปต์ไม่ต้องกางแผง) หน้าที่เลือกอยู่ใช้โหมดนี้
            # หลังบันทึกหน้าอยู่ในสภาพผลลัพธ์ จึงเริ่มใหม่แล้วทำซ้ำ ตำแหน่งที่วางกับกรอบครอบออกมาเท่าเดิม
            fresh([A])
            open_edit(4)
            stamp_at(0.5, 0.85)
            close_viewer()
            pick(4)
            bar().filter(has_text="ครอบขอบขาว").first.click(); pg.wait_for_timeout(2500)
            pg.evaluate("() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ตัดหน้าให้พอดีเนื้อหา').click()")
            pg.wait_for_timeout(500)
            doc = save("crop_tight.pdf")
            f = color_box(doc[page_with(doc, "Page 5")], "r")
            ck(f is not None, "⑤ โหมดพอดีเนื้อหา ไฟล์ยังมีรูปที่วาง ไม่โดนตัดหาย")
            if not f:
                return
            want = ((0.5 - c["x"]) / c["w"], (0.85 - c["y"]) / c["h"])
            dx, dy = f["c"][0] - want[0], f["c"][1] - want[1]
            measures.append(("⑥ ครอบพอดีเนื้อหา", dx, dy))
            ck(abs(dx) <= TOL and abs(dy) <= TOL, f"⑥ โหมดพอดีเนื้อหา รูปอยู่ตรงตำแหน่ง คลาด ({dx:+.4f}, {dy:+.4f})", f"{f['c']} ควรได้ {want}")
        section("⑤⑥ ครอบหลังวาง", s5)

        # ⑦⑧ คีย์ และคลิกทับ
        def s7():
            fresh([A])
            n0 = pg.locator(".pg").count()
            open_edit(0)
            pg.click(".pz-edit button[data-mode=cover]")
            x0, y0 = paper_at(0.3, 0.3); x1, y1 = paper_at(0.6, 0.36)
            pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
            ck(pg.locator(".pz .pe-box.cover").count() == 1, "⑦ ลากคลุมในตัวดูได้กล่องปิดทับ 1 กล่อง (ไม่กลายเป็นการเลื่อนภาพ)",
               str(pg.locator(".pz .pe-box.cover").count()))
            pg.click(".pz-edit button[data-mode=text]")
            pg.fill(".pz-edit input[type=text]", "2569")
            pg.mouse.click(*paper_at(0.45, 0.33)); pg.wait_for_timeout(300)
            ck(pg.locator(".pz .pe-box.text").count() == 1, "⑧ คลิกทับกล่องปิดทับ วางข้อความใหม่ได้")
            pg.evaluate("() => document.querySelector('.pz .pe-box.cover').focus()")
            pg.keyboard.press("Delete"); pg.wait_for_timeout(300)
            ck(pg.locator(".pz .pe-box.cover").count() == 0 and pg.locator(".pz .pe-box.text").count() == 1,
               "⑦ Delete บนกล่องปิดทับ ลบกล่องนั้นอย่างเดียว")
            pg.evaluate("() => document.activeElement && document.activeElement.blur()")
            pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
            ck(pg.locator(".pz .pe-box").count() == 0, "⑦ Ctrl+Z ในตัวดู ย้อนข้อความที่วางล่าสุด",
               str(pg.locator(".pz .pe-box").count()))
            close_viewer()
            ck(pg.locator(".pz").count() == 0, "⑦ Esc ปิดตัวดู")
            ck(pg.locator(".pg").count() == n0 and pg.locator(".pg.dropped").count() == 0,
               "⑦ Delete ในตัวดูไม่ลบหน้า", f"{pg.locator('.pg').count()} dropped {pg.locator('.pg.dropped').count()}")
            ck(pg.evaluate("location.hash").lstrip("#/").startswith("pdf-pages"), "⑦ Esc ไม่พาออกจากเครื่องมือ")
        section("⑦⑧ คีย์และคลิกทับ", s7)

        # ⑨ หลายไฟล์
        def s9():
            fresh([A, B])
            n = pg.locator(".pg").count()
            open_edit(5)                         # หน้าแรกของไฟล์ B
            stamp_at(0.5, 0.3)
            close_viewer()
            bar().filter(has_text="สลับไฟล์ทีละหน้า").first.click() if bar().filter(has_text="สลับไฟล์ทีละหน้า").count() else \
                pg.locator("button:visible").filter(has_text="สลับไฟล์ทีละหน้า").first.click()
            pg.wait_for_timeout(600)
            doc = save("multi.pdf")
            ib = page_with(doc, "Bfile 1")
            imgs = [len(p.get_images()) for p in doc]
            ck(doc.page_count == n and ib == 1 and imgs[ib] == 1 and sum(imgs) == 1,
               f"⑨ สลับไฟล์ทีละหน้าแล้ว ของยังอยู่กับหน้าแรกของไฟล์ B (อยู่หน้า {ib + 1} ภาพต่อหน้า {imgs})", f"{ib} {imgs}")
        section("⑨ หลายไฟล์", s9)

        # ⑩ หน้าว่าง
        def s10():
            fresh([A])
            bar().filter(has_text="หน้าว่าง").first.click(); pg.wait_for_timeout(600)
            open_edit()
            pg.click(".pz-edit button[data-mode=text]")
            pg.fill(".pz-edit input[type=text]", "NOTE")
            pg.mouse.click(*paper_at(0.3, 0.3)); pg.wait_for_timeout(300)
            close_viewer()
            doc = save("blank.pdf")
            last = doc[doc.page_count - 1]
            ck(doc.page_count == 6 and len(last.get_images()) == 1 and not last.get_text().strip(),
               "⑩ หน้าว่างที่เพิ่มมีข้อความที่วาง", f"{doc.page_count} {len(last.get_images())}")
        section("⑩ หน้าว่าง", s10)

        # ⑬ ครบ 5 เครื่องมือบนหน้าเดียว ปิดทับ ไฮไลต์ ข้อความ ลายเซ็น (วาดบนกระดาน) รูป
        def s13():
            fresh([A])
            open_edit(0)

            def drag(mode, a, b):
                pg.click(f".pz-edit button[data-mode={mode}]")
                x0, y0 = paper_at(*a); x1, y1 = paper_at(*b)
                pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=6); pg.mouse.up()
                pg.wait_for_timeout(300)
            drag("highlight", (0.2, 0.5), (0.5, 0.53))
            drag("cover", (0.2, 0.6), (0.5, 0.63))
            pg.click(".pz-edit button[data-mode=text]")
            pg.fill(".pz-edit input[type=text]", "OK")
            pg.mouse.click(*paper_at(0.2, 0.2)); pg.wait_for_timeout(300)
            pg.click(".pz-edit button[data-mode=sign]")
            cv = pg.locator(".pz-edit canvas.sign-canvas").bounding_box()
            pg.mouse.move(cv["x"] + 20, cv["y"] + cv["height"] / 2); pg.mouse.down()
            for k in range(1, 9):
                pg.mouse.move(cv["x"] + 20 + k * 25, cv["y"] + cv["height"] / 2 + (15 if k % 2 else -15), steps=3)
            pg.mouse.up(); pg.wait_for_timeout(200)
            pg.locator(".pz-edit button").filter(has_text="ใช้ลายเซ็นนี้").first.click(); pg.wait_for_timeout(500)
            pg.mouse.click(*paper_at(0.7, 0.8)); pg.wait_for_timeout(300)
            stamp_at(0.7, 0.3)
            kinds = pg.evaluate("() => [...document.querySelectorAll('.pz .pe-box')].map((b) => b.className.replace('pe-box ', '')).sort().join(',')")
            ck(kinds == "cover,highlight,stamp,stamp,text", f"⑬ บนจอมีของครบ 5 อย่าง ({kinds})", kinds)
            close_viewer()
            doc = save("five.pdf")
            p = doc[page_with(doc, "Page 1")]
            fills = [tuple(round(c, 2) for c in d["fill"]) for d in p.get_drawings() if d.get("fill")]
            ck(any(abs(f[0] - 1) < .02 and abs(f[1] - .88) < .02 and abs(f[2] - .3) < .02 for f in fills),
               f"⑬ ไฟล์มีแถบไฮไลต์สีเหลือง ({fills})", str(fills))
            ck(any(f == (1.0, 1.0, 1.0) for f in fills), "⑬ ไฟล์มีกล่องปิดทับสีขาว", str(fills))
            ck(len(p.get_images()) == 3, f"⑬ ไฟล์มีภาพ 3 ชิ้น ข้อความ ลายเซ็น รูป ({len(p.get_images())})", str(len(p.get_images())))
        section("⑬ ครบ 5 เครื่องมือ", s13)

        # ⑫ รีเซ็ตต้องถามก่อน
        def s12():
            fresh([A])
            open_edit(0)
            stamp_at(0.5, 0.5)
            close_viewer()
            dialogs.clear()
            bar().filter(has_text="รีเซ็ตทั้งหมด").first.click(); pg.wait_for_timeout(1500)
            ck(len(dialogs) == 1, f"⑫ มีของที่วางแล้วกดรีเซ็ต ถามก่อน ({dialogs[:1]})", str(dialogs))
            # เอาไฟล์ออกจากรายการก็ล้างของที่วางทั้งหมดเหมือนกัน (จนกว่าแผนเฟส 3 ข้อ 3) ต้องถามก่อน ตอบไม่ ไฟล์ยังอยู่
            dialogs.clear()
            pg.locator("button[aria-label^='เอา '][aria-label$=' ออก']").first.click(); pg.wait_for_timeout(1200)
            ck(len(dialogs) == 1 and pg.locator(".pg").count() == 5, f"⑫ เอาไฟล์ออกตอนมีของที่วาง ถามก่อน ตอบไม่ ไฟล์และหน้ายังอยู่ ({dialogs[:1]})",
               f"{dialogs} {pg.locator('.pg').count()}")
            doc = save("reset_no.pdf")
            ck(len(doc[0].get_images()) == 1, "⑫ ตอบไม่ ของที่วางยังอยู่")
        section("⑫ รีเซ็ตถามก่อน", s12)

        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

        # ⑪ มือถือ 390
        def s11():
            b2 = pw.chromium.launch()
            m = b2.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = m.new_page()
            mp.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            mp.wait_for_timeout(2200)
            mp.set_input_files("input[type=file]", [str(A)])
            mp.wait_for_selector(".pg", timeout=60000)
            mp.wait_for_timeout(1800)
            btn = mp.locator(".s2-tbar button").filter(has_text="แก้ข้อความบนหน้า").first
            btn.scroll_into_view_if_needed()
            btn.click()
            mp.wait_for_selector(".pz.editing", timeout=8000)
            mp.wait_for_timeout(1500)
            st = mp.locator(".pz-stage").bounding_box()
            eb = mp.locator(".pz-editbtn").bounding_box()
            pe = mp.locator(".pz-edit").bounding_box()
            ck(st["height"] >= 844 * 0.40, f"⑪ มือถือ กางแผงแล้วเวทีภาพสูง {st['height']:.0f}px ({st['height'] / 844:.0%} ของจอ)", str(st))
            ck(eb and eb["x"] >= 0 and eb["x"] + eb["width"] <= 390, "⑪ ปุ่มแก้ไขบนหน้าอยู่ในจอ", str(eb))
            ck(pe and pe["y"] >= st["y"] + st["height"] - 2, "⑪ แผงเครื่องมืออยู่ใต้ภาพ ไม่บังหน้ากระดาษ", f"{pe} {st}")
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "viewer_edit_390.png"))
            b2.close()
        section("⑪ มือถือ", s11)

    if measures:
        print("\n      ค่าคลาดกึ่งกลาง (สัดส่วนของหน้า)")
        for name, dx, dy in measures:
            print(f"      {name}: ({dx:+.4f}, {dy:+.4f})")
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
