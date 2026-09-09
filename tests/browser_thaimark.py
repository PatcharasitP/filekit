# ตรวจว่าวรรณยุกต์ไทยที่ต้องซ้อนบนสระบนถูกวางถูกที่ในไฟล์ PDF ที่เว็บสร้าง
#
# ทำไมต้องมีเทสนี้: jsPDF ไม่ทำ mark positioning ของ OpenType เลย สระบนกับวรรณยุกต์
# จึงถูกวาดทับกันสนิท (วัดจริง 09/09/2026: "ที่นี่ พี่ชาย" ออกมาเป็น "ทีนี พีชาย")
# src/thaifont.js แก้ด้วยการยกวรรณยุกต์ด้วยตัวดำเนินการ Ts ตามระยะที่วัดจากเบราว์เซอร์
#
# วิธีตัดสินว่า "ถูก": เบราว์เซอร์ทำ text shaping เต็มรูปแบบอยู่แล้ว จึงถือคำที่เบราว์เซอร์
# วาดลง canvas เป็นคำตอบที่ถูก แล้ววัดว่าหมึกใน PDF สูงเท่ากันไหม (ต่างเกินเกณฑ์ = ตก)
# ‼️ เทสนี้ต้องแดงถ้าถอด patch ออก — พิสูจน์แล้วด้วยการถอดจริง ไม่ใช่เขียนให้เขียวเฉย ๆ
#
# รันจากโฟลเดอร์ FileKit/ หลังเปิดเซิร์ฟเวอร์แล้ว:
#   python3 -m http.server 8899 &
#   python3 tests/browser_thaimark.py

import os, sys, io, base64, pathlib, shutil, tempfile, traceback
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
import fitz            # PyMuPDF
import docx            # python-docx

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZE = 400.0            # ขนาดตัวอักษรตอนวัด ยิ่งใหญ่ยิ่งวัดละเอียด
TOL_EM = 0.05           # ยอมให้ต่างจากเบราว์เซอร์ได้ 5% ของ em (ก่อนแก้ ต่างกัน 12.5%)

UPPER = ["ั", "ิ", "ี", "ึ", "ื", "็", "ํ"]
TONES = ["่", "้", "๊", "๋", "์"]

P, F = 0, []
def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(f"{name}{detail}")
    print(f"  {'✅' if ok else '❌'} {name}{'' if ok else detail}")

HARNESS = """<!doctype html><meta charset="utf-8"><canvas id="cv" width="1400" height="900"></canvas>
<script type="module">
import { useThaiFont, THAI_FONT } from "/src/thaifont.js";
const F = { normal: "/vendor/fonts/Sarabun-Regular-th.ttf", bold: "/vendor/fonts/Sarabun-Bold-th.ttf" };
const fam = {};
async function face(st){ if(fam[st]) return fam[st]; const n="Cal"+st;
  const f=new FontFace(n, `url(${F[st]})`); await f.load(); document.fonts.add(f); fam[st]=n; return n; }
// คำตอบที่ถูก: ให้เบราว์เซอร์วาดเอง (ทำ shaping เต็มรูปแบบ)
window.refPng = async (word, st) => {
  const n = await face(st);
  const cv = document.getElementById("cv"), g = cv.getContext("2d");
  g.fillStyle="#fff"; g.fillRect(0,0,cv.width,cv.height);
  g.fillStyle="#000"; g.font=`${st==="bold"?"bold ":""}%SIZE%px ${n}`; g.textBaseline="alphabetic";
  g.fillText(word, 100, 700);
  return cv.toDataURL("image/png");
};
// ของจริง: เส้นทางเดียวกับที่เครื่องมือทุกตัวใช้ (useThaiFont ครอบ doc.text ให้เอง)
window.pdfOf = async (words, st) => {
  const { jsPDF } = window.jspdf;
  // หน้าละคำ — PDF จำกัดขนาดหน้าไว้ที่ 14400 pt วางเรียงหน้าเดียวจะล้น
  const doc = new jsPDF({ unit:"pt", format:[1400, 900] });
  await useThaiFont(doc, "both");
  doc.setFont(THAI_FONT, st); doc.setFontSize(%SIZE%);
  words.forEach((w,i) => { if(i) doc.addPage([1400,900]); doc.text(w, 100, 700); });
  return doc.output("datauristring");
};
window.ready = true;
</script>
<script src="/vendor/jspdf.umd.min.js"></script>
""".replace("%SIZE%", str(int(SIZE)))

