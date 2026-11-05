"""browser_mailmerge_labels.py  จดหมายเวียนโหมดฉลาก หลายแถวของ Excel ต่อหนึ่งหน้า ได้ไฟล์ Word เดียว
พี่ปอนด์ 05/11/2026 "อยากได้ไฟล์เดียวแต่มันแบบ Auto มาจาก Excel ... พี่มีแพทเทินให้ 1 หน้า ... มีการเพิ่มหน้าให้เรื่อย ๆ"
เทมเพลต ตาราง 2x6 ตัวยึดแค่ช่องแรก ช่องอื่นมีข้อความเก่า , ข้อมูล 15 แถว ต้องได้ 2 หน้า หน้าแรก 12 ช่อง หน้าสอง 3 ช่อง ที่เหลือว่าง
ไฟล์ตัวอย่างสร้างด้วย tools/build_label_samples.py"""
import sys, pathlib, re, zipfile, os, tempfile, subprocess
from playwright.sync_api import sync_playwright
BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
S = ROOT / "samples"
P, F = 0, []
def ck(n, g, w):
    global P
    ok = g == w
    P += ok
    if not ok: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
def read_doc(path):
    import xml.etree.ElementTree as ET
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    return xml, ET.fromstring(xml)
def cell_text(tc):  # ย่อหน้าละบรรทัด ต่อติดกันแล้วชื่อชนเลขบ้าน อ่านชื่อไม่ออก
    return "\n".join("".join(t.text or "" for t in p.iter(W + "t")) for p in tc.iter(W + "p")).strip()

