#!/usr/bin/env python3
"""ตัวแก้ไขบนหน้า รอบ 4 (19/11/2026) ตามที่พี่ปอนด์ลองบนเว็บจริงแล้วติ (images/44.png ถึง 51.png)

  ①  ไม่มีแถบภาพย่อบนสุดของแผง ("มันไม่ค่อยสวย แปลก ๆ")
  ②  ช่องสีแสดงรหัสสีตัวพิมพ์ใหญ่ ไม่มีชื่อสี ("ไม่เอาคำว่าขาว เอาเป็นรหัสสีมาเลย")
  ③  ทุกเครื่องมือลากกรอบ ("แบบคลุมมาวาง จะได้แพทเทิร์นเดียวกัน")
      ข้อความ: ลากกรอบแล้วพิมพ์ในกรอบบนหน้าได้เลย ไม่ต้องพิมพ์ในแผง ดับเบิลคลิกแก้ซ้ำ
      ลายเซ็นกับรูป: ลากกรอบแล้วภาพพอดีกรอบรักษาสัดส่วน ในไฟล์ที่บันทึก , คลิกเฉย ๆ ยังวางขนาดปกติ
  ④  จุดจับเป็นวงกลมพื้นขาวที่ 4 มุม ทั้งตัวดูและหน้าแก้ไขและเซ็น
  ⑤  คลิกเลือกไฮไลต์แล้วเปลี่ยนสีกับความเข้ม ไฟล์ได้ค่าใหม่ , เลือกรูปแล้วปรับความทึบ ไฟล์ได้ค่าใหม่
  ⑥  ไฮไลต์บนจอหน้าตาเหมือนในไฟล์ ตัวหนังสือใต้แถบยังเห็นทั้งสองที่ และสีพื้นแถบต่างกันไม่เกิน 12 ต่อช่องสี
      (พี่ปอนด์: "ตอนทำก็ไม่ควรเห็นเป็นทึบ ๆ คนใช้งงนะ" บนจอเหลืองทึบ ในไฟล์โปร่ง)
  ภาพจอ คอม 1440 และมือถือ 390 ตอนเลือกของ และตอนลากกรอบ

ไฟล์ผลลัพธ์อ่านด้วย PyMuPDF (เรนเดอร์และอ่านค่าวาด)
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_edit_r4.py [--shots <โฟลเดอร์>]
"""
import io
import os
import sys
import tempfile
import traceback
from pathlib import Path

import fitz
from PIL import Image

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
ok = fail = 0
notes = []


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def make_files(tmp):
    a = tmp / "a.pdf"
    d = fitz.open()
    for i in range(3):
        p = d.new_page(width=595, height=842)
        p.insert_text((80, 100), f"Page {i + 1}", fontsize=20)
        # แถวตัวหนังสือดำหนา ๆ ไว้ทดสอบไฮไลต์ทับ (y 250 ถึง 290 พอยต์)
        p.insert_text((60, 280), "MMMMMMMMMMMMMMMM", fontsize=40, color=(0, 0, 0))
    d.save(a)
    d.close()
    red = tmp / "red.png"
    Image.new("RGB", (80, 40), (255, 0, 0)).save(red)       # กว้าง 2 เท่าของสูง
    return a, red


def render_png(page, zoom=2):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def color_bbox(im, test):
    px = im.load()
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    n = 0
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            if test(px[x, y]):
                n += 1
                x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    if not n:
        return None
    W, H = im.width, im.height
    return (x0 / W, y0 / H, (x1 + 2) / W, (y1 + 2) / H)


