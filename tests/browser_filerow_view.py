#!/usr/bin/env python3
"""แถวไฟล์ PDF: แว่นขยายเปิดตัวดูแบบเดียวกับการ์ดหน้า , ชี้ค้างที่ภาพย่อเห็นหน้าแรกใหญ่ , คลิกแถวเลือกทุกหน้าของไฟล์

‼️ ที่มา 18/11/2026 พี่ปอนด์ลองบนเว็บจริง
   (ค) กดแว่นขยายบนภาพย่อ เปิดตัวดูแบบ coverflow (ไฟล์ข้างโผล่เป็นกล่องจาง ๆ) "ฟีเจอร์อันนี้ไม่คือ" "ปุ่มกากบาทแปลก ๆ"
       ส่วนตัวดูของการ์ดหน้า (pagezoom) พี่ชมว่า "ดีมาก ๆ" จึงให้ PDF เปิดตัวดูตัวนั้นแทน ดูได้ทุกหน้าของไฟล์
       รูปกับเอกสารอื่นยังเป็นตัวดูเดิม (dialog.pv)
   (ง) "แค่เอาเมาส์แตะ จะได้มีหน้าแรกมาพรีวิวก็ดีนะ" ชี้ค้างบนภาพย่อ ภาพหน้าแรกใหญ่ลอยขึ้น เลื่อนออกแล้วหาย
   (จ) จุดหกจุด "ถ้ากดได้มีฟีเจอร์บางอย่างน่าจะเจ๋ง" คลิกแถวไฟล์ในจัดการหน้า PDF = เลือกทุกหน้าของไฟล์นั้น
       แล้วเลื่อนไปหาหน้าแรกของไฟล์ ลากไม่ถือเป็นคลิก

รัน:  FK_BASE=http://127.0.0.1:8941 ../.venv/bin/python tests/browser_filerow_view.py"""
import os
import pathlib
import sys
import tempfile

from PIL import Image
from playwright.sync_api import sync_playwright
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fkui  # noqa: E402

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = os.environ.get("FK_SHOTS", "")
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"  {'✅' if cond else '❌'} {label}" + (f"  ({detail})" if (detail and not cond) else ""), flush=True)


def make_pdf(path, tag, pages):
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    for p in range(1, pages + 1):
        c.setFont("Helvetica-Bold", 64)
        c.drawString(90, 520, f"{tag}{p}")
        c.showPage()
    c.save()


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name))


