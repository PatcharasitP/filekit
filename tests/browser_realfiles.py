# ไฟล์จริงที่ "หน้าตาไม่เหมือนไฟล์ตัวอย่าง" แล้วทำให้ข้อมูลเพี้ยน/หลุดแบบเงียบ ๆ
#
# เทสชุดนี้เกิดจากการยิงไฟล์จริงหลายรูปแบบเมื่อ 09/09/2026 แล้วเจอของที่พังโดยไม่มีอะไรฟ้อง
#
#   ① ชีทที่ผู้ใช้ "ซ่อนไว้" ใน Excel (เงินเดือน ต้นทุน สูตรราคา)
#      excel-csv และ excel-to-pdf เคยส่งออกให้ครบทุกตัวอักษรโดยไม่ถามและไม่บอก
#      = ทำข้อมูลที่ตั้งใจซ่อนหลุดออกไป ซึ่งร้ายกว่าแปลงไม่สำเร็จเสียอีก
#
#   ② รูปถ่ายจากมือถือที่หมุนด้วยแท็ก EXIF Orientation
#      images-to-pdf ฝังไบต์ JPEG ดิบลง PDF ตรง ๆ ซึ่ง pdf-lib ไม่รู้จักแท็กนี้เลย
#      รูปแนวตั้งจึงกลายเป็นแนวนอนล้มตะแคง (วัดได้จากสัดส่วนหน้า PDF)
#
#   ③ ย่อหน้าไทยยาว ๆ ที่ไม่มีเว้นวรรค (เอกสารราชการ/สัญญาเขียนแบบนี้เป็นปกติ)
#      jsPDF ตัดบรรทัดด้วย split(" ") เท่านั้น ทั้งย่อหน้าจึงเป็น "คำเดียว" แล้วถูกหั่น
#      ตรงไหนก็ได้ วัดจริงแล้ว "และ" ถูกฉีกเป็น "แล" + "ะ" และ "ค่าใช้จ่าย" ถูกฉีกจน
#      ค้นหาใน PDF ไม่เจอเลย · เกณฑ์ตรวจใช้ 2 ชั้น: บรรทัดต้องไม่จบด้วยสระนำโดด ๆ
#      (เ แ โ ใ ไ ซึ่งไม่มีทางเป็นตัวสุดท้ายของคำไทยได้) และคำทดสอบต้องค้นหาเจอครบ
#
#   ④ PDF ที่หน้าถูกหมุนไว้ (/Rotate 90/180/270 — ปกติมากสำหรับไฟล์สแกน)
#      pdf-page-numbers วางเลขด้วยพิกัดดิบซึ่งคนละแกนกับที่ตาเห็น เลขจึงไปโผล่ขอบซ้าย
#      ขอบขวา หรือหัวกระดาษ · ‼️ PyMuPDF คืนพิกัดข้อความแบบไม่คิด rotation ให้
#      ต้องคูณ page.rotation_matrix เองก่อนวัด ไม่งั้นจะอ่านผลผิดทั้งชุด
#
#   ⑤ PDF ที่ยังค้นหาข้อความได้ ถูกส่งเข้าเครื่องบีบอัด
#      เดิมวาดทุกหน้าใหม่เป็นภาพให้เอง = ไฟล์มักใหญ่ขึ้นและชั้นข้อความหายทั้งไฟล์
#      ตอนนี้ต้องบีบแบบไม่วาดใหม่ก่อน และถ้าทำไม่ได้ต้องหยุดถาม ไม่ทำลายของเงียบ ๆ
#
# ‼️ หน้าเว็บมี Content-Security-Policy ที่ไม่มี unsafe-eval — wait_for_function
#    ต้องส่งสตริงที่เป็นฟังก์ชันลูกศรเท่านั้น (มีเทสจับกฎนี้ใน accepts.test.mjs)
#
# รัน: ../.venv/bin/python tests/browser_realfiles.py     (เปิด/ปิด server ให้เอง)
#      ตั้ง FK_BASE=http://localhost:8899 ถ้ามี server อยู่แล้ว
import os
import subprocess
import sys
import pathlib
import shutil
import socket
import tempfile
import time

