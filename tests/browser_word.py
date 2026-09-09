# ตรวจ "เนื้อในไฟล์ผลลัพธ์จริง" ของกลุ่มเครื่องมือ Word ของ FileKit
# (browser_output.py ตรวจไปแล้ว 11 เครื่องมือ แต่ข้ามกลุ่ม Word ทั้งหมด — ไฟล์นี้ปิดช่องว่างนั้น)
#
# รันจากโฟลเดอร์ FileKit/ หลังเปิดเซิร์ฟเวอร์แล้ว (ดู tests/README.md):
#   python3 -m http.server 8899 &
#   ../.venv/bin/python tests/browser_word.py
#
# ทุกไฟล์ตัวอย่างสร้างขึ้นเองในสคริปต์นี้ (รู้คำตอบที่ถูกต้องล่วงหน้าเพราะเราสร้างเอง)
# ลงโฟลเดอร์ชั่วคราวแล้วลบทิ้งท้ายสคริปต์เสมอผ่าน try/finally

import sys, os, io, re, shutil, zipfile, traceback
import pathlib
import tempfile
from playwright.sync_api import sync_playwright

import fitz            # PyMuPDF
import docx            # python-docx
import openpyxl

BASE = os.environ.get("FK_BASE", "http://localhost:8899")

ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_word_test_"))   # เดิม hardcode path ของ scratchpad session เก่า (ซ่อม 09/09/2026)
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
    """รอจนกล่องสถานะ (.status) มีข้อความที่มี substr อยู่ในนั้น, ทนกว่าการรอ class เฉย ๆ
    ‼️ ใช้ querySelectorAll ไม่ใช่ querySelector ตัวเดียว — บางเครื่องมือ (เช่น word-clean) มี
    .status สองก้อนพร้อมกันบนหน้า (สรุปผลสแกนของ reportBox ค้างอยู่ถาวร + แถบสถานะจริงของ st.node
    ที่มาทีหลังใน DOM) querySelector ตัวเดียวจะไปติดอยู่กับก้อนแรกที่ไม่เคยอัปเดตข้อความอีกเลย
    แล้วรอจนไทม์เอาต์ทั้งที่งานจริงเสร็จไปนานแล้ว"""
    pg.wait_for_function(
        "(t) => [...document.querySelectorAll('.status')].some((el) => el.textContent.includes(t))",
        arg=substr, timeout=timeout,
    )


def dl_click(pg, locator, path):
    with pg.expect_download() as dlinfo:
        locator.click()
    dlinfo.value.save_as(str(path))
    return path


# ── สร้างไฟล์ตัวอย่าง (รู้คำตอบล่วงหน้าเพราะสร้างเอง) ─────────────────────────

def make_pdf(path, texts, size=(1000, 400), thai=False):
    # ‼️ ต้องกว้างพอสำหรับ 1 บรรทัด — fitz.insert_text() ตัดอักขระที่ล้นขอบหน้าทิ้งเงียบ ๆ
    # (จับได้จริง: ประโยคยาว 85 ตัวอักษรบนหน้ากว้าง 500pt โดนตัดเหลือแค่ "...เช่น ก" ตัวเดียว)
    doc = fitz.open()
    for t in texts:
        pg = doc.new_page(width=size[0], height=size[1])
        if thai:
            pg.insert_font(fontname="thaifont", fontfile=THAI_FONT)
            pg.insert_text((40, 80), t, fontname="thaifont", fontfile=THAI_FONT, fontsize=16)
        else:
            pg.insert_text((40, 80), t, fontname="helv", fontsize=16)
    doc.save(str(path))
    doc.close()


def make_two_column_pdf(path, heading, left_lines, right_lines):
    """PDF A4 จัด 2 คอลัมน์ (ซ้าย x=55, ขวา x=310) มีบรรทัดหัวเรื่องเหนือ 2 คอลัมน์ด้วย
    (บั๊กจริง 09/09/2026: หัวเรื่องที่ x เริ่มใกล้คอลัมน์ซ้าย — ภายใน COL_BUCKET_TOL — ทำให้
    detectColumnZones() เข้าใจผิดว่าคอลัมน์ซ้ายไม่ไหลเต็มโซน แล้วคืน null ทั้งที่เป็น 2 คอลัมน์จริง)"""
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    pg.insert_font(fontname="thaifont", fontfile=THAI_FONT)
    pg.insert_text((60, 66), heading, fontname="thaifont", fontsize=20)
    y = 121
    for t in left_lines:
        pg.insert_text((55, y), t, fontname="thaifont", fontsize=15)
        y += 26
    y = 121
    for t in right_lines:
        pg.insert_text((310, y), t, fontname="thaifont", fontsize=15)
        y += 26
    doc.save(str(path))
    doc.close()