def pgno(pg):
    return pg.evaluate("() => document.querySelector('.pz .pz-pgno')?.textContent.trim() || null")


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    a, b = tmp / "alpha.pdf", tmp / "bravo.pdf"
    make_pdf(a, "A", 2)
    make_pdf(b, "B", 3)
    imgs = []
    for i, col in enumerate([(200, 60, 60), (60, 120, 200)], 1):
        Image.new("RGB", (400, 300), col).save(tmp / f"img{i}.png")
        imgs.append(str(tmp / f"img{i}.png"))

    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={"width": 1440, "height": 950}, locale="th-TH", reduced_motion="no-preference")
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        fkui.open_tool(pg, "pdf-pages", base=BASE)
        fkui.feed(pg, [a, b])
        pg.wait_for_function("() => document.querySelectorAll('.pg').length >= 5", timeout=60000)
        pg.wait_for_timeout(1500)

        # ── (ค) แว่นขยายบนภาพย่อ ──
        thumb = pg.query_selector_all(".file-row")[1].query_selector("button.thumb")
        ck(thumb is not None, "(ค) แถวไฟล์มีปุ่มภาพย่อ")
        thumb.click()
        try:
            pg.wait_for_selector(".pz", timeout=8000)
        except Exception:
            pass
        ck(pg.query_selector(".pz") is not None, "(ค) กดภาพย่อของ PDF เปิดตัวดูแบบเดียวกับการ์ดหน้า (.pz)")
        ck(pg.evaluate("() => !document.querySelector('dialog.pv[open]')"), "(ค) ไม่เปิดตัวดู coverflow เดิม (dialog.pv)")
        pg.wait_for_timeout(900)
        ck(pgno(pg) == "1 / 3", "(ค) แสดงเลขหน้า 1 / 3 (bravo มี 3 หน้า ดูได้ทุกหน้าของไฟล์นั้น)", str(pgno(pg)))
        ttl = pg.evaluate("() => document.querySelector('.pz .pz-title')?.textContent || ''")
        ck("bravo" in ttl, "(ค) หัวตัวดูบอกชื่อไฟล์ bravo.pdf", ttl)
        shot(pg, "view_pz.png")
        pg.keyboard.press("ArrowRight")
        pg.wait_for_timeout(900)
        ck(pgno(pg) == "2 / 3", "(ค) ลูกศรขวาไปหน้า 2 / 3", str(pgno(pg)))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(500)
        ck(pg.query_selector(".pz") is None, "(ค) Esc ปิดตัวดู")
        # กดชื่อไฟล์ก็เปิดตัวเดียวกัน
        pg.query_selector_all(".file-row")[0].query_selector("button.f-open").click()
        try:
            pg.wait_for_selector(".pz", timeout=8000)
        except Exception:
            pass
        pg.wait_for_timeout(700)
        ck(pg.query_selector(".pz") is not None and pgno(pg) == "1 / 2", "(ค) กดชื่อไฟล์ alpha ก็เปิดตัวดูเดียวกัน 1 / 2", str(pgno(pg)))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)

        # ── (ง) ชี้ค้างที่ภาพย่อ ──
        tb = pg.query_selector_all(".file-row")[1].query_selector("button.thumb").bounding_box()
        pg.mouse.move(5, 5)
        pg.mouse.move(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2, steps=4)
        pg.wait_for_timeout(1500)
        pk = pg.evaluate("""() => { const n = document.querySelector('.fr-peek');
          if (!n) return null; const r = n.getBoundingClientRect();
          return { on: n.classList.contains('on'), w: Math.round(r.width), img: !!n.querySelector('img,canvas'),
                   opacity: parseFloat(getComputedStyle(n).opacity) }; }""")
        ck(pk is not None, "(ง) ชี้ค้างบนภาพย่อแล้วมีภาพลอยขึ้น (.fr-peek)", str(pk))
        if pk:
            ck(pk["on"] and pk["opacity"] >= 0.95 and pk["img"], "(ง) ภาพลอยโชว์เต็มและมีรูปหน้าแรก", str(pk))
            ck(pk["w"] >= 200, f"(ง) ภาพหน้าแรกใหญ่พอดูได้ (กว้าง {pk['w']}px)", str(pk))
        shot(pg, "peek.png")
        pg.mouse.move(tb["x"] - 300, tb["y"] - 100, steps=4)
        pg.wait_for_timeout(700)
        ck(pg.query_selector(".fr-peek") is None, "(ง) เลื่อนเมาส์ออกแล้วภาพลอยหาย")

        # ── (จ) grip ──
        grip = pg.query_selector_all(".file-row")[1].query_selector(".grip")
        gi = pg.evaluate("""(g) => ({cursor: getComputedStyle(g).cursor, rowCursor: getComputedStyle(g.closest('.file-row')).cursor,
          pick: g.closest('.file-row').classList.contains('fr-pick'),
          border0: getComputedStyle(g.closest('.file-row')).borderColor})""", grip)
        ck(gi["cursor"] == "grab" and gi["rowCursor"] == "grab", "(จ) เคอร์เซอร์บนจุดหกจุดกับแถวเป็นมือ (บอกว่าลากได้)", str(gi))
        # ‼️ ไม่ใช้ title เพราะ el() ถอด tooltip ของเบราว์เซอร์ทิ้งตามที่พี่ปอนด์สั่ง บอกว่าคลิกได้ด้วยขอบแถวที่เข้มขึ้นตอนชี้
        gb0 = grip.bounding_box()
        pg.mouse.move(gb0["x"] + gb0["width"] / 2, gb0["y"] + gb0["height"] / 2)
        pg.wait_for_timeout(300)
        border1 = pg.evaluate("(g) => getComputedStyle(g.closest('.file-row')).borderColor", grip)
        ck(gi["pick"] and border1 != gi["border0"], "(จ) ชี้แถวแล้วขอบเข้มขึ้น บอกว่าคลิกได้", f"{gi['border0']} -> {border1}")
        sel0 = pg.evaluate("() => document.querySelectorAll('.pg.selected').length")
        ck(sel0 == 0, "(จ) เริ่มต้นไม่มีหน้าที่เลือก", str(sel0))
        gb = grip.bounding_box()
        pg.mouse.move(gb["x"] + gb["width"] / 2, gb["y"] + gb["height"] / 2)
        pg.mouse.down()
        pg.mouse.up()
        pg.wait_for_timeout(700)
        got = pg.evaluate("""() => [...document.querySelectorAll('.pg.selected')].map(n => n.querySelector('.src')?.textContent.trim())""")
        ck(got == ["B", "B", "B"], "(จ) คลิกแถว bravo เลือกครบทั้ง 3 หน้าของไฟล์ B", str(got))
        vis = pg.evaluate("""() => { const c = document.querySelector('.pg.selected'); if (!c) return null;
          const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0; }""")
        ck(vis is True, "(จ) หน้าแรกของไฟล์ที่เลือกอยู่ในจอ", str(vis))
        shot(pg, "pick.png")
        # คลิกแถว alpha เปลี่ยนไปเลือกของ alpha แทน
        r0 = pg.query_selector_all(".file-row")[0].bounding_box()
        pg.mouse.click(r0["x"] + r0["width"] - 140, r0["y"] + 3)   # พื้นแถวขอบบน ไม่ใช่ปุ่ม
        pg.wait_for_timeout(600)
        got = pg.evaluate("""() => [...document.querySelectorAll('.pg.selected')].map(n => n.querySelector('.src')?.textContent.trim())""")
        ck(got == ["A", "A"], "(จ) คลิกพื้นแถว alpha เลือกทั้ง 2 หน้าของ alpha แทน", str(got))
        # ลากไม่ใช่คลิก: ตอนนี้เลือก alpha อยู่ 2 หน้า ลากแถว bravo ขึ้น ต้องไม่ถูกนับเป็นคลิกที่ bravo (ซึ่งจะเลือก 3 หน้า)
        rows = pg.query_selector_all(".file-row")
        g2 = rows[1].query_selector(".grip").bounding_box()
        pg.mouse.move(g2["x"] + 6, g2["y"] + 6)
        pg.mouse.down()
        pg.mouse.move(g2["x"] + 6, rows[0].bounding_box()["y"] + 2, steps=10)
        pg.mouse.up()
        pg.wait_for_timeout(900)
        n = pg.evaluate("() => document.querySelectorAll('.pg.selected').length")
        ck(n == 2, "(จ) ลากแถวไม่ถือเป็นคลิก ที่เลือกไว้ (alpha 2 หน้า) ไม่เปลี่ยน", str(n))

        # ── รูป ยังเป็นตัวดูเดิม ──
        fkui.open_tool(pg, "image-convert", base=BASE)
        pg.locator("input[type=file]").first.set_input_files(imgs)
        pg.wait_for_timeout(1500)
        pg.query_selector(".file-row button.thumb").click()
        pg.wait_for_timeout(1000)
        ck(pg.query_selector("dialog.pv[open]") is not None and pg.query_selector(".pz") is None,
           "รูปภาพยังเปิดตัวดูเดิม (dialog.pv) ไม่ใช่ .pz")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)

        # ── เครื่องมืออื่นที่ไม่ใช่จัดการหน้า (รวม PDF) แว่นขยาย PDF ก็เป็นตัวดูใหม่ และคลิกแถวไม่พัง ──
        fkui.open_tool(pg, "pdf-merge", base=BASE)
        fkui.feed(pg, [a, b])
        pg.wait_for_selector(".file-row", timeout=15000)
        pg.query_selector(".file-row button.thumb, .file-row button.f-open").click()
        try:
            pg.wait_for_selector(".pz", timeout=8000)
        except Exception:
            pass
        ck(pg.query_selector(".pz") is not None, "รวม PDF กดภาพย่อไฟล์ PDF เปิดตัวดูแบบเดียวกัน (.pz)")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)
        r = pg.query_selector_all(".file-row")[0].bounding_box()
        pg.mouse.click(r["x"] + r["width"] - 140, r["y"] + 3)
        pg.wait_for_timeout(300)
        ck(pg.query_selector(".pz") is None, "รวม PDF คลิกพื้นแถว (ไม่มีหน้าให้เลือก) ไม่เปิดอะไร ไม่พัง")

        ck(not errs, "ไม่มี pageerror ตลอดทาง", str(errs[:2]))
        ctx.close()
        br.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
