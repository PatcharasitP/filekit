"""จัดการหน้า PDF: ครอบขอบขาว และเพิ่มหน้าว่าง

‼️ ที่มา 18/09/2026 พี่ปอนด์ส่งภาพหน้าสแกนที่เนื้อหาอยู่ครึ่งบน เหลือขาวครึ่งล่าง
   "อยากได้ให้สามารถครอบได้ กระดาษมันจะได้เต็มแบบเพื่อน"
   และขอ "เพิ่มเอกสาร เพิ่มหน้าว่าง" แบบปุ่ม + ระหว่างหน้าของ Smallpdf

‼️ บั๊กที่เทสนี้เกิดมาเพื่อจับ: ครั้งแรกที่ทำ หน้าว่าง "หายไปจากไฟล์" โดยไม่มี error
   และหน้าจอยังโชว์การ์ดครบ 4 ใบถูกต้อง เห็นก็ต่อเมื่อเปิดไฟล์ผลลัพธ์นับหน้าจริง
   เหตุ: copiedAt เป็น new Array(n) ช่องของหน้าว่างไม่เคยถูกกำหนดค่า = เป็น "รู"
   ซึ่ง Array.forEach ข้ามทิ้งเงียบ ๆ
   → เทสนี้ต้องเปิดไฟล์ผลลัพธ์อ่านค่าจริงเสมอ ห้ามตรวจแค่หน้าจอ

เทสนี้ตรวจ 6 อย่าง
   ① กดครอบแล้วป้าย "ครอบแล้ว" ขึ้นบนหน้านั้นหน้าเดียว
   ② หน้าที่เต็มกระดาษอยู่แล้ว ต้องบอกว่าไม่มีขอบขาวให้ตัด (ไม่ใช่ครอบมั่ว)
   ③ เพิ่มหน้าว่างแล้วการ์ดเพิ่มขึ้นจริง
   ④ ‼️ ไฟล์ผลลัพธ์ต้องมีจำนวนหน้าครบ รวมหน้าว่างด้วย
   ⑤ ‼️ โหมดตั้งต้น "หน้าเท่ากันทุกหน้า" ทุกหน้าต้องขนาดเท่ากัน และข้อความยังอยู่ครบ
   ⑥ ‼️ หน้าที่ไม่ได้ครอบต้องไม่ถูกแตะ
   ⑦ ‼️ เพิ่มไฟล์แล้วงานที่จัดไว้ต้องไม่หาย และหน้าใหม่ต้องแทรกตรงที่เลือก
   ⑧ ‼️ ทางไปเครื่องมือแก้ข้อความ ต้องพาไฟล์ไปด้วย ไม่ให้เลือกใหม่

รัน: tests/run.sh browser_pdfpages_crop   (ต้องมี PyMuPDF)
"""
import os
import sys
import glob
import tempfile
from playwright.sync_api import sync_playwright

try:
    import fitz
except ImportError:
    print("ข้าม: ไม่มี PyMuPDF (pip install pymupdf)")
    sys.exit(0)

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0


def ck(label, got, want):
    global ok, fail
    if got == want:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")


def make_src(path):
    """2 หน้าเต็มกระดาษ + 1 หน้าที่เนื้อหาอยู่ครึ่งบน (จำลองไฟล์สแกนที่พี่ปอนด์เจอ)"""
    d = fitz.open()
    for i in range(2):
        p = d.new_page(width=595, height=842)
        p.draw_rect(fitz.Rect(40, 40, 555, 800), color=(0, 0, 0), width=1)
        p.insert_text((60, 80), f"Full page {i + 1}", fontsize=20)
    p = d.new_page(width=595, height=842)
    p.draw_rect(fitz.Rect(40, 40, 555, 400), color=(0, 0, 0), width=1)
    p.insert_text((60, 80), "Short scan", fontsize=20)
    d.save(path)
    d.close()