def mask_png(uri):
    return np.array(Image.open(io.BytesIO(base64.b64decode(uri.split(",",1)[1]))).convert("L")) < 128

def ink_top(mask):
    rows = np.where(mask.any(axis=1))[0]
    return None if not len(rows) else rows.min()

def main():
    harness = ROOT / "_thaimark_harness.html"
    harness.write_text(HARNESS, encoding="utf-8")
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk_thaimark_"))
    try:
        words = [f"ก{v}{t}" for v in UPPER for t in TONES] + [f"ก{t}ำ" for t in TONES]
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width":1500,"height":1000})
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"{BASE}/_thaimark_harness.html", wait_until="networkidle")
            pg.wait_for_function("() => window.ready === true", timeout=15000)

            print("\n━━ ① วรรณยุกต์ซ้อนสระบน สูงเท่าที่เบราว์เซอร์วาด ━━")
            for st in ["normal", "bold"]:
                pdf_uri = pg.evaluate(f"pdfOf({words!r}, {st!r})")
                doc = fitz.open(stream=base64.b64decode(pdf_uri.split(",",1)[1]), filetype="pdf")
                worst = (None, 0)
                for i, w in enumerate(words):
                    ref_top = ink_top(mask_png(pg.evaluate(f"refPng({w!r},{st!r})")))
                    pix = doc[i].get_pixmap()
                    got_top = ink_top(np.array(Image.frombytes("RGB",(pix.width,pix.height),pix.samples).convert("L")) < 128)
                    if ref_top is None or got_top is None:
                        ck(f"[{st}] {w} มีหมึกให้วัด", False, " (ว่างเปล่า)"); continue
                    diff = abs(got_top - ref_top) / SIZE
                    if diff > worst[1]: worst = (w, diff)
                    ck(f"[{st}] {w} สูงต่างจากเบราว์เซอร์ ≤ {TOL_EM:.0%} em",
                       diff <= TOL_EM, f" (ต่าง {diff:.1%} em)")
                print(f"     คู่ที่ต่างมากสุด: {worst[0]} {worst[1]:.1%} em")

            print("\n━━ ② ไฟล์จาก 'Word เป็น PDF' จริง: ค้นหาคำที่มีวรรณยุกต์ซ้อนได้ ━━")
            src = tmp / "thaimark.docx"
            sentence = "เมื่อวันที่เก้า ผู้ซื้อแจ้งเรื่องนี้ไว้ตั้งแต่ต้น น้ำหนักรวมหนึ่งพันกิโลกรัม เสื้อผ้าชื้นทั้งหมด"
            d = docx.Document(); d.add_paragraph(sentence); d.save(str(src))
            pg.goto("about:blank"); pg.goto(f"{BASE}/#/word-to-pdf", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").set_input_files(str(src))
            pg.wait_for_timeout(400)
            pg.locator("button.btn", has_text="แปลงเป็น PDF").click()
            pg.wait_for_timeout(3500)
            out = tmp / "out.pdf"
            with pg.expect_download() as dl:
                pg.locator(".results .result button").first.click()
            dl.value.save_as(str(out))
            page = fitz.open(out)[0]
            for w in ["ที่", "ผู้ซื้อ", "เรื่องนี้", "ตั้งแต่", "น้ำหนัก", "หนึ่ง", "เสื้อผ้า", "ชื้น"]:
                ck(f"ค้นคำว่า '{w}' ในไฟล์ผลลัพธ์เจอ", len(page.search_for(w)) >= 1)
            ck("ข้อความในไฟล์ยังครบทั้งประโยค", sentence.replace(" ", "") in page.get_text().replace(" ", "").replace("\n", ""))
            ck("ไม่มี error ในคอนโซล", not errs, f" ({errs[:2]})")
            b.close()
    finally:
        harness.unlink(missing_ok=True)
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{'='*60}\nผ่าน {P} ข้อ · ไม่ผ่าน {len(F)} ข้อ")
    for f in F: print("  ❌", f)
    sys.exit(1 if F else 0)

if __name__ == "__main__":
    try: main()
    except Exception:
        traceback.print_exc(); sys.exit(2)