def make_docx(path, paragraphs, heading=None):
    """docx ธรรมดา: [หัวข้อ] + ย่อหน้าตามลำดับ — คืนรายการข้อความที่ควรอ่านเจอ"""
    d = docx.Document()
    if heading:
        d.add_heading(heading, level=1)
    for t in paragraphs:
        d.add_paragraph(t)
    d.save(str(path))


def make_docx_with_table(path, paragraphs, table_cell_text):
    d = docx.Document()
    for t in paragraphs:
        d.add_paragraph(t)
    tbl = d.add_table(rows=1, cols=1)
    tbl.cell(0, 0).text = table_cell_text
    d.save(str(path))


def make_docx_with_traces(path, body_paragraphs, comment_target, comment_author, comment_text,
                           author, last_modified_by, company, manager):
    """docx ที่มีคอมเมนต์ + ชื่อผู้เขียน/บริษัท ติดมาด้วย — เพื่อทดสอบ word-clean
    สร้างผ่าน python-docx ก่อน (ตั้ง author/last_modified_by ได้ตรง ๆ) แล้วแก้ zip เพิ่ม
    comments.xml + comment-anchor รอบ paragraph เป้าหมาย + Company/Manager ใน app.xml เอง
    (python-docx ไม่มี API ตรงสำหรับ 3 อย่างหลัง)
    """
    d = docx.Document()
    for t in body_paragraphs:
        d.add_paragraph(t)
    d.core_properties.author = author
    d.core_properties.last_modified_by = last_modified_by
    buf = io.BytesIO()
    d.save(buf)
    buf.seek(0)

    src = zipfile.ZipFile(buf)
    parts = {n: src.read(n) for n in src.namelist()}

    # 1) app.xml: เติม Company/Manager (แม่แบบของ python-docx มี tag ว่างให้อยู่แล้ว)
    app = parts["docProps/app.xml"].decode("utf-8")
    assert "<Company/>" in app and "<Manager/>" in app, "แม่แบบ python-docx เปลี่ยนไป — ไม่มี <Company/>/<Manager/> ว่างให้แทรก"
    app = app.replace("<Company/>", f"<Company>{company}</Company>")
    app = app.replace("<Manager/>", f"<Manager>{manager}</Manager>")
    parts["docProps/app.xml"] = app.encode("utf-8")

    # 2) document.xml: ครอบ paragraph เป้าหมายด้วยเครื่องหมายคอมเมนต์
    doc_xml = parts["word/document.xml"].decode("utf-8")
    target_run = f"<w:r><w:t>{comment_target}</w:t></w:r>"
    assert target_run in doc_xml, "หา run เป้าหมายสำหรับผูกคอมเมนต์ไม่เจอ — ข้อความ/โครง XML ไม่ตรงที่คาด"
    wrapped = (
        '<w:commentRangeStart w:id="0"/>' + target_run + '<w:commentRangeEnd w:id="0"/>'
        '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>'
    )
    doc_xml = doc_xml.replace(target_run, wrapped, 1)
    parts["word/document.xml"] = doc_xml.encode("utf-8")

    # 3) word/comments.xml ใหม่
    comments_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:comment w:id="0" w:author="{comment_author}" w:date="2024-01-01T00:00:00Z" w:initials="XX">'
        f'<w:p><w:r><w:t>{comment_text}</w:t></w:r></w:p></w:comment></w:comments>'
    )
    parts["word/comments.xml"] = comments_xml.encode("utf-8")

    # 4) rels: เพิ่มความสัมพันธ์ไปยัง comments.xml
    rels = parts["word/_rels/document.xml.rels"].decode("utf-8")
    rel_tag = ('<Relationship Id="rIdCommentsTest" '
               'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" '
               'Target="comments.xml"/>')
    rels = rels.replace("</Relationships>", rel_tag + "</Relationships>")
    parts["word/_rels/document.xml.rels"] = rels.encode("utf-8")

    # 5) [Content_Types].xml: ประกาศชนิดของ comments.xml
    ct = parts["[Content_Types].xml"].decode("utf-8")
    override = ('<Override PartName="/word/comments.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>')
    ct = ct.replace("</Types>", override + "</Types>")
    parts["[Content_Types].xml"] = ct.encode("utf-8")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as out:
        for name, data in parts.items():
            out.writestr(name, data)


