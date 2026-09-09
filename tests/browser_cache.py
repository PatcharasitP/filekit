# แคชเครื่องมือ (mounted Map ใน src/app.js) — ต้องคืนหน่วยความจำ แต่ห้ามกินงานของผู้ใช้
#
# ‼️ ที่มา: เดิมแคชไม่มีเพดานเลย เปิดครบ 29 ตัวคือถือ DOM + objectURL ของภาพย่อไว้ทั้งหมด
#    ตลอดอายุแท็บ (วัดจาก tests/browser_leak.py) · พอใส่เพดานเข้าไปก็เกิดความเสี่ยงใหม่
#    ทันทีคือ "ผู้ใช้ลากไฟล์ 30 ใบใส่ไว้ แวะไปดูเครื่องมืออื่น กลับมาแล้วไฟล์หายเกลี้ยง"
#    เทสนี้จึงกันสองด้านพร้อมกัน: คืนหน่วยความจำได้ แต่ห้ามทิ้งงานที่ผู้ใช้ทำค้างไว้
#
# รัน: python3 -m http.server 8921 &  แล้ว  ../.venv/bin/python tests/browser_cache.py
import os, re, sys, pathlib, tempfile, shutil
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8921")
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_cache_"))

# ‼️ อ่านเพดานจากซอร์สจริง ไม่ hardcode — ถ้าโค้ดเปลี่ยนค่า เทสต้องรู้ตาม ไม่ใช่เขียวหลอกต่อไป
APP = (ROOT / "src/app.js").read_text(encoding="utf-8")
m = re.search(r"const MAX_CACHED\s*=\s*(\d+)", APP)
MAX_CACHED = int(m.group(1)) if m else None

P, F = 0, []
def ck(name, got, want):
    global P
    if got == want: P += 1
    else: F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if got == want else '❌'} {name}")

def ck_true(name, cond, detail=""):
    global P
    if cond: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  {detail}" if detail else ""))

def count_listeners(pg):
    return pg.evaluate("() => (window.__fkListen && window.__fkListen.paste) || 0")

INIT = """
// นับ listener ชนิด paste ที่ถูกผูกไว้กับ document (dropzone ผูก 1 ชุดต่อกล่อง)
(() => {
  window.__fkListen = { paste: 0 };
  const add = document.addEventListener.bind(document);
  const rm = document.removeEventListener.bind(document);
  document.addEventListener = function (t, ...r) { if (t === "paste") window.__fkListen.paste++; return add(t, ...r); };
  document.removeEventListener = function (t, ...r) { if (t === "paste") window.__fkListen.paste--; return rm(t, ...r); };
})();
"""

def main():
    print(f"เพดานแคชที่อ่านได้จาก src/app.js: MAX_CACHED = {MAX_CACHED}")
    ck_true("อ่านค่า MAX_CACHED จากซอร์สจริงได้ (ไม่ hardcode ในเทส)", MAX_CACHED is not None)
    imgs = []
    for i in range(6):
        fp = TMP / f"รูป{i}.png"
        Image.new("RGB", (240, 180), (30 * i, 90, 200 - 20 * i)).save(fp)
        imgs.append(str(fp))

    # เครื่องมือที่ไม่ต้องโหลดไลบรารีหนัก ใช้แวะผ่านให้แคชเต็มเร็ว ๆ
    DETOUR = ["pdf-merge", "pdf-split", "pdf-pages", "pdf-watermark", "pdf-sign",
              "pdf-to-text", "pdf-to-images", "word-clean", "word-join", "excel-csv"]

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 950}, reduced_motion="no-preference")
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
        pg.wait_for_selector(".dz")
        pg.locator("input[type=file]").set_input_files(imgs)
        pg.wait_for_timeout(1200)
        ck("ใส่รูป 6 ใบเข้าเครื่องมือแรก", pg.locator(".file-row").count(), 6)
        ck("ภาพย่อขึ้นครบ 6 อัน", pg.locator("button.thumb").count(), 6)

        print(f"\n── แวะเครื่องมืออื่น {len(DETOUR)} ตัว (มากกว่าเพดานแคช) แล้วกลับมา ──")
        for tid in DETOUR:
            pg.evaluate(f"location.hash = '#/{tid}'")
            pg.wait_for_timeout(500)
        peak = count_listeners(pg)
        pg.evaluate("location.hash = '#/image-convert'")
        pg.wait_for_timeout(1500)

        ck("‼️ กลับมาแล้วไฟล์ที่เลือกไว้ยังอยู่ครบ 6 ใบ (ห้ามถูกถอดออกจากแคชทั้งที่มีงานค้าง)",
           pg.locator(".file-row").count(), 6)
        ck("‼️ ภาพย่อกลับมาครบ 6 อัน (คืนหน่วยความจำตอนหลับแล้วต้องวาดใหม่ให้เองตอนตื่น)",
           pg.locator("button.thumb").count(), 6)
        ck_true("ภาพย่อโหลดรูปได้จริง ไม่ใช่กล่องเปล่า",
                pg.evaluate("() => [...document.querySelectorAll('button.thumb img')].every(i => i.naturalWidth > 0)")
                or pg.locator("button.thumb img").count() == 0,
                f"จำนวน img ในภาพย่อ = {pg.locator('button.thumb img').count()}")

        print("\n── เพดานหน่วยความจำ: ตัวรับ event ต้องไม่โตตามจำนวนเครื่องมือที่เปิดผ่าน ──")
        after = count_listeners(pg)
        ceiling = 1 + (MAX_CACHED + 2) * 2      # หน้าแรก 1 + เครื่องมือที่ยังแคชอยู่ (บางตัวมีกล่อง 2 ใบ)
        print(f"  ตัวรับ paste บน document: ตอนแวะครบ = {peak}, ตอนกลับมา = {after}, เพดานที่ยอมรับ = {ceiling}")
        ck_true(f"เปิดผ่าน {len(DETOUR) + 1} เครื่องมือแล้วตัวรับ event ยังไม่เกินเพดาน {ceiling}",
                after <= ceiling, f"วัดได้ {after}")
        ck_true(f"ไม่โตแบบ 1 ตัวต่อ 1 เครื่องมือ (ถ้าโตแบบนั้นจะได้ราว {len(DETOUR) + 1})",
                after < len(DETOUR), f"วัดได้ {after}")

        ck("ไม่มี page error ตลอดทั้งชุด", errs, [])
        ctx.close(); b.close()

if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(f"\nผ่าน {P}, ตก {len(F)}")
    for i, x in enumerate(F, 1): print(f"  {i}. {x}")
    sys.exit(1 if F else 0)
