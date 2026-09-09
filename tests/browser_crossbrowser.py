# ─────────────────────────────────────────────────────────────────────────
# เทสข้ามเบราว์เซอร์ — FileKit เคยเทสแค่ Chromium มาตลอด ไม่เคยรันบน Firefox/WebKit เลย
# วนเคสเดียวกันบนทั้ง 3 เบราว์เซอร์ แล้วสรุปว่าใครพังตรงไหน พร้อม error จริง + ไฟล์:บรรทัดต้นเหตุ
#
# รันจากโฟลเดอร์ FileKit/ (ต้องเปิด http server เองก่อน เหมือนเทสไฟล์อื่นในชุดนี้):
#   python3 -m http.server 8899 &
#   ../.venv/bin/python tests/browser_crossbrowser.py
#
# ‼️ ทุก context ต้องตั้ง reduced_motion="no-preference" เสมอ (ค่าเริ่มต้นของ Playwright
#    คือ "reduce" ซึ่งข้ามเส้นทางแอนิเมชัน/view-transition ที่ผู้ใช้จริง 99% เจอ)
# ─────────────────────────────────────────────────────────────────────────
import os
import re
import sys
import shutil
import pathlib
import tempfile
import traceback

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from PIL import Image
import fitz            # pymupdf
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8899")

REG_TEXT = (ROOT / "src/registry.js").read_text(encoding="utf-8")
TOOL_IDS = set(re.findall(r'id:"([\w-]+)"', REG_TEXT))

WORKDIR = pathlib.Path(tempfile.mkdtemp(prefix="filekit_xbrowser_"))
IN_DIR = WORKDIR / "in"
OUT_DIR = WORKDIR / "out"
SHOT_DIR = WORKDIR / "shots"
for d in (IN_DIR, OUT_DIR, SHOT_DIR):
    d.mkdir(parents=True, exist_ok=True)

SIF_TIMEOUT = 10_000

# ครอบทุกตระกูลไลบรารี: pdf-lib, pdf.js, docx, xlsx, canvas, mammoth+jspdf, tesseract
OPEN_TOOLS = [
    "pdf-merge",      # pdflib
    "pdf-to-text",    # pdfjs
    "pdf-to-images",  # pdfjs + jszip
    "pdf-to-word",    # pdfjs + docx
    "excel-csv",      # xlsx
    "thai-number",    # xlsx
    "image-resize",   # canvas
    "pdf-sign",       # canvas (signpad) + pdflib + pdfjs + createImageBitmap
    "pdf-ocr",        # tesseract (โหลดจริงตอนกด "อ่านข้อความ" เท่านั้น เปิดหน้าไม่โหลด)
    "word-to-pdf",    # mammoth + jspdf
]


def log(msg=""):
    print(msg, flush=True)


def ok_or_fail(results, name, cond, detail=""):
    if cond:
        results["passed"].append(name)
        log(f"  ✅ {name}")
    else:
        results["failed"].append((name, str(detail)[:400]))
        log(f"  ❌ {name}  — {str(detail)[:200]}")


# ─────────────────────────────────────────────────────────────────────────
# สร้างไฟล์ตัวอย่างเอง (PIL / pymupdf / openpyxl) ลงโฟลเดอร์ชั่วคราว — ลบทิ้งท้ายสคริปต์
# ─────────────────────────────────────────────────────────────────────────
def make_sample_files():
    files = {}

    # รูป PNG ธรรมดา สำหรับ image-resize
    p = IN_DIR / "xb-sample.png"
    img = Image.new("RGB", (900, 600), color=(210, 70, 60))
    for x in range(0, 900, 40):
        for y in range(0, 600, 40):
            img.putpixel((x, y), (0, 0, 0))
    img.save(p, "PNG")
    files["png"] = p

    # 2 PDF สำหรับ pdf-merge (คนละจำนวนหน้า จะได้เช็ค page count รวมได้ตรง)
    p1 = IN_DIR / "xb-sample-a.pdf"
    d1 = fitz.open()
    for i in range(2):
        pg = d1.new_page(width=595, height=842)
        pg.insert_text((72, 72), f"FileKit crossbrowser test A page {i+1}", fontsize=16)
    d1.save(p1)
    d1.close()
    files["pdf_a"] = p1

    p2 = IN_DIR / "xb-sample-b.pdf"
    d2 = fitz.open()
    pg = d2.new_page(width=595, height=842)
    pg.insert_text((72, 72), "FileKit crossbrowser test B page 1", fontsize=16)
    d2.save(p2)
    d2.close()
    files["pdf_b"] = p2

    # xlsx สำหรับ excel-csv
    p = IN_DIR / "xb-sample.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["เลขที่", "ชื่อลูกค้า", "ยอดเงิน"])
    ws.append(["XB-001", "ทดสอบ ข้ามเบราว์เซอร์", 1234])
    ws.append(["XB-002", "ทดสอบ สอง", 5678])
    wb.save(p)
    files["xlsx"] = p

    return files


