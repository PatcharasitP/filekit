"""จดหมายเวียน คำเตือน ยังไม่ได้จับคู่ ต้องตรงกับโหมดที่ตั้งอยู่จริง ไม่ค้างจากก่อนระบบสลับโหมดเอง
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 กดลองด้วยไฟล์ตัวอย่าง (ใบเสนอราคา) ระบบสลับเป็นโหมดจัดกลุ่ม
และเลือกบล็อก {{#รายการ}} ให้เองถูกแล้ว แต่ยังขึ้นกล่องแดง ยังไม่ได้จับคู่ 1 ตัวยึด: {{รายการ}} เพราะ renderUnmatched
ถูกเรียกก่อน syncMode คนลองครั้งแรกเห็นว่าตัวอย่างของเว็บเองผิด ทั้งที่กดสร้างได้ถูกต้อง
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_mailmerge_unmatched.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

ST = r"""() => { const sels = [...document.querySelectorAll('#tool select')];
  const mode = sels.find(s => [...s.options].some(o => o.value === 'labels'));
  const err = [...document.querySelectorAll('#tool .status.err')].map(e => e.textContent.trim()).filter(t => t.includes('ยังไม่ได้จับคู่'));
  return { mode: mode && mode.value, err }; }"""
SET_MODE = r"""(v) => { const s = [...document.querySelectorAll('#tool select')].find(s => [...s.options].some(o => o.value === 'labels'));
  s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1280, "height": 1000}); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/word-mailmerge"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(500)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
    p.wait_for_function("() => /จัดกลุ่มตามคอลัมน์/.test(document.querySelector('#tool').innerText)", timeout=30000)
    p.wait_for_timeout(500)
    s = p.evaluate(ST)
    check("ตัวอย่างใบเสนอราคา ระบบตั้งโหมดจัดกลุ่มให้", s["mode"] == "group", s)
    check("โหมดจัดกลุ่มที่เลือกบล็อกรายการแล้ว ไม่มีคำเตือนยังไม่ได้จับคู่", not s["err"], s)
    p.evaluate(SET_MODE, "row"); p.wait_for_timeout(400)
    s = p.evaluate(ST)
    check("สลับเป็นทีละแถว คำเตือน {{รายการ}} ขึ้น (บล็อกนี้ต้องจับคู่เองในโหมดนี้)", any("{{รายการ}}" in e for e in s["err"]), s)
    p.evaluate(SET_MODE, "group"); p.wait_for_timeout(400)
    s = p.evaluate(ST)
    check("สลับกลับจัดกลุ่ม คำเตือนหายอีกครั้ง", not s["err"], s)
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_mailmerge_unmatched: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
