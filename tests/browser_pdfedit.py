#!/usr/bin/env python3
"""แก้ไขข้อความบน PDF ต้องปิดทับของเดิมได้ และพิมพ์ภาษาไทยลงไปได้จริง

‼️ ทำไมต้องมีเทสนี้ (18/09/2026)
   โจทย์จริงคือ "ลบวันที่เดิมแล้วพิมพ์วันที่ใหม่แทน" ซึ่งมีของพังเงียบได้ 3 อย่าง
   ① แกนตั้งของ PDF นับจากล่างขึ้นบน ส่วนหน้าจอนับจากบนลงล่าง
      ถ้าลืมกลับด้าน กล่องจะไปโผล่คนละที่กับที่ผู้ใช้ลาก ซึ่งดูจากจำนวนกล่องไม่รู้เลย
   ② ภาษาไทยวาดด้วยการฝังเป็นภาพ ถ้าฟอนต์ไม่ติดจะได้กล่องสี่เหลี่ยมแทนตัวอักษร
      และไฟล์ยังเปิดได้ปกติ จึงต้องวัดว่าภาพที่ฝังมีเนื้อหาจริงไม่ใช่ว่างเปล่า
   ③ กล่องที่เก็บเป็นพิกเซลของจอจะเลื่อนเมื่อจอเปลี่ยนขนาด ต้องเก็บเป็นสัดส่วน

รันปกติ:   FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_pdfedit.py
รันพิสูจน์: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_pdfedit.py --selftest
"""
import os
import sys
import tempfile
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def make_pdf(path):
    """หน้าเดียวที่มีข้อความวันที่ให้ลองปิดทับ"""
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    c.setFont("Helvetica", 18)
    c.drawString(120, 700, "Date: 1 January 2026")
    c.setFont("Helvetica", 11)
    for i in range(6):
        c.drawString(120, 650 - i * 22, "This is a contract line that should stay untouched.")
    c.showPage()
    c.save()


