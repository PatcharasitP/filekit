# ตรวจเครื่องมือ "ตรวจ PDF ก่อนส่ง" — รายงานต้องตรงกับของที่มีอยู่จริง และล้างแล้วต้องหายจริง
#
# ‼️ เทสนี้สร้างไฟล์ที่ "สกปรก" ขึ้นมาเองโดยรู้ว่าใส่อะไรเข้าไปบ้าง
#    แล้วถามสองคำถาม ① เครื่องมือรายงานครบไหม ② กดล้างแล้วของพวกนั้นหายจริงไหม
#    ตรวจผลด้วย PyMuPDF ซึ่งเป็นคนละเครื่องยนต์กับตัวที่แก้ไฟล์

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_pdfclean_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

DIRTY_TITLE = "สัญญาจ้าง-ฉบับลับ-ห้ามส่งออก"
DIRTY_AUTHOR = "Somchai Confidential"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make_dirty(path):
    """ไฟล์ที่พกของติดมาครบ: ข้อมูลกำกับ + คอมเมนต์ 3 อัน"""
    d = fitz.open()
    p = d.new_page(width=400, height=600)
    p.insert_text((40, 80), "CONTRACT BODY TEXT", fontname="helv", fontsize=14)
    for i, y in enumerate((150, 200, 250)):
        a = p.add_text_annot((60, y), f"internal note {i + 1}")
        a.update()
    d.set_metadata({"title": DIRTY_TITLE, "author": DIRTY_AUTHOR,
                    "subject": "internal only", "keywords": "secret,draft",
                    "creator": "Microsoft Word", "producer": "Acrobat Distiller"})
    d.save(str(path)); d.close()
    return path


def audit(path):
    d = fitz.open(str(path))
    m = d.metadata or {}
    annots = sum(len(list(d[i].annots() or [])) for i in range(d.page_count))
    text = d[0].get_text().strip()
    meta = {k: (m.get(k) or "") for k in ("title", "author", "subject", "keywords", "creator", "producer")}
    d.close()
    return {"meta_left": [v for v in meta.values() if v.strip()], "annots": annots,
            "text": text, "title": meta["title"], "author": meta["author"]}


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def dl_result(pg, path, timeout=30000):
    loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
    try:
        loc.first.wait_for(state="visible", timeout=8000)
    except Exception:
        loc = pg.locator(".s2-res-list .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด")
        loc.first.wait_for(state="visible", timeout=timeout)
    with pg.expect_download() as d:
        loc.first.click()
    d.value.save_as(str(path))
    return path


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    dirty = make_dirty(FIX / "dirty.pdf")

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        a = audit(dirty)
        ok1 = ck("ไฟล์สกปรก ต้องเจอข้อมูลกำกับหลายรายการ", len(a["meta_left"]) >= 5, True)
        ok2 = ck("ไฟล์สกปรก ต้องเจอคอมเมนต์ 3 อัน", a["annots"], 3)
        clean = FIX / "already-clean.pdf"
        d = fitz.open()
        d.new_page(width=400, height=600).insert_text((40, 80), "PLAIN", fontname="helv", fontsize=14)
        d.set_metadata({})
        d.save(str(clean)); d.close()
        b = audit(clean)
        ok3 = ck("ไฟล์สะอาด ต้องไม่เจอข้อมูลกำกับที่มีเนื้อหา", b["meta_left"], [])
        ok4 = ck("ไฟล์สะอาด ต้องไม่มีคอมเมนต์", b["annots"], 0)
        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ตัวตรวจใช้ได้ แยกไฟล์สกปรกกับสะอาดออกจากกันได้" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        pg.goto(f"{BASE}/#/pdf-clean", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(dirty))
        pg.wait_for_selector(".pc-file", timeout=20000)
        pg.wait_for_timeout(900)

        print("\n── ① รายงานต้องตรงกับของที่ใส่เข้าไปจริง")
        txt = pg.locator(".pc-report").inner_text()
        ck("ต้องรายงานว่าพบร่องรอย", "พบร่องรอยที่ควรล้าง" in txt, True, f"ข้อความจริง: {txt[:100]!r}")
        ck("ต้องรายงานข้อมูลกำกับไฟล์", "ข้อมูลกำกับไฟล์" in txt, True)
        ck("ต้องโชว์ชื่อเรื่องเดิมที่เป็นความลับให้เห็น", DIRTY_TITLE[:14] in txt, True,
           "ถ้าไม่โชว์ ผู้ใช้จะไม่รู้ว่ามีอะไรติดมา")
        ck("ต้องรายงานจำนวนคอมเมนต์ให้ตรง", "3" in txt and "คอมเมนต์" in txt, True)

        print("\n── ② ล้างแล้วต้องหายจริง")
        act(pg, "ล้างแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out = dl_result(pg, DL / "cleaned.pdf")
        r = audit(out)
        ck("ข้อมูลกำกับต้องถูกล้างหมด", r["meta_left"], [])
        ck("คอมเมนต์ต้องหายหมด", r["annots"], 0)
        ck("เนื้อหาหลักต้องยังอยู่", "CONTRACT BODY TEXT" in r["text"], True,
           "ถ้าหาย แปลว่าล้างเกินขอบเขต ไปลบเนื้อหาจริงด้วย")

        print("\n── ③ ตั้งชื่อเรื่องใหม่ได้")
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/pdf-clean", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files(str(dirty))
        pg.wait_for_selector(".pc-file", timeout=20000)
        pg.locator(".s2-side-bd input[type=text]").first.fill("เอกสารเผยแพร่ได้")
        pg.wait_for_timeout(300)
        act(pg, "ล้างแล้วบันทึก")
        pg.wait_for_timeout(3000)
        out3 = dl_result(pg, DL / "retitled.pdf")
        r3 = audit(out3)
        ck("ชื่อเรื่องใหม่ต้องถูกใส่ให้", r3["title"], "เอกสารเผยแพร่ได้")
        ck("ชื่อผู้เขียนเดิมต้องยังถูกล้าง", r3["author"], "")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ รายงานตรงกับของจริง และล้างแล้วหายจริงโดยไม่แตะเนื้อหา")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