import fitz
import openpyxl
from docx import Document
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_realfiles_"))
DL = TMP / "dl"
DL.mkdir()

P, F = 0, []


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def make_hidden_workbook():
    """xlsx ที่มีชีทเห็นปกติ 1 ชีท, ซ่อน 1 ชีท, ซ่อนลึก 1 ชีท"""
    wb = openpyxl.Workbook()
    s1 = wb.active
    s1.title = "รายชื่อ"
    s1["A1"], s1["A2"] = "ชื่อ", "สมชาย"
    s2 = wb.create_sheet("ลับ")
    s2["A1"], s2["A2"] = "เงินเดือน", "ห้ามเผยแพร่"
    s2.sheet_state = "hidden"
    s3 = wb.create_sheet("ลับมาก")
    s3["A1"] = "รหัสผ่านระบบ"
    s3.sheet_state = "veryHidden"
    p = TMP / "มีชีทซ่อน.xlsx"
    wb.save(p)
    return p


def make_rotated_photo():
    """JPEG ที่เก็บพิกเซลเป็นแนวนอน แล้วสั่งหมุนเป็นแนวตั้งด้วย EXIF (แบบที่มือถือถ่ายจริง)"""
    im = Image.new("RGB", (800, 600), (240, 240, 240))
    im.paste(Image.new("RGB", (200, 60), (20, 20, 200)), (0, 0))
    ex = Image.Exif()
    ex[0x0112] = 6          # 6 = หมุนตามเข็ม 90 องศาตอนแสดงผล
    p = TMP / "ถ่ายแนวตั้ง.jpg"
    im.save(p, exif=ex)
    return p


FIND_WORDS = ["ไม่เหมือนใคร", "ประสบการณ์", "ค่าใช้จ่าย", "รับประกัน"]

# ‼️ กฎที่ตัดสินได้แน่นอนว่า "ฉีกคำ" โดยไม่ต้องมีตัวตัดคำภาษาไทยในฝั่งเทส
#   · สระนำ (เ แ โ ใ ไ) เขียนไว้ "หน้า" พยัญชนะ จึงเป็นตัวท้ายบรรทัดไม่ได้เด็ดขาด
#   · สระบน/ล่าง วรรณยุกต์ ทัณฑฆาต และสระ ะ า ำ ต้องเกาะพยัญชนะที่มาก่อนเสมอ
#     จึงเป็นตัวแรกของบรรทัดไม่ได้เด็ดขาด
BAD_LINE_END = "เแโใไ"
BAD_LINE_START = "ะัาำิีึืุู็่้๊๋์ํๆฺๅ"


def broken_words(lines):
    return ([x for x in lines if x[-1] in BAD_LINE_END]
            + [x for x in lines if x[0] in BAD_LINE_START])

THAI_PARA = (
    "บริษัทของเราให้บริการที่ไม่เหมือนใครในตลาดเพราะเราใส่ใจรายละเอียดทุกขั้นตอน"
    "และมีทีมงานที่มีประสบการณ์มากกว่าสิบปีพร้อมให้คำปรึกษาแก่ลูกค้าทุกท่าน"
    "โดยไม่มีค่าใช้จ่ายเพิ่มเติมและรับประกันความพึงพอใจเต็มร้อย"
)


def make_thai_docx():
    """.docx ที่มีย่อหน้าไทยยาวไม่มีเว้นวรรคเลย แบบเอกสารราชการ/สัญญาจริง"""
    d = Document()
    d.add_paragraph(THAI_PARA)
    p = TMP / "ย่อหน้าไทย.docx"
    d.save(p)
    return p