def make_docx_template(path, paragraphs_with_placeholders):
    d = docx.Document()
    for t in paragraphs_with_placeholders:
        d.add_paragraph(t)
    d.save(str(path))


def make_xlsx_rows(path, headers, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    wb.save(path)


def read_docx_text(data: bytes):
    """คืนข้อความทุกย่อหน้า + ทุกเซลล์ตาราง รวมกัน (join ด้วย \\n) จาก bytes ของ .docx
    ‼️ d.paragraphs ของ python-docx คืนเฉพาะย่อหน้าระดับบนสุด ไม่รวมย่อหน้าในตาราง —
    ต้องไล่ d.tables เพิ่มเอง ไม่งั้นเนื้อหาในตาราง (เช่นที่ word-replace ต้องแก้ด้วย) จะหายไปจากการตรวจทั้งที่ไฟล์จริงมี"""
    d = docx.Document(io.BytesIO(data))
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            for cell in row.cells:
                parts.append(cell.text)
    return "\n".join(parts)


def read_pdf_texts(data: bytes):
    d = fitz.open(stream=data, filetype="pdf")
    texts = [d[i].get_text() for i in range(d.page_count)]
    d.close()
    return texts


# ═══════════════════════════════════════════════════════════════════════════
# แต่ละฟังก์ชันด้านล่าง = 1 เครื่องมือ · รับ (pg) แล้วอัปโหลด → กด → ดาวน์โหลด → ตรวจ
# ═══════════════════════════════════════════════════════════════════════════

def test_word_join(pg):
    tool = "word-join"
    t1, t2, t3 = "เอกสารหนึ่ง คือไฟล์แรกที่ต้องอยู่บนสุดหลังรวม", \
                 "เอกสารสอง คือไฟล์กลางที่ต้องอยู่ตรงกลางหลังรวม", \
                 "เอกสารสาม คือไฟล์สุดท้ายที่ต้องอยู่ล่างสุดหลังรวม"
    a = FIX / "join-a.docx"; make_docx(a, [t1])
    b = FIX / "join-b.docx"; make_docx(b, [t2])
    c = FIX / "join-c.docx"; make_docx(c, [t3])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-join", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(a), str(b), str(c)])
    pg.wait_for_timeout(400)
    pg.locator("button.btn", has_text="รวมไฟล์").click()
    wait_status(pg, "รวมเสร็จ")
    out = DL / "join-out.docx"
    dl_click(pg, pg.locator(".results .result button"), out)

    text = read_docx_text(out.read_bytes())
    ck(tool, "ทั้ง 3 ไฟล์ถูกรวมมาครบ ไม่มีไฟล์ไหนหาย", "พบข้อความทั้ง 3 ไฟล์ในผลลัพธ์",
       all(t in text for t in (t1, t2, t3)), True)
    idx1, idx2, idx3 = text.find(t1), text.find(t2), text.find(t3)
    ck(tool, "เรียงตามลำดับที่อัปโหลด (ไฟล์ 1 → 2 → 3)", "ตำแหน่งอักขระของ t1 < t2 < t3 ในผลลัพธ์",
       idx1 < idx2 < idx3, True)
    ck(tool, "ภาษาไทยไม่เพี้ยน (เทียบตรงตัวกับต้นฉบับ ไม่ใช่แค่ contains คร่าว ๆ)",
       "ข้อความไฟล์ที่ 2 ตรงตัวกับต้นฉบับ", t2 in text, True)
    ck(tool, "ไม่มีอักขระ replacement char (เครื่องหมายอ่านไม่ออก) ปนมา", "มี U+FFFD ในผลลัพธ์ไหม", "�" in text, False)


def test_word_replace(pg):
    tool = "word-replace"
    find, repl = "บริษัท เดโม จำกัด", "บริษัท ทดสอบ จำกัด"
    keep = "บริษัทอื่นไม่เกี่ยวข้องเลย"  # คำใกล้เคียงแต่ไม่ตรง find เป๊ะ ๆ — ต้องไม่ถูกแตะ

    f1 = FIX / "rep-1.docx"
    make_docx_with_table(f1, [f"สวัสดีชาวโลก ยินดีต้อนรับสู่{find}", keep], f"ที่อยู่: {find} เลขที่ 99")
    f2 = FIX / "rep-2.docx"
    make_docx(f2, [f"ติดต่อ {find} อีกครั้งได้ที่นี่"])

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-replace", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files([str(f1), str(f2)])
    pg.wait_for_timeout(300)
    row = pg.locator(".rep-row").first
    row.locator("input").nth(0).fill(find)
    row.locator("input").nth(1).fill(repl)
    pg.wait_for_timeout(200)
    pg.locator("button.btn", has_text="แทนที่").click()
    wait_status(pg, "จุด ใน")  # ข้อความจบจริง "แทนที่ N จุด ใน M ไฟล์" — ตัดจากคำว่า "กำลังแทนที่…" ที่ขึ้นก่อน
    results = pg.locator(".results .result")
    ck(tool, "แก้ครบทั้ง 2 ไฟล์", "จำนวนไฟล์ผลลัพธ์", results.count(), 2)

    for i, fname in enumerate(["rep-1-out.docx", "rep-2-out.docx"]):
        out = DL / fname
        dl_click(pg, results.nth(i).locator("button"), out)
        text = read_docx_text(out.read_bytes())
        ck(tool, f"ไฟล์ {i+1}: คำเดิม “{find}” ถูกแทนหมด ไม่เหลือเลย", f"“{find}” ยังอยู่ในไฟล์ {i+1} ไหม", find in text, False)
        ck(tool, f"ไฟล์ {i+1}: คำใหม่ “{repl}” ปรากฏแทน", f"“{repl}” อยู่ในไฟล์ {i+1} ไหม", repl in text, True)
        if i == 0:
            ck(tool, "ไฟล์ 1: คำในตารางก็ถูกแทนที่ด้วย (ไม่ใช่แค่ย่อหน้านอกตาราง)", "“ที่อยู่: … เลขที่ 99” มีคำใหม่แทรก", f"ที่อยู่: {repl} เลขที่ 99" in text, True)
            ck(tool, "ไฟล์ 1: ข้อความที่ไม่ตรง find เป๊ะ ๆ ต้องไม่ถูกแตะ", "ข้อความ distractor ยังอยู่ครบ", keep in text, True)


def test_word_clean(pg):
    tool = "word-clean"
    keep1 = "เอกสารทดสอบการล้างข้อมูล ต้นฉบับต้องอยู่ครบ"
    target = "ย่อหน้าที่ถูกคอมเมนต์ไว้ต้องอยู่ครบ"
    keep2 = "ย่อหน้าสุดท้ายไม่มีอะไรพิเศษ"
    author, lastmod = "สมชาย ผู้เขียนต้นฉบับ", "สมหญิง ผู้แก้ไขล่าสุด"
    company, manager = "บริษัททดสอบ จำกัด", "ผู้จัดการทดสอบ"
    src = FIX / "clean_test.docx"
    make_docx_with_traces(src, [keep1, target, keep2], target, "ผู้ตรวจ", "ความเห็นทดสอบ ต้องถูกลบไปด้วย",
                           author, lastmod, company, manager)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-clean", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_selector(".clean-card")
    # ยืนยันว่าตัวตรวจ (inspect) ก็เจอร่องรอยจริงก่อนล้าง — พิสูจน์ว่า fixture ใช้งานได้ตามที่ตั้งใจ
    report_text = pg.locator(".clean-card").inner_text()
    ck(tool, "ก่อนล้าง: ตัวตรวจของเว็บเจอคอมเมนต์ในไฟล์ (พิสูจน์ fixture ใช้ได้จริง)", "คำว่า “คอมเมนต์” ในรายงานก่อนล้าง", "คอมเมนต์" in report_text, True)

    pg.locator("button.btn", has_text="ล้าง").click()
    wait_status(pg, "ล้างเสร็จ")
    out = DL / "clean-out.docx"
    dl_click(pg, pg.locator(".results .result button"), out)

    raw = out.read_bytes()
    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = zf.namelist()
    ck(tool, "ไฟล์คอมเมนต์ถูกถอดออกจาก zip ทั้งชิ้น", "'word/comments.xml' อยู่ใน zip ไหม", "word/comments.xml" in names, False)

    core = zf.read("docProps/core.xml").decode("utf-8")
    ck(tool, "ชื่อผู้เขียนเดิมถูกล้าง ไม่หลงเหลือใน core.xml", f"“{author}” ยังอยู่ใน core.xml ไหม", author in core, False)
    ck(tool, "ชื่อผู้แก้ไขล่าสุดเดิมถูกล้าง", f"“{lastmod}” ยังอยู่ใน core.xml ไหม", lastmod in core, False)

    app = zf.read("docProps/app.xml").decode("utf-8")
    ck(tool, "ชื่อบริษัทถูกล้างจาก app.xml", f"“{company}” ยังอยู่ใน app.xml ไหม", company in app, False)
    ck(tool, "ชื่อผู้จัดการถูกล้างจาก app.xml", f"“{manager}” ยังอยู่ใน app.xml ไหม", manager in app, False)

    text = read_docx_text(raw)
    ck(tool, "เนื้อหาย่อหน้าทั้ง 3 ยังอยู่ครบเหมือนเดิม (ล้างแค่ร่องรอย ไม่ใช่เนื้อหา)", "พบครบทั้ง 3 ย่อหน้าในผลลัพธ์",
       all(t in text for t in (keep1, target, keep2)), True)


def test_word_mailmerge(pg):
    tool = "word-mailmerge"
    tpl = FIX / "mm-template.docx"
    make_docx_template(tpl, ["เรียนคุณ {{ชื่อ}} แผนก {{แผนก}}", "หมายเหตุ: {{หมายเหตุ}}"])
    xls = FIX / "mm-data.xlsx"
    rows_data = [
        ["สมชาย ใจดี", "ฝ่ายขาย", "ลูกค้าประจำ"],
        ["สมหญิง รักไทย", "ฝ่ายบัญชี", ""],          # แถวนี้ไม่มีหมายเหตุ — ต้องไม่เหลือ {{หมายเหตุ}} ค้าง
        ["วิชัย มั่งมี", "ฝ่ายผลิต", "รอเอกสารเพิ่ม"],
    ]
    make_xlsx_rows(xls, ["ชื่อ", "แผนก", "หมายเหตุ"], rows_data)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle")
    pg.wait_for_selector(".mm-step")
    dzs = pg.locator(".dz input[type=file]")
    dzs.nth(0).set_input_files(str(tpl))
    pg.wait_for_timeout(600)
    dzs.nth(1).set_input_files(str(xls))
    pg.wait_for_timeout(1200)

    go = pg.locator("button.btn", has_text="สร้างเอกสารทั้งชุด")
    go.click()  # Playwright รอปุ่มพ้นสถานะ disabled ให้เองก่อนคลิกจริง
    wait_status(pg, "สร้างเอกสารสำเร็จ")
    results = pg.locator(".results .result")
    ck(tool, "ได้เอกสารครบ 3 ไฟล์ (1 แถว = 1 ไฟล์)", "จำนวนไฟล์ผลลัพธ์", results.count(), 3)

    texts = []
    for i in range(3):
        out = DL / f"mm-out-{i}.docx"
        dl_click(pg, results.nth(i).locator("button"), out)
        texts.append(read_docx_text(out.read_bytes()))

    for i, (name, dept, note) in enumerate(rows_data):
        t = texts[i]
        ck(tool, f"ไฟล์แถวที่ {i+1}: ชื่อ/แผนกตรงกับแถวของตัวเอง ไม่สลับกับแถวอื่น", f"พบ “{name}” และ “{dept}” ในไฟล์ {i+1}",
           name in t and dept in t, True)
        others = [r[0] for j, r in enumerate(rows_data) if j != i]
        ck(tool, f"ไฟล์แถวที่ {i+1}: ไม่มีชื่อของแถวอื่นหลุดเข้ามา", f"ชื่อแถวอื่นปนอยู่ในไฟล์ {i+1} ไหม",
           any(o in t for o in others), False)
        if note:
            ck(tool, f"ไฟล์แถวที่ {i+1}: หมายเหตุตรงกับแถวของตัวเอง", f"พบ “{note}” ในไฟล์ {i+1}", note in t, True)
        else:
            ck(tool, f"ไฟล์แถวที่ {i+1}: หมายเหตุว่าง → ตัวยึดต้องไม่ค้างเป็น {{{{หมายเหตุ}}}}", "มี '{{' ค้างในไฟล์ไหม", "{{" in t, False)


def test_word_to_pdf(pg):
    tool = "word-to-pdf"
    heading = "หัวข้อทดสอบภาษาไทย"
    para = "การทดสอบนี้ต้องอ่านข้อความไทยได้ครบถ้วน สระและวรรณยุกต์ต้องไม่หาย เช่น ก่อน ก้อน กี่ ก๊าซ ปู่ย่า"
    src = FIX / "w2p_test.docx"
    make_docx(src, [para], heading=heading)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-to-pdf", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แปลงเป็น PDF").click()
    wait_status(pg, "แปลงสำเร็จ")
    out = DL / "w2p-out.pdf"
    dl_click(pg, pg.locator(".results .result button"), out)

    texts = read_pdf_texts(out.read_bytes())
    full = "\n".join(texts)
    # ‼️ ประโยคยาวถูกตัดขึ้นบรรทัดใหม่จริงตามความกว้างหน้ากระดาษ (jsPDF splitTextToSize) —
    # เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่บั๊ก (สังเกตจริง: "...เช่น ก่อน\nก้อน กี่..." ตัด ณ ช่องว่างเดิมพอดี)
    # จึงยุบช่องว่างก่อนเทียบ ไม่เทียบดิบ ๆ
    norm = re.sub(r"\s+", " ", full).strip()
    ck(tool, "หัวข้อภาษาไทยแปลงมาโดยไม่เพี้ยน (ค้นหาเจอตรงตัว)", "พบหัวข้อในผลลัพธ์ PDF", heading in norm, True)
    ck(tool, "เนื้อย่อหน้าภาษาไทย (สระ/วรรณยุกต์ครบ) แปลงมาโดยไม่เพี้ยน — เทียบหลังยุบช่องว่าง/บรรทัดตัดคำ",
       "พบย่อหน้าในผลลัพธ์ PDF (normalize whitespace)", para in norm, True)
    ck(tool, "ไม่มีอักขระ replacement char (สระ/วรรณยุกต์หาย) ปนมา", "มี U+FFFD ในผลลัพธ์ไหม", "�" in full, False)


