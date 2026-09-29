# PDF เป็น Markdown บนเบราว์เซอร์จริง ด้วย PDF ไทยที่รู้คำตอบ (ต้นฉบับอยู่ .claude/evidence/2026-09-29-pdf-markdown-proof/truth.json)
# pdfmd-word.pdf   Word for Microsoft 365 บันทึก (Leelawadee UI หัวข้อ BrowalliaNew-Bold) สระอำหายเพราะ Word ใช้รูปสระอาร่วม
# pdfmd-chrome.pdf Chrome 148 พิมพ์จาก HTML ฟอนต์ Sarabun มีรหัสว่าง 14 ตัว
# ‼️ ค่าที่คาดทุกข้อลอกจากผลจริงที่ฟ้าเปิดดูเอง 29/09/2026 ไม่ได้เดา
import os, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
FX = pathlib.Path(__file__).resolve().parent / "fixtures"
P, Fa = 0, []

def ck(name, got, want, contains=False):
    global P
    ok = (want in str(got)) if contains else (got == want)
    if ok: P += 1
    else: Fa.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {'…มีคำว่า ' + repr(want) if contains else repr(want)}")
    print(f"  {'✅' if ok else '❌'} {name}")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    def convert(fn):
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/pdf-to-markdown", wait_until="networkidle")
        pg.wait_for_selector(".dz", timeout=15000)
        pg.set_input_files("input[type=file]", str(FX / fn))
        pg.wait_for_timeout(600)
        pg.locator("button.btn:visible", has_text="แปลงเป็น Markdown").first.click()
        pg.wait_for_selector("pre.preview-text:not([hidden])", timeout=20000)
        return pg.locator("pre.preview-text").inner_text()

    print("\n━━ ① PDF จาก Word ได้โครงเอกสารครบ ━━")
    md = convert("pdfmd-word.pdf")
    ck("หัวข้อใหญ่จากตัวหนาขนาดเท่าเนื้อความ", md.startswith("# รายงานสรุปผลการ"), True)
    ck("หัวข้อรอง", "\n## ปัญหาที่พบและแนวทางแก้ไข\n" in md, True)
    ck("ย่อหน้าที่ถูกตัดสามบรรทัดต่อกลับเป็นย่อหน้าเดียว", "ออนไลน์ และทีมได้อัปเดตแดชบอร์ด Power BI ให้ผู้บริหาร" in md, True)
    ck("รายการ 3 ข้อ", md.count("\n- "), 3)
    ck("ตารางครบ 4 แถวรวมแถวที่ชื่อยาวเต็มคอลัมน์", "| กรุงเทพมหานครและปริมณฑล | 4,315,200 | +15% |" in md, True)
    ck("สรุปบอกจำนวนหัวข้อและตาราง", pg.locator(".status").first.inner_text(), "หัวข้อ 2 ตาราง 1", contains=True)
    ck("เตือนเรื่อง Word สลับสระอากับสระอำ", pg.locator("[role=alert]").inner_text(), "สลับสระอากับสระอำ", contains=True)
    ck("มีปุ่มอ่านใหม่ด้วย OCR", pg.locator("button.btn:visible", has_text="อ่านใหม่ด้วย OCR").count(), 1)

    print("\n━━ ② PDF จาก Chrome เตือนตัวอักษรที่ไม่มีรหัส ━━")
    md = convert("pdfmd-chrome.pdf")
    ck("ไม่มีอักขระว่างหลุดในผลลัพธ์", "\x00" in md, False)
    ck("สระอำที่ถูกแยกรวมกลับแล้ว", "ผู้อำนวยการ" in md, True)
    ck("รายการที่ไม่มีจุดเป็นตัวอักษร (บรรทัดเยื้อง) ได้ 3 ข้อ", md.count("\n- "), 3)
    ck("เตือนจำนวนตัวอักษรที่ไม่มีรหัส 14 ตัว", pg.locator("[role=alert]").inner_text(), "มีตัวอักษร 14 ตัว", contains=True)
    ck("ไม่เตือนเรื่อง Word ในไฟล์ที่ไม่ได้มาจาก Word", "สลับสระ" in pg.locator("[role=alert]").inner_text(), False)

    ck("ไม่มี page error", errs, [])
    b.close()

print("\n" + "━" * 60)
print(f"ผ่าน {P} · ตก {len(Fa)}")
if Fa:
    print("\nรายการที่ตก:")
    for i, f in enumerate(Fa, 1): print(f"  {i}. {f}")
    raise SystemExit(1)
