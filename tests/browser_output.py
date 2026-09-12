# ตรวจ "เนื้อในไฟล์ผลลัพธ์จริง" ของ FileKit — ไม่ใช่แค่กดแล้วไม่ error
# ดาวน์โหลดไฟล์ที่แต่ละเครื่องมือสร้างจริง แล้วเปิดตรวจด้วยไลบรารีฝั่ง Python
# (fitz/PyMuPDF สำหรับ PDF, Pillow สำหรับรูป, openpyxl สำหรับ Excel)
#
# รันจากโฟลเดอร์ FileKit/ หลังเปิดเซิร์ฟเวอร์แล้ว (ดู tests/README.md):
#   python3 -m http.server 8899 &
#   ../.venv/bin/python tests/browser_output.py
#
# ทุกไฟล์ตัวอย่างสร้างขึ้นเองในสคริปต์นี้ (รู้คำตอบที่ถูกต้องล่วงหน้าเพราะเราสร้างเอง)
# ลงโฟลเดอร์ชั่วคราวแล้วลบทิ้งท้ายสคริปต์เสมอผ่าน try/finally

import sys, os, io, csv, shutil, zipfile, traceback
import pathlib
import tempfile
from playwright.sync_api import sync_playwright

import fitz            # PyMuPDF
from PIL import Image
import openpyxl

BASE = os.environ.get("FK_BASE", "http://localhost:8899")

ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_output_test_"))   # เดิม hardcode path ของ scratchpad session เก่า (ซ่อม 09/09/2026)
FIX = ROOT / "fixtures"
DL = ROOT / "downloads"

THAI_FONT = "/mnt/c/Windows/Fonts/leelawad.ttf"  # ฟอนต์ไทยบนเครื่อง Windows (มองผ่าน WSL) — ใช้สร้าง PDF ภาษาไทยของจริง

P, F = 0, []
ROWS = []  # ตารางสรุป: (เครื่องมือ, สิ่งที่ตรวจ, ค่าที่คาด, ค่าจริง, ผ่าน/ไม่ผ่าน)


def ck(tool, what, name, got, want, contains=False):
    """บันทึกผลตรวจ 1 ข้อ ลง P/F และตาราง ROWS"""
    global P
    ok = (want in got) if contains else (got == want)
    if ok:
        P += 1
    else:
        F.append(f"[{tool}] {name}\n      ได้ {got!r} ควรได้ {want!r}")
    ROWS.append((tool, what, repr(want), repr(got), "ผ่าน" if ok else "ไม่ผ่าน"))
    print(f"  {'✅' if ok else '❌'} [{tool}] {name}")
    return ok


def wait_status(pg, substr, timeout=20000):
    """รอจนกล่องสถานะ (.status) มีข้อความที่มี substr อยู่ในนั้น, ทนกว่าการรอ class เฉย ๆ"""
    pg.wait_for_function(
        "(t) => { const el = document.querySelector('.status'); return !!(el && el.textContent.includes(t)); }",
        arg=substr, timeout=timeout,
    )


def dl_click(pg, locator, path):
    with pg.expect_download() as dlinfo:
        locator.click()
    dlinfo.value.save_as(str(path))
    return path


# ── สร้างไฟล์ตัวอย่าง (รู้คำตอบล่วงหน้าเพราะสร้างเอง) ─────────────────────────

def make_pdf(path, texts, size=(400, 600), thai=False):
    doc = fitz.open()
    for t in texts:
        pg = doc.new_page(width=size[0], height=size[1])
        if thai:
            pg.insert_font(fontname="thaifont", fontfile=THAI_FONT)
            pg.insert_text((40, 80), t, fontname="thaifont", fontfile=THAI_FONT, fontsize=18)
        else:
            pg.insert_text((40, 80), t, fontname="helv", fontsize=16)
    doc.save(str(path))
    doc.close()


def make_png(path, size, color):
    Image.new("RGB", size, color).save(path, "PNG")


def make_transparent_png(path, size=(200, 200)):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    px = im.load()
    x0, y0, x1, y1 = size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4
    for y in range(y0, y1):
        for x in range(x0, x1):
            px[x, y] = (220, 30, 30, 255)
    im.save(path, "PNG")


