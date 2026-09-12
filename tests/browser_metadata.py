# ข้อมูลส่วนตัวของไฟล์ต้นฉบับติดไปกับไฟล์ผลลัพธ์โดยผู้ใช้ไม่รู้ตัว
#
# audit จริงเมื่อ 09/09/2026 (ยิงเครื่องมือจริงผ่านเว็บ ฝังลายนิ้วมือ POND-SECRET-* ในไฟล์ต้นฉบับ
# แล้วเปิดไฟล์ผลลัพธ์ดูค่าจริง — ไม่ใช่อ่านโค้ดแล้วเดา) เจอว่าหลายเครื่องมือพาข้อมูลที่ผู้ใช้ไม่ได้
# ตั้งใจให้ติดไปด้วยจริง:
#
#   ① pdf-compress/pdf-watermark/pdf-page-numbers/pdf-sign
#      โหลดไฟล์ต้นฉบับด้วย pdf-lib แล้ว save() ทับเอกสารเดิมตรง ๆ (ต่างจาก pdf-merge/split/pages
#      ที่ copyPages ไปเอกสารใหม่) Title/Author/Subject/Keywords/Creator ของต้นฉบับจึงติดไปทั้งดุ้น
#      ทั้งที่ผู้ใช้แค่สั่งบีบอัด/ใส่ลายน้ำ/ใส่เลขหน้า/เซ็นชื่อ ไม่เกี่ยวอะไรกับ metadata เลย
#
#   ② images-to-pdf
#      ทางลัดฝังไบต์ JPEG ดิบตรงเข้า pdf-lib (สำหรับรูปที่ไม่ต้องหมุนตาม EXIF Orientation)
#      ไม่ได้ตัด EXIF ออกก่อน พิกัด GPS + ชื่อกล้อง/ผู้ถ่ายของต้นฉบับจึงติดไปกับไฟล์ PDF ทั้งดุ้น
#      (รูปที่ต้องหมุนไปทาง canvas อยู่แล้ว ซึ่งล้าง EXIF ให้เองโดยธรรมชาติของ canvas — ไม่ใช่จุดที่พัง)
#
#   ③ powerpoint-to-pdf / powerpoint-to-word
#      ไม่เช็คแอตทริบิวต์ show="0" บน <p:sld> (สไลด์ที่ผู้พูดสั่งซ่อนไว้) เลย แปลงทุกสไลด์เท่ากันหมด
#      ของที่ตั้งใจซ่อนจึงโผล่ในไฟล์ที่แชร์ออกไป ส่วน powerpoint-to-word ยังพาโน้ตผู้บรรยายไปด้วย
#      เป็นค่าเริ่มต้น (ตัวเลือกมีอยู่แล้วแต่ default ผิด)
#
#   ④⑤ word-join / word-replace / word-mailmerge
#      แก้ไฟล์แบบ "คัดลอกโครงสร้างเดิมแล้วแก้บางส่วน" — docProps/core.xml (ชื่อผู้เขียน/ผู้แก้ไข
#      ล่าสุด) ของไฟล์ต้นฉบับ (หรือของ "เทมเพลต" กรณี mailmerge) เลยติดไปกับไฟล์ผลลัพธ์ทุกใบ
#      word-join ยังรวมคอมเมนต์จากทุกไฟล์เข้าด้วยกันแบบไม่มีทางเลือกให้ผู้ใช้ปิด
#
#   ⑥ word-to-pdf
#      ข้อความที่ยังไม่ยอมรับการแก้ไข (w:ins/w:del ค้างอยู่) ถูกพิมพ์ลง PDF เหมือนเป็นเนื้อหา
#      สุดท้ายเงียบ ๆ โดยไม่มีอะไรเตือนผู้ใช้ก่อนส่งออกเลย
#
# แก้แล้ว (ดูรายละเอียดที่ .claude/agent-progress/metadata-privacy.md):
#   ① src/pdfopen.js: loadPdfLib() ล้าง Info dict ทันทีหลังโหลด (จุดเดียว ครอบ 3 เครื่องมือ)
#      + src/tools/pdf-compress.js: ล้างเพิ่มบนเส้นทาง lossless-compress ที่โหลดเองแยกต่างหาก
#   ② src/tools/images-to-pdf.js: stripJpegExif() ตัดก้อน APP1 (EXIF/XMP) ออกก่อนฝัง ไม่กระทบทิศทาง
#   ③ src/pptx.js: readPptx() ข้ามสไลด์ show="0" (คืน hiddenCount ให้ขึ้นแบนเนอร์ + ปุ่มขอรวมได้เอง)
#      + powerpoint-to-word: ตัวเลือกโน้ตผู้บรรยาย default เปลี่ยนจาก "yes" เป็น "no"
#   ④⑤ src/docxreplace.js, src/docxmerge.js: เรียก src/docxclean.js:clean({metadata:true}) ซ้ำ
#      หลังสร้างไฟล์เสร็จ (ไม่เขียนตรรกะล้าง metadata ใหม่) · word-join: checkbox เก็บ/ลบคอมเมนต์
#      (default = เก็บ) + docxclean.js:inspect() บอกจำนวนคอมเมนต์ที่ติดไปให้ผู้ใช้เห็น
#   ⑥ src/tools/word-to-pdf.js: นับ w:ins/w:del แล้วขึ้น banner เตือน — ไม่แก้เนื้อหา/พฤติกรรมแปลง
#
# ‼️ กับดักที่ห้ามพลาด (ยืนยันด้วยรูปที่ Orientation=6 จริง ก่อนเขียนเทสนี้):
#    ต้องตรวจว่ารูปถ่ายแนวตั้งจากมือถือ (เก็บพิกเซลแนวนอน + สั่งหมุนด้วย EXIF) ยังหมุนถูกทิศ
#    หลังตัด EXIF ออก — ห้ามแค่เช็คว่า metadata หายแล้วปล่อยผ่านจุดนี้
#
# รัน: ../.venv/bin/python tests/browser_metadata.py     (เปิด/ปิด server ให้เอง)
#      ตั้ง FK_BASE=http://localhost:8899 ถ้ามี server อยู่แล้ว
import io
import os
import re
import sys
import time
import socket
import shutil
import tempfile
import zipfile
import subprocess
import pathlib

