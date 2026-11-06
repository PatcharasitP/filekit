"""browser_mailmerge_scale.py  จดหมายเวียนหลายร้อยฉบับ รวมเป็นไฟล์ Word เดียว รูปไม่คัดลอกซ้ำทุกฉบับ
พี่ปอนด์ 06/11/2026 (ผู้ใช้ที่ทรู) "เอาไปใช้แบบ 2800 แถว แล้วมันรอเป็นชั่วโมง จนไปซอยเหลือ 500 แถวแล้วเร็วขึ้น ... เรื่อง Performance ควรดู"
วัดจริงก่อนแก้ (แม่แบบรูปราว 230 KB) 800 ฉบับ ไฟล์รวม 105 MB หน่วยความจำ 595 MB , ขั้นรวมโตแบบกำลังสอง (400 ฉบับ 2 วินาที 2,800 ฉบับ 33 วินาที)
แม่แบบสมมติ: รูป 3 รูปคนละรูป (โลโก้ ลายเซ็น ท้ายกระดาษ) ข้อมูลสมมติ 300 แถว
ต้อง: ไฟล์รวมมีรูปแค่ 3 ไฟล์ , รูปทุกจุดในเนื้อชี้ไฟล์ที่มีจริง , ชื่อผู้รับครบทุกฉบับ , ชื่อผู้เขียนแม่แบบไม่ติดไป
ใช้: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_mailmerge_scale.py"""
import sys, os, io, re, time, zipfile, tempfile, pathlib, random
from playwright.sync_api import sync_playwright
from docx import Document
from docx.shared import Cm
from PIL import Image
from openpyxl import Workbook

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
N = int(os.environ.get("FK_MM_N", "300"))
P, F = 0, []
def ck(n, g, w):
    global P
    ok = g == w
    P += ok
    if not ok: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}", flush=True)

TMP = pathlib.Path(tempfile.mkdtemp())
def jpg(w, h, seed):
    random.seed(seed); im = Image.new("RGB", (w, h)); im.putdata([(random.randrange(256), random.randrange(256), random.randrange(256)) for _ in range(w * h)])
    b = io.BytesIO(); im.save(b, "JPEG", quality=80); b.seek(0); return b
tpl = TMP / "แม่แบบ-จดหมาย.docx"
d = Document(); d.core_properties.author = "TEMPLATE-AUTHOR-SCALE"
d.add_picture(jpg(240, 90, 1), width=Cm(3))
d.add_paragraph("เรื่อง ขอแจ้งการปรับเปลี่ยนรอบการชำระค่าเช่าพื้นที่ Site Code {{Site}}")
d.add_paragraph("เรียน {{ชื่อ}}")
d.add_paragraph("บริษัท ตัวอย่าง จำกัด ขอแจ้งการปรับเปลี่ยนรอบการชำระเงิน จึงเรียนมาเพื่อทราบ")
d.add_picture(jpg(200, 80, 2), width=Cm(2.5))
d.sections[0].footer.paragraphs[0].add_run().add_picture(jpg(300, 50, 3), width=Cm(6))
d.save(tpl)
data = TMP / "ข้อมูล.xlsx"
wb = Workbook(); ws = wb.active; ws.append(["Site", "ชื่อ"])
for i in range(N): ws.append([f"CRI{i:04d}", f"คุณทดสอบ ลำดับที่ {i + 1} ท้ายชื่อ"])
wb.save(data)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle"); pg.wait_for_selector(".mm-step")
    pg.locator("input[type=file]").nth(0).set_input_files(str(tpl)); pg.wait_for_timeout(900)
    pg.locator("input[type=file]").nth(1).set_input_files(str(data)); pg.wait_for_timeout(1500)
    t0 = time.time()
    pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
    pg.wait_for_selector("button:visible:has-text('รวมเป็นไฟล์ Word เดียว')", timeout=600000)
    t1 = time.time()
    with pg.expect_download(timeout=600000) as dl:
        pg.locator("button:visible", has_text="รวมเป็นไฟล์ Word เดียว").click()
    t2 = time.time()
    out = TMP / "รวม.docx"; dl.value.save_as(out)
    if os.environ.get("FK_SAVE"): __import__("shutil").copy(out, pathlib.Path(os.environ["FK_SAVE"]) / f"mm_scale_{N}.docx")  # เก็บไว้เปิดใน Word
    print(f"  สร้าง {N} ฉบับ {t1 - t0:.1f} วินาที , รวมไฟล์ {t2 - t1:.1f} วินาที , ไฟล์รวม {out.stat().st_size // 1024} KB", flush=True)
    z = zipfile.ZipFile(out)
    isimg = lambda n: n.startswith("word/media/") and n.lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "gif", "bmp", "emf", "wmf")  # นับไฟล์รูปจริง ไม่นับชื่อโฟลเดอร์
    media = [n for n in z.namelist() if isimg(n)]
    tpl_media = [n for n in zipfile.ZipFile(tpl).namelist() if isimg(n)]
    ck(f"ประชากร: แม่แบบมีรูป {len(tpl_media)} ไฟล์", len(tpl_media), 3)
    ck(f"ไฟล์รวม {N} ฉบับ มีรูปเท่าแม่แบบ ไม่คัดลอกซ้ำทุกฉบับ (เดิมราว {N * 3} ไฟล์)", sorted(media) if len(media) != len(tpl_media) else len(media), len(tpl_media))
    docx = z.read("word/document.xml").decode("utf-8")
    rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
    tgt = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)) | {k: v for v, k in re.findall(r'Target="([^"]+)"[^>]*Id="([^"]+)"', rels)}
    embeds = re.findall(r'r:embed="([^"]+)"', docx)
    missing = [e for e in embeds if e not in tgt or ("word/" + tgt[e].lstrip("./")) not in z.namelist()]
    ck(f"รูปทุกจุดในเนื้อ ({len(embeds)} จุด) ชี้ไฟล์ที่มีอยู่จริงในแพ็กเกจ", missing[:3], [])
    ck(f"ประชากร: รูปในเนื้อครบ 2 รูปต่อฉบับ", len(embeds), 2 * N)
    text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", docx))
    ck(f"ชื่อผู้รับครบทุกฉบับ ({N} ฉบับ)", sum(1 for i in range(N) if f"ลำดับที่ {i + 1} ท้ายชื่อ" in text), N)
    ck("ชื่อผู้เขียนแม่แบบไม่ติดไปกับไฟล์รวม", "TEMPLATE-AUTHOR-SCALE" in z.read("docProps/core.xml").decode("utf-8"), False)
    ck("ไม่มี error ในหน้า", errs, [])
    b.close()

print(f"\nbrowser_mailmerge_scale: ผ่าน {P}/{P + len(F)}")
for f in F: print("  ❌", f)
sys.exit(1 if F else 0)
