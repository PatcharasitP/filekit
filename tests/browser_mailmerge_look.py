"""browser_mailmerge_look.py  ฉลากฟอนต์เดียว ขนาดเท่ากัน ตั้งขนาดรายฟิลด์ และแถวยาวรวมท้ายเรียงตามความยาว
พี่ปอนด์ 05/11/2026 ดึก (ภาพ 136 ถึง 139)
  "ไปเลือกย้ายอันแปลก ๆ ไปอยู่ด้านหลัง พี่ก็บอกอยู่ว่าขนาดกล่องเอาตามเขาเลย"  แถวปกติ 1,069 แถวถูกนับว่ายาวเกิน
  "เรื่องฟอนต์อีก ทำไมจะใช้ปนกัน เอาสักฟอนต์นึงที่รองรับภาษาไทยและอังกฤษ ขนาดตัวอักษรเท่ากันให้หมด
   แต่มีเพิ่มได้ว่าฟิลด์ไหนจะให้ dynamic มีขนาดเท่าไรบ้าง ถ้าไม่เลือกก็เท่ากันหมด"
  "มันบาลานซ์ความสูงกันไหม อันไหนยาวเกินกล่องปกติก็ไปท้าย ๆ เลย ไม่ต้องสนใจลำดับ"
แม่แบบจำลองโครงเดียวกับไฟล์จริงของพี่ (P_FERN): ตาราง Table Grid 2x6 ช่อง 4749 twip สูง 2168 twip ตัวยึดครบทุกช่อง
  ชื่อกับที่อยู่ใช้ฟอนต์ธีม 14pt บรรทัด Site เป็น Calibri ขนาดตั้งต้น เอกสารเว้นหลังย่อหน้า 10pt ระยะบรรทัด 1.15 แต่ Table Grid ทับเป็น 0 กับ 1.0
ข้อมูลสมมติ 24 แถว ที่อยู่ปกติ 20 แถว ยาวจริง 4 แถว (Excel แถว 4 , 9 , 16 , 21)
ใช้: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_mailmerge_look.py"""
import sys, pathlib, zipfile, os, tempfile, re
from playwright.sync_api import sync_playwright
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from openpyxl import Workbook

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
P, F = 0, []
def ck(n, g, w):
    global P
    ok = g == w
    P += ok
    if not ok: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}", flush=True)

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
TMP = pathlib.Path(tempfile.mkdtemp())
SAVE = os.environ.get("FK_SAVE")  # โฟลเดอร์เก็บไฟล์ผลไปเปิดใน Word

def build_template(path):
    d = Document()
    d.styles["Normal"].paragraph_format.space_after = None
    t = d.add_table(rows=6, cols=2); t.style = "Table Grid"
    for g in t._tbl.find(qn("w:tblGrid")).findall(qn("w:gridCol")): g.set(qn("w:w"), "4749")
    for row in t.rows:
        trPr = row._tr.get_or_add_trPr(); h = OxmlElement("w:trHeight"); h.set(qn("w:val"), "2168"); trPr.append(h)
        for c in row.cells:
            c.width = Pt(4749 / 20)
            c.paragraphs[0].text = ""
            def theme_run(p, text):
                r = p.add_run(text); rPr = r._element.get_or_add_rPr(); rf = OxmlElement("w:rFonts")
                rf.set(qn("w:asciiTheme"), "minorBidi"); rf.set(qn("w:hAnsiTheme"), "minorBidi"); rf.set(qn("w:cstheme"), "minorBidi"); rPr.append(rf)
                for k in ("w:sz", "w:szCs"):
                    e = OxmlElement(k); e.set(qn("w:val"), "28"); rPr.append(e)
            theme_run(c.paragraphs[0], "ผู้รับ")
            theme_run(c.add_paragraph(), "{{ชื่อ}}")
            theme_run(c.add_paragraph(), "{{ที่อยู่จัดส่งเอกสาร}}")
            p = c.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            r = p.add_run("Site : {{Site}}"); r.font.name = "Calibri"
    d.save(path)

