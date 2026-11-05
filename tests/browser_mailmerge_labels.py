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
        # ชุดนี้ตรวจโหมดตามแม่แบบ (ฟอนต์และขนาดเดิม ย่อทั้งช่องตามสัดส่วน) ฟอนต์เดียวทั้งฉลากตรวจใน browser_mailmerge_look.py
        pg.evaluate("() => { const s = document.querySelector('#mm-font'); if (s) { s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); } }")
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
        addr = (base_addr + " " + base_addr) if i == 3 else base_addr if i == 5 else (base_addr + " ") * 8 if i == 7 else "\n".join(f"บรรทัดที่ {k} ซอยสั้น" for k in range(1, 9)) if i == 11 else f"{i * 7} หมู่ 2 ถนนพหลโยธิน จังหวัดนนทบุรี 10001"
        # รีวิว 05/11/2026: คนที่ 11 ที่อยู่กด Alt+Enter 8 บรรทัด (ข้อ 2) , แถวว่างก่อนคนที่ 7 ใน Excel เลขแถวต้องตามแถวจริง (ข้อ 4)
        if i == 7: ws.append([])
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
    ck("Site ยาวไม่เว้นวรรคถูกย่อเล็กกว่า 12pt หรือถูกเตือน", max(sizes(lcells[8]) or [99]) < 24 or "11" in (pg.locator("[data-warn=overflow]").first.get_attribute("data-rows") or "").split(","), True)
    ck("ช่องที่อยู่ยาว 2 เท่าถูกย่อตัวอักษร", max(sizes(lcells[2]) or [99]) < 28, True)
    ck("ช่องที่อยู่ยาวถูกย่อตัวอักษร", max(sizes(lcells[4]) or [99]) < 28, True)
    ck("ยาวกว่าย่อเล็กกว่า", max(sizes(lcells[2])) <= max(sizes(lcells[4])), True)
    ck("ช่องปกติย่อไม่เล็กกว่า 10pt", min(min(sizes(c) or [99]) for i, c in enumerate(lcells) if i not in (6, 10)), 20)
    # พี่ปอนด์ 05/11/2026 "ไม่เอาตัด ... มันควรเล็กสิถ้ามันเยอะ ... ให้มัน dynamic" ยาวผิดปกติย่อทั้งช่องรวม Site ต่อจนพอดี ข้อความครบ
    t7 = cell_text(lcells[6])
    ck("ช่องยาวมาก (คนที่ 7) ข้อความครบ ไม่ถูกตัด ไม่มี …", (t7.count("ถนนพหลโยธิน"), "…" in t7, "Site : TRG0007" in t7), (8, False, True))
    ck("ช่องยาวมากย่อทุกบรรทัดรวม Site เล็กกว่า 10pt", max(sizes(lcells[6]) or [99]) < 20 and max(sizes(lcells[10]) or [99]) < 20, True)
    ck("ช่องยาวมากไม่เล็กกว่า 3pt", min(sizes(lcells[6]) + sizes(lcells[10]) or [0]) >= 6, True)
    warn = pg.locator("[data-warn=overflow]")
    ck("ยาวเกินแม้ย่อเหลือ 10pt เตือนแถว Excel ที่ 9 (คนที่ 7 หลังแถวว่าง) กับ 13 (คนที่ 11 ขึ้นบรรทัด 8 บรรทัด)", warn.get_attribute("data-rows") if warn.count() else None, "9,13")
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
        mtbls = mroot.find(W + "body").findall(W + "tbl")
        mpages = [[cell_text(tc) for tc in t.iter(W + "tc")] for t in mtbls]
        nm = lambda c: c.split("\n")[1] if c.count("\n") else ""
        # พี่ปอนด์ใช้จริง 05/11/2026 "ของดีปนมาด้วย" แถวยาวต้องเริ่มหน้าใหม่ หน้าแรกเหลือช่องว่างได้
        ck("หน้าแรกมีแต่แถวปกติตามลำดับ Excel ที่เหลือว่าง", [nm(c) for c in mpages[0]], [f"คุณทดสอบ ตัวอย่างที่{i}" for i in (1, 2, 3, 4, 5, 6, 8, 9, 10, 12)] + ["", ""])
        # พี่ปอนด์ 05/11/2026 ดึก "อันไหนยาวเกินกล่องปกติก็ไปท้าย ๆ เลย ไม่ต้องสนใจลำดับ" แถวยาวเรียงจากสั้นไปยาว คนที่ 11 (8 บรรทัดสั้น) มาก่อนคนที่ 7
        ck("แถวยาวเกิน (คนที่ 11 กับ 7 เรียงจากสั้นไปยาว) เริ่มหน้าใหม่ หน้า 2", [nm(c) for c in mpages[1][:2]] if len(mpages) > 1 else None, ["คุณทดสอบ ตัวอย่างที่11", "คุณทดสอบ ตัวอย่างที่7"])
        # พี่ปอนด์ "SiteCode หายไปเลยทั้งที่ใน Excel มีทุกบรรทัด" ยาวเกินแม้ย่อสุด ตัดท้ายที่อยู่ใส่ … บรรทัด Site ต้องยังอยู่
        c7 = next((c for c in (mpages[1] if len(mpages) > 1 else []) if nm(c) == "คุณทดสอบ ตัวอย่างที่7"), "")
        ck("ช่องที่ยาวเกินย้ายมาแล้วข้อความครบ มี Site : TRG0007 ไม่มี …", ("Site : TRG0007" in c7, "…" in c7, c7.count("ถนนพหลโยธิน")), (True, False, 8))
        # พี่ปอนด์ 05/11/2026 "ถ้าอันไหนมันเยอะเกินกล่อง เราขยายไปเลยความยาวกล่อง แล้วย้ายมันไปอยู่ล่างสุดรวม ๆ"
        hr = lambda t: [tr.find(W + "trPr").find(W + "trHeight").get(W + "hRule") for tr in t.findall(W + "tr")]
        ck("หน้าแถวปกติกล่องสูงคงที่ (Exactly) หน้าแถวยาวกล่องสูงตามข้อความ (At least)", (set(hr(mtbls[0])), set(hr(mtbls[1])) if len(mtbls) > 1 else None), ({"exact"}, {"atLeast"}))
        ck("หน้าแถวยาวฉลากหนึ่งช่องไม่แยกข้ามหน้า (cantSplit ทุกแถว)", all(tr.find(W + "trPr").find(W + "cantSplit") is not None for tr in mtbls[1].findall(W + "tr")) if len(mtbls) > 1 else False, True)
        mc = list(mtbls[1].iter(W + "tc")) if len(mtbls) > 1 else []
        # Word จริง 05/11/2026 กล่องขยายรวมกล่องว่างที่เหลือดันย่อหน้าท้ายไปเกิดหน้าว่าง (word2/grow-5.png) หน้าแถวยาวเก็บเฉพาะแถวที่มีฉลาก
        ck("หน้าแถวยาวไม่มีแถวกล่องว่าง (2 ฉลากเหลือ 1 แถว)", len(mtbls[1].findall(W + "tr")) if len(mtbls) > 1 else None, 1)
        ck("หน้าแถวยาวไม่ย่อจิ๋ว ตัวอักษรไม่เล็กกว่า 10pt", min(sizes(mc[0]) + sizes(mc[1]) or [0]) >= 20 if mc else False, True)
        ck("ชื่อไฟล์ไม่บอกจำนวนหน้า (กล่องขยาย Word นับหน้าเอง)", dl.value.suggested_filename.endswith("แถว.docx"), True)
        # พี่ปอนด์ 05/11/2026 "ต้องเอาตาม Layout ของเขา อย่าง Site เราไปเปลี่ยนตำแหน่งเอง มันไม่ถูก" เทมเพลต: 4 ย่อหน้า Site ย่อหน้าสุดท้ายชิดขวา
        def layout(tc):
            ps = tc.findall(W + "p"); last = ps[-1] if ps else None
            jc = last.find(W + "pPr/" + W + "jc") if last is not None else None
            return (len(ps), "Site :" in "".join(t.text or "" for t in last.iter(W + "t")) if last is not None else False, jc.get(W + "val") if jc is not None else None)
        filled = [tc for t in mtbls for tc in t.iter(W + "tc") if cell_text(tc)]
        ck("ทุกช่อง (ปกติ ถูกย่อ และกล่องขยาย) Site อยู่ย่อหน้าสุดท้ายชิดขวาเหมือนเทมเพลต", sorted({layout(tc) for tc in filled}), [(4, True, "right")])
        pg.wait_for_timeout(300)
        # หลังกด กลับไปแก้ แล้วสร้างใหม่ คำเตือนรอบแรกค้างในแผงผลลัพธ์ที่ซ่อนอยู่ นับเฉพาะที่ตาเห็น ต้องเห็นอันเดียว
        w2 = pg.locator("[data-warn=overflow]:visible")
        ck("คำเตือนที่มองเห็นมีอันเดียว ไม่ซ้อนกับรอบก่อน", w2.count(), 1)
        ck("คำเตือนยังบอกเลขแถว Excel เดิม (9,13) ไม่ใช่ตำแหน่งใหม่", w2.first.get_attribute("data-rows") if w2.count() else None, "9,13")
        mv = pg.locator("[data-moved]:visible")
        ck("บอกว่าแถวที่ยาวเกินเริ่มหน้าไหน", mv.get_attribute("data-moved") if mv.count() else None, "2")
        ck("ข้อความบอกหน้าของแถวที่ย้าย มองเห็นบนหน้าเสร็จงาน", mv.count() == 1 and mv.is_visible(), True)
    # ── รีวิว 05/11/2026 ข้อ 1: ตัวยึดอยู่ช่องที่สอง ช่องแรกเป็นข้อความเก่า ต้องได้ฉลากครบ ไม่ใช่ฉลากเปล่าทั้งไฟล์ ──
    subprocess.run([sys.executable, str(ROOT / "tools/build_label_samples.py"), str(allcells), "--second"], check=True, capture_output=True)
    load(allcells / "ตัวอย่าง-ฉลากชื่อที่อยู่-second.docx", S / "ตัวอย่าง-ข้อมูลฉลาก.xlsx")
    mode().select_option("labels"); pg.wait_for_timeout(400)
    with pg.expect_download(timeout=60000) as dl:
        pg.locator("button.btn:visible", has_text="สร้าง").first.click()
    sp2 = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename); dl.value.save_as(sp2)
    _, sroot = read_doc(sp2)
    scells = [cell_text(tc) for tc in sroot.find(W + "body").find(W + "tbl").iter(W + "tc")]
    ck("ตัวยึดอยู่ช่องที่สอง หน้าแรกได้ชื่อครบ 12 ช่องตามลำดับ", [c.split("\n")[1] if c.count("\n") else "" for c in scells], names[:12])
    # ── พี่ปอนด์ใช้จริง 05/11/2026 ย้ายไปหน้าท้ายแล้วไม่ย้าย ไม่ย่อเลย หรือแถวปกติไปปนท้าย: เทมเพลตจาก Word ใช้ฟอนต์ธีม
    #    ความกว้างช่องเป็น auto ไม่มี หรือ pct (ห้าสิบเท่าของร้อยละ) จำลองบนเว็บจริง v207 .claude/evidence/2026-11-05-filekit-end ──
    subprocess.run([sys.executable, str(ROOT / "tools/build_label_samples.py"), str(allcells), "--theme-font"], check=True, capture_output=True)
    theme = allcells / "ตัวอย่าง-ฉลากชื่อที่อยู่-theme.docx"
    with zipfile.ZipFile(theme) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    for kind, rep in (("ไม่มีความกว้างช่อง", ""), ("ความกว้างช่อง auto", '<w:tcW w:w="0" w:type="auto"/>'), ("ความกว้างช่อง pct", '<w:tcW w:w="2500" w:type="pct"/>')):
        vp = allcells / f"theme-{len(rep)}.docx"
        with zipfile.ZipFile(vp, "w", zipfile.ZIP_DEFLATED) as o:
            for n, v in parts.items():
                o.writestr(n, re.sub(rb"<w:tcW [^>]*/>", rep.encode(), v) if n == "word/document.xml" else v)
        load(vp, longx)
        mode().select_option("labels"); pg.wait_for_timeout(400)
        with pg.expect_download(timeout=60000) as dl:
            pg.locator("button.btn:visible", has_text="สร้าง").first.click()
        tp = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename); dl.value.save_as(tp)
        tcells = list(read_doc(tp)[1].find(W + "body").find(W + "tbl").iter(W + "tc"))
        tw = pg.locator("[data-warn=overflow]:visible")
        ck(f"ฟอนต์ธีม {kind}: เตือนเฉพาะแถวยาวจริง (9,13)", tw.first.get_attribute("data-rows") if tw.count() else None, "9,13")
        ck(f"ฟอนต์ธีม {kind}: ช่องที่อยู่สั้นไม่ถูกย่อ ยังเป็น 14pt", sizes(tcells[0]), [28])
        ck(f"ฟอนต์ธีม {kind}: ช่องที่อยู่ยาว 2 เท่าถูกย่อ", max(sizes(tcells[2]) or [99]) < 28, True)
    ck("ไม่มี error", [e for e in errs if "favicon" not in e.lower()], [])
    b.close()
print(f"\nผ่าน {P} ตก {len(F)}")
for i, x in enumerate(F, 1): print(f"  {i}. {x}")
sys.exit(1 if F or P == 0 else 0)