import fitz
import openpyxl
from docx import Document
from PIL import Image
from PIL.ExifTags import Base, GPS, IFD
from PIL.TiffImagePlugin import IFDRational
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_metadata_"))
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


def press(pg, pattern):
    """กดปุ่มที่มองเห็นจริงด้วย evaluate (ไม่ใช้ .click() ของ Playwright เพราะจะรอ event loop
    ว่างก่อน ซึ่งชนกับงานหนักที่กำลังรันอยู่ — บทเรียน 09/09/2026)"""
    return pg.evaluate(
        "(re) => { const b = [...document.querySelectorAll('button')]"
        ".find((b) => b.offsetParent && new RegExp(re).test(b.textContent.trim())); "
        "if (b) { b.click(); return b.textContent.trim(); } return null; }",
        pattern,
    )


def dl_click(pg, out_path, timeout=25000, label="ดาวน์โหลด"):
    """ปุ่มดาวน์โหลดมี 2 แบบในเว็บนี้: มีตัวหนังสือ "ดาวน์โหลด" หรือไอคอนล้วน (class="btn has-ico")"""
    loc = pg.locator("button", has_text=label)
    if loc.count() == 0:
        loc = pg.locator("button.btn.has-ico")
    with pg.expect_download(timeout=timeout) as info:
        loc.last.click()
    info.value.save_as(str(out_path))
    return out_path