def make_xlsx(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["ชื่อ", "จำนวน"])
    ws.append(["สมชาย ใจดี", 12345])
    ws.append(["สมหญิง รักไทย", 67890])
    wb.save(path)


def read_pdf_texts(data: bytes):
    d = fitz.open(stream=data, filetype="pdf")
    texts = [d[i].get_text().strip() for i in range(d.page_count)]
    d.close()
    return texts


def read_pdf(data: bytes):
    return fitz.open(stream=data, filetype="pdf")


# ═══════════════════════════════════════════════════════════════════════════
# แต่ละฟังก์ชันด้านล่าง = 1 เครื่องมือ · รับ (pg) แล้วอัปโหลด → กด → ดาวน์โหลด → ตรวจ
# ═══════════════════════════════════════════════════════════════════════════

def test_pdf_merge(pg):
    tool = "pdf-merge"
    a = FIX / "merge-a.pdf"; make_pdf(a, ["MERGE-A-P1"])
    b = FIX / "merge-b.pdf"; make_pdf(b, ["MERGE-B-P1", "MERGE-B-P2"])
    c = FIX / "merge-c.pdf"; make_pdf(c, ["MERGE-C-P1", "MERGE-C-P2", "MERGE-C-P3"])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-merge", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(a), str(b), str(c)])
    pg.wait_for_timeout(400)
    pg.locator("button.btn", has_text="รวมไฟล์").click()
    wait_status(pg, "รวมเสร็จ")
    out = DL / "merge-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    data = out.read_bytes()
    texts = read_pdf_texts(data)
    ck(tool, "จำนวนหน้ารวม 1+2+3", "รวมหน้า", len(texts), 6)
    expect = ["MERGE-A-P1", "MERGE-B-P1", "MERGE-B-P2", "MERGE-C-P1", "MERGE-C-P2", "MERGE-C-P3"]
    ck(tool, "ลำดับหน้าตรงกับไฟล์ต้นฉบับที่อัปโหลด", "ลำดับข้อความทุกหน้า", texts, expect)


def test_pdf_split(pg):
    tool = "pdf-split"
    src = FIX / "split_test.pdf"
    make_pdf(src, [f"SPLIT-PAGE-{i}" for i in range(1, 6)])  # 5 หน้า

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-split", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_selector('input[type=radio][value="every"]')
    pg.locator('input[type=radio][value="every"]').check()
    pg.locator('input[type=number]').fill("2")
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แยกไฟล์").click()
    wait_status(pg, "แยกได้")
    out = DL / "split-out.zip"
    dl_click(pg, pg.locator(".results button", has_text="ZIP"), out)

    zf = zipfile.ZipFile(out)
    names = zf.namelist()
    ck(tool, "จำนวนไฟล์ที่แยกได้ (ทุก 2 หน้า จาก 5 หน้า = 3 ไฟล์)", "จำนวนไฟล์ใน ZIP", len(names), 3)

    got = []
    for n in names:
        texts = read_pdf_texts(zf.read(n))
        got.append(texts)
    got.sort(key=lambda t: t[0])
    expect = [["SPLIT-PAGE-1", "SPLIT-PAGE-2"], ["SPLIT-PAGE-3", "SPLIT-PAGE-4"], ["SPLIT-PAGE-5"]]
    ck(tool, "แต่ละไฟล์มีหน้าถูกต้องตามลำดับ ไม่ผิดกลุ่ม", "เนื้อหาแต่ละไฟล์ (เรียงแล้ว)", got, expect)