def make_narrow_table():
    """xlsx หลายคอลัมน์จนแต่ละช่องแคบ บังคับให้ต้องตัดบรรทัดในเซลล์"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "งาน"
    ws.append(["ลำดับ", "รายการ", "หมายเหตุ", "ผู้รับผิดชอบ", "สถานะงาน",
               "หน่วยงาน", "งบประมาณ", "วันครบกำหนด"])
    ws.append([1, "ค่าบริการรายเดือน", THAI_PARA, "ฝ่ายบัญชีและการเงิน",
               "อยู่ระหว่างดำเนินการตรวจสอบเอกสาร", "สำนักงานใหญ่",
               "หนึ่งแสนสองหมื่นบาทถ้วน", "สามสิบเอ็ดธันวาคม"])
    ws.append([2, "ค่าติดตั้งอุปกรณ์", "ไม่มีค่าใช้จ่ายเพิ่มเติมเพราะรวมอยู่ในสัญญาแล้ว",
               "ฝ่ายเทคโนโลยีสารสนเทศ", "เสร็จสมบูรณ์แล้วรอปิดงาน", "สาขาภาคเหนือ",
               "ห้าหมื่นบาทถ้วน", "สิบห้ามกราคม"])
    p = TMP / "ตารางแคบ.xlsx"
    wb.save(p)
    return p


def make_rotated_pdf():
    """PDF ที่แต่ละหน้าถูกหมุนไว้คนละองศา แบบไฟล์สแกนที่ผ่านการหมุนแก้มาแล้ว"""
    d = fitz.open()
    for rot in (0, 90, 270, 180):
        page = d.new_page(width=595, height=842)
        page.insert_text((70, 100), f"rot {rot}", fontsize=18)
        page.set_rotation(rot)
    p = TMP / "หมุนสลับ.pdf"
    d.save(p)
    d.close()
    return p


def make_text_pdf(compact):
    """PDF ที่มีชั้นข้อความจริง · compact=True คือบันทึกแบบบีบโครงสร้างมาแล้ว
    (บีบแบบไม่เสียข้อความต่อไม่ได้ เครื่องมือต้องหยุดถามแทนที่จะวาดใหม่เป็นภาพ)"""
    d = fitz.open()
    for i in range(6):
        page = d.new_page()
        for k in range(28):
            page.insert_text((60, 80 + k * 22),
                             f"Line {k + 1} of page {i + 1} - searchable text that must survive",
                             fontsize=11)
    p = TMP / ("บีบมาแล้ว.pdf" if compact else "ข้อความล้วน.pdf")
    # use_objstms=1 คือรูปแบบเดียวกับที่ pdf-lib บันทึกออกมา (เช่นไฟล์ที่ผ่าน pdf-merge มาแล้ว)
    # บันทึกซ้ำจึงไม่เล็กลงอีก = เคสที่เครื่องมือต้องหยุดถาม ไม่ใช่วาดใหม่เป็นภาพให้เอง
    if compact:
        d.save(p, garbage=4, deflate=True, use_objstms=1)
    else:
        d.save(p)
    d.close()
    return p


def pages_with_text(path):
    doc = fitz.open(path)
    n = sum(1 for i in range(doc.page_count) if doc[i].get_text().strip())
    doc.close()
    return n


def press(pg, pattern):
    """กดปุ่มที่มองเห็นจริงด้วย evaluate — ระหว่างที่เครื่องมือทำงานหนัก .click() ของ Playwright
    จะรอจนงานเสร็จก่อนค่อยกด ทำให้ทดสอบผิดเคสโดยไม่รู้ตัว (บทเรียน 09/09/2026)"""
    return pg.evaluate(
        "(re) => { const b = [...document.querySelectorAll('button')]"
        ".find((b) => b.offsetParent && new RegExp(re).test(b.textContent)); "
        "if (b) { b.click(); return b.textContent.trim(); } return null; }",
        pattern,
    )


def main():
    base = os.environ.get("FK_BASE")
    server = None
    if not base:
        port = free_port()
        server = subprocess.Popen([sys.executable, "-m", "http.server", str(port)],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://localhost:{port}"
        time.sleep(1.5)

    xlsx = make_hidden_workbook()
    photo = make_rotated_photo()
    docx = make_thai_docx()
    narrow = make_narrow_table()
    rotated = make_rotated_pdf()
    text_pdf = make_text_pdf(False)
    compact_pdf = make_text_pdf(True)

    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1360, "height": 950},
                                reduced_motion="no-preference", accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)

            # ── ① ชีทที่ซ่อนไว้ ต้องไม่หลุดออกไปเอง ────────────────────────────────
            print("\n── ① ชีทที่ผู้ใช้ซ่อนไว้ ต้องไม่ถูกส่งออกโดยไม่ถาม ──")

            pg.goto(f"{base}/#/excel-csv", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(xlsx))
            pg.wait_for_timeout(600)
            press(pg, "แปลงไฟล์")
            pg.wait_for_timeout(2500)
            names = pg.evaluate("() => [...document.querySelectorAll('.result .r-name strong')]"
                                ".map((e) => e.textContent)")
            ck("excel-csv แปลงเฉพาะชีทที่เห็นปกติ ไม่แตะชีทที่ซ่อนไว้",
               [n for n in names if "ลับ" in n], [])
            ck("excel-csv ได้ไฟล์ของชีทที่เห็นปกติจริง", len(names), 1)
            warn = pg.locator(".note.warn").inner_text() if pg.locator(".note.warn").count() else ""
            ck("excel-csv บอกผู้ใช้ตรง ๆ ว่าข้ามชีทที่ซ่อนไว้กี่ชีท ชื่ออะไร",
               ("ลับ" in warn and "ลับมาก" in warn), True)

            # ผู้ใช้ที่ต้องการจริง ๆ ต้องยังสั่งได้ ไม่ใช่ปิดตายไปเลย
            press(pg, "แปลงชีทที่ซ่อนด้วย")
            pg.wait_for_timeout(2500)
            names2 = pg.evaluate("() => [...document.querySelectorAll('.result .r-name strong')]"
                                 ".map((e) => e.textContent)")
            ck("กดขอเองแล้วได้ชีทที่ซ่อนมาครบ", len([n for n in names2 if "ลับ" in n]), 2)

            pg.goto(f"{base}/#/excel-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(xlsx))
            pg.wait_for_timeout(600)
            press(pg, "แปลงเป็น PDF")
            pg.wait_for_timeout(4000)
            with pg.expect_download(timeout=20000) as info:
                pg.locator(".result button").first.click()
            out = DL / "sheets.pdf"
            info.value.save_as(str(out))
            doc = fitz.open(out)
            text = "\n".join(doc[i].get_text() for i in range(doc.page_count))
            doc.close()
            ck("excel-to-pdf ไม่พิมพ์เนื้อหาชีทที่ซ่อนไว้ลงหน้ากระดาษ", "ห้ามเผยแพร่" in text, False)
            ck("excel-to-pdf ไม่พิมพ์ชีทที่ซ่อนลึกด้วย", "รหัสผ่านระบบ" in text, False)
            ck("excel-to-pdf ยังพิมพ์ชีทที่เห็นปกติครบ", "สมชาย" in text, True)
            warn2 = pg.locator(".note.warn").inner_text() if pg.locator(".note.warn").count() else ""
            ck("excel-to-pdf บอกผู้ใช้ว่าข้ามชีทที่ซ่อนไว้", "ลับ" in warn2, True)

            # ── ② รูปที่หมุนด้วย EXIF ต้องเข้า PDF ถูกทิศ ──────────────────────────
            print("\n── ② รูปถ่ายที่หมุนด้วยแท็ก EXIF ──")
            pg.goto(f"{base}/#/images-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(photo))
            pg.wait_for_timeout(1200)
            press(pg, "สร้างไฟล์ PDF")
            pg.wait_for_timeout(4000)
            with pg.expect_download(timeout=20000) as info:
                pg.locator(".result button").last.click()
            out2 = DL / "photo.pdf"
            info.value.save_as(str(out2))
            doc = fitz.open(out2)
            r = doc[0].rect
            doc.close()
            # ไฟล์เก็บพิกเซลไว้ 800x600 (แนวนอน) แต่ EXIF สั่งหมุนเป็น 600x800 (แนวตั้ง)
            ck("images-to-pdf วางรูปถ่ายแนวตั้งเป็นหน้าแนวตั้ง ไม่ล้มตะแคง", r.height > r.width, True)

            # ── ③ ย่อหน้าไทยยาวไม่มีเว้นวรรค ต้องตัดบรรทัดที่ขอบคำ ───────────────────
            print("\n── ③ ตัดบรรทัดภาษาไทยโดยไม่ฉีกคำ ──")

            def lines_of(pdf_path):
                doc = fitz.open(pdf_path)
                page = doc[0]
                out = []
                for blk in page.get_text("dict")["blocks"]:
                    for ln in blk.get("lines", []):
                        t = "".join(sp["text"] for sp in ln["spans"]).strip()
                        if t:
                            out.append(t)
                hits = {w: len(page.search_for(w)) for w in FIND_WORDS}
                doc.close()
                return out, hits

            pg.goto(f"{base}/#/word-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(docx))
            pg.wait_for_timeout(1200)
            press(pg, "แปลง|สร้าง")
            pg.wait_for_timeout(5000)
            with pg.expect_download(timeout=25000) as info:
                pg.locator(".result button").last.click()
            out3 = DL / "thai.pdf"
            info.value.save_as(str(out3))
            lines, hits = lines_of(out3)
            ck("word-to-pdf ไม่มีบรรทัดไหนขึ้นต้น/ลงท้ายด้วยรูปที่ยืนเดี่ยวไม่ได้ (= ฉีกคำแน่นอน)",
               broken_words(lines), [])
            ck("word-to-pdf ค้นหาคำในเอกสารที่สร้างเจอครบทุกคำ",
               [w for w, n in hits.items() if n == 0], [])

            pg.goto(f"{base}/#/excel-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(narrow))
            pg.wait_for_timeout(900)
            press(pg, "แปลงเป็น PDF")
            pg.wait_for_timeout(5000)
            with pg.expect_download(timeout=25000) as info:
                pg.locator(".result button").first.click()
            out4 = DL / "narrow.pdf"
            info.value.save_as(str(out4))
            lines2, hits2 = lines_of(out4)
            # ถ้าคอลัมน์กว้างพอจนไม่มีเซลล์ไหนต้องตัดบรรทัดเลย เทสนี้จะผ่านแบบหลอก ๆ
            # (8 คอลัมน์ x 3 แถว = 24 ช่อง ถ้าบรรทัดมากกว่านั้นแปลว่ามีการตัดบรรทัดจริง)
            ck("มีเซลล์ที่ถูกตัดบรรทัดจริงในไฟล์ทดสอบ (ประชากรต้องไม่เป็นศูนย์)",
               len(lines2) > 24, True)
            ck("excel-to-pdf ตัดบรรทัดในเซลล์แคบโดยไม่ฉีกคำไทย",
               broken_words(lines2), [])
            ck("excel-to-pdf ค้นหาคำในตารางที่สร้างเจอครบทุกคำ",
               [w for w, n in hits2.items() if n == 0], [])

            # ── ④ PDF ที่หน้าถูกหมุนไว้ เลขหน้าต้องอยู่ขอบล่างเสมอ ─────────────────────
            print("\n── ④ เลขหน้าบน PDF ที่หมุนไว้ ──")
            pg.goto(f"{base}/#/pdf-page-numbers", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(rotated))
            pg.wait_for_timeout(2000)
            press(pg, "ใส่เลขหน้า|เพิ่มเลขหน้า")
            pg.wait_for_timeout(5000)
            with pg.expect_download(timeout=25000) as info:
                pg.locator(".result button").first.click()
            out5 = DL / "numbered.pdf"
            info.value.save_as(str(out5))
            doc = fitz.open(out5)
            spots = []
            for i in range(doc.page_count):
                page = doc[i]
                r = page.rect
                box = None
                for blk in page.get_text("dict")["blocks"]:
                    for ln in blk.get("lines", []):
                        if "".join(sp["text"] for sp in ln["spans"]).strip().isdigit():
                            box = ln["bbox"]
                # ‼️ PyMuPDF คืนพิกัดแบบไม่คิด rotation ต้องแปลงเองก่อนถึงจะวัดตรงกับที่ตาเห็น
                if box:
                    # ‼️ อย่าใช้ชื่อ b ตรงนี้ มันไปทับตัวแปรเบราว์เซอร์จนปิดไม่ลงตอนจบ
                    vb = tuple(fitz.Rect(box) * page.rotation_matrix)
                    cy, cx = (vb[1] + vb[3]) / 2, (vb[0] + vb[2]) / 2
                    spots.append((page.rotation,
                                  "ล่าง" if cy > r.height * 0.8 else "ไม่ใช่ล่าง",
                                  "กลาง" if r.width * 0.3 < cx < r.width * 0.7 else "ไม่ใช่กลาง"))
                else:
                    spots.append((page.rotation, "ไม่พบเลข", "ไม่พบเลข"))
            doc.close()
            ck("pdf-page-numbers วางเลขที่ขอบล่างกลางหน้าเสมอ ไม่ว่าหน้าจะถูกหมุนไว้กี่องศา",
               spots, [(0, "ล่าง", "กลาง"), (90, "ล่าง", "กลาง"),
                       (270, "ล่าง", "กลาง"), (180, "ล่าง", "กลาง")])

            # ── ⑤ บีบอัด PDF ต้องไม่ทำลายชั้นข้อความเงียบ ๆ ────────────────────────────
            print("\n── ⑤ บีบอัด PDF ที่ยังค้นหาข้อความได้ ──")
            pg.goto(f"{base}/#/pdf-compress", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(text_pdf))
            pg.wait_for_timeout(2500)
            press(pg, "บีบอัดไฟล์")
            pg.wait_for_selector(".results .result, .results .note.warn", timeout=40000)
            ck("บีบไฟล์ข้อความแล้วได้ไฟล์ออกมาจริง", pg.locator(".results .result").count() >= 1, True)
            with pg.expect_download(timeout=25000) as info:
                pg.locator(".results .result button").first.click()
            out6 = DL / "compressed.pdf"
            info.value.save_as(str(out6))
            ck("บีบแล้วชั้นข้อความยังอยู่ครบทุกหน้า", pages_with_text(out6), 6)
            ck("บีบแล้วไฟล์เล็กลงจริง", out6.stat().st_size < text_pdf.stat().st_size, True)
            ck("บอกผู้ใช้ว่าข้อความยังค้นหาได้",
               "ค้นหา" in pg.locator(".status").inner_text(), True)

            # ไฟล์ที่บีบโครงสร้างมาแล้ว: ห้ามวาดใหม่เป็นภาพให้เอง ต้องหยุดถามก่อน
            pg.goto(f"{base}/#/pdf-compress", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(compact_pdf))
            pg.wait_for_timeout(2500)
            press(pg, "บีบอัดไฟล์")
            pg.wait_for_selector(".results .result, .results .note.warn", timeout=40000)
            ck("ไฟล์ที่บีบต่อไม่ได้โดยไม่เสียข้อความ ต้องไม่ยัดไฟล์ที่ข้อความหายให้เอง",
               pg.locator(".results .result").count(), 0)
            ck("ต้องมีปุ่มให้ผู้ใช้เลือกเองว่าจะยอมเสียข้อความไหม",
               pg.locator(".results .note.warn button").count(), 1)
            pg.evaluate("() => document.querySelector('.note.warn button').click()")
            pg.wait_for_selector(".results .result", timeout=40000)
            with pg.expect_download(timeout=25000) as info:
                pg.locator(".results .result button").first.click()
            out7 = DL / "forced.pdf"
            info.value.save_as(str(out7))
            ck("กดยอมแล้วยังบีบให้ได้จริง (ไม่ได้ปิดทางผู้ใช้)", out7.stat().st_size > 0, True)

            print("\n── ไม่มี error หลุดออกมา ──")
            ck("ไม่มี console หรือ page error ตลอดทั้งชุด", errs, [])
            ctx.close()
            b.close()
    finally:
        if server:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"\nผ่าน {P}, ตก {len(F)}")
    for i, x in enumerate(F, 1):
        print(f"  {i}. {x}")
    sys.exit(1 if F else 0)