def main():
    tmp = Path(tempfile.mkdtemp())
    src = tmp / "contract.pdf"
    make_pdf(src)
    before = fitz.open(str(src))
    base_imgs = len(before[0].get_images())
    base_text = before[0].get_text()
    before.close()
    print(f"ไฟล์ทดสอบ 1 หน้า ภาพเดิม {base_imgs} รูป")

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 1440, "height": 1000})
        pg.goto(f"{BASE}/#/pdf-edit", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)

        inp = pg.query_selector(".dz input[type=file]")
        ck(inp is not None, "เปิดเครื่องมือแล้วเจอช่องใส่ไฟล์ (หาไม่เจอ = ตก)")
        if not inp:
            br.close()
            return
        inp.set_input_files([str(src)])
        pg.wait_for_selector(".pe-stage:not([hidden])", timeout=60000)
        pg.wait_for_timeout(1200)

        ck(pg.query_selector(".pe-thumb") is not None, "มีรายการหน้าให้เลือกในแผงซ้าย")
        layer = pg.query_selector(".pe-layer")
        ck(layer is not None, "มีชั้นสำหรับวาดทับหน้ากระดาษ")
        box = layer.bounding_box()

        # ── ปิดทับข้อความวันที่ ลากคลุมบริเวณบรรทัดบนสุด
        x0 = box["x"] + box["width"] * 0.25
        y0 = box["y"] + box["height"] * 0.10
        pg.mouse.move(x0, y0)
        pg.mouse.down()
        pg.mouse.move(x0 + box["width"] * 0.35, y0 + box["height"] * 0.035, steps=8)
        pg.mouse.up()
        pg.wait_for_timeout(400)
        covers = pg.eval_on_selector_all(".pe-box.cover", "n=>n.length")
        ck(covers == 1, f"ลากคลุมแล้วได้กล่องปิดทับ 1 กล่อง (ได้ {covers})", str(covers))

        # เก็บเป็นสัดส่วน ไม่ใช่พิกเซล เพื่อให้ตำแหน่งไม่เลื่อนเมื่อจอเปลี่ยน
        unit = pg.eval_on_selector(".pe-box.cover", "n => n.style.left")
        ck(unit.endswith("%"), f"ตำแหน่งกล่องเก็บเป็นสัดส่วน ไม่ใช่พิกเซล (ได้ {unit})", unit)

        # ‼️ ซูมต้องขยายภาพจริง ไม่ใช่แค่เปลี่ยนป้าย
        #    เคยมี max-width:100% ที่เวที ผลคือกดซูมแล้วป้ายขึ้น 200% แต่ภาพเท่าเดิม
        #    ซึ่งดูเผิน ๆ เหมือนปุ่มซูมเสีย
        w0 = pg.eval_on_selector(".pe-stage", "n=>Math.round(n.getBoundingClientRect().width)")
        pg.click("button[aria-label='ซูมเข้า']")
        pg.wait_for_timeout(350)
        w1 = pg.eval_on_selector(".pe-stage", "n=>Math.round(n.getBoundingClientRect().width)")
        ck(w1 > w0 * 1.2, f"กดซูมเข้าแล้วภาพกว้างขึ้นจริง ({w0} เป็น {w1}px)", f"{w0} -> {w1}")
        ck(pg.inner_text(".pe-zoom") == "150%", f"ป้ายบอกระดับซูมถูก (ได้ {pg.inner_text('.pe-zoom')})")

        # ‼️ กล่องที่วางไว้ต้องไม่เลื่อนเมื่อซูม เพราะเก็บเป็นสัดส่วน
        after_zoom = pg.eval_on_selector(".pe-box.cover", "n=>n.style.left")
        ck(after_zoom == unit, f"ซูมแล้วกล่องยังอยู่ที่เดิม ({unit} เป็น {after_zoom})", f"{unit} -> {after_zoom}")
        pg.click("button:has-text('พอดีหน้า')")
        pg.wait_for_timeout(350)

        # ‼️ ลากย้ายของที่วางแล้วต้องได้ และต้องไม่กลายเป็นสร้างกล่องใหม่ทับ
        bb = pg.query_selector(".pe-box.cover").bounding_box()
        pos0 = pg.eval_on_selector(".pe-box.cover", "n=>n.style.left")
        pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(bb["x"] + bb["width"] / 2 + 80, bb["y"] + bb["height"] / 2 + 40, steps=8)
        pg.mouse.up()
        pg.wait_for_timeout(350)
        pos1 = pg.eval_on_selector(".pe-box.cover", "n=>n.style.left")
        n_after = pg.eval_on_selector_all(".pe-box.cover", "n=>n.length")
        ck(pos1 != pos0 and n_after == 1,
           f"ลากย้ายกล่องได้ และไม่กลายเป็นสร้างใหม่ ({pos0} เป็น {pos1} จำนวน {n_after})",
           f"{pos0} -> {pos1}, n={n_after}")

        # ‼️ ปรับขนาดด้วยมือจับมุม
        grip = pg.query_selector(".pe-grip")
        ck(grip is not None, "มีมือจับมุมสำหรับปรับขนาดกล่องปิดทับ")
        if grip:
            w_before = pg.eval_on_selector(".pe-box.cover", "n=>parseFloat(n.style.width)")
            g = grip.bounding_box()
            pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + g["height"] / 2)
            pg.mouse.down()
            pg.mouse.move(g["x"] + 60, g["y"] + 35, steps=8)
            pg.mouse.up()
            pg.wait_for_timeout(350)
            w_after = pg.eval_on_selector(".pe-box.cover", "n=>parseFloat(n.style.width)")
            ck(w_after > w_before, f"ลากมุมแล้วกล่องใหญ่ขึ้นจริง ({w_before:.1f}% เป็น {w_after:.1f}%)")

        # ── พิมพ์ข้อความไทยแล้ววางทับ
        # ‼️ ต้องเลือกเครื่องมือ "ข้อความ" ก่อน (เปลี่ยน 21/09/2026 ตอนรวมเครื่องมือเป็นตัวเดียว)
        #    แผงขวาโชว์เฉพาะตัวเลือกของเครื่องมือที่เลือกอยู่ ไม่ได้กองทุกกลุ่มไว้พร้อมกันแล้ว
        #    เพราะห้าเครื่องมือรวมกันมีสิบกว่าช่อง ถ้าโชว์หมดแผงจะกลายเป็นกำแพง
        pg.click("[data-mode=text]")
        pg.wait_for_timeout(250)
        pg.fill(".pe-right input[type=text]", "๑๒ มีนาคม ๒๕๖๙")
        pg.wait_for_timeout(200)
        pg.mouse.click(x0 + 20, y0 + 8)
        pg.wait_for_timeout(400)
        texts = pg.eval_on_selector_all(".pe-box.text", "ns=>ns.map(n=>n.textContent.replace('✕',''))")
        ck(len(texts) == 1 and "มีนาคม" in texts[0],
           f"วางข้อความไทยบนหน้าได้ (ได้ {texts})", str(texts))

        # ‼️ เวทีต้องสูงเท่าภาพหน้ากระดาษเป๊ะ ไม่งั้นพิกัดเพี้ยนทั้งหมด
        #    เคยโดนกล่องกลางบีบจาก 954 เหลือ 631 แล้วข้อความที่วางออกมาใหญ่กว่าที่เห็น 53%
        fit = pg.evaluate("""() => {
          const st = document.querySelector('.pe-stage');
          const cv = st.querySelector('canvas');
          const ly = st.querySelector('.pe-layer');
          const h = (n) => Math.round(n.getBoundingClientRect().height);
          return {stage: h(st), canvas: h(cv), layer: h(ly)};
        }""")
        ck(abs(fit["stage"] - fit["canvas"]) <= 2 and abs(fit["layer"] - fit["canvas"]) <= 2,
           f"เวทีและชั้นวาดสูงเท่าภาพหน้ากระดาษ (เวที {fit['stage']} ภาพ {fit['canvas']} ชั้น {fit['layer']})",
           str(fit))

        # ── บันทึกแล้วตรวจไฟล์จริง
        if SELFTEST:
            # จำลองบั๊กลืมกลับแกนตั้ง กล่องจะไปโผล่คนละที่ เทสต้องจับได้
            pg.evaluate("() => { window.__FK_FLIP_BUG = true }")
        pg.click("button.s2-cta:has-text('บันทึก'), .ws-footer button:has-text('บันทึก')")
        try:
            pg.wait_for_selector(".result button:has-text('ดาวน์โหลด')", timeout=90000)
            got = True
        except Exception:
            got = False
        ck(got, "กดบันทึกแล้วได้ไฟล์ออกมาจริง")
        if not got:
            print(f"\nผ่าน {ok} · ตก {fail}")
            br.close()
            sys.exit(1)

        out = tmp / "out.pdf"
        with pg.expect_download(timeout=60000) as dl:
            pg.click(".result button:has-text('ดาวน์โหลด')")
        dl.value.save_as(str(out))
        br.close()

    doc = fitz.open(str(out))
    page = doc[0]
    imgs = page.get_images()
    drawings = page.get_drawings()
    text_after = page.get_text()
    # เรนเดอร์ออกมาดูว่าบริเวณที่ปิดทับกลายเป็นสีพื้นจริงไหม
    pix = page.get_pixmap(dpi=90)
    doc.close()

    ck(len(imgs) == base_imgs + 1,
       f"ข้อความไทยถูกฝังเป็นภาพลงไฟล์ 1 รูป (เดิม {base_imgs} เป็น {len(imgs)})", str(len(imgs)))
    fills = [d for d in drawings if d.get("fill")]
    ck(len(fills) >= 1, f"มีสี่เหลี่ยมปิดทับอยู่ในไฟล์จริง (พบ {len(fills)} ชิ้น)", str(len(fills)))
    ck("contract line that should stay untouched" in text_after,
       "ข้อความส่วนที่ไม่ได้แตะยังอยู่ครบ")

    # ‼️ ตรวจตำแหน่ง กล่องต้องอยู่ครึ่งบนของหน้า ตามที่ลากไว้ที่ราว 10% จากขอบบน
    #    ถ้าลืมกลับแกนตั้ง กล่องจะไปอยู่ครึ่งล่าง ซึ่งจำนวนกล่องเท่าเดิมทุกอย่าง
    if fills:
        tops = [d["rect"].y0 for d in fills]
        ck(min(tops) < 300,
           f"กล่องปิดทับอยู่ครึ่งบนของหน้าตามที่ลาก (ขอบบนสุดที่ y={min(tops):.0f})",
           f"y0 ที่พบ: {[round(t) for t in tops]}")

    print(f"\nผ่าน {ok} · ตก {fail}")
    sys.exit(1 if fail else 0)


main()