ADDR = ["เลขที่ 254 ถ.พญาไท แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330", "เลขที่ 96/27 ม.9 ต.บางเขน อ.เมืองนนทบุรี นนทบุรี 11000",
        "เลขที่ 12 ม.3 ต.วัดประดู่ อ.เมืองสุราษฎร์ธานี สุราษฎร์ธานี 84000", "อุทยานแห่งชาติแม่วงก์ ถ.คลองลาน อุ้มผาง อ.ปางศิลาทอง กำแพงเพชร 62120"]
LONG_AT = {4: 250, 9: 1200, 16: 600, 21: 400}   # แถว Excel : ความยาวที่อยู่โดยประมาณ (ตัวอักษร)
# พี่ปอนด์ 06/11/2026 (ภาพ 141 ถึง 143) Site หลายรหัสในย่อหน้าชิดขวา ข้อมูลจริงมีทั้งคั่นจุลภาคติดกันและเว้นวรรค
SITE_AT = {7: ",".join(f"RM-BKK5298/{c}" for c in "AFIHKB"), 12: ", ".join(f"BKK{n}" for n in (1057, 1576, 1577, 1579, 1583, 1584))}
def build_data(path):
    wb = Workbook(); ws = wb.active; ws.append(["Site", "ชื่อ", "ที่อยู่จัดส่งเอกสาร"])
    for xl in range(2, 26):
        n = LONG_AT.get(xl)
        addr = ",".join(ADDR * 40)[:n] if n else ADDR[xl % 4]
        name = f"บริษัท ทดสอบ ตัวอย่างที่ {xl} จำกัด" + (" ทุน 1,250 บาท" if xl == 13 else "")
        ws.append([SITE_AT.get(xl, f"KPT{xl:04d}"), name, addr])
    wb.save(path)
def label_cells(path):
    """ช่องฉลากทุกช่องตามลำดับ รวมช่องว่าง (cells_of ข้ามช่องว่าง จึงไม่เห็นช่องว่างคั่นกลาง)"""
    with zipfile.ZipFile(path) as z:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(z.read("word/document.xml"))
    return [tc for tbl in root.iter(W + "tbl") for tc in tbl.iter(W + "tc")]
def para_parts(p):
    """ข้อความของย่อหน้าแยกตาม w:br และนับขีดห้ามตัดเป็น -"""
    parts, cur = [], ""
    for r in p.iter(W + "r"):
        for c in r:
            if c.tag == W + "t": cur += c.text or ""
            elif c.tag == W + "noBreakHyphen": cur += "-"
            elif c.tag == W + "br": parts.append(cur); cur = ""
    return parts + [cur]

def cells_of(path):
    with zipfile.ZipFile(path) as z:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(z.read("word/document.xml"))
    out = []
    for tbl in root.iter(W + "tbl"):
        for tc in tbl.iter(W + "tc"):
            paras = ["".join(t.text or "" for t in p.iter(W + "t")) for p in tc.iter(W + "p")]
            if not any(paras): continue
            out.append({"tc": tc, "paras": paras, "tbl": tbl})
    return out
def runs_of(tc):
    return [r for r in tc.iter(W + "r") if "".join(t.text or "" for t in r.iter(W + "t")).strip()]
def rpr(r, tag, attr="val"):
    e = r.find(f"{W}rPr/{W}{tag}")
    return e.get(W + attr) if e is not None else None