def test_pdf_pages(pg):
    tool = "pdf-pages"
    src = FIX / "pages_test.pdf"
    make_pdf(src, ["PAGE-KEEP-1", "PAGE-DELETE-2", "PAGE-KEEP-3", "PAGE-KEEP-4"])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-pages", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    # ‼️ "โหลดแล้ว N หน้า" ขึ้นแว้บเดียวแล้วถูก render() ทับเป็น "เหลือ N/N หน้า" ทันทีในติ๊กเดียวกัน
    # (ดู src/tools/pdf-pages.js: loadPreview() เรียก st.ok() แล้วเรียก render()->st.info() ต่อทันที)
    # จับพฤติกรรมจริงแล้วว่าข้อความที่ค้างอยู่จริงคือ "เหลือ 4/4 หน้า" — รอตัวนี้แทน
    wait_status(pg, "เหลือ 4/4 หน้า")
    pg.wait_for_selector(".pg")
    ck(tool, "โหลดพรีวิวครบ 4 การ์ดหน้า", "จำนวนการ์ดหน้า", pg.locator(".pg").count(), 4)

    # ลบหน้าที่ 2 (data-i=1) ผ่านปุ่มลบในการ์ดโดยตรง
    del_btn = pg.get_by_label("ลบหน้า 2")
    del_btn.hover(); del_btn.click()
    # หมุนหน้าที่ 1 (data-i=0) ไปทางขวา 90 องศา
    rot_btn = pg.get_by_label("หมุนหน้า 1 ไปทางขวา")
    rot_btn.hover(); rot_btn.click()
    pg.wait_for_timeout(200)

    pg.get_by_role("button", name="บันทึก", exact=True).click()
    wait_status(pg, "บันทึกแล้ว")
    out = DL / "pages-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    doc = read_pdf(out.read_bytes())
    ck(tool, "เหลือ 3 หน้า (ลบไป 1 จาก 4)", "จำนวนหน้าหลังลบ", doc.page_count, 3)
    texts = [doc[i].get_text().strip() for i in range(doc.page_count)]
    ck(tool, "หน้าที่เหลือคือ 1,3,4 เรียงตามลำดับเดิม (ไม่ใช่หน้าที่ถูกลบ)", "ข้อความ 3 หน้าที่เหลือ",
       texts, ["PAGE-KEEP-1", "PAGE-KEEP-3", "PAGE-KEEP-4"])
    ck(tool, "หน้าแรกถูกหมุน 90 องศาจริงในไฟล์ (ไม่ใช่แค่พรีวิว)", "มุมหมุนหน้า 1 (rotation)", doc[0].rotation, 90)
    ck(tool, "หน้าอื่นไม่ถูกหมุนไปด้วย", "มุมหมุนหน้า 2,3 (rotation)", [doc[1].rotation, doc[2].rotation], [0, 0])


def test_images_to_pdf(pg):
    tool = "images-to-pdf"
    sizes = [(400, 300), (800, 200), (150, 150)]
    colors = [(255, 0, 0), (0, 0, 255), (0, 180, 0)]
    paths = []
    for i, (sz, c) in enumerate(zip(sizes, colors)):
        p = FIX / f"i2p-{i}.png"
        make_png(p, sz, c)
        paths.append(p)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/images-to-pdf", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(x) for x in paths])
    pg.wait_for_timeout(400)
    pg.locator("button.btn", has_text="สร้างไฟล์ PDF").click()
    wait_status(pg, "สร้าง PDF")
    out = DL / "i2p-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    doc = read_pdf(out.read_bytes())
    ck(tool, "จำนวนหน้า = จำนวนรูปที่อัปโหลด (3 รูป)", "จำนวนหน้า", doc.page_count, 3)
    # โหมด "ตามขนาดรูป" (auto, ค่าเริ่มต้น) + ขอบ 24pt (ค่าเริ่มต้น) → หน้า = ขนาดรูป + 48
    expect_sizes = [(w + 48, h + 48) for (w, h) in sizes]
    got_sizes = [(round(doc[i].rect.width), round(doc[i].rect.height)) for i in range(doc.page_count)]
    ck(tool, "ขนาดหน้าตรงกับขนาดรูป+ขอบ 24pt ทุกด้าน ตามลำดับที่อัปโหลด", "ขนาดหน้า (pt) ทั้ง 3 หน้า",
       got_sizes, expect_sizes)