def region_stats(im, fx0, fy0, fx1, fy1):
    """ในกรอบสัดส่วน: ค่ามืดสุด (มีตัวหนังสือใต้แถบไหม) และสีพื้นแถบ (ค่ากลางของพิกเซลที่สว่าง)"""
    px = im.load()
    W, H = im.size
    lums, light = [], []
    for y in range(int(fy0 * H), int(fy1 * H), 2):
        for x in range(int(fx0 * W), int(fx1 * W), 2):
            r, g, b = px[x, y]
            L = 0.299 * r + 0.587 * g + 0.114 * b
            lums.append(L)
            if L > 150:
                light.append((r, g, b))
    if not lums:
        return None, None
    light.sort(key=lambda c: c[0] + c[1] + c[2])
    bg = light[len(light) // 2] if light else None
    return min(lums), bg


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_ppedit4_"))
    A, RED = make_files(tmp)

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda dg: dg.dismiss())

        def fresh():
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2200)
            pg.set_input_files("input[type=file]", [str(A)])
            pg.wait_for_selector(".pg", timeout=60000)
            pg.wait_for_timeout(1500)

        def open_edit():
            pg.locator(".s2-tbar button:visible").filter(has_text="แก้ข้อความบนหน้า").first.click()
            pg.wait_for_selector(".pz.editing", timeout=8000)
            pg.wait_for_timeout(1200)

        def paper_at(fx, fy):
            r = pg.locator(".pz-paper").bounding_box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def drag(a, c, steps=8, hold=None):
            pg.mouse.move(*paper_at(*a)); pg.mouse.down()
            pg.mouse.move(*paper_at(*c), steps=steps)
            if hold:
                hold()
            pg.mouse.up(); pg.wait_for_timeout(350)

        def mode(m):
            pg.click(f".pz-edit button[data-mode={m}]"); pg.wait_for_timeout(250)

        def set_input(sel, value):
            pg.evaluate("""([sel, v]) => { const n = [...document.querySelectorAll(sel)].find((x) => x.offsetParent);
              n.value = v; n.dispatchEvent(new Event('input', {bubbles: true})); n.dispatchEvent(new Event('change', {bubbles: true})); }""",
                        [sel, value])
            pg.wait_for_timeout(300)

        def close_viewer():
            pg.keyboard.press("Escape"); pg.wait_for_timeout(900)

        def save(name):
            out = tmp / name
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible").filter(has_text="บันทึก").first.click()
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

        # ①② แผงไม่มีแถบภาพย่อ ช่องสีเป็นรหัสสี
        def s1():
            fresh(); open_edit(); mode("cover")
            ck(pg.locator(".pz-edit .pp-strip").count() == 0, "① แผงไม่มีแถบภาพย่อบนสุด")
            t = pg.evaluate("() => { const s = [...document.querySelectorAll('.pz-edit .pe-swatch')].find((n) => n.offsetParent); return s ? s.innerText.trim() : ''; }")
            ck(t == "#FFFFFF", f"② ช่องสีปิดทับแสดงรหัสสี #FFFFFF ({t})", t)
            ck("ขาว" not in t, "② ช่องสีไม่มีคำว่า ขาว")
        section("①② แผง", s1)

        # ③ ข้อความ: ลากกรอบแล้วพิมพ์บนหน้า ดับเบิลคลิกแก้
        def s3t():
            fresh(); open_edit(); mode("text")
            set_input(".pz-edit input[type=color]", "#0000ff")
            drag((0.15, 0.62), (0.55, 0.66))
            ed = pg.locator(".pz .pe-edit")
            ck(ed.count() == 1, "③ ลากกรอบด้วยเครื่องมือข้อความ ช่องพิมพ์โผล่บนหน้า ไม่ต้องพิมพ์ในแผงก่อน")
            pg.keyboard.type("HELLO 2569")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "typing_on_page_1440.png"))
            pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            texts = pg.evaluate("() => [...document.querySelectorAll('.pz .pe-box.text')].map((n) => n.firstChild && n.firstChild.textContent)")
            ck(texts == ["HELLO 2569"], f"③ กด Enter แล้วได้ข้อความบนหน้า ({texts})", str(texts))
            ck(pg.locator(".pz").count() == 1, "③ Enter ไม่ปิดตัวดู")
            pg.locator(".pz .pe-box.text").first.dblclick(); pg.wait_for_timeout(400)
            ck(pg.locator(".pz .pe-edit").count() == 1, "③ ดับเบิลคลิกข้อความ เปิดช่องพิมพ์แก้ในที่")
            pg.keyboard.press("End"); pg.keyboard.type("X"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            texts = pg.evaluate("() => [...document.querySelectorAll('.pz .pe-box.text')].map((n) => n.firstChild && n.firstChild.textContent)")
            ck(texts == ["HELLO 2569X"], f"③ แก้แล้วยังเป็นชิ้นเดียว ข้อความใหม่ ({texts})", str(texts))
            pg.locator(".pz .pe-box.text").first.dblclick(); pg.wait_for_timeout(300)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
            ck(pg.locator(".pz").count() == 1 and pg.locator(".pz .pe-box.text").count() == 1,
               "③ Esc ในช่องพิมพ์ ยกเลิกการแก้ ไม่ปิดตัวดู ข้อความเดิมยังอยู่")
            close_viewer()
            doc = save("text_box.pdf")
            p = doc[0]
            bb = color_bbox(render_png(p), lambda c: c[2] > 150 and c[0] < 90 and c[1] < 90)
            ck(len(p.get_images()) == 1 and bb is not None, "③ ไฟล์มีข้อความที่พิมพ์บนหน้า")
            if bb:
                left, mid = bb[0], (bb[1] + bb[3]) / 2
                notes.append(f"ข้อความจากกรอบ ขอบซ้าย {left:.4f} (กรอบ 0.15) กึ่งกลางสูง {mid:.4f} (กรอบ 0.64)")
                ck(abs(left - 0.15) <= 0.012 and abs(mid - 0.64) <= 0.006,
                   f"③ ข้อความในไฟล์เริ่มที่ขอบซ้ายกรอบ และอยู่กลางกรอบแนวสูง ({left:.4f}, {mid:.4f})", str(bb))
        section("③ ข้อความลากกรอบ", s3t)

        # ③ รูป: ลากกรอบแล้วพอดีกรอบ , คลิกเฉย ๆ ขนาดปกติ
        def s3s():
            fresh(); open_edit(); mode("sign")  # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
            pg.locator(".pz-edit input[type=file]").last.set_input_files(str(RED)); pg.wait_for_timeout(700)
            # กรอบกว้าง 0.40 สูง 0.10 ของหน้า (238 x 84 พอยต์) รูปกว้างเป็น 2 เท่าของสูง ต้องได้สูงเต็ม 84 กว้าง 168
            hold = (lambda: pg.screenshot(path=str(SHOTS / "dragging_box_1440.png"))) if SHOTS else None
            drag((0.30, 0.45), (0.70, 0.55), hold=hold)
            ck(pg.locator(".pz .pe-box.stamp").count() == 1, "③ ลากกรอบด้วยเครื่องมือรูป ได้รูป 1 ชิ้น")
            pg.mouse.click(*paper_at(0.25, 0.85)); pg.wait_for_timeout(400)
            ck(pg.locator(".pz .pe-box.stamp").count() == 2, "③ คลิกเฉย ๆ ยังวางรูปขนาดปกติได้")
            close_viewer()
            doc = save("stamp_box.pdf")
            infos = sorted(doc[0].get_image_info(), key=lambda i: i["bbox"][1])
            W, H = doc[0].rect.width, doc[0].rect.height
            if len(infos) != 2:
                return ck(False, "③ ไฟล์มีรูป 2 ชิ้น", str(len(infos)))
            x0, y0, x1, y1 = infos[0]["bbox"]
            cx, cy = (x0 + x1) / 2 / W, (y0 + y1) / 2 / H
            notes.append(f"รูปจากกรอบ กว้าง {x1 - x0:.1f} สูง {y1 - y0:.1f} พอยต์ (ควรได้ 168.4 x 84.2) กึ่งกลาง ({cx:.4f}, {cy:.4f}) (ควร 0.5, 0.5)")
            ck(abs((y1 - y0) - 0.10 * H) <= 3 and abs((x1 - x0) - 2 * 0.10 * H) <= 5,
               f"③ ในไฟล์รูปพอดีกรอบรักษาสัดส่วน สูง {y1 - y0:.1f} กว้าง {x1 - x0:.1f} พอยต์", f"{infos[0]['bbox']}")
            ck(abs(cx - 0.5) <= 0.005 and abs(cy - 0.5) <= 0.005, f"③ รูปอยู่กึ่งกลางกรอบ ({cx:.4f}, {cy:.4f})")
            w2 = infos[1]["bbox"][2] - infos[1]["bbox"][0]
            # รอบ 5 ค่าเริ่มต้นลดจาก 22% เป็น 20% (พี่ปอนด์: "มันดูใหญ่เกินไปไหม")
            ck(abs(w2 - 0.20 * W) <= 3, f"③ รูปที่คลิกวางกว้าง 20% ของหน้าตามค่าปกติ ({w2:.1f} พอยต์)")
        section("③ รูปลากกรอบ", s3s)

        # ④⑤⑥ ไฮไลต์: จุดจับวงกลม เลือกแล้วแก้สีและความเข้ม จอกับไฟล์ตรงกัน
        def s5():
            fresh(); open_edit(); mode("highlight")
            drag((0.08, 0.29), (0.80, 0.36))
            box = pg.locator(".pz .pe-box.highlight").first
            # ⑥ ก่อนแก้ค่า: บนจอต้องเห็นตัวหนังสือใต้แถบ
            pg.mouse.move(5, 5); pg.wait_for_timeout(300)
            scr = Image.open(io.BytesIO(pg.locator(".pz-paper").screenshot())).convert("RGB")
            dark_s, bg_s = region_stats(scr, 0.12, 0.30, 0.76, 0.35)
            box.click(); pg.wait_for_timeout(400)
            ck("sel" in (box.get_attribute("class") or ""), "⑤ คลิกไฮไลต์แล้วชิ้นนั้นถูกเลือก")
            g = pg.evaluate("""() => [...document.querySelectorAll('.pz .pe-box.sel .pe-grip')].map((n) => { const c = getComputedStyle(n);
              return [c.borderTopLeftRadius, c.backgroundColor, n.getBoundingClientRect().width]; })""")
            ck(len(g) == 4 and all(x[0] in ("50%", "6px") or x[0].endswith("px") and float(x[0][:-2]) >= x[2] / 2 - 0.5 for x in g)
               and all(x[1] == "rgb(255, 255, 255)" for x in g), f"④ จุดจับวงกลมพื้นขาว 4 มุม ({g[:1]} จำนวน {len(g)})", str(g))
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "selected_1440.png"))
            set_input(".pz-edit input[type=color]", "#00ff00")
            set_input(".pz-edit input[type=range]", "60")
            bgcol = pg.evaluate("() => getComputedStyle(document.querySelector('.pz .pe-box.highlight')).backgroundColor")
            ch = [int(float(v)) for v in bgcol[bgcol.index("(") + 1:bgcol.index(")")].split(",")[:3]] if "(" in bgcol else []
            ck(ch == [0, 255, 0], f"⑤ เปลี่ยนสีในแผงแล้วชิ้นที่เลือกเปลี่ยนทันที ({bgcol})", bgcol)
            pg.mouse.move(5, 5); pg.wait_for_timeout(300)
            scr2 = Image.open(io.BytesIO(pg.locator(".pz-paper").screenshot())).convert("RGB")
            dark_s2, bg_s2 = region_stats(scr2, 0.12, 0.30, 0.76, 0.35)
            close_viewer()
            doc = save("highlight.pdf")
            fills = [(tuple(round(c, 2) for c in d["fill"]), round(d.get("fill_opacity") or 1, 2)) for d in doc[0].get_drawings() if d.get("fill")]
            ck(any(f == (0.0, 1.0, 0.0) and abs(o - 0.6) < 0.02 for f, o in fills), f"⑤ ไฟล์ได้สีเขียวความเข้ม 60% ({fills})", str(fills))
            im = render_png(doc[0])
            dark_f, bg_f = region_stats(im, 0.12, 0.30, 0.76, 0.35)
            ck(dark_s is not None and dark_s < 90, f"⑥ บนจอเห็นตัวหนังสือใต้ไฮไลต์ (มืดสุด {dark_s:.0f})", str(dark_s))
            ck(dark_s2 is not None and dark_s2 < 90 and dark_f < 90, f"⑥ หลังแก้ค่า จอ (มืดสุด {dark_s2:.0f}) และไฟล์ (มืดสุด {dark_f:.0f}) ยังเห็นตัวหนังสือ")
            diff = max(abs(a - c) for a, c in zip(bg_s2, bg_f)) if bg_s2 and bg_f else 999
            notes.append(f"สีพื้นไฮไลต์ จอ {bg_s2} ไฟล์ {bg_f} ต่างสุด {diff} ต่อช่องสี")
            ck(diff <= 12, f"⑥ สีพื้นแถบบนจอ {bg_s2} กับในไฟล์ {bg_f} ต่างกันไม่เกิน 12 ({diff})", str(diff))
        section("④⑤⑥ ไฮไลต์", s5)

        # ⑥ ไฮไลต์ค่าเริ่มต้น จอกับไฟล์ ไม่ผ่านการเลือกหรือแก้ค่า (โค้ดเดิมแก้ค่าไม่ได้ ข้อนี้จึงแยกไว้วัดตรง ๆ)
        def s5b():
            fresh(); open_edit(); mode("highlight")
            drag((0.08, 0.29), (0.80, 0.36))
            pg.mouse.move(5, 5); pg.wait_for_timeout(300)
            scr = Image.open(io.BytesIO(pg.locator(".pz-paper").screenshot())).convert("RGB")
            if SHOTS:
                scr.save(str(SHOTS / "highlight_screen.png"))
            dark_s, bg_s = region_stats(scr, 0.12, 0.30, 0.76, 0.35)
            close_viewer()
            doc = save("highlight_default.pdf")
            im = render_png(doc[0])
            if SHOTS:
                im.crop((0, int(im.height * 0.25), im.width, int(im.height * 0.40))).save(str(SHOTS / "highlight_file.png"))
            dark_f, bg_f = region_stats(im, 0.12, 0.30, 0.76, 0.35)
            ck(dark_s is not None and dark_s < 90, f"⑥ ค่าเริ่มต้น บนจอเห็นตัวหนังสือใต้ไฮไลต์ (มืดสุด {dark_s:.0f})", str(dark_s))
            ck(dark_f is not None and dark_f < 90, f"⑥ ค่าเริ่มต้น ในไฟล์เห็นตัวหนังสือใต้ไฮไลต์ (มืดสุด {dark_f:.0f})", str(dark_f))
            diff = max(abs(a - c) for a, c in zip(bg_s, bg_f)) if bg_s and bg_f else 999
            notes.append(f"ไฮไลต์ค่าเริ่มต้น จอ {bg_s} ไฟล์ {bg_f} ต่างสุด {diff} มืดสุด จอ {dark_s:.0f} ไฟล์ {dark_f:.0f}")
            ck(diff <= 12, f"⑥ ค่าเริ่มต้น สีพื้นแถบบนจอ {bg_s} กับในไฟล์ {bg_f} ต่างกันไม่เกิน 12 ({diff})", str(diff))
        section("⑥ ไฮไลต์จอเทียบไฟล์", s5b)

        # ⑤⑥ ความทึบรูป
        def s6():
            fresh(); open_edit(); mode("sign")  # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
            pg.locator(".pz-edit input[type=file]").last.set_input_files(str(RED)); pg.wait_for_timeout(700)
            pg.mouse.click(*paper_at(0.5, 0.75)); pg.wait_for_timeout(400)
            pg.locator(".pz .pe-box.stamp").first.click(); pg.wait_for_timeout(400)
            ck("sel" in (pg.locator(".pz .pe-box.stamp").first.get_attribute("class") or ""), "⑤ คลิกรูปตอนถือเครื่องมือรูป = เลือก ไม่วางซ้ำ")
            ck(pg.locator(".pz .pe-box.stamp").count() == 1, "⑤ ยังมีรูปชิ้นเดียว")
            rng = pg.evaluate("() => [...document.querySelectorAll('.pz-edit input[type=range]')].filter((n) => n.offsetParent).length")
            set_input(".pz-edit .pe-grp:not([hidden]) .row:last-child input[type=range]", "50")
            pg.mouse.move(5, 5); pg.wait_for_timeout(300)
            scr = Image.open(io.BytesIO(pg.locator(".pz-paper").screenshot())).convert("RGB")
            px = scr.getpixel((int(scr.width * 0.5), int(scr.height * 0.75)))
            close_viewer()
            doc = save("stamp_alpha.pdf")
            im = render_png(doc[0])
            pf = im.getpixel((int(im.width * 0.5), int(im.height * 0.75)))
            notes.append(f"รูปความทึบ 50% จอ {px} ไฟล์ {pf} (แถบเลื่อนที่เห็น {rng})")
            ck(abs(px[1] - 128) <= 20 and abs(pf[1] - 128) <= 20 and abs(px[1] - pf[1]) <= 12,
               f"⑤⑥ ปรับความทึบรูป 50% จอ {px} ไฟล์ {pf} ตรงกัน", f"{px} {pf}")
        section("⑤⑥ ความทึบรูป", s6)

        # ④ หน้าแก้ไขและเซ็นก็ใช้จุดจับวงกลม
        def s7():
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#pdf-edit", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2200)
            pg.set_input_files("input[type=file]", [str(A)])
            pg.wait_for_selector(".pe-stage:not([hidden]) canvas", timeout=60000)
            pg.wait_for_timeout(1500)
            st = pg.locator(".pe-stage").bounding_box()
            pg.mouse.move(st["x"] + st["width"] * 0.2, st["y"] + st["height"] * 0.5); pg.mouse.down()
            pg.mouse.move(st["x"] + st["width"] * 0.5, st["y"] + st["height"] * 0.55, steps=6); pg.mouse.up()
            pg.wait_for_timeout(300)
            pg.locator(".pe-box.cover").first.click(); pg.wait_for_timeout(300)
            g = pg.evaluate("""() => [...document.querySelectorAll('.pe-box.sel .pe-grip')].map((n) => { const c = getComputedStyle(n);
              return [parseFloat(c.borderTopLeftRadius) >= n.getBoundingClientRect().width / 2 - 0.5, c.backgroundColor]; })""")
            ck(len(g) == 4 and all(x[0] and x[1] == "rgb(255, 255, 255)" for x in g), f"④ หน้าแก้ไขและเซ็น จุดจับวงกลมพื้นขาว 4 มุม ({len(g)})", str(g))
            t = pg.evaluate("() => { const s = [...document.querySelectorAll('.pe-right .pe-swatch')].find((n) => n.offsetParent); return s ? s.innerText.trim() : ''; }")
            ck(t == "#FFFFFF", f"② หน้าแก้ไขและเซ็น ช่องสีแสดง #FFFFFF ({t})", t)
        section("④② หน้าแก้ไขและเซ็น", s7)

        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

        # มือถือ 390 ภาพตอนลากกรอบ และตอนเลือกของ
        def s8():
            b2 = pw.chromium.launch()
            m = b2.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = m.new_page()
            mp.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            mp.wait_for_timeout(2200)
            mp.set_input_files("input[type=file]", [str(A)])
            mp.wait_for_selector(".pg", timeout=60000)
            mp.wait_for_timeout(1500)
            btn = mp.locator(".s2-tbar button").filter(has_text="แก้ข้อความบนหน้า").first
            btn.scroll_into_view_if_needed(); btn.click()
            mp.wait_for_selector(".pz.editing", timeout=8000)
            mp.wait_for_timeout(1200)
            mp.click(".pz-edit button[data-mode=highlight]"); mp.wait_for_timeout(300)
            r = mp.locator(".pz-paper").bounding_box()
            at = lambda fx, fy: (r["x"] + r["width"] * fx, r["y"] + r["height"] * fy)
            mp.mouse.move(*at(0.08, 0.29)); mp.mouse.down(); mp.mouse.move(*at(0.7, 0.36), steps=6)
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "dragging_box_390.png"))
            mp.mouse.up(); mp.wait_for_timeout(400)
            n = mp.locator(".pz .pe-box.highlight").count()
            ck(n == 1, f"มือถือ ลากกรอบไฮไลต์ได้ ({n})")
            mp.locator(".pz .pe-box.highlight").first.click(); mp.wait_for_timeout(400)
            ck(mp.locator(".pz .pe-box.sel").count() == 1, "มือถือ แตะไฮไลต์แล้วถูกเลือก")
            ck(mp.locator(".pz-edit .pp-strip").count() == 0, "มือถือ ไม่มีแถบภาพย่อ")
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "selected_390.png"))
            b2.close()
        section("มือถือ 390", s8)

    if notes:
        print("\n      ค่าที่วัด")
        for n in notes:
            print(f"      {n}")
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