names = [f"คุณทดสอบ ตัวอย่างที่{i}" for i in range(1, 16)]
allcells = pathlib.Path(tempfile.mkdtemp()) 
subprocess.run([sys.executable, str(ROOT / "tools/build_label_samples.py"), str(allcells), "--all-cells"], check=True, capture_output=True)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True); pg = ctx.new_page()
    errs = []
    def load(tpl, data):
        global pg
        pg.close(); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle"); pg.wait_for_selector(".mm-step")
        pg.locator("input[type=file]").nth(0).set_input_files(str(tpl)); pg.wait_for_timeout(1200)
        pg.locator("input[type=file]").nth(1).set_input_files(str(data)); pg.wait_for_timeout(1500)
    mode = lambda: pg.locator("select:has(option[value=labels])")
    # ── ตัวยึดแค่ช่องแรก เลือกโหมดฉลากเอง ──
    load(S / "ตัวอย่าง-ฉลากชื่อที่อยู่.docx", S / "ตัวอย่าง-ข้อมูลฉลาก.xlsx")
    ck("มีตัวเลือกโหมดฉลากหลายช่องต่อหน้า", mode().count(), 1)
    if mode().count():
        mode().select_option("labels"); pg.wait_for_timeout(600)
        pv = pg.locator(".mm-box:visible .mm-label").all_inner_texts()
        joined = " ".join(pv)
        ck(f"พรีวิวบอกหน้าละ 12 ช่อง ได้ 2 หน้า {pv}", ("12 ช่อง" in joined and "2 หน้า" in joined), True)
        go = pg.locator("button.btn:visible", has_text="สร้าง")
        ck("ปุ่มสร้างกดได้", go.first.is_disabled(), False)
        with pg.expect_download(timeout=60000) as dl:
            go.first.click()
        path = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename); dl.value.save_as(path)
        if os.environ.get("FK_SAVE"): __import__("shutil").copy(path, os.environ["FK_SAVE"])  # เก็บไฟล์ไปเปิดใน Word ดูด้วยตา
        ck("ได้ไฟล์ .docx ไฟล์เดียว", dl.value.suggested_filename.endswith(".docx"), True)
        xml, root = read_doc(path)
        body = root.find(W + "body")
        tbls = body.findall(W + "tbl")
        ck("มีตาราง 2 ตาราง (2 หน้า)", len(tbls), 2)
        breaks = [s for s in body.iter(W + "sectPr")]
        ck("ตัวแบ่งหน้าแบบ section 1 ตัว กับ section ท้าย 1 ตัว", len(breaks), 2)
        ck("ไม่มีบรรทัดตัวขึ้นหน้าใหม่แบบ page break (กันหน้าว่างแทรก)", len(re.findall(r'w:type="page"', xml)), 0)
        cells = [[cell_text(tc) for tc in t.iter(W + "tc")] for t in tbls]
        got = [c.split("\n")[1] for page in cells for c in page if c.startswith("ผู้รับ")]
        ck("ชื่อครบ 15 คนเรียงตามแถว Excel อ่านซ้ายไปขวาบนลงล่าง", got, names)
        if got != names: print("      ช่องจริง", [c[:60] for c in cells[0][:3]])
        ck("หน้าแรกเต็ม 12 ช่อง", sum(1 for c in cells[0] if "คุณทดสอบ" in c), 12)
        ck("หน้าสองมี 3 ช่อง", sum(1 for c in cells[1] if "คุณทดสอบ" in c), 3)
        ck("ช่องเกินหน้าสุดท้ายว่างทั้งช่อง ไม่มีคำว่าผู้รับหรือ Site ค้าง", [c for c in cells[1][3:] if c.strip()], [])
        ck("ข้อความเก่าในช่องอื่นถูกแทนด้วยแพทเทินช่องแรก", "ชื่อเก่าที่ต้องหายไป" in xml or "OLD0000" in xml, False)
        ck("ไม่มีตัวยึดค้าง", "{{" in xml, False)
        ck("ทุกช่องตารางมีย่อหน้าอย่างน้อย 1 ตัว (Word ไม่ฟ้องไฟล์เสีย)", [i for t in tbls for i, tc in enumerate(t.iter(W + "tc")) if tc.find(W + "p") is None], [])
        ck("Site ของคนที่ 13 อยู่หน้า 2 ช่องแรก", "Site : TRG0013" in cells[1][0], True)
        # พี่ปอนด์ใช้จริง 05/11/2026: Site ยาวติดกันไม่มีเว้นวรรค Word AutoFit ขยายคอลัมน์นั้นบีบอีกคอลัมน์ทั้งหน้า ต้องล็อกความกว้าง
        lays = [t.find(W + "tblPr").find(W + "tblLayout") for t in tbls]
        ck("ตารางฉลากทุกหน้าล็อกความกว้างคอลัมน์ (tblLayout fixed)", [l.get(W + "type") if l is not None else None for l in lays], ["fixed"] * len(tbls))
        order = [c.tag.split("}")[1] for c in tbls[0].find(W + "tblPr")]
        ck("tblLayout อยู่ก่อน tblLook ตามลำดับ schema", "tblLayout" in order and ("tblLook" not in order or order.index("tblLayout") < order.index("tblLook")), True)
    # ── ตัวยึดครบทุกช่อง ระบบเลือกโหมดฉลากให้เอง ──
    load(allcells / "ตัวอย่าง-ฉลากชื่อที่อยู่-ครบทุกช่อง.docx", S / "ตัวอย่าง-ข้อมูลฉลาก.xlsx")
    ck("ตัวยึดซ้ำครบทุกช่อง ระบบเลือกโหมดฉลากให้เอง", mode().input_value() if mode().count() else None, "labels")
    # ── ตารางที่ทำเองใน Word ช่องกว้างไม่เท่ากันเป๊ะ (5386 กับ 5329) ต้องนับครบ 12 ช่อง ──
    subprocess.run([sys.executable, str(ROOT / "tools/build_label_samples.py"), str(allcells), "--at-least", "--jitter"], check=True, capture_output=True)
    jit = allcells / "ตัวอย่าง-ฉลากชื่อที่อยู่-atleast-jitter.docx"
    load(jit, S / "ตัวอย่าง-ข้อมูลฉลาก.xlsx")
    mode().select_option("labels"); pg.wait_for_timeout(500)
    pv = " ".join(pg.locator(".mm-box:visible .mm-label").all_inner_texts())
    ck("ช่องกว้างต่างกันราว 1% ยังนับเป็นช่องฉลากครบ 12 ช่อง", "12 ช่อง" in pv, True)
    # ── ที่อยู่ยาว: ย่อตัวอักษรเฉพาะช่องที่ยาว ยาวเกินแม้ย่อสุดต้องเตือนแถวนั้น (พี่ปอนด์ 05/11/2026 "ที่อยู่ยาวมาก ๆ มันจะเลยความกว้างไหม") ──
    from openpyxl import Workbook
    base_addr = "99/123 หมู่บ้านตัวอย่างทดสอบ ซอยทดสอบ 12 แยก 3 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร 10400 อาคารทดสอบชั้น 25 ห้อง 2501 ฝ่ายบัญชีเจ้าหนี้ ติดต่อคุณทดสอบ โทร 02-000-0000 ต่อ 1234"
    wb = Workbook(); ws = wb.active; ws.append(["Site", "ชื่อ", "ที่อยู่จัดส่งเอกสาร"])
    for i in range(1, 13):
        addr = (base_addr + " " + base_addr) if i == 3 else base_addr if i == 5 else (base_addr + " ") * 8 if i == 7 else f"{i * 7} หมู่ 2 ถนนพหลโยธิน จังหวัดนนทบุรี 10001"
        site = ",".join(f"{p}{n:04d}" for p, n in zip(["PTN", "RYG", "CMI", "BRM", "SNK", "NSN", "KBI", "PKN", "BKK", "SNI", "NRT", "UTT", "KKN"] * 2, range(38, 64))) if i == 9 else f"TRG{i:04d}"
        ws.append([site, f"คุณทดสอบ ตัวอย่างที่{i}", addr])
    longx = allcells / "ข้อมูลที่อยู่ยาว.xlsx"; wb.save(longx)
    load(jit, longx)
    mode().select_option("labels"); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=60000) as dl:
        pg.locator("button.btn:visible", has_text="สร้าง").first.click()
    lp = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename); dl.value.save_as(lp)
    if os.environ.get("FK_SAVE_LONG"): __import__("shutil").copy(lp, os.environ["FK_SAVE_LONG"])
    _, lroot = read_doc(lp)
    lcells = list(lroot.find(W + "body").find(W + "tbl").iter(W + "tc"))
    def sizes(tc):
        return sorted({int(e.get(W + "val")) for e in tc.iter() if e.tag in (W + "sz", W + "szCs")})
    # พี่ปอนด์ใช้จริง 05/11/2026 เทมเพลตแถว At least ที่อยู่ยาวเป็นสิบที่ แถวยืดล้นไปอีกหน้า ฉลากหลังจากนั้นเลื่อนทั้งไฟล์ ต้องบังคับ Exactly
    rules = [tr.find(W + "trPr").find(W + "trHeight").get(W + "hRule") for tr in lroot.find(W + "body").find(W + "tbl").findall(W + "tr")]
    ck("เทมเพลตแถว At least ผลลัพธ์ทุกแถวเป็น Exactly ฉลากไม่เลื่อน", rules, ["exact"] * len(rules))
    ck("ช่องที่อยู่สั้นขนาดตัวอักษรเดิม 14pt", sizes(lcells[0]), [28])
    # Site ยาวไม่เว้นวรรค (คนที่ 9) Word ขึ้นบรรทัดใหม่ก่อนตัดกลางคำ Word จริงยืนยัน 12pt ยังล้นครึ่งบรรทัด (real30/word/zoom5c-1.png)
    ck("Site ยาวไม่เว้นวรรคถูกย่อเล็กกว่า 12pt หรือถูกเตือน", max(sizes(lcells[8]) or [99]) < 24 or "10" in (pg.locator("[data-warn=overflow]").first.get_attribute("data-rows") or "").split(","), True)
    ck("ช่องที่อยู่ยาว 2 เท่าถูกย่อตัวอักษร", max(sizes(lcells[2]) or [99]) < 28, True)
    ck("ช่องที่อยู่ยาวถูกย่อตัวอักษร", max(sizes(lcells[4]) or [99]) < 28, True)
    ck("ยาวกว่าย่อเล็กกว่า", max(sizes(lcells[2])) <= max(sizes(lcells[4])), True)
    ck("ย่อไม่เล็กกว่า 10pt", min(min(sizes(c) or [99]) for c in lcells), 20)
    warn = pg.locator("[data-warn=overflow]")
    ck("ยาวเกินแม้ย่อเหลือ 10pt เตือนแถว Excel ที่ 8 (คนที่ 7)", warn.get_attribute("data-rows") if warn.count() else None, "8")
    # ‼️ หน้าเสร็จงานของ FileKit ซ่อนฟอร์มทั้งหมด ดึงไปแสดงเฉพาะ .results > .note คำเตือนต้องมองเห็นจริง ไม่ใช่แค่มีในหน้า (พี่ใช้จริง 2,885 แถวไม่เห็นคำเตือน)
    ck("คำเตือนแถวยาวเกินมองเห็นบนหน้าเสร็จงาน", warn.count() == 1 and warn.is_visible(), True)
    # ── เลือกย้ายแถวที่ยาวเกินไปรวมหน้าท้าย (พี่ปอนด์ 05/11/2026 "เอาแปลก ๆ ไปอยู่หน้าท้าย ๆ รวมกัน") ──
    back = pg.locator("button:visible", has_text="กลับไปแก้")
    if back.count(): back.first.click(); pg.wait_for_timeout(400)
    longsel = pg.locator("#mm-long")
    ck("โหมดฉลากมีช่องเลือกแถวที่ยาวเกินช่อง", longsel.count() == 1 and longsel.is_visible(), True)
    if longsel.count():
        longsel.select_option("end"); pg.wait_for_timeout(300)
        with pg.expect_download(timeout=60000) as dl:
            pg.locator("button.btn:visible", has_text="สร้าง").first.click()
        mp = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename); dl.value.save_as(mp)
        _, mroot = read_doc(mp)
        mcells = [cell_text(tc) for tc in mroot.find(W + "body").find(W + "tbl").iter(W + "tc")]
        names_m = [c.split("\n")[1] if c.count("\n") else "" for c in mcells]
        ck("คนที่ 7 ที่ยาวเกินย้ายไปช่องสุดท้าย คนที่ 8 เลื่อนขึ้นมาแทน", (names_m[-1], names_m[6]), ("คุณทดสอบ ตัวอย่างที่7", "คุณทดสอบ ตัวอย่างที่8"))
        ck("แถวปกติยังเรียงตามลำดับ Excel", names_m[:6], [f"คุณทดสอบ ตัวอย่างที่{i}" for i in range(1, 7)])
        pg.wait_for_timeout(300)
        # หลังกด กลับไปแก้ แล้วสร้างใหม่ คำเตือนรอบแรกค้างในแผงผลลัพธ์ที่ซ่อนอยู่ นับเฉพาะที่ตาเห็น ต้องเห็นอันเดียว
        w2 = pg.locator("[data-warn=overflow]:visible")
        ck("คำเตือนที่มองเห็นมีอันเดียว ไม่ซ้อนกับรอบก่อน", w2.count(), 1)
        ck("คำเตือนยังบอกเลขแถว Excel เดิม (8) ไม่ใช่ตำแหน่งใหม่", w2.first.get_attribute("data-rows") if w2.count() else None, "8")
        mv = pg.locator("[data-moved]:visible")
        ck("บอกว่าแถวที่ยาวเกินอยู่หน้าไหน", mv.get_attribute("data-moved") if mv.count() else None, "1-1")
        ck("ข้อความบอกหน้าของแถวที่ย้าย มองเห็นบนหน้าเสร็จงาน", mv.count() == 1 and mv.is_visible(), True)
    ck("ไม่มี error", [e for e in errs if "favicon" not in e.lower()], [])
    b.close()
print(f"\nผ่าน {P} ตก {len(F)}")
for i, x in enumerate(F, 1): print(f"  {i}. {x}")
sys.exit(1 if F or P == 0 else 0)
