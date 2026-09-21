# ตรวจเครื่องมือ "เทียบ PDF สองฉบับ"
#
# ‼️ คำถามหลักคือ **ชี้จุดที่ต่างได้ตรงจุดจริงไหม** ไม่ใช่แค่บอกว่า "ไม่เหมือนกัน"
#    เพราะถ้าแก้เลขตัวเดียวแล้วมันฟ้องว่าทั้งบรรทัดเปลี่ยน คนอ่านสัญญาก็ยังต้องไล่เอง
#    และภาษาไทยไม่มีช่องว่างระหว่างคำ ถ้าตัดคำไม่เป็น ทั้งประโยคจะกลายเป็นคำเดียว
#
# --selftest พิสูจน์ว่าไฟล์ทดสอบต่างกันตามที่ตั้งใจจริง

import sys, os, re, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_cmp_"))
FIX, DL = ROOT / "fix", ROOT / "dl"
THAI_FONT = "/mnt/c/Windows/Fonts/leelawad.ttf"

OLD = ["สัญญาจ้างทำของ ฉบับที่ ๑",
       "ข้อ 1 ผู้ว่าจ้างตกลงจ้าง นายสมชาย ใจดี",
       "ข้อ 2 ค่าจ้างรวม 150,000 บาท",
       "ข้อ 3 กำหนดส่งมอบภายใน 60 วัน",
       "ลงชื่อ ผู้ว่าจ้าง"]
NEW = ["สัญญาจ้างทำของ ฉบับที่ ๑",
       "ข้อ 1 ผู้ว่าจ้างตกลงจ้าง นายสมชาย ใจดี",
       "ข้อ 2 ค่าจ้างรวม 180,000 บาท",          # แก้ตัวเลข
       "ข้อ 3 กำหนดส่งมอบภายใน 60 วัน",
       "ข้อ 4 ผู้รับจ้างต้องรับประกันผลงาน 1 ปี",  # เพิ่มบรรทัด
       "ลงชื่อ ผู้ว่าจ้าง"]
# ฉบับใหม่ไม่มี "ลงชื่อ ผู้ว่าจ้าง" ของเดิมหายไปในเคสที่ 3
NEW_MINUS = OLD[:-1]

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make(path, lines):
    d = fitz.open()
    p = d.new_page(width=595, height=842)
    p.insert_font(fontname="tf", fontfile=THAI_FONT)
    for i, t in enumerate(lines):
        p.insert_text((60, 110 + i * 46), t, fontname="tf", fontfile=THAI_FONT, fontsize=15)
    d.save(str(path)); d.close()
    return path


def act(pg, text, timeout=20000):
    cta = pg.locator("button.s2-cta").filter(has_text=text)
    loc = cta if cta.count() else pg.locator("button.btn").filter(has_text=text)
    loc.first.wait_for(state="visible", timeout=timeout)
    loc.first.click()