# ── fixture: PDF ที่มี Info dict ครบทุกฟิลด์ ────────────────────────────────
def make_pdf(name, tag, n_pages=1):
    doc = fitz.open()
    for i in range(n_pages):
        p = doc.new_page(width=595, height=842)
        p.insert_text((72, 100), f"{tag}-PAGE-{i + 1}", fontsize=20)
    doc.set_metadata({
        "author": f"{tag}-AUTHOR", "producer": f"{tag}-PRODUCER", "creator": f"{tag}-CREATOR",
        "title": f"{tag}-TITLE", "subject": f"{tag}-SUBJECT", "keywords": f"{tag}-KEYWORDS",
    })
    p_out = TMP / name
    doc.save(str(p_out)); doc.close()
    return p_out


# ── fixture: JPEG ที่มี EXIF GPS จริง (ไม่หมุน = ทางลัดฝังไบต์ดิบ) ──────────
def make_jpeg_with_gps(name, rotate=False):
    img = Image.new("RGB", (800, 600), (80, 130, 200))
    exif = Image.Exif()
    if rotate:
        exif[Base.Orientation.value] = 6   # เก็บพิกเซลแนวนอนแต่สั่งหมุน 90° ตอนแสดงผล (รูปมือถือจริง)
    exif[Base.Make.value] = "SECRET-CAM-MAKE"
    exif[Base.Model.value] = "SECRET-CAM-MODEL"
    exif[Base.Artist.value] = "SECRET-ARTIST"
    gps = exif.get_ifd(IFD.GPSInfo)
    gps[GPS.GPSLatitudeRef.value] = "N"
    gps[GPS.GPSLatitude.value] = (IFDRational(13, 1), IFDRational(45, 1), IFDRational(22, 1))
    gps[GPS.GPSLongitudeRef.value] = "E"
    gps[GPS.GPSLongitude.value] = (IFDRational(100, 1), IFDRational(31, 1), IFDRational(10, 1))
    p_out = TMP / name
    img.save(str(p_out), format="JPEG", exif=exif, quality=92)
    return p_out


# ── fixture: DOCX ที่มี author/lastModifiedBy + comment + track-change ─────
def make_docx_with_traces(name, tag):
    d = Document()
    d.add_paragraph(f"เนื้อหาย่อหน้าแรก {tag}")
    d.add_paragraph(f"ย่อหน้าที่ถูกคอมเมนต์ {tag}-COMMENT-TARGET")
    d.core_properties.author = f"{tag}-AUTHOR"
    d.core_properties.last_modified_by = f"{tag}-LASTMOD"
    buf = io.BytesIO(); d.save(buf); buf.seek(0)

    src = zipfile.ZipFile(buf)
    parts = {n: src.read(n) for n in src.namelist()}

    doc_xml = parts["word/document.xml"].decode("utf-8")
    target_run = f"<w:r><w:t>ย่อหน้าที่ถูกคอมเมนต์ {tag}-COMMENT-TARGET</w:t></w:r>"
    assert target_run in doc_xml, "fixture เพี้ยน — หา run เป้าหมายไม่เจอ"
    wrapped = (
        '<w:commentRangeStart w:id="0"/>' + target_run + '<w:commentRangeEnd w:id="0"/>'
        '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>'
    )
    doc_xml = doc_xml.replace(target_run, wrapped, 1)

    first_target = f"<w:r><w:t>เนื้อหาย่อหน้าแรก {tag}</w:t></w:r>"
    assert first_target in doc_xml
    ins_run = (
        first_target +
        '<w:ins w:id="99" w:author="reviewer" w:date="2024-01-01T00:00:00Z">'
        f'<w:r><w:t> {tag}-UNACCEPTED-INSERTION</w:t></w:r></w:ins>'
    )
    doc_xml = doc_xml.replace(first_target, ins_run, 1)
    parts["word/document.xml"] = doc_xml.encode("utf-8")

    parts["word/comments.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:comment w:id="0" w:author="ผู้ตรวจ" w:date="2024-01-01T00:00:00Z" w:initials="XX">'
        f'<w:p><w:r><w:t>{tag}-COMMENT-TEXT</w:t></w:r></w:p></w:comment></w:comments>'
    ).encode("utf-8")

    rels = parts["word/_rels/document.xml.rels"].decode("utf-8")
    rels = rels.replace("</Relationships>",
        '<Relationship Id="rIdCommentsTest" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" '
        'Target="comments.xml"/></Relationships>')
    parts["word/_rels/document.xml.rels"] = rels.encode("utf-8")

    ct = parts["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace("</Types>",
        '<Override PartName="/word/comments.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>')
    parts["[Content_Types].xml"] = ct.encode("utf-8")

    p_out = TMP / name
    with zipfile.ZipFile(p_out, "w", zipfile.ZIP_DEFLATED) as out:
        for n, data in parts.items():
            out.writestr(n, data)
    return p_out