def test_pdf_to_images(pg):
    tool = "pdf-to-images"
    src = FIX / "p2i_test.pdf"
    make_pdf(src, ["IMG-P1", "IMG-P2", "IMG-P3"], size=(400, 600))

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-to-images", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แปลงเป็นรูป").click()
    wait_status(pg, "แปลงเสร็จ")
    out = DL / "p2i-out.zip"
    dl_click(pg, pg.locator(".results button", has_text="ZIP"), out)

    zf = zipfile.ZipFile(out)
    names = zf.namelist()
    ck(tool, "แปลงครบ 3 หน้า = 3 ไฟล์รูป", "จำนวนไฟล์รูปใน ZIP", len(names), 3)
    # ค่าเริ่มต้น: PNG, ความละเอียด scale=2 (~150 DPI) → พิกเซล = หน้า(pt) × 2 พอดี (ไม่มีปัดเศษเพราะ 400,600 หารลงตัว)
    dims = sorted(Image.open(io.BytesIO(zf.read(n))).size for n in names)
    expect_dims = sorted([(400 * 2, 600 * 2)] * 3)
    ck(tool, "ขนาดพิกเซลของรูปทุกใบ = ขนาดหน้า(pt) × 2 ตามความละเอียดเริ่มต้น", "ขนาดพิกเซล (กว้าง,สูง) ทั้ง 3 ไฟล์",
       dims, expect_dims)