def compare(pg, a, b):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-compare", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files([str(a), str(b)])
    pg.wait_for_timeout(800)
    act(pg, "เทียบสองฉบับ")
    pg.wait_for_selector(".cd-row", timeout=30000)
    pg.wait_for_timeout(1200)
    return pg.evaluate("""() => ({
        chips: [...document.querySelectorAll('.cd-chip')].map(c => c.textContent.trim()),
        rows: [...document.querySelectorAll('.cd-row')].filter(r => !r.querySelector('.cd-page'))
              .map(r => ({ type: [...r.classList].find(c => c !== 'cd-row'),
                           a: r.children[0]?.textContent || '', b: r.children[1]?.textContent || '',
                           delWords: [...r.querySelectorAll('.cd-w-del')].map(e => e.textContent),
                           addWords: [...r.querySelectorAll('.cd-w-add')].map(e => e.textContent) })),
        status: document.querySelector('.status')?.textContent.trim() || '',
      })""")


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    a = make(FIX / "old.pdf", OLD)
    b = make(FIX / "new.pdf", NEW)
    same = make(FIX / "same.pdf", OLD)
    shorter = make(FIX / "short.pdf", NEW_MINUS)

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        ta = fitz.open(str(a))[0].get_text()
        tb = fitz.open(str(b))[0].get_text()
        ok1 = ck("ไฟล์เดิมต้องมีเลข 150,000", "150,000" in ta, True)
        ok2 = ck("ไฟล์ใหม่ต้องมีเลข 180,000 แทน", "180,000" in tb and "150,000" not in tb, True)
        ok3 = ck("ไฟล์ใหม่ต้องมีบรรทัดที่เพิ่มเข้ามา", "รับประกันผลงาน" in tb, True)
        ok4 = ck("ไฟล์เดิมต้องไม่มีบรรทัดนั้น", "รับประกันผลงาน" in ta, False)
        good = all([ok1, ok2, ok3, ok4])
        print("\n" + ("✅ ไฟล์ทดสอบต่างกันตามที่ตั้งใจ" if good else "❌ ไฟล์ทดสอบไม่ถูก"))
        return 0 if good else 1

    with sync_playwright() as pw:
        pwb = pw.chromium.launch()
        pg = pwb.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① เทียบฉบับที่แก้ตัวเลขและเพิ่มบรรทัด")
        r = compare(pg, a, b)
        types = [x["type"] for x in r["rows"]]
        ck("ต้องเจอบรรทัดที่ถูกแก้ 1 บรรทัด", types.count("changed"), 1)
        ck("ต้องเจอบรรทัดที่เพิ่มเข้ามา 1 บรรทัด", types.count("add"), 1)
        ck("ต้องไม่ฟ้องว่ามีบรรทัดหายไป", types.count("del"), 0)

        print("\n── ② ต้องชี้ถึงระดับคำ ไม่ใช่ฟ้องทั้งบรรทัด")
        ch = next((x for x in r["rows"] if x["type"] == "changed"), None)
        ck("บรรทัดที่แก้ต้องไฮไลต์คำที่หายไป", ch and any("150,000" in w for w in ch["delWords"]), True,
           f"คำที่ไฮไลต์ว่าหาย: {ch['delWords'] if ch else None}")
        ck("บรรทัดที่แก้ต้องไฮไลต์คำที่เพิ่มมา", ch and any("180,000" in w for w in ch["addWords"]), True,
           f"คำที่ไฮไลต์ว่าเพิ่ม: {ch['addWords'] if ch else None}")
        ck("ต้องไม่ไฮไลต์ทั้งบรรทัด", ch and len("".join(ch["delWords"])) < len(ch["a"]) * 0.5, True,
           "ถ้าไฮไลต์เกินครึ่งบรรทัด แปลว่าตัดคำไทยไม่เป็น คนอ่านต้องไล่หาเองอยู่ดี")

        print("\n── ③ บรรทัดที่หายไปจากฉบับใหม่")
        r3 = compare(pg, a, shorter)
        ck("ต้องเจอบรรทัดที่หายไป", [x["type"] for x in r3["rows"]].count("del"), 1)

        print("\n── ④ สองฉบับที่เหมือนกันเป๊ะ ต้องบอกว่าไม่ต่าง")
        r4 = compare(pg, a, same)
        ck("ต้องไม่เจอความต่างเลย",
           [x["type"] for x in r4["rows"]].count("changed")
           + [x["type"] for x in r4["rows"]].count("add")
           + [x["type"] for x in r4["rows"]].count("del"), 0)
        ck("ต้องบอกผู้ใช้ว่าไม่พบความต่าง", "ไม่พบความต่าง" in r4["status"], True,
           f"ข้อความจริง {r4['status'][:60]!r}")

        print("\n── ⑤ ไฟล์สรุปผลต้องดาวน์โหลดได้และมีเนื้อหาถูก")
        compare(pg, a, b)
        loc = pg.locator(".s2-side-res button:visible, .s2-subrow button:visible").filter(has_text="ดาวน์โหลด")
        try:
            loc.first.wait_for(state="visible", timeout=8000)
        except Exception:
            loc = pg.locator(".results .result button:visible").filter(has_text="ดาวน์โหลด")
            loc.first.wait_for(state="visible", timeout=20000)
        with pg.expect_download() as dl:
            loc.first.click()
        out = DL / "report.txt"; dl.value.save_as(str(out))
        raw = out.read_bytes()
        ck("ไฟล์สรุปต้องมี BOM กันภาษาไทยเพี้ยน", raw[:3], b"\xef\xbb\xbf")
        text = raw.decode("utf-8-sig")
        ck("สรุปต้องมีทั้งค่าเดิมและค่าใหม่", "150,000" in text and "180,000" in text, True)
        ck("สรุปต้องมีบรรทัดที่เพิ่มเข้ามา", "รับประกันผลงาน" in text, True)

        ck("ไม่มี error บนหน้า", errs, [])
        pwb.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ เทียบได้ตรงจุด ชี้ถึงระดับคำ และสรุปผลเป็นไฟล์ได้")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