def make_docx_plain(name, tag):
    d = Document()
    d.add_paragraph(f"เอกสารที่สอง {tag}-BODY")
    d.core_properties.author = f"{tag}-AUTHOR2"
    p_out = TMP / name
    d.save(str(p_out))
    return p_out


def make_docx_template(name, tag):
    d = Document()
    d.add_paragraph("เรียนคุณ {{ชื่อ}}")
    d.core_properties.author = f"{tag}-TEMPLATE-AUTHOR"
    p_out = TMP / name
    d.save(str(p_out))
    return p_out


def make_xlsx_row(name, header, row):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(header)
    ws.append(row)
    p_out = TMP / name
    wb.save(str(p_out))
    return p_out


# ── fixture: PPTX ที่มีสไลด์ซ่อน (show="0") + โน้ตผู้บรรยาย ─────────────────
def make_pptx_with_hidden_slide(name, tag):
    from pptx import Presentation
    from pptx.util import Inches
    prs = Presentation()
    prs.core_properties.author = f"{tag}-AUTHOR"
    s1 = prs.slides.add_slide(prs.slide_layouts[1])
    s1.shapes.title.text = f"{tag}-SLIDE-TITLE"
    s1.placeholders[1].text = "เนื้อหาสไลด์ 1 ปกติ"
    s1.notes_slide.notes_text_frame.text = f"{tag}-SPEAKER-NOTE"
    s2 = prs.slides.add_slide(prs.slide_layouts[6])
    tb = s2.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(2))
    tb.text_frame.text = f"{tag}-HIDDEN-SLIDE-TEXT"
    p_out = TMP / name
    prs.save(str(p_out))

    zin = zipfile.ZipFile(p_out)
    parts = {n: zin.read(n) for n in zin.namelist()}
    zin.close()
    xml = parts["ppt/slides/slide2.xml"].decode("utf-8")
    xml = xml.replace("<p:sld ", '<p:sld show="0" ', 1)
    parts["ppt/slides/slide2.xml"] = xml.encode("utf-8")
    with zipfile.ZipFile(p_out, "w", zipfile.ZIP_DEFLATED) as zout:
        for n, d in parts.items():
            zout.writestr(n, d)
    return p_out