def test_pdf_to_word(pg):
    tool = "pdf-to-word"
    p1 = "เอกสารพีดีเอฟภาษาไทยสำหรับแปลงเป็นเวิร์ด ทดสอบสระและวรรณยุกต์ เช่น ก่อน ก้อน กี่ ก๊าซ"
    p2 = "หน้าที่สองมีตัวเลขไทย ๑๒๓ และเลขอารบิก 456 ทดสอบครบถ้วน"
    src = FIX / "p2w_test.pdf"
    make_pdf(src, [p1, p2], thai=True)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-to-word", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แปลงเป็น Word").click()
    wait_status(pg, "แปลงสำเร็จ")
    out = DL / "p2w-out.docx"
    dl_click(pg, pg.locator(".results .result button"), out)

    text = read_docx_text(out.read_bytes())
    ck(tool, "ข้อความไทยหน้า 1 ถูกแปลงมาไม่เพี้ยน", "พบข้อความหน้า 1 ในผลลัพธ์ .docx", p1 in text, True)
    ck(tool, "ข้อความไทยหน้า 2 (เลขไทย+เลขอารบิก) ถูกแปลงมาไม่เพี้ยน", "พบข้อความหน้า 2 ในผลลัพธ์ .docx", p2 in text, True)
    ck(tool, "ไม่มีอักขระ replacement char ปนมา", "มี U+FFFD ในผลลัพธ์ไหม", "�" in text, False)