def cleanup_samples():
    try:
        shutil.rmtree(WORKDIR, ignore_errors=True)
    except Exception:
        pass


def goto(pg, tool_id):
    assert tool_id in TOOL_IDS, f"ไม่พบเครื่องมือ id={tool_id} ใน src/registry.js"
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tool_id}", wait_until="networkidle")


def dl(pg, trigger, filename, timeout=20_000):
    with pg.expect_download(timeout=timeout) as di:
        trigger()
    d = di.value
    out = OUT_DIR / filename
    d.save_as(str(out))
    return out


def is_real_error(text):
    return "favicon" not in text.lower()


# ─────────────────────────────────────────────────────────────────────────
# ชุดเคสที่รันเหมือนกันทุกเบราว์เซอร์
# ─────────────────────────────────────────────────────────────────────────
def run_suite(browser_name, browser, samples, results):
    ctx = browser.new_context(viewport={"width": 1280, "height": 950}, reduced_motion="no-preference")
    pg = ctx.new_page()
    console_errors, page_errors = [], []
    pg.on("pageerror", lambda e: page_errors.append(str(e)))
    pg.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    def real_errs():
        return [e for e in (console_errors + page_errors) if is_real_error(e)]

    def clear_errs():
        console_errors.clear(); page_errors.clear()

    # ── ① หน้าแรก ──────────────────────────────────────────────────────
    log("\n━━ ① หน้าแรก ━━")
    try:
        clear_errs()
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_selector(".pill", timeout=15_000)
        pg.wait_for_timeout(400)
        shot = SHOT_DIR / f"home_{browser_name}.png"
        pg.screenshot(path=str(shot))
        results["home_screenshot"] = str(shot)
        errs = real_errs()
        ok_or_fail(results, "หน้าแรกโหลดสำเร็จไม่มี console/page error", len(errs) == 0, "; ".join(errs[:5]))
        n_pills = pg.locator("button.pill").count()
        ok_or_fail(results, "มีป้ายเครื่องมือแสดงอยู่ (>0)", n_pills > 0, f"พบ {n_pills}")
    except Exception as e:
        ok_or_fail(results, "หน้าแรกโหลดสำเร็จ", False, f"{type(e).__name__}: {e}")

    # ── feature detection (ข้อมูลประกอบ ไม่ตัดสินผ่าน/ตก) ────────────────
    try:
        feat = pg.evaluate("""() => ({
            viewTransition: typeof document.startViewTransition === "function",
            dialogEl: typeof HTMLDialogElement !== "undefined",
            hasSelector: (() => { try { return CSS.supports("selector(:has(a))"); } catch(e) { return false; } })(),
            colorMix: (() => { try { return CSS.supports("color","color-mix(in srgb, red 50%, blue)"); } catch(e) { return false; } })(),
            backdropFilter: (() => { try { return CSS.supports("backdrop-filter","blur(4px)") || CSS.supports("-webkit-backdrop-filter","blur(4px)"); } catch(e) { return false; } })(),
            createImageBitmap: typeof createImageBitmap === "function",
            reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        })""")
        results["features"] = feat
        log(f"  ℹ️ feature support: {feat}")
    except Exception as e:
        results["features"] = {"error": str(e)}

    # ── ② เปิดเครื่องมือ ≥8 ตัว ครอบทุกตระกูลไลบรารี ───────────────────
    log("\n━━ ② เปิดเครื่องมือครอบไลบรารี ━━")
    for t in OPEN_TOOLS:
        clear_errs()
        try:
            goto(pg, t)
            pg.wait_for_selector(".dz, .tool-head", timeout=15_000)
            pg.wait_for_timeout(150)
            errs = real_errs()
            ok_or_fail(results, f"เปิดเครื่องมือ {t} ไม่มี error", len(errs) == 0, "; ".join(errs[:3]))
        except Exception as e:
            ok_or_fail(results, f"เปิดเครื่องมือ {t} ไม่มี error", False, f"{type(e).__name__}: {e}")

    # ── ③ อัปโหลดไฟล์จริง + ทำงานจริง (excel-csv) ──────────────────────
    log("\n━━ ③ ทำงานจริง: excel-csv ━━")
    try:
        clear_errs()
        goto(pg, "excel-csv")
        pg.set_input_files("input[type=file]", str(samples["xlsx"]), timeout=SIF_TIMEOUT)
        pg.wait_for_selector(".file-row", timeout=15_000)
        pg.get_by_role("button", name="แปลงไฟล์").click()
        pg.wait_for_selector(".results .result", timeout=20_000)
        out = dl(pg, lambda: pg.locator(".results .result button").first.click(), f"{browser_name}_excelcsv_out.csv")
        data = out.read_bytes()
        text = data.decode("utf-8-sig")
        header = text.splitlines()[0] if text.splitlines() else ""
        cols_ok = all(c in header for c in ["เลขที่", "ชื่อลูกค้า", "ยอดเงิน"])
        rows_ok = len(text.splitlines()) >= 3
        errs = real_errs()
        ok_or_fail(results, "excel-csv: แปลงสำเร็จ หัวคอลัมน์/แถวครบ", cols_ok and rows_ok,
                   f"header={header!r} lines={len(text.splitlines())}")
        ok_or_fail(results, "excel-csv: ไม่มี console/page error ระหว่างทำงาน", len(errs) == 0, "; ".join(errs[:5]))
    except Exception as e:
        ok_or_fail(results, "excel-csv: ทำงานจริงสำเร็จ", False,
                   f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}")

    # ── ④ อัปโหลดไฟล์จริง + ทำงานจริง (pdf-merge) ──────────────────────
    log("\n━━ ④ ทำงานจริง: pdf-merge ━━")
    try:
        expected_pages = fitz.open(str(samples["pdf_a"])).page_count + fitz.open(str(samples["pdf_b"])).page_count
        clear_errs()
        goto(pg, "pdf-merge")
        pg.set_input_files("input[type=file]", [str(samples["pdf_a"]), str(samples["pdf_b"])], timeout=SIF_TIMEOUT)
        pg.wait_for_selector(".file-row", timeout=15_000)
        rows_ok = pg.locator(".file-row").count() == 2
        ok_or_fail(results, "pdf-merge: ไฟล์ที่ใส่ขึ้นครบ 2 แถว", rows_ok, f"พบ {pg.locator('.file-row').count()} แถว")

        pg.get_by_role("button", name="รวมไฟล์").click()
        pg.wait_for_selector(".results .result", timeout=20_000)
        out = dl(pg, lambda: pg.locator(".results .result button").first.click(), f"{browser_name}_pdfmerge_out.pdf")
        doc = fitz.open(str(out))
        got_pages = doc.page_count
        pages_ok = got_pages == expected_pages
        text_ok = bool(doc[0].get_text().strip())
        doc.close()
        errs = real_errs()
        ok_or_fail(results, f"pdf-merge: จำนวนหน้าหลังรวมถูกต้อง ({expected_pages})", pages_ok, f"ได้ {got_pages}")
        ok_or_fail(results, "pdf-merge: หน้าแรกมีข้อความจริง", text_ok)
        ok_or_fail(results, "pdf-merge: ไม่มี console/page error ระหว่างทำงาน", len(errs) == 0, "; ".join(errs[:5]))
    except Exception as e:
        ok_or_fail(results, "pdf-merge: ทำงานจริงสำเร็จ", False,
                   f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}")

    # ── ④b ตัวดูรูปเต็มจอ — ใช้ images-to-pdf กับไฟล์รูปภาพ (canView รูปไม่ต้องรอ pdf.js โหลด)
    #    ‼️ พบระหว่างเขียนเทสนี้ (จับได้จริง 08/09): ถ้าใช้หน้า pdf-merge + ไฟล์ .pdf แทน
    #    ปุ่ม button.thumb จะกดแล้วไม่มีอะไรเกิดขึ้นเลย (ไม่ error ด้วย) เพราะ src/preview.js:99
    #    `canView()` ของไฟล์ชนิด pdf ต้องมี window.pdfjsLib โหลดแล้วเท่านั้น แต่หน้า pdf-merge
    #    โหลดแค่ libs:["pdflib"] (ไม่มี pdfjs) — ไม่ใช่บั๊กข้ามเบราว์เซอร์ (เกิดเหมือนกันทั้ง
    #    chromium และ firefox) แต่เป็นบั๊กแอปทั่วไป ดูหัวข้อ "บั๊กที่พบเพิ่มเติม" ท้ายสรุปผล
    log("\n━━ ④b ตัวดูรูปเต็มจอ (images-to-pdf + รูปภาพ) ━━")
    try:
        clear_errs()
        goto(pg, "images-to-pdf")
        pg.set_input_files("input[type=file]", str(samples["png"]), timeout=SIF_TIMEOUT)
        pg.wait_for_selector(".file-row", timeout=15_000)
        thumb_btn = pg.locator("button.thumb").first
        thumb_btn.wait_for(state="visible", timeout=8_000)
        thumb_btn.click()
        pg.wait_for_selector("dialog.pv[open]", timeout=8_000)
        opened_ok = pg.evaluate("() => { const d = document.querySelector('dialog.pv'); return !!(d && d.open); }")
        ok_or_fail(results, "ตัวดูรูปเต็มจอ: เปิดขึ้นจริง (dialog.pv[open])", opened_ok)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        closed_ok = pg.evaluate("() => { const d = document.querySelector('dialog.pv'); return !d || !d.open; }")
        ok_or_fail(results, "ตัวดูรูปเต็มจอ: กด Esc แล้วปิดสนิท", closed_ok)
        errs = real_errs()
        ok_or_fail(results, "ตัวดูรูปเต็มจอ: ไม่มี console/page error", len(errs) == 0, "; ".join(errs[:5]))
    except Exception as e:
        ok_or_fail(results, "ตัวดูรูปเต็มจอ: เปิด/ปิดด้วย Esc ได้", False,
                   f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}")

    # ── ⑤ อัปโหลดไฟล์จริง + ทำงานจริง (image-resize) ───────────────────
    log("\n━━ ⑤ ทำงานจริง: image-resize (canvas) ━━")
    try:
        clear_errs()
        goto(pg, "image-resize")
        pg.set_input_files("input[type=file]", str(samples["png"]), timeout=SIF_TIMEOUT)
        pg.wait_for_selector(".file-row", timeout=15_000)
        pg.get_by_role("button", name="ย่อและบีบอัด").click()
        pg.wait_for_selector(".status-wrap .status.show", timeout=20_000)
        out = dl(pg, lambda: pg.get_by_role("button", name="ดาวน์โหลดรูป").click(), f"{browser_name}_imgresize_out.jpg")
        im = Image.open(out)
        im.load()
        size_ok = im.size[0] > 0 and im.size[1] > 0
        errs = real_errs()
        ok_or_fail(results, "image-resize: ได้ไฟล์รูปที่เปิดได้จริง (canvas ทำงาน)", size_ok, f"size={im.size}")
        ok_or_fail(results, "image-resize: ไม่มี console/page error ระหว่างทำงาน", len(errs) == 0, "; ".join(errs[:5]))
    except Exception as e:
        ok_or_fail(results, "image-resize: ทำงานจริงสำเร็จ", False,
                   f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}")

    # ── ⑥ สลับภาษา ไทย/อังกฤษ ──────────────────────────────────────────
    log("\n━━ ⑥ สลับภาษา ━━")
    try:
        clear_errs()
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_selector("#lang .langopt", timeout=10_000)
        en_btn = pg.locator('#lang .langopt[data-lang="en"]')
        with pg.expect_navigation(wait_until="networkidle", timeout=15_000):
            en_btn.click()
        pg.wait_for_timeout(300)
        lang_ok = pg.evaluate("document.documentElement.lang") == "en"
        errs = real_errs()
        ok_or_fail(results, "สลับเป็นอังกฤษ: document.lang == 'en'", lang_ok)
        ok_or_fail(results, "สลับภาษา: ไม่มี console/page error", len(errs) == 0, "; ".join(errs[:5]))

        clear_errs()
        th_btn = pg.locator('#lang .langopt[data-lang="th"]')
        with pg.expect_navigation(wait_until="networkidle", timeout=15_000):
            th_btn.click()
        pg.wait_for_timeout(300)
        lang_back_ok = pg.evaluate("document.documentElement.lang") != "en"
        ok_or_fail(results, "สลับกลับไทยสำเร็จ", lang_back_ok)
    except Exception as e:
        ok_or_fail(results, "สลับภาษาได้โดยไม่พัง", False, f"{type(e).__name__}: {e}")

    # ── ⑦ สลับธีมสว่าง/มืด ──────────────────────────────────────────────
    log("\n━━ ⑦ สลับธีม ━━")
    try:
        clear_errs()
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_selector("#theme", timeout=10_000)
        before = pg.evaluate("document.documentElement.dataset.theme || 'auto'")
        pg.locator("#theme").click()
        pg.wait_for_timeout(250)
        after = pg.evaluate("document.documentElement.dataset.theme || 'auto'")
        changed_ok = after != before and after in ("light", "dark")
        errs = real_errs()
        ok_or_fail(results, f"สลับธีมสำเร็จ ({before} → {after})", changed_ok)
        ok_or_fail(results, "สลับธีม: ไม่มี console/page error", len(errs) == 0, "; ".join(errs[:5]))
        # สลับกลับให้ context สะอาดสำหรับเบราว์เซอร์ถัดไป (ไม่มีผล เพราะ context แยกกันอยู่แล้ว)
    except Exception as e:
        ok_or_fail(results, "สลับธีมได้โดยไม่พัง", False, f"{type(e).__name__}: {e}")

    ctx.close()