def main():
    base = os.environ.get("FK_BASE")
    server = None
    if not base:
        port = free_port()
        server = subprocess.Popen([sys.executable, "-m", "http.server", str(port)],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://localhost:{port}"
        time.sleep(1.5)

    tag = "MDT"
    pdf1 = make_pdf("main.pdf", tag, n_pages=2)
    pdf_blank = TMP / "blank.pdf"     # หน้าที่ 2 ว่างจริง ให้ปุ่ม save ของ pdf-remove-blank ไม่ถูก disable
    d = fitz.open(str(pdf1)); d.new_page(width=595, height=842); d.set_metadata(fitz.open(str(pdf1)).metadata)
    d.save(str(pdf_blank)); d.close()
    jpeg_flat = make_jpeg_with_gps("photo-flat.jpg", rotate=False)
    jpeg_rot = make_jpeg_with_gps("photo-rot.jpg", rotate=True)
    docx1 = make_docx_with_traces("main.docx", tag)
    docx2 = make_docx_plain("second.docx", tag)
    docx_tpl = make_docx_template("template.docx", tag)
    xlsx_mm = make_xlsx_row("mm.xlsx", ["ชื่อ"], [f"{tag}-ROW"])
    pptx1 = make_pptx_with_hidden_slide("main.pptx", tag)

    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1360, "height": 950}, accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)

            # ── ① pdf-compress/watermark/page-numbers/sign: Info dict ต้องว่าง ──
            print("\n── ① Info dict ของ pdf-compress/watermark/page-numbers ──")
            for tool, label in [("pdf-compress", "บีบอัดไฟล์"), ("pdf-watermark", "ใส่ลายน้ำ"),
                                 ("pdf-page-numbers", "ใส่เลขหน้า")]:
                pg.goto("about:blank")
                pg.goto(f"{base}/#/{tool}", wait_until="networkidle")
                pg.wait_for_selector(".dz")
                pg.locator(".dz input[type=file]").first.set_input_files(str(pdf1))
                pg.wait_for_timeout(1000)
                press(pg, f"^{label}$")
                pg.wait_for_timeout(3000)
                out = DL / f"{tool}.pdf"
                dl_click(pg, out, timeout=30000)
                meta = fitz.open(out).metadata
                ck(f"{tool}: /Author ของต้นฉบับไม่ติดไปด้วย", tag in str(meta.get("author", "")), False)
                ck(f"{tool}: /Title ของต้นฉบับไม่ติดไปด้วย", tag in str(meta.get("title", "")), False)
                ck(f"{tool}: /Creator ของต้นฉบับไม่ติดไปด้วย", tag in str(meta.get("creator", "")), False)

            print("\n── pdf-sign: Info dict ต้องว่างด้วย ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/pdf-sign", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(pdf1))
            pg.wait_for_timeout(2000)
            sig = TMP / "sig.png"
            Image.new("RGBA", (200, 80), (0, 0, 0, 0)).save(sig)
            for inp in pg.locator("input[type=file]").all():
                if "image" in (inp.get_attribute("accept") or ""):
                    inp.set_input_files(str(sig)); break
            pg.wait_for_timeout(1200)
            pg.evaluate("() => { const im = document.querySelector('.sign-saved img'); if (im) im.click(); }")
            pg.wait_for_timeout(500)
            stage = pg.locator(".sign-stage").first
            if stage.count():
                r = stage.bounding_box()
                pg.mouse.click(r["x"] + r["width"] * 0.15, r["y"] + r["height"] * 0.15)
                pg.wait_for_timeout(400)
            press(pg, "บันทึกไฟล์เซ็น")
            pg.wait_for_selector("button.btn.has-ico, button:has-text('ดาวน์โหลด')", timeout=20000)
            out_sign = DL / "pdf-sign.pdf"
            dl_click(pg, out_sign)
            meta_sign = fitz.open(out_sign).metadata
            ck("pdf-sign: /Author ของต้นฉบับไม่ติดไปด้วย", tag in str(meta_sign.get("author", "")), False)

            # ── ② images-to-pdf: EXIF GPS ต้องหาย ทั้งกรณีหมุน/ไม่หมุน ──────
            print("\n── ② images-to-pdf: EXIF/GPS ──")
            for jpeg, case in [(jpeg_flat, "ไม่ต้องหมุน (ทางลัดฝังไบต์ดิบ)"), (jpeg_rot, "ต้องหมุน (ทาง canvas)")]:
                pg.goto("about:blank"); pg.goto(f"{base}/#/images-to-pdf", wait_until="networkidle")
                pg.wait_for_selector(".dz")
                pg.locator(".dz input[type=file]").first.set_input_files(str(jpeg))
                pg.wait_for_timeout(1200)
                press(pg, "^สร้างไฟล์ PDF$")
                pg.wait_for_timeout(2500)
                out = DL / f"images-to-pdf-{'flat' if jpeg is jpeg_flat else 'rot'}.pdf"
                with pg.expect_download(timeout=20000) as info:
                    pg.locator(".result button").last.click()
                info.value.save_as(str(out))
                doc = fitz.open(out)
                page = doc[0]
                imgs = page.get_images(full=True)
                ck(f"images-to-pdf ({case}): มีรูปฝังอยู่จริง", len(imgs) > 0, True)
                if imgs:
                    raw = doc.extract_image(imgs[0][0])["image"]
                    im = Image.open(io.BytesIO(raw))
                    ex = im.getexif()
                    make = ex.get(Base.Make.value)
                    gps_out = ex.get_ifd(IFD.GPSInfo) if ex else {}
                    ck(f"images-to-pdf ({case}): Make/กล้อง ไม่ติดไปด้วย", make, None)
                    ck(f"images-to-pdf ({case}): GPS ไม่ติดไปด้วย", dict(gps_out), {})
                if jpeg is jpeg_rot:
                    # ‼️ กับดักห้ามพลาด — รูปเก็บพิกเซล 800x600 แนวนอน + Orientation=6 ต้องได้หน้า
                    #    PDF แนวตั้ง (สูง > กว้าง) ถ้าทดสอบนี้ไม่ผ่าน = ตัด EXIF ไปพังการหมุนด้วย
                    r = page.rect
                    ck("images-to-pdf (ต้องหมุน): หน้า PDF เป็นแนวตั้งจริง (การหมุนยังทำงาน)", r.height > r.width, True)
                doc.close()

            # ── ③ powerpoint-to-pdf/word: สไลด์ที่ซ่อนไว้ + โน้ตผู้บรรยาย ──
            print("\n── ③ powerpoint-to-pdf: สไลด์ที่ซ่อน ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/powerpoint-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(pptx1))
            pg.wait_for_timeout(1500)
            press(pg, "^สร้างไฟล์ PDF$")
            pg.wait_for_timeout(3500)
            warn = pg.locator(".note.warn")
            warn_text = warn.first.inner_text() if warn.count() else ""
            ck("powerpoint-to-pdf: ขึ้นแบนเนอร์บอกว่าข้ามสไลด์ที่ซ่อน", "1" in warn_text and "ซ่อน" in warn_text, True)
            out_ppt = DL / "ppt.pdf"
            dl_click(pg, out_ppt, timeout=30000)
            txt_ppt = "\n".join(fitz.open(out_ppt)[i].get_text() for i in range(fitz.open(out_ppt).page_count))
            ck("powerpoint-to-pdf: เนื้อหาสไลด์ที่ซ่อนไม่หลุดมาในไฟล์", f"{tag}-HIDDEN-SLIDE-TEXT" in txt_ppt, False)

            print("\n── powerpoint-to-word: สไลด์ที่ซ่อน + โน้ตผู้บรรยาย default ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/powerpoint-to-word", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            # ‼️ ต้องจำกัดขอบเขตไว้ในแผงเครื่องมือ เพราะหน้าแรกมี <select> เรียงลำดับ
            #    ที่ยังอยู่ใน DOM (ซ่อนด้วย CSS) locator("select") เปล่า ๆ จึงเจอ 2 ตัวแล้วพัง
            sel = pg.locator(".panel select").first
            pg.locator(".dz input[type=file]").first.set_input_files(str(pptx1))
            pg.wait_for_timeout(1200)
            ck("powerpoint-to-word: ค่าเริ่มต้นตัวเลือกโน้ต = ไม่เอา (เอาเฉพาะเนื้อสไลด์)", sel.input_value(), "no")
            press(pg, "^แปลงเป็น Word$")
            pg.wait_for_timeout(3000)
            out_docw = DL / "ppt.docx"
            dl_click(pg, out_docw, timeout=30000)
            docw_text = "\n".join(p.text for p in Document(str(out_docw)).paragraphs)
            ck("powerpoint-to-word: โน้ตผู้บรรยายไม่ติดมาด้วย default", f"{tag}-SPEAKER-NOTE" in docw_text, False)
            ck("powerpoint-to-word: สไลด์ที่ซ่อนไม่ติดมาด้วย", f"{tag}-HIDDEN-SLIDE-TEXT" in docw_text, False)

            # ── ④⑤ word-join/word-replace/word-mailmerge: metadata + checkbox ──
            print("\n── ④ word-join: metadata + checkbox คอมเมนต์ ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/word-join", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            cb = pg.locator("input[type=checkbox]").first
            ck("word-join: checkbox เก็บคอมเมนต์ default = ติ๊กไว้", cb.is_checked(), True)
            pg.locator(".dz input[type=file]").first.set_input_files([str(docx1), str(docx2)])
            pg.wait_for_timeout(1000)
            press(pg, "^รวมไฟล์$")
            pg.wait_for_timeout(2500)
            out_join_keep = DL / "join-keep.docx"
            dl_click(pg, out_join_keep)
            core_keep = zipfile.ZipFile(out_join_keep).read("docProps/core.xml").decode("utf-8", "replace")
            ck("word-join (เก็บคอมเมนต์): ชื่อผู้เขียนเดิมไม่ติดไปด้วย", f"{tag}-AUTHOR" in core_keep, False)
            ck("word-join (ค่าเริ่มต้น): คอมเมนต์ยังอยู่", "word/comments.xml" in zipfile.ZipFile(out_join_keep).namelist(), True)

            pg.goto("about:blank"); pg.goto(f"{base}/#/word-join", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files([str(docx1), str(docx2)])
            pg.wait_for_timeout(1000)
            pg.locator("input[type=checkbox]").first.uncheck()
            press(pg, "^รวมไฟล์$")
            pg.wait_for_timeout(2500)
            out_join_rm = DL / "join-removed.docx"
            dl_click(pg, out_join_rm)
            names_rm = zipfile.ZipFile(out_join_rm).namelist()
            ck("word-join (ติ๊กออก): คอมเมนต์ถูกลบออกจริง", "word/comments.xml" in names_rm, False)
            body_rm = "\n".join(p.text for p in Document(str(out_join_rm)).paragraphs)
            ck("word-join (ติ๊กออก): เนื้อหาย่อหน้ายังอยู่ครบ (ลบแค่คอมเมนต์)",
               all(s in body_rm for s in [f"เนื้อหาย่อหน้าแรก {tag}", f"ย่อหน้าที่ถูกคอมเมนต์ {tag}-COMMENT-TARGET"]), True)

            print("\n── word-replace: metadata ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/word-replace", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(docx1))
            pg.wait_for_timeout(800)
            pg.locator('input[placeholder="ค้นหาคำนี้"]').fill("เนื้อหา")
            pg.locator('input[placeholder="แทนที่ด้วย (ว่าง = ลบ)"]').fill("เนื้อความ")
            pg.wait_for_timeout(400)
            press(pg, "^แทนที่$")
            pg.wait_for_timeout(2000)
            out_rep = DL / "replace.docx"
            dl_click(pg, out_rep)
            core_rep = zipfile.ZipFile(out_rep).read("docProps/core.xml").decode("utf-8", "replace")
            ck("word-replace: ชื่อผู้เขียนเดิมไม่ติดไปด้วย", f"{tag}-AUTHOR" in core_rep, False)

            print("\n── word-mailmerge: metadata ของทุกไฟล์ที่ merge ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/word-mailmerge", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            dzs = pg.locator(".dz")
            dzs.nth(0).locator("input[type=file]").set_input_files(str(docx_tpl))
            pg.wait_for_timeout(700)
            dzs.nth(1).locator("input[type=file]").set_input_files(str(xlsx_mm))
            pg.wait_for_timeout(1200)
            press(pg, "^สร้างเอกสารทั้งชุด$")
            pg.wait_for_timeout(2500)
            out_mm = DL / "mm.out"
            dl_click(pg, out_mm)
            core_mm = zipfile.ZipFile(out_mm).read("docProps/core.xml").decode("utf-8", "replace")
            ck("word-mailmerge: ชื่อผู้เขียนของเทมเพลตไม่ติดไปด้วย", f"{tag}-TEMPLATE-AUTHOR" in core_mm, False)

            # ── ⑥ word-to-pdf: banner เตือน track-change (ไม่แก้พฤติกรรม) ──
            print("\n── ⑥ word-to-pdf: banner เตือน track-change ──")
            pg.goto("about:blank"); pg.goto(f"{base}/#/word-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(docx1))
            pg.wait_for_timeout(800)
            press(pg, "^แปลงเป็น PDF$")
            pg.wait_for_timeout(3500)
            warn_wp = pg.locator(".note.warn")
            # ‼️ เครื่องมือนี้ขึ้นได้หลาย banner (ฟอนต์ไทยรุ่นเก่า + แก้ไขค้าง)
            #    เดิมอ่านแค่ใบแรกซึ่งอาจเป็นคนละใบกับที่ตรวจ ต้องรวมทุกใบ
            warn_wp_text = " ".join(warn_wp.all_inner_texts()) if warn_wp.count() else ""
            # ‼️ ข้อความ banner ถูกย่อไปตั้งแต่ commit 78fd857 (ย่อข้อความที่ยาวเกินกฎ)
            #    จาก "ยังไม่ยอมรับ" เป็น "แก้ไขค้าง" แต่เทสยังเทียบคำเดิม จึงแดงค้างมาตั้งแต่นั้น
            #    เกณฑ์ยังเหมือนเดิมทุกอย่าง คือต้องบอกจำนวนจุด และต้องบอกว่าข้อความนั้นจะติดไปใน PDF
            ck("word-to-pdf: banner เตือนขึ้นจริงพร้อมจำนวน 1 จุด",
               ("1 จุด" in warn_wp_text and "แก้ไขค้าง" in warn_wp_text and "PDF" in warn_wp_text), True)
            out_wp = DL / "word-to-pdf.pdf"
            dl_click(pg, out_wp, timeout=30000)
            txt_wp = "\n".join(fitz.open(out_wp)[i].get_text() for i in range(fitz.open(out_wp).page_count))
            ck("word-to-pdf: พฤติกรรมแปลงคงเดิม (ข้อความที่ยังไม่ accept ยังแปลงลง PDF)",
               f"{tag}-UNACCEPTED-INSERTION" in txt_wp, True)

            pg.goto("about:blank"); pg.goto(f"{base}/#/word-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(docx2))
            pg.wait_for_timeout(800)
            press(pg, "^แปลงเป็น PDF$")
            pg.wait_for_timeout(3000)
            ck("word-to-pdf: ไฟล์ไม่มี track-change ไม่ขึ้น banner หลอก", pg.locator(".note.warn").count(), 0)

            print("\n── ไม่มี error หลุดออกมา ──")
            ck("ไม่มี console หรือ page error ตลอดทั้งชุด", errs, [])
            ctx.close(); b.close()
    finally:
        if server:
            server.terminate(); server.wait(timeout=10)


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"\nผ่าน {P}, ตก {len(F)}")
    for i, x in enumerate(F, 1):
        print(f"  {i}. {x}")
    sys.exit(1 if F else 0)