tpl, data = TMP / "แม่แบบ-fern.docx", TMP / "ข้อมูล24.xlsx"
build_template(tpl); build_data(data)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
    errs = []
    def open_tool():
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle"); pg.wait_for_selector(".mm-step")
        pg.locator("input[type=file]").nth(0).set_input_files(str(tpl)); pg.wait_for_timeout(1200)
        pg.locator("input[type=file]").nth(1).set_input_files(str(data)); pg.wait_for_timeout(1500)
        pg.locator("select:has(option[value=labels])").select_option("labels"); pg.wait_for_timeout(400)
        return pg
    def make(pg, tag):
        with pg.expect_download(timeout=90000) as dl:
            pg.locator("button.btn:visible", has_text="สร้าง").first.click()
        path = TMP / f"{tag}.docx"; dl.value.save_as(path); pg.wait_for_timeout(500)
        if SAVE: pathlib.Path(SAVE).mkdir(parents=True, exist_ok=True); __import__("shutil").copy(path, pathlib.Path(SAVE) / f"{tag}.docx")
        w = pg.locator("[data-warn=overflow]:visible")
        rows = w.first.get_attribute("data-rows") if w.count() else ""
        return path, sorted(int(x) for x in rows.split(",") if x)

    # ── ค่าตั้งต้น: ฟอนต์เดียว 10pt ย้ายแถวยาวไปท้าย ──
    pg = open_tool()
    opts = pg.locator("#mm-font option").all_inner_texts()
    ck("ประชากร: มีช่องเลือกฟอนต์ ค่าตั้งต้น Leelawadee UI", (pg.locator("#mm-font").count(), pg.locator("#mm-font").input_value()), (1, "Leelawadee UI"))
    ck("ไม่มี TH Sarabun New ในตัวเลือก (ไม่มากับ Windows Word เอาฟอนต์อื่นแทน)", any("Sarabun" in o for o in opts), False)
    ck("ขนาดตั้งต้น 10pt ช่องเห็นในโหมดฉลาก", (pg.locator("#mm-size").input_value(), pg.locator("#mm-size").is_visible()), ("10", True))
    pg.locator("#mm-fsizes summary").click(); pg.wait_for_timeout(200)
    flds = pg.locator("#mm-fsizes .mm-key").all_inner_texts()
    ck("ตั้งขนาดรายฟิลด์ มีครบ 3 ฟิลด์", sorted(flds), sorted(["{{Site}}", "{{ชื่อ}}", "{{ที่อยู่จัดส่งเอกสาร}}"]))
    txt = pg.locator(".mm-step").last.inner_text()
    ck("ข้อความหน้าจอไม่มีจุดกลาง ขีดยาว หรือ null", [c for c in ("·", "—", "null") if c in txt], [])
    pg.locator("#mm-long").select_option("end"); pg.wait_for_timeout(200)
    path, flagged = make(pg, "look-end")
    ck("แถวที่นับว่ายาวเกินกล่อง มีแต่ 4 แถวที่ยาวจริง (เดิมแถวปกตินับว่ายาวเพราะเอาเว้นหลังย่อหน้าของเอกสารมาคิดในตาราง)", flagged, sorted(LONG_AT))
    cells = cells_of(path)
    fonts = set(); sizes = set(); theme = 0
    for c in cells:
        for r in runs_of(c["tc"]):
            rf = r.find(f"{W}rPr/{W}rFonts")
            fonts.add(tuple(rf.get(W + a) for a in ("ascii", "hAnsi", "cs", "eastAsia")) if rf is not None else None)
            theme += sum(1 for a in ("asciiTheme", "hAnsiTheme", "cstheme", "eastAsiaTheme") if rf is not None and rf.get(W + a))
            sizes.add((rpr(r, "sz"), rpr(r, "szCs")))
    ck("ทุกตัวอักษรในฉลากเป็น Leelawadee UI ทั้งไทยและอังกฤษ (รวม Site กับ ผู้รับ)", fonts, {("Leelawadee UI",) * 4})
    ck("ไม่เหลือฟอนต์ธีมทับชื่อฟอนต์", theme, 0)
    ck("ทุกบรรทัดขนาดเท่ากัน 10pt", sizes, {("20", "20")})
    # แถวยาวรวมท้าย เรียงจากสั้นไปยาว กล่องข้างกันยาวใกล้กัน
    addr_of = lambda c: c["paras"][2] if len(c["paras"]) > 2 else ""
    tail = [len(addr_of(c)) for c in cells[-4:]]
    ck("แถวยาวสี่แถวอยู่ท้ายไฟล์ เรียงจากสั้นไปยาว", tail, sorted(tail) if len(tail) == 4 and min(tail) > 200 else "ไม่ใช่สี่แถวยาว")
    ck("แถวปกติอยู่ก่อน ไม่มีแถวยาวปน", all(len(addr_of(c)) < 200 for c in cells[:-4]), True)
    # พี่ปอนด์ 06/11/2026 ภาพ 140 "ทำไมมันมีว่างด้วย ไม่ควรว่าง" แถวยาวต่อท้ายแถวปกติทันที ช่องว่างมีได้แค่ท้ายไฟล์
    tcs = label_cells(path)
    filled = [i for i, tc in enumerate(tcs) if "".join(t.text or "" for t in tc.iter(W + "t")).strip()]
    gaps = [i for i in range(len(tcs)) if i < filled[-1] and i not in filled]
    ck("ประชากร: ช่องฉลากที่มีข้อความ 24 ช่อง", len(filled), 24)
    ck("ไม่มีช่องฉลากว่างคั่นระหว่างแถวปกติกับแถวยาว (ว่างได้แค่ท้ายไฟล์)", gaps, [])
    # Site หลายรหัส บรรทัดแรก Site : รหัสแรก อยู่ที่เดิมเหมือนฉลากปกติ ที่เหลือขึ้นบรรทัดใหม่ ชิดขวาตามแม่แบบ
    def site_p(key):
        for tc in tcs:
            if key in "".join(t.text or "" for t in tc.iter(W + "t")):
                return next((p for p in tc.iter(W + "p") if "Site :" in "".join(t.text or "" for t in p.iter(W + "t"))), None)
    for xl, first_code in ((7, "RM-BKK5298/A,"), (12, "BKK1057,")):
        sp = site_p(f"ตัวอย่างที่ {xl} ")
        parts = para_parts(sp) if sp is not None else []
        jc = sp.find(f"{W}pPr/{W}jc").get(W + "val") if sp is not None and sp.find(f"{W}pPr/{W}jc") is not None else None
        ck(f"Site หลายรหัสแถว {xl} บรรทัดแรกเป็น Site : {first_code} แล้วขึ้นบรรทัดใหม่ ชิดขวาตามแม่แบบ", (parts[:1], len(parts) > 1, jc), ([f"Site : {first_code}"], True, "right"))
        ck(f"Site แถว {xl} รหัสครบตรงตัวตามข้อมูล (ตาไม่เห็นตัวเว้นวรรคกว้างศูนย์)", "".join(parts).replace("​", "").replace("Site : ", "").replace(" ", ""), SITE_AT[xl].replace(" ", ""))
    sp7 = site_p("ตัวอย่างที่ 7 ")
    ck("รหัส RM-BKK ใช้ขีดห้ามตัด Word ไม่ตัดบรรทัดกลางรหัส", sum(1 for _ in sp7.iter(W + "noBreakHyphen")) if sp7 is not None else 0, 6)
    # จุลภาค 5 ตัว ตัวแรกเป็นที่ขึ้นบรรทัดใหม่ (w:br) อีก 4 ตัวมีตัวเว้นวรรคกว้างศูนย์ตาม
    ck("รหัสคั่นจุลภาคติดกัน มีจุดตัดบรรทัดที่ตาไม่เห็นหลังจุลภาคที่เหลือทั้ง 4 ตัว", "".join(para_parts(sp7)).count(",​") if sp7 is not None else 0, 4)
    sp2 = site_p("ตัวอย่างที่ 2 ")
    ck("Site รหัสเดียวไม่ขึ้นบรรทัดใหม่", len(para_parts(sp2)) if sp2 is not None else 0, 1)
    nm = next(("".join(t.text or "" for t in tc.iter(W + "t")) for tc in tcs if "ตัวอย่างที่ 13 " in "".join(t.text or "" for t in tc.iter(W + "t"))), "")
    ck("ตัวเลขเงิน 1,250 ไม่ถูกแทรกอะไร", "1,250" in nm and "1,​250" not in nm, True)
    pg.close()

    # ── ตั้งรายฟิลด์: ที่อยู่ 9pt ย่อเองได้ถึง 6pt , Site 8pt ──
    pg = open_tool()
    pg.locator("#mm-long").select_option("end")
    pg.locator("#mm-fsizes summary").click(); pg.wait_for_timeout(200)
    pg.locator('#mm-fsizes input[data-field="ที่อยู่จัดส่งเอกสาร"][data-kind="size"]').fill("9")
    pg.locator('#mm-fsizes input[data-field="ที่อยู่จัดส่งเอกสาร"][data-kind="min"]').fill("6")
    pg.locator('#mm-fsizes input[data-field="Site"][data-kind="size"]').fill("8")
    path, flagged2 = make(pg, "look-fields")
    cells = cells_of(path)
    def sizes_in(c, i):
        ps = list(c["tc"].iter(W + "p")); return {rpr(r, "sz") for r in runs_of(ps[i])} if i < len(ps) else set()
    normal = [c for c in cells if len(addr_of(c)) < 200]
    ck("ประชากร: มีฉลากแถวปกติ", len(normal) > 0, True)
    ck("ฟิลด์ที่ไม่ได้ตั้ง (ผู้รับ ชื่อ) ยัง 10pt", {s for c in normal for s in sizes_in(c, 0) | sizes_in(c, 1)}, {"20"})
    ck("บรรทัด Site 8pt ตามที่ตั้ง (รวมคำว่า Site :)", {s for c in normal for s in sizes_in(c, 3)}, {"16"})
    ck("ที่อยู่แถวปกติ 9pt ไม่ย่อเกินจำเป็น", {s for c in normal for s in sizes_in(c, 2)}, {"18"})
    ck("ที่อยู่ย่อเองได้ถึง 6pt แถว 250 400 600 ตัวพอดีกล่อง ไม่ถูกย้าย เหลือแต่แถว 1,200 ตัว", flagged2, [9])
    shrunk = [c for c in cells if 300 < len(addr_of(c)) < 700]
    seen = [(len(addr_of(c)), sorted(sizes_in(c, 2)), sorted(sizes_in(c, 1))) for c in shrunk]
    ck(f"แถว 400 กับ 600 ตัว ที่อยู่ย่อลงระหว่าง 6 ถึง 9pt ฟิลด์อื่นไม่ย่อ {seen}", len(shrunk) == 2 and all(12 <= int(s) < 18 for c in shrunk for s in sizes_in(c, 2))
       and all(sizes_in(c, 1) == {"20"} for c in shrunk), True)
    pg.close()

    # ── ตามแม่แบบ: ไม่แตะฟอนต์ ──
    pg = open_tool()
    pg.locator("#mm-font").select_option("")
    pg.wait_for_timeout(200)
    ck("ตามแม่แบบ ซ่อนช่องขนาดและรายฟิลด์", (pg.locator("#mm-size").is_visible(), pg.locator("#mm-fsizes").is_visible()), (False, False))
    path, _ = make(pg, "look-template")
    cells = cells_of(path)
    th = sum(1 for c in cells for r in runs_of(c["tc"]) if (rf := r.find(f"{W}rPr/{W}rFonts")) is not None and rf.get(W + "cstheme"))
    ck("ตามแม่แบบ ฟอนต์ธีมของแม่แบบยังอยู่", th > 0, True)
    pg.close()
    ck("ไม่มี error ในหน้า", errs, [])
    b.close()

print(f"\nbrowser_mailmerge_look: ผ่าน {P}/{P + len(F)}")
for f in F: print("  ❌", f)
sys.exit(1 if F else 0)
