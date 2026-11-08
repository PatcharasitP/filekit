"""ใส่ไฟล์ผิดชนิดตอนอยู่หน้าแรกของเครื่องมือ ต้องเห็นข้อความเตือนกับปุ่มพาไปเครื่องมือที่ถูก
ที่มา 08/11/2026 ล่าบั๊ก F1 (.claude/evidence/2026-11-08-hunt-filekit/wrongtype_vis_pdf-merge.png)
กล่อง ไฟล์นี้ใช้กับเครื่องมือนี้ไม่ได้ ถูกวางในกล่องรับไฟล์ ซึ่งอยู่ใต้หน้าแรกที่ลอยทับ (.s2-land)
ไม่มีไฟล์ที่ใช้ได้ หน้าจึงยังเป็นหน้าแรก ผู้ใช้เห็นว่าไม่มีอะไรเกิดขึ้นเลย
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_wrongtype_landing.py"""
import os, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
HERE = pathlib.Path(__file__).resolve().parent.parent
PDF = HERE / "samples" / "ตัวอย่าง-รายงานประจำเดือน.pdf"
XLSX = HERE / "samples" / "ตัวอย่าง-ข้อมูลลูกค้า.xlsx"
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:220]}]" if not ok else ""), flush=True)

# ข้อความเตือนที่มองเห็นจริง = จุดกลางของกล่องชี้กลับมาที่กล่องนั้นเอง ไม่ใช่ชั้นที่ทับอยู่
SEEN = """() => { const out = [];
  for (const b of document.querySelectorAll('#tool .wrong-type')) { const r = b.getBoundingClientRect();
    if (!r.width || !r.height) continue; const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
    out.push({ seen: !!e && b.contains(e), text: b.innerText.slice(0, 80) }); }
  return { state: document.querySelector('#tool .s2')?.dataset.state, boxes: out }; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for tool, wrong, go in (("pdf-merge", XLSX, "excel-to-pdf"), ("thai-suite", PDF, None), ("excel-csv", PDF, None)):
        p = b.new_page(viewport={"width": 1440, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tool}", wait_until="load", timeout=60000); p.wait_for_selector("#tool .s2-land", timeout=20000); p.wait_for_timeout(800)
        p.set_input_files("#tool .dz input[type=file]", [str(wrong)]); p.wait_for_timeout(1200)
        r = p.evaluate(SEEN)
        check(f"{tool}: ประชากร ใส่ {wrong.suffix} แล้วยังอยู่หน้าแรก และมีกล่องเตือนใน DOM", r["state"] == "landing" and len(r["boxes"]) >= 1, r)
        check(f"{tool}: มองเห็นข้อความ ไฟล์นี้ใช้กับเครื่องมือนี้ไม่ได้ (ไม่ถูกหน้าแรกบัง)", any(x["seen"] and "ใช้กับเครื่องมือนี้ไม่ได้" in x["text"] for x in r["boxes"]), r)
        if go:
            btn = [x for x in p.locator("#tool .wrong-type button").all() if x.is_visible()]
            try:
                btn[0].click(timeout=3000); p.wait_for_timeout(1000)
                check(f"{tool}: กดปุ่มในกล่องเตือนแล้วไปเครื่องมือ {go}", p.evaluate("location.hash") == "#/" + go, p.evaluate("location.hash"))
            except Exception as e:  # ปุ่มถูกชั้นอื่นทับ คลิกไม่ถึง
                check(f"{tool}: กดปุ่มพาไปเครื่องมือที่ถูกได้จริง", False, str(e).splitlines()[0] if btn else "ไม่มีปุ่มที่มองเห็น")
        else:
            # ใส่ไฟล์ที่ถูกต่อ ข้อความเตือนเก่าต้องหาย
            p.set_input_files("#tool .dz input[type=file]", [str(XLSX)]); p.wait_for_timeout(1500)
            r2 = p.evaluate(SEEN)
            check(f"{tool}: ใส่ไฟล์ที่ถูกแล้ว ข้อความเตือนที่มองเห็นหายไป", not any(x["seen"] for x in r2["boxes"]), r2)
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print("BAD", bad)
sys.exit(1 if bad else 0)
