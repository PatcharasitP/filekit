"""pbi-matrix-details ปุ่ม เพิ่มชั้น ต้องจางจนกว่าจะเลือกคอลัมน์ในช่องข้างปุ่ม
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 ปุ่ม เพิ่มชั้น กดแล้วไม่เกิดอะไร ทั้งหน้าว่างและหลังกดตัวอย่าง
เพราะช่องเลือกยังเป็น เลือกคอลัมน์… (ค่าว่าง) onAddLevel จึง return เงียบ ปุ่มชวนกดแต่ไม่มีผล
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_matrix_addlevel.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

ST = """() => { const row = [...document.querySelectorAll('#tool .pmd-col-row')].find(r => /เพิ่มชั้น/.test(r.textContent));
  if (!row) return null; const sel = row.querySelector('select'), btn = [...row.querySelectorAll('button')].find(b => /เพิ่มชั้น/.test(b.textContent));
  return { val: sel.value, opts: sel.options.length, dis: btn.disabled, levels: document.querySelectorAll('#tool .pmd-levels > *').length }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1280, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/pbi-matrix-details"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(800)
    s = p.evaluate(ST)
    check("หน้าว่าง ยังไม่มีคอลัมน์ให้เลือก ปุ่มเพิ่มชั้นจาง", s is None or s["dis"] is True, s)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
    p.wait_for_function("() => document.querySelectorAll('#tool .pmd-levels > *').length > 0", timeout=20000); p.wait_for_timeout(600)
    s = p.evaluate(ST)
    check("มีไฟล์แล้วแต่ยังไม่เลือกคอลัมน์ ปุ่มเพิ่มชั้นจาง", s and s["val"] == "" and s["opts"] > 1 and s["dis"] is True, s)
    before = s["levels"] if s else 0
    p.evaluate("""() => { const row = [...document.querySelectorAll('#tool .pmd-col-row')].find(r => /เพิ่มชั้น/.test(r.textContent));
      const sel = row.querySelector('select'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }""")
    p.wait_for_timeout(300); s = p.evaluate(ST)
    check("เลือกคอลัมน์แล้ว ปุ่มเพิ่มชั้นกดได้", s and s["dis"] is False, s)
    p.locator("#tool button:visible", has_text="เพิ่มชั้น").first.click(); p.wait_for_timeout(500); s = p.evaluate(ST)
    check("กดเพิ่มชั้นแล้วได้ชั้นเพิ่มหนึ่งชั้น", s and s["levels"] == before + 1, {"before": before, "now": s})
    check("หลังเพิ่ม ช่องเลือกกลับเป็นค่าว่างและปุ่มจางอีกครั้ง", s and s["val"] == "" and s["dis"] is True, s)
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_matrix_addlevel: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