def run_browser(pw, name, samples):
    results = {"browser": name, "passed": [], "failed": [], "skipped": False, "skip_reason": "", "features": {}, "home_screenshot": ""}
    log(f"\n{'='*70}\n🌐 {name.upper()}\n{'='*70}")
    launcher = getattr(pw, name)
    try:
        browser = launcher.launch()
    except Exception as e:
        results["skipped"] = True
        results["skip_reason"] = f"{type(e).__name__}: {e}"
        log(f"  ⚠️ ติดตั้ง/รัน {name} ไม่ได้: {results['skip_reason'][:500]}")
        return results
    try:
        run_suite(name, browser, samples, results)
    finally:
        browser.close()
    return results


def main():
    log(f"BASE = {BASE}")
    log(f"WORKDIR (ไฟล์ตัวอย่าง + ผลลัพธ์ชั่วคราว) = {WORKDIR}")
    samples = make_sample_files()
    all_results = []
    try:
        with sync_playwright() as pw:
            for name in ["chromium", "firefox", "webkit"]:
                all_results.append(run_browser(pw, name, samples))
    finally:
        cleanup_samples()

    # ── สรุปผล ──────────────────────────────────────────────────────────
    log("\n" + "━" * 70)
    log("สรุปผลข้ามเบราว์เซอร์")
    log("━" * 70)
    log(f"{'เบราว์เซอร์':<12}{'ผ่าน':<8}{'ตก':<8}สถานะ")
    any_hard_fail = False
    for r in all_results:
        if r["skipped"]:
            log(f"{r['browser']:<12}{'-':<8}{'-':<8}ข้าม (ติดตั้งไม่ได้: {r['skip_reason'][:80]})")
            continue
        p, f = len(r["passed"]), len(r["failed"])
        log(f"{r['browser']:<12}{p:<8}{f:<8}{'มีอาการพัง' if f else 'ผ่านหมด'}")
        if f:
            any_hard_fail = True

    for r in all_results:
        if r["skipped"]:
            continue
        log(f"\n── รายละเอียด {r['browser']} ──")
        log(f"  feature support: {r['features']}")
        log(f"  screenshot: {r['home_screenshot']}")
        if r["failed"]:
            for i, (n, detail) in enumerate(r["failed"], 1):
                log(f"  {i}. ❌ {n}\n      {detail}")
        else:
            log("  ไม่พบอาการพังจากเคสที่ทดสอบ")

    skipped_names = [r["browser"] for r in all_results if r["skipped"]]
    if skipped_names:
        log(f"\n⚠️ เบราว์เซอร์ที่ข้ามไป (ไม่ได้รันจริง): {', '.join(skipped_names)}")

    sys.exit(1 if any_hard_fail else 0)


if __name__ == "__main__":
    main()
