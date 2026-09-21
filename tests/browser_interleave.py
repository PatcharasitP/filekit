# ตรวจโหมด "สลับหน้าจาก 2 ไฟล์" ของเครื่องมือรวมไฟล์
#
# ‼️ เคสจริงที่เครื่องมือนี้แก้: คนสแกนสองหน้าด้วยเครื่องที่สแกนได้ทีละด้าน
#    สแกนด้านหน้าทั้งปึกได้ไฟล์ A = หน้า 1,3,5,7
#    พลิกทั้งปึกสแกนอีกรอบได้ไฟล์ B = หน้า 8,6,4,2 (กลับหลัง เพราะพลิกปึก)
#    ถ้าต่อกันตรง ๆ จะได้ 1,3,5,7,8,6,4,2 ซึ่งอ่านไม่ได้เลย
#    โหมดนี้ต้องคืน 1,2,3,4,5,6,7,8
#
# --selftest พิสูจน์ว่าตัวตรวจอ่านลำดับหน้าจากไฟล์ได้จริง และจับลำดับผิดได้

import sys, os, pathlib, tempfile, shutil, re, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_alt_"))
FIX, DL = ROOT / "fix", ROOT / "dl"

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make(path, marks):
    """สร้าง PDF ที่แต่ละหน้าเขียนเลขหน้าจริงของเอกสารต้นฉบับไว้"""
    d = fitz.open()
    for m in marks:
        p = d.new_page(width=400, height=600)
        p.insert_text((50, 100), f"SHEET-{m}", fontname="helv", fontsize=24)
    d.save(str(path)); d.close()
    return path


def order_of(path):
    d = fitz.open(str(path))
    out = []
    for i in range(d.page_count):
        m = re.search(r"SHEET-(\d+)", d[i].get_text())
        out.append(int(m.group(1)) if m else None)
    d.close()
    return out


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


def merge(pg, files, mode, back=None, out_name="out.pdf"):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/pdf-merge", wait_until="networkidle")
    pg.wait_for_selector(".dz", state="attached")
    pg.locator(".dz input[type=file]").set_input_files([str(f) for f in files])
    pg.wait_for_timeout(700)
    sels = pg.locator(".s2-side-bd select, .s2-stage select")
    sels.first.select_option(mode)
    pg.wait_for_timeout(400)
    if back:
        pg.locator("select").nth(1).select_option(back)
        pg.wait_for_timeout(300)
    act(pg, "รวม")
    pg.wait_for_timeout(3000)
    return dl_result(pg, DL / out_name)


def main():
    FIX.mkdir(parents=True, exist_ok=True); DL.mkdir(parents=True, exist_ok=True)
    fronts = make(FIX / "front.pdf", [1, 3, 5, 7])       # ด้านหน้าทั้งปึก
    backs_rev = make(FIX / "back.pdf", [8, 6, 4, 2])     # พลิกปึกแล้วสแกน จึงกลับหลัง
    backs_fwd = make(FIX / "back2.pdf", [2, 4, 6, 8])    # เครื่องบางรุ่นเรียงตามปกติ

    if SELFTEST:
        print("ตรวจตัวตรวจเอง")
        ok1 = ck("อ่านลำดับจากไฟล์ด้านหน้าได้ถูก", order_of(fronts), [1, 3, 5, 7])
        ok2 = ck("อ่านลำดับจากไฟล์ด้านหลังที่กลับหลังได้ถูก", order_of(backs_rev), [8, 6, 4, 2])
        wrong = make(FIX / "wrong.pdf", [1, 3, 5, 7, 8, 6, 4, 2])
        ok3 = ck("ไฟล์ที่ต่อกันตรง ๆ ต้องอ่านได้ว่าลำดับผิด", order_of(wrong) == list(range(1, 9)), False,
                 "ถ้าตัวตรวจบอกว่าถูก แปลว่ามันแยกลำดับถูกกับผิดไม่ออก")
        good = all([ok1, ok2, ok3])
        print("\n" + ("✅ ตัวตรวจอ่านลำดับหน้าได้จริง" if good else "❌ ตัวตรวจเชื่อไม่ได้"))
        return 0 if good else 1

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        print("\n── ① สลับหน้า โดยไฟล์ด้านหลังเรียงกลับ (ค่าเริ่มต้น)")
        out1 = merge(pg, [fronts, backs_rev], "alt", "reverse", "alt-rev.pdf")
        ck("ต้องได้ 1 ถึง 8 เรียงถูกต้อง", order_of(out1), [1, 2, 3, 4, 5, 6, 7, 8],
           "นี่คือเหตุผลทั้งหมดที่โหมดนี้มีอยู่")

        print("\n── ② สลับหน้า โดยไฟล์ด้านหลังเรียงตามปกติ")
        out2 = merge(pg, [fronts, backs_fwd], "alt", "forward", "alt-fwd.pdf")
        ck("ต้องได้ 1 ถึง 8 เรียงถูกต้องเช่นกัน", order_of(out2), [1, 2, 3, 4, 5, 6, 7, 8])

        print("\n── ③ โหมดต่อกันตามเดิม ต้องไม่เปลี่ยนพฤติกรรม")
        out3 = merge(pg, [fronts, backs_rev], "join", None, "join.pdf")
        ck("ต้องต่อกันตามลำดับไฟล์เหมือนเดิมทุกประการ", order_of(out3), [1, 3, 5, 7, 8, 6, 4, 2],
           "ของเดิมต้องไม่ถูกงานใหม่ทำพัง")

        print("\n── ④ จำนวนไฟล์ไม่ใช่ 2 ในโหมดสลับ ต้องบอกผู้ใช้ ไม่ใช่ทำมั่ว")
        third = make(FIX / "third.pdf", [9])
        pg.goto("about:blank"); pg.goto(f"{BASE}/#/pdf-merge", wait_until="networkidle")
        pg.wait_for_selector(".dz", state="attached")
        pg.locator(".dz input[type=file]").set_input_files([str(fronts), str(backs_rev), str(third)])
        pg.wait_for_timeout(700)
        pg.locator(".s2-side-bd select, .s2-stage select").first.select_option("alt")
        pg.wait_for_timeout(400)
        act(pg, "รวม")
        pg.wait_for_timeout(1500)
        txt = pg.evaluate("() => document.querySelector('.status')?.textContent || ''")
        ck("ต้องขึ้นข้อความบอกว่าโหมดนี้ใช้กับ 2 ไฟล์", "2 ไฟล์" in txt, True, f"ข้อความจริง {txt[:70]!r}")
        ck("ต้องไม่มีไฟล์ผลลัพธ์ออกมา", pg.locator(".s2-side-res .result, .results .result").count(), 0)

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ สลับหน้าถูกต้องทั้งสองแบบ และโหมดเดิมไม่ถูกทำพัง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