def test_pdf_to_word_columns(pg):
    """PDF สองคอลัมน์ (มีหัวเรื่องเหนือ 2 คอลัมน์) ต้องอ่านคอลัมน์ซ้ายจบก่อนแล้วค่อยขวา
    ไม่ใช่ยำซ้าย+ขวาต่อกันเป็นบรรทัดเดียวแบบ row-major (บั๊กจริง 09/09/2026)"""
    tool = "pdf-to-word (2 คอลัมน์)"
    heading = "ประกาศจัดหน้าสองคอลัมน์ สำหรับทดสอบ"
    numerals = ["หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก"]   # ‼️ ต้องเป็น list ห้ามวน for ทับสตริงไทยตรง ๆ (จะได้ตัวอักษรทีละตัวแทนคำ)
    # ‼️ ต้องสั้นพอไม่ให้ fitz.insert_text() ตัดท้ายทิ้งเงียบ ๆ ตอนคอลัมน์ขวา (x=310) เหลือที่แค่ ~285pt
    left = [f"ซ้ายบรรทัดที่{n}ยาวใกล้เคียงกันทุกบรรทัด" for n in numerals]
    right = [f"ขวาบรรทัดที่{n}ยาวใกล้เคียงกันทุกบรรทัด" for n in numerals]
    src = FIX / "p2w_2col_test.pdf"
    make_two_column_pdf(src, heading, left, right)

    pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-to-word", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    pg.locator(".dz input[type=file]").set_input_files(str(src))
    pg.wait_for_timeout(300)
    pg.locator("button.btn", has_text="แปลงเป็น Word").click()
    wait_status(pg, "แปลงสำเร็จ")
    out = DL / "p2w-2col-out.docx"
    dl_click(pg, pg.locator(".results .result button"), out)

    text = read_docx_text(out.read_bytes())
    for i, t in enumerate(left):
        ck(tool, "เนื้อหาคอลัมน์ซ้ายครบ", f"คอลัมน์ซ้ายบรรทัดที่{i+1} อยู่ในผลลัพธ์ ไม่ถูกยำรวมกับขวา", t in text, True)
    for i, t in enumerate(right):
        ck(tool, "เนื้อหาคอลัมน์ขวาครบ", f"คอลัมน์ขวาบรรทัดที่{i+1} อยู่ในผลลัพธ์ ไม่ถูกยำรวมกับซ้าย", t in text, True)

    # ‼️ ใจกลางของบั๊ก: ก่อนแก้ ซ้าย+ขวาบรรทัดเดียวกันถูกต่อกันเป็นสตริงเดียว (row-major)
    #    หลังแก้ ต้องอ่านคอลัมน์ซ้ายทั้ง 6 บรรทัดจบก่อน แล้วค่อยขึ้นคอลัมน์ขวา (column-major)
    last_left_pos = text.find(left[-1])
    first_right_pos = text.find(right[0])
    ck(tool, "ลำดับการอ่าน column-major", "คอลัมน์ซ้ายบรรทัดสุดท้ายอยู่ก่อนคอลัมน์ขวาบรรทัดแรก",
       last_left_pos != -1 and first_right_pos != -1 and last_left_pos < first_right_pos, True)
    # กันเคสที่แก้แบบขี้เกียจแล้วดันไปต่อบรรทัดในสตริงเดียวกัน (แถวเดียวกัน) แทนที่จะแยกย่อหน้า/บรรทัด
    ck(tool, "ไม่ใช่ row-major", "ซ้ายบรรทัดแรก+ขวาบรรทัดแรก ไม่ถูกต่อกันในสตริงเดียว",
       (left[0] + " " + right[0]) in text or (left[0] + right[0]) in text, False)


# ═══════════════════════════════════════════════════════════════════════════

TESTS = [
    test_word_join, test_word_replace, test_word_clean,
    test_word_mailmerge, test_word_to_pdf, test_pdf_to_word, test_pdf_to_word_columns,
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
                ROWS.append((name, "รันเทสทั้งชุด", "รันจบไม่ error", "error: " + str(e)[:300], "ไม่ผ่าน"))
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
