"""กฎจุดกลาง ต้องบังคับถึงข้อความที่ฝังอยู่ใน PDF ตัวอย่างด้วย

‼️ ที่มา: `tests/samples.test.mjs` ตรวจไฟล์ตัวอย่างได้เกือบหมด แต่ **ตรวจ PDF ไม่ได้**
   เพราะข้อความใน PDF ถูกเข้ารหัสเป็นรหัสกลิฟของฟอนต์ ไม่ใช่ UTF-8
   เทสนั้นจึงประกาศตรง ๆ ว่า "ตรวจไม่ถึง 4 ไฟล์" ซึ่งซื่อสัตย์ แต่เป็นจุดบอดจริง
   จุดกลาง 1 จุดจึงหลบอยู่ในไฟล์ตัวอย่างมาตลอด และไหลไปโผล่ในโค้ด M
   ที่ผู้ใช้คัดลอกไปใช้ (excel-to-pq เลือกตัวอย่างเป็น PDF)

เทสนี้ปิดจุดบอดนั้นด้วยการถอดข้อความจริงออกมาอ่าน
‼️ มีตัวควบคุมเชิงลบ สร้าง PDF ที่มีจุดกลางขึ้นมาเองแล้วตัวตรวจต้องจับได้
   ไม่งั้นเทสจะผ่านเพราะถอดข้อความไม่ออก ไม่ใช่เพราะไม่มีจุดกลาง

รัน: python3 tests/pdf_middot.py
ข้ามอัตโนมัติถ้าไม่มี PyMuPDF (ไม่ทำให้ชุดเทสแดงเพราะเครื่องไม่มีไลบรารี)
"""
import glob
import os
import sys

try:
    import fitz
except ImportError:
    print("ข้าม: ไม่มี PyMuPDF (pip install pymupdf)")
    sys.exit(0)

BAD = {"·": "จุดกลาง ·", "—": "ขีดยาว —"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("\n      " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label)

pdfs = sorted(glob.glob(os.path.join(ROOT, "samples", "**", "*.pdf"), recursive=True))
print(f"\n① ตรวจ PDF ตัวอย่าง {len(pdfs)} ไฟล์")
ck(f"มี PDF ตัวอย่างให้ตรวจจริง ({len(pdfs)} ไฟล์)", len(pdfs) > 0, "ประชากรเป็นศูนย์ เทสนี้ไม่ได้ตรวจอะไรเลย")

total_chars = 0
for p in pdfs:
    doc = fitz.open(p)
    text = "".join(page.get_text() for page in doc)
    doc.close()
    total_chars += len(text)
    rel = os.path.relpath(p, ROOT)
    found = {name: text.count(ch) for ch, name in BAD.items() if ch in text}
    ck(f"{rel} ไม่มีอักขระต้องห้าม ({len(text)} อักขระ)", not found, found)

ck(f"ถอดข้อความออกมาได้จริง รวม {total_chars} อักขระ", total_chars > 200,
   "ถอดข้อความไม่ออก ผลที่ว่าผ่านจึงเชื่อไม่ได้")

print("\n② ตัวควบคุมเชิงลบ ตัวตรวจต้องจับ PDF ที่มีจุดกลางได้")
tmp = os.path.join(os.environ.get("TMPDIR", "/tmp"), "fk_middot_probe.pdf")
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 100), "Sales Dept. · Prepared by", fontsize=14)
doc.save(tmp)
doc.close()
doc = fitz.open(tmp)
probe = "".join(pg.get_text() for pg in doc)
doc.close()
os.remove(tmp)
ck(f"สร้าง PDF ที่มีจุดกลางแล้วตัวตรวจจับได้ (เจอ {probe.count(chr(0xb7))} จุด)", "·" in probe, repr(probe[:80]))

print(f"\nตก {len(fails)} ข้อ")
sys.exit(1 if fails else 0)
