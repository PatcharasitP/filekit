"""ทำอะไรต่อดี ต้องพาไฟล์ผลลัพธ์ทุกใบไปเครื่องมือถัดไป ไม่ใช่ไฟล์ต้นฉบับในกล่อง และไม่ใช่แค่ใบสุดท้าย
ที่มา 07/11/2026 ฟ้าสำรวจทุกเครื่องมือบนเว็บจริง v219 (.claude/evidence/2026-11-07-filekit-buttons/carry_survey.json)
กดลองด้วยไฟล์ตัวอย่าง กดปุ่มหลัก แล้วอ่าน carryFiles() เทียบกับแถวผลลัพธ์บนแผงขวา
  8 เครื่องมือพาต้นฉบับไป (แปลง Word เป็น PDF แล้วกดทำต่อ ได้ไฟล์ Word เดิม) เพราะแถวผลลัพธ์ใช้ button + download
  ซึ่งประกาศผลลัพธ์ตอนกดดาวน์โหลดเท่านั้น , 2 เครื่องมือ (pdf-clean pdf-unlock) ได้ผล 2 ใบ แต่พาไปแค่ใบสุดท้าย
  เพราะ downloadButton ทีละแถวประกาศทับกัน , image-bg-remove พาต้นฉบับที่ยังมีพื้นหลังไป
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_carry_results.py [ชื่อเครื่องมือ ...]"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
# เครื่องมือที่กดตัวอย่างกับปุ่มหลักแล้วได้แถวผลลัพธ์ (จากผลสำรวจ 07/11/2026)
TOOLS = ["pdf-pages", "pdf-merge", "pdf-split", "pdf-compress", "pdf-compare", "pdf-resize", "pdf-nup", "pdf-clean",
         "pdf-unlock", "pdf-watermark", "pdf-to-powerpoint", "pdf-to-images", "pdf-to-longimage", "pdf-to-word", "pdf-to-excel",
         "image-convert", "image-bg-remove", "images-to-pdf", "word-join", "word-clean", "word-mailmerge", "word-to-pdf",
         "powerpoint-to-word", "powerpoint-to-pdf", "excel-csv", "excel-split", "excel-merge", "excel-to-pdf"]
if len(sys.argv) > 1: TOOLS = sys.argv[1:]
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:220]}]" if not ok else ""), flush=True)

ST = """async () => { const m = await import('./src/ui.js'); const s = m.fileState();
  const f = (a) => (a || []).map(x => x.name);
  return { input: f(s.input), carry: f(m.carryFiles()),
    rows: [...document.querySelectorAll('#tool .s2-side-res .result strong')].map(e => e.textContent.trim()) }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for tid in TOOLS:
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tid}"); p.wait_for_selector("#tool button.s2-link", timeout=20000); p.wait_for_timeout(600)
        p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click(); p.wait_for_timeout(2500)
        cta = p.locator("#tool button.s2-cta:visible").first
        try:
            with p.expect_download(timeout=4000): cta.click()
        except Exception: pass
        for _ in range(80):
            if p.evaluate("() => document.querySelectorAll('#tool .s2-side-res .result').length"): break
            p.wait_for_timeout(250)
        p.wait_for_timeout(700)
        s = p.evaluate(ST)
        if not s["rows"]:
            check(f"{tid}: มีแถวผลลัพธ์ให้เทียบ", False, s); ctx.close(); continue
        # ‼️ แถวที่โชว์อาจตัดไว้ 50 แรก (จดหมายเวียน) ให้เทียบว่าแถวที่โชว์ทุกแถวอยู่ในไฟล์ที่พาไป
        shown = set(s["rows"]); carry = set(s["carry"])
        check(f"{tid}: พาไฟล์ผลลัพธ์ไป ไม่ใช่ต้นฉบับ", carry and carry != set(s["input"]), s)
        check(f"{tid}: พาไปครบทุกแถวผลลัพธ์ ({len(shown)} แถว)", shown <= carry, {"ขาด": sorted(shown - carry)[:4], "carry": s["carry"][:4]})
        if errs: check(f"{tid}: ไม่มี error ในหน้า", False, errs[:2])
        ctx.close()
    b.close()
print(f"\nbrowser_carry_results: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