def test_pdf_to_text(pg):
    tool = "pdf-to-text"
    src = FIX / "text_thai.pdf"
    p1 = "การทดสอบเครื่องมือแปลงพีดีเอฟเป็นข้อความ ภาษาไทยต้องไม่เพี้ยน"
    p2 = "หน้าที่สองมีตัวเลขไทย ๑๒๓ และเลขอารบิก 456 ทดสอบครบถ้วน"
    make_pdf(src, [p1, p2], size=(500, 400), thai=True)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-to-text", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="ดึงข้อความ").click()
    wait_status(pg, "ดึงข้อความสำเร็จ")
    out = DL / "text-out.txt"
    dl_click(pg, pg.locator(".results button", has_text="ดาวน์โหลด .txt"), out)

    raw = out.read_bytes()
    ck(tool, "ไฟล์ .txt มี UTF-8 BOM (กันภาษาไทยเพี้ยนใน Excel/Notepad)", "3 ไบต์แรก", raw[:3], b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    ck(tool, "ข้อความไทยหน้า 1 ถูกดึงมาครบ ไม่เพี้ยน (ตรงตัวกับต้นฉบับ)", "พบข้อความหน้า 1 ในผลลัพธ์", text, p1, contains=True)
    ck(tool, "ข้อความไทยหน้า 2 (มีเลขไทย+เลขอารบิก) ถูกดึงมาครบ ไม่เพี้ยน", "พบข้อความหน้า 2 ในผลลัพธ์", text, p2, contains=True)
    ck(tool, "ไม่มีอักขระ replacement char (เครื่องหมายอ่านไม่ออก) ปนมา", "มี U+FFFD ในผลลัพธ์ไหม", "�" in text, False)


def test_image_resize(pg):
    tool = "image-resize"
    src = FIX / "resize_src.png"
    make_png(src, (1000, 600), (10, 120, 200))

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/image-resize", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(400)
    # โหมด "กำหนดความกว้าง" — ต้องเลือกโหมดก่อน เพราะเปลี่ยนโหมดจะรีเซ็ตค่าช่องกรอกกลับเป็นค่าเริ่มต้นเสมอ
    # ‼️ ต้องจำกัดขอบเขตไว้ในแผงเครื่องมือ เพราะหน้าแรกมี <select> เรียงลำดับ
    #    ที่ยังอยู่ใน DOM (ซ่อนด้วย CSS) locator("select") เปล่า ๆ จึงเจอ 2 ตัวแล้วพัง
    pg.locator(".panel select").first.select_option("width")
    pg.locator("input[type=number]").fill("300")
    pg.wait_for_timeout(400)
    pg.locator("button.btn", has_text="ย่อและบีบอัด").click()
    wait_status(pg, "เสร็จ")
    out = DL / "resize-out.jpg"
    dl_click(pg, pg.locator("button.btn", has_text="ดาวน์โหลดรูป"), out)

    im = Image.open(out)
    ck(tool, "ความกว้างย่อเหลือ 300 พิกเซลพอดีตามที่ตั้งค่า", "ความกว้างผลลัพธ์ (px)", im.size[0], 300)
    # อัตราส่วนเดิม 1000:600 = 5:3 → สูงคาดว่า 300*600/1000 = 180
    ck(tool, "อัตราส่วนภาพคงเดิม (สูงคำนวณตามสัดส่วน 1000:600)", "ความสูงผลลัพธ์ (px)", im.size[1], 180)
    ck(tool, "ชนิดไฟล์ผลลัพธ์เป็น JPEG จริงตามค่าเริ่มต้น (บังคับเป็น JPG)", "รูปแบบไฟล์ที่ PIL อ่านได้", im.format, "JPEG")


def test_image_convert(pg):
    tool = "image-convert"
    src = FIX / "convert_src.png"
    make_transparent_png(src, (200, 200))

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    # ค่าเริ่มต้นของหน้านี้คือแปลงเป็น JPG อยู่แล้ว
    pg.locator("button.btn", has_text="แปลงไฟล์").click()
    wait_status(pg, "แปลงเสร็จ")
    out = DL / "convert-out.jpg"
    dl_click(pg, pg.locator(".results .result button"), out)

    raw = out.read_bytes()
    ck(tool, "ไฟล์ผลลัพธ์เป็น JPEG จริงตาม magic bytes (ไม่ใช่แค่เปลี่ยนนามสกุล)", "2 ไบต์แรก (SOI marker)", raw[:2], b"\xff\xd8")
    im = Image.open(out).convert("RGB")
    corner = im.getpixel((2, 2))
    ck(tool, "มุมที่โปร่งใสเดิม ถูกรองพื้นขาวตอนแปลงเป็น JPG (JPG ไม่มีช่องโปร่งใส)", "สีพิกเซลมุมภาพ (R,G,B)",
       all(v > 235 for v in corner), True)
    center = im.getpixel((100, 100))
    ck(tool, "สีจริงตรงกลางภาพยังเป็นโทนแดงตามต้นฉบับ (ไม่ใช่ขาวทั้งภาพ)", "สีพิกเซลกลางภาพเป็นโทนแดง (R>G และ R>B)",
       center[0] > center[1] and center[0] > center[2], True)


def test_excel_csv(pg):
    tool = "excel-csv"
    src = FIX / "excel_csv_test.xlsx"
    make_xlsx(src)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/excel-csv", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    # ทิศทางเริ่มต้นคือ Excel → CSV อยู่แล้ว
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แปลงไฟล์").click()
    wait_status(pg, "แยกได้")
    out = DL / "csv-out.csv"
    dl_click(pg, pg.locator(".results .result button"), out)

    raw = out.read_bytes()
    ck(tool, "CSV มี UTF-8 BOM ตามที่โฆษณาไว้ (กันไทยเพี้ยนใน Excel)", "3 ไบต์แรก", raw[:3], b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    ck(tool, "หัวตารางภาษาไทยตรงกับต้นฉบับ", "แถวหัวตาราง", rows[0], ["ชื่อ", "จำนวน"])
    ck(tool, "ชื่อไทยแถวที่ 1 ไม่เพี้ยน", "แถวข้อมูล 1", rows[1], ["สมชาย ใจดี", "12345"])
    ck(tool, "ชื่อไทยแถวที่ 2 ไม่เพี้ยน", "แถวข้อมูล 2", rows[2], ["สมหญิง รักไทย", "67890"])


def test_pdf_watermark(pg):
    tool = "pdf-watermark"
    src = FIX / "wm_test.pdf"
    make_pdf(src, ["WM-P1", "WM-P2", "WM-P3"])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-watermark", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(500)
    # ข้อความลายน้ำมีค่าเริ่มต้นอยู่แล้ว ("เอกสารลับ ห้ามเผยแพร่") ไม่ต้องพิมพ์เพิ่ม
    pg.locator("button.btn", has_text="ใส่ลายน้ำ").click()
    wait_status(pg, "ใส่ลายน้ำครบ")
    out = DL / "wm-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    doc = read_pdf(out.read_bytes())
    ck(tool, "จำนวนหน้าไม่เปลี่ยนหลังใส่ลายน้ำ", "จำนวนหน้า", doc.page_count, 3)
    img_counts = [len(doc[i].get_images(full=True)) for i in range(doc.page_count)]
    ck(tool, "ทุกหน้ามีภาพลายน้ำถูกฝังเพิ่มเข้าไปจริง (ต้นฉบับไม่มีภาพเลย)", "จำนวนภาพต่อหน้า (>=1 ทุกหน้า)",
       all(c >= 1 for c in img_counts), True)
    texts = [doc[i].get_text() for i in range(doc.page_count)]
    ck(tool, "ข้อความเดิมของเอกสารยังอยู่ครบ (ลายน้ำไม่ได้ลบเนื้อหาเดิม)", "พบมาร์กเกอร์เดิมครบ 3 หน้า",
       all(m in t for m, t in zip(["WM-P1", "WM-P2", "WM-P3"], texts)), True)


def test_pdf_sign(pg):
    tool = "pdf-sign"
    src = FIX / "sign_test.pdf"
    make_pdf(src, ["SIGN-P1", "SIGN-P2"])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-sign", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    wait_status(pg, "เปิดแล้ว")
    pg.wait_for_selector(".sign-canvas")

    box = pg.locator(".sign-canvas").bounding_box()
    x0, y0 = box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.3
    x1, y1 = box["x"] + box["width"] * 0.8, box["y"] + box["height"] * 0.7
    pg.mouse.move(x0, y0)
    pg.mouse.down()
    pg.mouse.move((x0 + x1) / 2, y1, steps=5)
    pg.mouse.move(x1, y0, steps=5)
    pg.mouse.up()
    pg.wait_for_timeout(300)

    pg.locator("button.btn", has_text="ใช้ลายเซ็น").click()
    pg.wait_for_timeout(200)
    pg.locator(".sign-stage").click()
    pg.wait_for_timeout(200)

    save_btn = pg.get_by_role("button", name="บันทึกไฟล์เซ็นแล้ว")
    save_btn.click()
    wait_status(pg, "เซ็นแล้ว")
    out = DL / "sign-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    doc = read_pdf(out.read_bytes())
    ck(tool, "จำนวนหน้าไม่เปลี่ยนหลังเซ็น", "จำนวนหน้า", doc.page_count, 2)
    img_counts = [len(doc[i].get_images(full=True)) for i in range(doc.page_count)]
    ck(tool, "หน้าที่วางลายเซ็น (หน้า 1) มีภาพลายเซ็นถูกฝังเพิ่มเข้าไปจริง", "จำนวนภาพในหน้า 1 (>=1)",
       img_counts[0] >= 1, True)


# ═══════════════════════════════════════════════════════════════════════════

TESTS = [
    test_pdf_merge, test_pdf_split, test_pdf_pages, test_images_to_pdf,
    test_pdf_to_images, test_pdf_to_text, test_image_resize, test_image_convert,
    test_excel_csv, test_pdf_watermark, test_pdf_sign,
]


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    FIX.mkdir(parents=True, exist_ok=True)
    DL.mkdir(parents=True, exist_ok=True)

    crashed = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        for fn in TESTS:
            name = fn.__name__
            print(f"\n── {name} ──")
            try:
                fn(pg)
            except Exception as e:
                crashed.append((name, str(e)))
                ROWS.append((name, "รันเทสทั้งชุด", "รันจบไม่ error", "error: " + str(e)[:200], "ไม่ผ่าน"))
                F.append(f"[{name}] เทสตัวนี้ crash ก่อนจะตรวจครบ: {e}")
                print(f"  💥 {name} crash: {e}")
                traceback.print_exc()
        browser.close()

    print("\n" + "━" * 70)
    print("ตารางสรุป")
    print("━" * 70)
    for tool, what, want, got, verdict in ROWS:
        print(f"  {verdict:8} | {tool:16} | {what}")
        print(f"           ค่าที่คาด: {want}")
        print(f"           ค่าจริง:   {got}")
    print("━" * 70)
    print(f"\nผ่าน {P} รายการ, ตก {len(F)} รายการ")
    if crashed:
        print(f"\nเทสที่ crash กลางทาง ({len(crashed)} ตัว):")
        for name, msg in crashed:
            print(f"  - {name}: {msg}")
    if F:
        print("\nรายละเอียดข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")
    return 1 if F else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
