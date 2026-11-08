"""คีย์บอร์ดล้วน: กด ลองด้วยไฟล์ตัวอย่าง แล้วโฟกัสต้องย้ายไปอยู่ในหน้าทำงาน ไม่หลุดไป BODY
ที่มา 08/11/2026 ล่าบั๊ก F6: หน้าแรกถูกซ่อนตอนเข้าหน้าทำงาน ปุ่มที่โฟกัสอยู่หายไปด้วย
document.activeElement กลายเป็น BODY คนใช้คีย์บอร์ดหรือโปรแกรมอ่านหน้าจอไม่รู้ว่าอยู่ตรงไหน
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_sample_focus.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

AE = """() => { const a = document.activeElement; const r = a && a.getBoundingClientRect();
  return { tag: a ? a.tagName : null, cls: a ? String(a.className).slice(0, 40) : '', text: a ? (a.innerText || a.value || '').slice(0, 30) : '',
           inLand: !!(a && a.closest('.s2-land')), visible: !!(r && r.width && r.height),
           state: document.querySelector('#tool .s2')?.dataset.state }; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for tool in ("thai-suite", "pdf-merge", "excel-csv"):
        p = b.new_page(viewport={"width": 1440, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tool}", wait_until="load", timeout=60000); p.wait_for_selector("#tool .s2-land .s2-link", timeout=20000); p.wait_for_timeout(800)
        p.locator("#tool .s2-land .s2-link", has_text="ลองด้วยไฟล์ตัวอย่าง").first.focus()
        p.keyboard.press("Enter"); p.wait_for_function("() => document.querySelector('#tool .s2')?.dataset.state !== 'landing'", timeout=30000)
        p.wait_for_timeout(1500)
        a = p.evaluate(AE)
        check(f"{tool}: ประชากร กด Enter แล้วเข้าหน้าทำงาน", a["state"] in ("work", "result"), a)
        check(f"{tool}: โฟกัสอยู่บนของที่มองเห็นในหน้าทำงาน ไม่หลุดไป BODY", a["tag"] not in ("BODY", None) and not a["inLand"] and a["visible"], a)
        print("     โฟกัสที่", a["tag"], a["cls"], a["text"])
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print("BAD", bad)
sys.exit(1 if bad else 0)
