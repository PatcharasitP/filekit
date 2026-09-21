#!/usr/bin/env python3
"""จัดการหน้า PDF ต้องรับหลายไฟล์แล้วบอกได้ว่าหน้าไหนมาจากไฟล์ไหน

‼️ ทำไมต้องมีเทสนี้ (18/09/2026)
   เดิมเครื่องมือนี้รับครั้งละ 1 ไฟล์ พอเปิดให้รับหลายไฟล์ มีของที่พังเงียบได้ 3 อย่าง
   ① หน้าจากไฟล์ที่สองอาจไปคัดลอกจากไฟล์แรก เพราะเลขหน้าเริ่มนับใหม่ทุกไฟล์
      ถ้าลืมจำว่าหน้านั้นมาจากไฟล์ไหน จะได้ไฟล์ผลลัพธ์ที่หน้าถูกต้องตามจำนวนแต่เนื้อหาผิด
      ซึ่งดูจากจำนวนหน้าอย่างเดียวจับไม่ได้เลย
   ② ลำดับที่ผู้ใช้ลากจัดไว้อาจหายตอนบันทึก เพราะคัดลอกทีละไฟล์เป็นก้อนเพื่อความเร็ว
   ③ ป้ายบอกไฟล์อาจไม่ขึ้น ทำให้ผู้ใช้แยกไม่ออกว่าหน้าไหนของใคร

‼️ สีอย่างเดียวเชื่อไม่ได้ จึงตรวจที่ "ตัวอักษร" A B C เป็นหลัก
   วัดด้วย src/cvd.js แล้ว ชุดสี 5 สีขึ้นไปไม่มีทางแยกออกครบทุกแบบตาบอดสี

รันปกติ:   FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_pdfpages_multi.py
รันพิสูจน์: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_pdfpages_multi.py --selftest
"""
import os
import sys
import tempfile
from pathlib import Path

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


def make_pdf(path, tag, pages):
    """PDF ที่แต่ละหน้าเขียนข้อความบอกชัดว่าเป็นไฟล์ไหนหน้าไหน"""
    c = rl_canvas.Canvas(str(path), pagesize=A4)
    for p in range(1, pages + 1):
        c.setFont("Helvetica-Bold", 64)
        c.drawString(90, 520, f"{tag}{p}")
        c.showPage()
    c.save()