print(f"\n━━ ครอบขอบขาว + เพิ่มหน้าว่าง ({BASE}) ━━")
with tempfile.TemporaryDirectory() as td:
    src = os.path.join(td, "scan3.pdf")
    make_src(src)
    out = os.path.join(td, "out.pdf")

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [src])
        pg.wait_for_timeout(6000)

        bar = pg.locator(".ws-toolbar button, .ws-canvas button")
        # ② หน้าเต็มกระดาษอยู่แล้ว ต้องไม่ครอบมั่ว
        pg.locator(".pg").nth(0).click()
        pg.wait_for_timeout(500)
        bar.filter(has_text="ครอบขอบขาว").first.click()
        pg.wait_for_timeout(2500)
        msg = pg.evaluate("() => (document.querySelector('.status')||{}).textContent || ''")
        ck("② หน้าที่เต็มอยู่แล้ว ต้องบอกว่าไม่มีขอบขาวให้ตัด", "ไม่มีขอบขาว" in msg, True)
        ck("② และต้องไม่ติดป้ายครอบให้หน้านั้น", pg.locator(".pg-cropped").count(), 0)

        # ① ครอบหน้าที่มีขอบขาวจริง
        pg.locator(".pg").nth(2).click()
        pg.wait_for_timeout(500)
        bar.filter(has_text="ครอบขอบขาว").first.click()
        pg.wait_for_timeout(2500)
        ck("① ป้าย 'ครอบแล้ว' ขึ้นหน้าเดียว", pg.locator(".pg-cropped").count(), 1)

        # ③ เพิ่มหน้าว่าง
        before = pg.locator(".pg").count()
        bar.filter(has_text="หน้าว่าง").first.click()
        pg.wait_for_timeout(1200)
        ck("③ เพิ่มหน้าว่างแล้วการ์ดเพิ่มขึ้น 1 ใบ", pg.locator(".pg").count(), before + 1)
        ck("③ และวาดเป็นกระดาษเปล่าให้เห็น", pg.locator(".pg-blank").count(), 1)

        # ── ⑦ ‼️ เพิ่มไฟล์แล้วงานที่จัดไว้ต้องไม่หาย และหน้าใหม่ต้องแทรกตรงที่เลือก
        #    เดิมเพิ่มไฟล์แล้ว loadPreview() ล้าง items ทิ้งหมด หน้าที่ลบไว้กลับมา
        #    การหมุน การครอบ หน้าว่างที่เพิ่มเอง หายเกลี้ยง (พิสูจน์แล้ว 18/09/2026)
        second = os.path.join(td, "two.pdf")
        d2 = fitz.open()
        d2.new_page(width=595, height=842)
        d2.new_page(width=595, height=842)
        d2.save(second)
        d2.close()
        pg.locator(".pg").nth(1).click()          # เลือกหน้า 2 แล้วลบทิ้ง
        pg.wait_for_timeout(400)
        bar.nth(2).click()
        pg.wait_for_timeout(800)
        dropped_before = pg.locator(".pg.dropped").count()
        pg.locator(".pg").nth(0).click()          # เลือกหน้า 1 ไว้เป็นจุดแทรก
        pg.wait_for_timeout(400)
        pg.set_input_files("input[type=file]", [src, second])
        pg.wait_for_timeout(7000)
        ck("⑦ เพิ่มไฟล์แล้วหน้าที่ทำเครื่องหมายลบไว้ต้องยังอยู่",
           pg.locator(".pg.dropped").count(), dropped_before)
        tags = pg.evaluate(
            "() => [...document.querySelectorAll('.pg')]"
            ".map(n => (n.querySelector('.src')||{}).textContent || '-')")
        ck("⑦ หน้าจากไฟล์ใหม่ต้องแทรกต่อจากหน้าที่เลือก ไม่ใช่ต่อท้าย", tags[1:3], ["B", "B"])
        print(f"      ลำดับไฟล์ที่ได้: {tags}")

        with pg.expect_download(timeout=60000) as dl:
            pg.locator(".ws-footer button, .actions button").filter(has_text="บันทึก").first.click()
            pg.wait_for_timeout(3000)
            pg.locator(".result button").filter(has_text="ดาวน์โหลด").first.click()
        dl.value.save_as(out)
        # ── ⑧ ‼️ รอยต่อไปเครื่องมือแก้ข้อความ ต้องพาไฟล์ไปด้วย
        #    พี่ปอนด์ถามว่าควรรวมสองเครื่องมือเข้าด้วยกันไหม (18/09/2026)
        #    ทั้งคู่โหลดไลบรารีชุดเดียวกัน (pdfjs+pdflib) การแยกจึงไม่ได้ทำให้หนักขึ้น
        #    ปัญหาจริงคือ "รอยต่อ" — ลิงก์ในหมายเหตุเคยเป็นลิงก์เปล่า กดแล้วไฟล์หาย
        #    ต้องไปเลือกไฟล์ใหม่ ซึ่งทำให้รู้สึกว่าเป็นคนละเครื่องมือ
        pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        pg.set_input_files("input[type=file]", [src])
        pg.wait_for_timeout(6000)
        bar2 = pg.locator(".ws-toolbar button, .ws-canvas button")
        bar2.filter(has_text="แก้ข้อความบนหน้า").first.click()
        pg.wait_for_timeout(5000)
        ck("⑧ ปุ่มไปแก้ข้อความ ต้องไปถึงเครื่องมือนั้นจริง",
           pg.evaluate("() => location.hash"), "#/pdf-edit")
        ck("⑧ และต้องพาไฟล์ไปด้วย ไม่ให้ต้องเลือกใหม่",
           pg.locator(".file-row").count() > 0, True)

        ck("ไม่มี error หลุดออกมา", errs[:1], [])
        b.close()

    # ── เปิดไฟล์ผลลัพธ์อ่านค่าจริง
    doc = fitz.open(out)
    ck("④ ไฟล์ผลลัพธ์ต้องมีหน้าครบ (3 + หน้าว่าง 1 + ไฟล์ใหม่ 2 - ที่ลบ 1)", doc.page_count, 5)
    p3 = next(pp for pp in doc if "Short scan" in pp.get_text())
    # ‼️ ค่าตั้งต้นคือโหมด "หน้าเท่ากันทุกหน้า" หน้าที่ครอบจึงยังเป็น A4 เท่าเดิม
    #    เนื้อหาถูกฝังใหม่แล้วจัดกลางหน้า ไม่ใช่หน้ากระดาษหดลง
    ck("⑤ โหมดตั้งต้น ทุกหน้าต้องขนาดเท่ากันหมด",
       sorted({(round(pp.rect.width), round(pp.rect.height)) for pp in doc}), [(595, 842)])
    ck("⑤ และข้อความในหน้านั้นต้องยังอยู่", "Short scan" in p3.get_text(), True)
    p1 = next(pp for pp in doc if "Full page 1" in pp.get_text())
    ck("⑥ หน้าที่ไม่ได้ครอบต้องไม่ถูกแตะ",
       (round(p1.cropbox.width), round(p1.cropbox.height)), (595, 842))
    # ‼️ เนื้อหาที่ครอบต้องยังไม่ถูกยืดบิด — ตรวจว่าขนาดตัวอักษรเท่าเดิม
    sp = next(sp for bl in p3.get_text("dict")["blocks"] if bl.get("lines")
              for ln in bl["lines"] for sp in ln["spans"])
    ck("⑥ เนื้อหาต้องไม่ถูกยืดบิด (ขนาดตัวอักษรเท่าเดิม 20pt)", round(sp["size"]), 20)
    ck("④ ต้องมีหน้าว่างอยู่ในไฟล์จริง", sum(1 for pp in doc if not pp.get_text().strip()) >= 1, True)
    print(f"      หน้า 3: CropBox {round(p3.cropbox.width)}x{round(p3.cropbox.height)}"
          f" / MediaBox {round(p3.mediabox.width)}x{round(p3.mediabox.height)}")
    doc.close()

print(f"\nผ่าน {ok} · ตก {fail}")
sys.exit(1 if fail else 0)