def main():
    tmp = Path(tempfile.mkdtemp())
    a, b = tmp / "alpha.pdf", tmp / "bravo.pdf"
    make_pdf(a, "A", 2)
    make_pdf(b, "B", 3)
    print(f"สร้างไฟล์ทดสอบ alpha.pdf 2 หน้า และ bravo.pdf 3 หน้า")

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 1440, "height": 950})
        pg.goto(f"{BASE}/#/pdf-pages", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1500)

        if SELFTEST:
            # จำลองบั๊กเดิม บังคับให้รับไฟล์เดียว เทสต้องจับได้
            pg.evaluate("""() => {
              const i = document.querySelector('.dz input[type=file]');
              if (i) i.removeAttribute('multiple');
            }""")

        inp = pg.query_selector(".dz input[type=file]") or pg.query_selector("input[type=file]")
        ck(inp is not None, "หาช่องใส่ไฟล์เจอ (หาไม่เจอ = ตก)")
        if not inp:
            br.close()
            return

        multiple = pg.evaluate("(el) => el.hasAttribute('multiple')", inp)
        ck(multiple, "ช่องใส่ไฟล์เปิดให้เลือกหลายไฟล์", "ยังตั้งเป็นไฟล์เดียว")

        try:
            inp.set_input_files([str(a), str(b)])
        except Exception as e:
            # โหมดพิสูจน์ถอด multiple ออก เบราว์เซอร์จึงรับสองไฟล์ไม่ได้ ซึ่งคือสิ่งที่ต้องจับให้ได้
            ck(False, "ใส่สองไฟล์พร้อมกันได้", str(e)[:90])
            print(f"\nผ่าน {ok} · ตก {fail}")
            br.close()
            sys.exit(1)
        pg.wait_for_timeout(700)
        pg.wait_for_function("() => document.querySelectorAll('.pg').length > 0", timeout=60000)
        pg.wait_for_timeout(1200)

        # ‼️ ชื่อ "จัดการหน้า PDF" กับ "แก้ไขข้อความบน PDF" ใกล้กันมาก
        #    พี่ปอนด์เปิดหน้านี้แล้วถามว่า "ไหนถ้าพี่จะลบพวกข้อความ" ซึ่งอยู่คนละเครื่องมือ
        #    ต้องมีทางเชื่อมที่เห็นตั้งแต่แรก ไม่ใช่รอให้ไปเจอตอนทำงานเสร็จ
        edit_link = pg.query_selector("a[href='#/pdf-edit']")
        ck(edit_link is not None, "มีทางเชื่อมไปเครื่องมือลบข้อความให้เห็นตั้งแต่แรก")

        # ‼️ ชิปเลือกเร็ว ถอดแนวคิดจาก openkrua ที่หน้าใช้งานจริงไม่ให้ผู้ใช้พิมพ์อะไรเลย
        #    ของเราเดิมต้องรู้ก่อนว่ารูปแบบ 1-3,5,8- แปลว่าอะไร ซึ่งต้องเรียนก่อนใช้
        chips = pg.eval_on_selector_all(".pp-chip", "ns=>ns.map(n=>n.textContent.trim())")
        ck(len(chips) >= 4, f"มีชิปเลือกเร็วให้กดโดยไม่ต้องพิมพ์ ({chips})", str(chips))
        # ‼️ ตัวเลือกย้ายไปแผงขวาตามผัง Power BI แล้ว (20/09/2026 พี่ปอนด์ขอ)
        #    และเครื่องมือนี้ตั้งให้ "เปิดมาพับไว้" เพราะงานหลักคือดูภาพหน้าแล้วลากสลับ
        #    วัดจริง พับไว้ = 4 คอลัมน์ การ์ด 249px  กางอยู่ = 3 คอลัมน์ การ์ด 215px
        #    ผู้ใช้กดแถบไอคอนขวาครั้งเดียวก็กางออกมา เทสจึงต้องกางก่อนเหมือนกัน
        #    ‼️ ทำเป็นตัวช่วยเรียกซ้ำได้ เพราะเทสนี้แตะตัวเลือกหลายจุดคนละช่วง
        def open_options():
            r = pg.query_selector(".ws-rail-right")
            if r and r.is_visible():
                r.click(); pg.wait_for_timeout(400)

        def close_options():
            f = pg.query_selector(".ws-right .ws-panefold")
            if f and f.is_visible():
                f.click(); pg.wait_for_timeout(400)

        open_options()
        ck(pg.is_visible(".pp-chip"), "กางแผงตัวเลือกแล้วชิปโผล่ให้กดได้จริง")
        pg.click(".pp-chip:has-text('หน้าคี่')")
        pg.wait_for_timeout(400)
        left = pg.eval_on_selector_all(
            ".pg", "ns=>ns.map((n,i)=>n.classList.contains('dropped')?null:i+1).filter(Boolean)")
        ck(left == [1, 3, 5], f"กดหน้าคี่แล้วเหลือหน้า 1 3 5 จริง (ได้ {left})", str(left))
        pg.click("button:has-text('รีเซ็ตทั้งหมด')")
        pg.wait_for_timeout(1500)
        close_options()

        cards = pg.query_selector_all(".pg")
        ck(len(cards) == 5, f"หน้าจากทั้งสองไฟล์มาครบ 5 ใบ (พบ {len(cards)})", f"พบ {len(cards)}")

        tags = pg.eval_on_selector_all(".pg .src", "ns => ns.map(n => n.textContent.trim())")
        ck(tags[:5] == ["A", "A", "B", "B", "B"],
           f"ป้ายบอกไฟล์ถูกต้องตามลำดับ A A B B B (ได้ {tags})", str(tags))

        colors = pg.eval_on_selector_all(
            ".pg",
            "ns => [...new Set(ns.map(n => getComputedStyle(n).getPropertyValue('--fc').trim()))]")
        real = [c for c in colors if c]
        ck(len(real) == 2, f"สองไฟล์ได้คนละสี (พบ {len(real)} สี)", str(colors))

        # ‼️ ป้ายต้องไปเกาะกับรายการไฟล์เดิมที่กล่องเลือกไฟล์วาดไว้ ไม่ใช่รายการใหม่ที่ทำซ้ำ
        rowtags = pg.eval_on_selector_all(".file-row .pp-tag", "ns => ns.map(n => n.textContent.trim())")
        ck(rowtags == ["A", "B"], f"ป้ายไปเกาะกับรายการไฟล์เดิมครบทุกแถว (ได้ {rowtags})", str(rowtags))
        ck(pg.query_selector(".pp-files") is None,
           "ไม่มีรายการไฟล์ซ้อนอันที่สอง (ชื่อไฟล์ต้องขึ้นที่เดียว)")
        # ป้ายต้องลอยทับ ไม่ไปแย่งที่จนขนาดไฟล์ตกบรรทัด
        onerow = pg.eval_on_selector(".file-row .pp-tag", "n => getComputedStyle(n).position")
        ck(onerow == "absolute", f"ป้ายลอยทับ ไม่แย่งพื้นที่ในแถว (ได้ {onerow})", onerow)

        # ‼️ สลับลำดับไฟล์แล้วหน้าต้องตามไป และห้ามเรนเดอร์ภาพใหม่ทั้งหมด
        rows = pg.query_selector_all(".file-row")
        btns = rows[1].query_selector_all(".icon-btn") if len(rows) > 1 else []
        if btns:
            before = pg.eval_on_selector_all(".pg .src", "ns=>ns.map(n=>n.textContent.trim())")
            btns[0].click()
            pg.wait_for_timeout(1200)
            after = pg.eval_on_selector_all(".pg .src", "ns=>ns.map(n=>n.textContent.trim())")
            first_row = pg.eval_on_selector(".file-row", "n => n.textContent")
            ck(before == ["A", "A", "B", "B", "B"] and after == ["A", "A", "A", "B", "B"]
               and "bravo" in first_row,
               "เลื่อนไฟล์ขึ้นแล้วหน้าตามไปด้วย (ลำดับแท็บเปลี่ยนจาก A A B B B เป็น A A A B B)",
               f"{before} -> {after} · แถวไฟล์แรกตอนนี้ {first_row[:32]!r}")

        # สลับไฟล์ทีละหน้า ต้องได้ A B A B B
        open_options()                      # ปุ่มนี้อยู่ในแผงตัวเลือกที่พับไว้ตอนเปิดมา
        btn = pg.query_selector("text=สลับไฟล์ทีละหน้า")
        ck(btn is not None, "มีปุ่มสลับไฟล์ทีละหน้า")
        if btn:
            btn.click()
            pg.wait_for_timeout(600)
            tags2 = pg.eval_on_selector_all(".pg .src", "ns => ns.map(n => n.textContent.trim())")
            # ‼️ ตอนนี้ไฟล์ A คือ bravo ซึ่งมี 3 หน้า ส่วนไฟล์ B คือ alpha มี 2 หน้า
            #    เพราะขั้นก่อนหน้าเลื่อน bravo ขึ้นมาเป็นไฟล์แรกแล้ว
            #    สลับทีละหน้าจึงได้ A B A B A ไม่ใช่ A B A B B
            ck(tags2 == ["A", "B", "A", "B", "A"],
               f"สลับไฟล์ทีละหน้าแล้วได้ A B A B A (ได้ {tags2})", str(tags2))

        # ‼️ กริดต้องได้ 4 คอลัมน์บนจอกว้าง และการ์ดต้องไม่เล็กลงกว่าเดิม
        #    เดิมได้ 3 คอลัมน์ การ์ด 215px เพราะแผงขวากินที่ไป 340px
        #    ทั้งที่แผงนั้นมีแค่ช่องเดียวกับปุ่มสามปุ่ม ย้ายไปแผงซ้ายแล้วได้ 4 คอลัมน์ 249px
        close_options()                     # วัดในสภาพเดียวกับที่ผู้ใช้เจอตอนเปิดหน้า
        grid = pg.evaluate("""() => {
          const g = document.querySelector('.pages');
          const c = document.querySelector('.pg');
          return {cols: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length,
                  cardW: Math.round(c.getBoundingClientRect().width),
                  hasRight: !!document.querySelector('.ws-right, .s2-side'),
                  v1: !!document.querySelector('.ws-right')};
        }""")
        ck(grid["cols"] >= 4, f"จอกว้างแสดงอย่างน้อย 4 คอลัมน์ (ได้ {grid['cols']})", str(grid))
        ck(grid["cardW"] >= 215, f"การ์ดไม่เล็กลงกว่าเดิม 215px (ได้ {grid['cardW']}px)", str(grid))
        # ‼️ ข้อนี้เคยเขียนว่า "ห้ามมีแผงขวา" ซึ่งเป็นวิธีเดียวที่ทำได้ในตอนนั้น (8efcdbe)
        #    20/09/2026 พี่ปอนด์ขอให้ตัวเลือกไปอยู่ขวาตามผัง Power BI เหมือนอีก 23 เครื่องมือ
        #    ตอนนี้ทำได้ทั้งสองอย่าง เพราะแผงพับเก็บเป็นแถบไอคอนได้แล้ว
        #    เจตนาจริงของข้อนี้คือ "แผงขวาต้องไม่กินพื้นที่ภาพ" ไม่ใช่ "ห้ามมีแผงขวา"
        #    จึงเขียนเจตนาตรง ๆ แทน คือมีได้ แต่ตอนเปิดมาต้องพับอยู่
        ck(grid["hasRight"], "มีแผงตัวเลือกอยู่ด้านขวาตามผังเดียวกับเครื่องมืออื่น")
        # ‼️ v2 ไม่มีการพับแผง แผงข้างเป็นที่อยู่ของปุ่มหลักเสมอ (22/09/2026)
        #    เจตนาของข้อนี้ "แผงขวาต้องไม่กินพื้นที่ภาพ" ถูกวัดแล้วตรง ๆ ด้วยข้อจำนวนคอลัมน์กับความกว้างการ์ดข้างบน
        #    ข้อพับแผงจึงตรวจเฉพาะตอนเป็นโครง v1 เท่านั้น
        if grid.get("v1"):
            ck(pg.evaluate("() => !document.querySelector('.ws-right')?.offsetParent"),
               "แผงขวาต้องพับอยู่ ไม่กินพื้นที่ภาพตั้งแต่เปิดมา")

        # ‼️ ลากสลับหน้าต้องบอกให้เห็นว่าจะไปวางตรงไหน และผลต้องตรงกับที่เห็น
        #    เดิมบอกด้วยการเปลี่ยนสีขอบเท่านั้น ผู้ใช้จึงไม่รู้ว่าลากแล้วเปลี่ยนไหม
        cards = pg.query_selector_all(".pg")
        if len(cards) >= 4:
            # ‼️ alt อย่างเดียวซ้ำได้ เพราะสองไฟล์ต่างก็มี "หน้า 1"
            #    ต้องรวมกับไฟล์ต้นทางเป็นลายเซ็นที่ไม่ซ้ำ ไม่งั้นตัวตรวจหาผิดใบ
            JS_ALT = """ns => ns.map(n => {
              const card = n.closest('.pg');
              const src = card.querySelector('.src');
              return (src ? src.textContent.trim() + ' ' : '') + n.getAttribute('alt');
            })"""
            before_alt = pg.eval_on_selector_all(".pg img", JS_ALT)
            # ‼️ ต้องเลื่อนการ์ดเข้ามาในจอก่อนวัดพิกัด (แก้ 20/09/2026)
            #    ขั้นก่อนหน้า (เรียงทีละไฟล์ / สลับไฟล์ทีละหน้า) ทำให้หน้าเลื่อนไปเอง
            #    พิกัดที่วัดไว้จึงเป็นของตำแหน่งเก่า พอมีอะไรมาเพิ่มความสูงของหน้า
            #    (ส่วน "ตรวจเองได้" รอบหนึ่ง ริบบอนเครื่องมืออีกรอบหนึ่ง) ค่าก็เพี้ยนทันที
            #    คนใช้จริงย่อมเลื่อนให้เห็นการ์ดก่อนลากอยู่แล้ว เทสจึงควรทำเหมือนกัน
            cards[0].scroll_into_view_if_needed()
            pg.wait_for_timeout(300)
            c0, c3 = cards[0].bounding_box(), cards[3].bounding_box()
            pg.mouse.move(c0["x"] + c0["width"] / 2, c0["y"] + c0["height"] / 2)
            pg.mouse.down()
            pg.mouse.move(c3["x"] + c3["width"] * 0.8, c3["y"] + c3["height"] / 2, steps=10)
            pg.wait_for_timeout(250)
            mark = pg.evaluate("""() => {
              const o = document.querySelector('.pg.over');
              if (!o) return null;
              const cs = getComputedStyle(o, '::after');
              return {side: o.classList.contains('after') ? 'after' : 'before',
                      w: cs.width, shown: cs.content !== 'none'};
            }""")
            ck(bool(mark) and mark["shown"] and mark["side"] == "after",
               f"ตอนลากมีเส้นบอกตำแหน่งวาง และบอกฝั่งถูก (ได้ {mark})", str(mark))
            pg.mouse.up()
            pg.wait_for_timeout(500)
            after_alt = pg.eval_on_selector_all(".pg img", JS_ALT)
            moved = before_alt[0]
            ck(after_alt.index(moved) == 3,
               f"วางแล้วหน้าไปอยู่ตำแหน่งที่เส้นบอกจริง ({moved} ไปอยู่ลำดับ {after_alt.index(moved) + 1})",
               f"{before_alt} -> {after_alt}")
            # ลากกลับที่เดิม จะได้ทดสอบบันทึกด้วยลำดับที่รู้ผลแน่นอน
            cards2 = pg.query_selector_all(".pg")
            src, dst = cards2[3].bounding_box(), cards2[0].bounding_box()
            pg.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2)
            pg.mouse.down()
            pg.mouse.move(dst["x"] + dst["width"] * 0.2, dst["y"] + dst["height"] / 2, steps=10)
            pg.mouse.up()
            pg.wait_for_timeout(500)

        # บันทึกจริง แล้วต้องได้ลิงก์ดาวน์โหลดพร้อมจำนวนหน้าถูกต้อง
        save = pg.query_selector("button.s2-cta:has-text('บันทึก'), .ws-footer button:has-text('บันทึก')")
        ck(save is not None and save.is_visible(), "หาปุ่มบันทึกที่กดได้จริงเจอ")
        if save:
            save.click()
            # ‼️ ปุ่มดาวน์โหลดของโปรเจกต์นี้เป็น <button> ที่เรียก download() ไม่ใช่ <a download>
            #    เทสรุ่นแรกหา a[download] แล้วรายงานว่าบันทึกไม่ได้ ทั้งที่ไฟล์ออกมาแล้วจริง
            try:
                pg.wait_for_selector(".result button:has-text('ดาวน์โหลด')", timeout=90000)
                got = True
            except Exception:
                got = False
            ck(got, "กดบันทึกแล้วได้ไฟล์ผลลัพธ์ออกมาจริง")
            if got:
                txt = pg.inner_text(".result")
                ck("5" in txt, f"ไฟล์ผลลัพธ์บอกว่ามี 5 หน้า (ข้อความ: {txt[:60]})", txt[:80])

                # ‼️ ข้อที่สำคัญที่สุดของเทสนี้ เปิดไฟล์จริงอ่านข้อความทีละหน้า
                #    เพราะบั๊กหยิบหน้าจากไฟล์ผิด จะได้จำนวนหน้าถูกแต่เนื้อหาผิด
                #    ซึ่งทุกข้อข้างบนผ่านหมดโดยไม่มีใครรู้
                out = tmp / "out.pdf"
                with pg.expect_download(timeout=60000) as dl:
                    pg.click(".result button:has-text('ดาวน์โหลด')")
                dl.value.save_as(str(out))
                import fitz
                doc = fitz.open(str(out))
                got_pages = [d.get_text().strip() for d in doc]
                doc.close()
                # ‼️ ข้อความในหน้ายังเป็น A กับ B ตามไฟล์ต้นฉบับ ไม่ใช่ตามป้ายบนจอ
                #    bravo เขียน B1 B2 B3 อยู่แล้ว และตอนนี้มันเป็นไฟล์แรก
                #    ลำดับที่ถูกจึงเป็น B1 A1 B2 A2 B3 ซึ่งพิสูจน์ว่าหน้ามาจากไฟล์ที่ถูกต้องจริง
                ck(got_pages == ["B1", "A1", "B2", "A2", "B3"],
                   f"เนื้อหาในไฟล์ตรงกับลำดับที่จัดไว้ B1 A1 B2 A2 B3 (ได้ {got_pages})",
                   str(got_pages))

        br.close()

    print(f"\nผ่าน {ok} · ตก {fail}")
    sys.exit(1 if fail else 0)


main()
