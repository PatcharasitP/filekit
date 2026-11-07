"""อุปกรณ์รวม จัดข้อมูลลูกค้าไทยครบในรอบเดียว (thai-suite) ต้องได้ไฟล์เดียวที่ทุกช่องตรงกับการต่อ 4 เครื่องมือทีละตัว
ที่มา 07/11/2026 วัดเส้นทางเดิมบนเว็บจริง v222 แยกที่อยู่ แยกชื่อ ตรวจเลขบัตร แปลงปี ผ่านการ์ดทำต่อ กด 8 ครั้ง ได้ 4 ไฟล์
(.claude/evidence/2026-11-07-filekit-suite-plan/chain_now.log) เทสนี้ทำทั้งสองเส้นทางในเบราว์เซอร์เดียวกัน แล้วเทียบทุกช่อง
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_thai_suite.py"""
import os, sys, tempfile, pathlib, openpyxl
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
TMP = pathlib.Path(tempfile.mkdtemp(prefix="fk_suite_"))
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:260]}]" if not ok else ""), flush=True)

def sheet(path):
    ws = openpyxl.load_workbook(path).active
    return [[("" if v is None else str(v)) for v in r] for r in ws.iter_rows(values_only=True)]

CHAIN = [("thai-address", None), ("thai-name", "แยกคำนำหน้า"), ("thai-id", "ตรวจเลขบัตร"), ("thai-date", "สลับปี")]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    # เส้นทางเดิม ต่อเครื่องมือทีละตัวผ่านการ์ดทำต่อ
    c = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True); p = c.new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    chain_clicks = 0
    p.goto(f"{BASE}/#/thai-address"); p.wait_for_timeout(2000)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click(); chain_clicks += 1; p.wait_for_timeout(2500)
    last = None
    for k, (tool, card) in enumerate(CHAIN):
        if card:
            p.locator("#tool a.next-card:visible", has_text=card).first.click(); chain_clicks += 1; p.wait_for_timeout(2500)
        with p.expect_download() as d:
            p.locator("#tool button:visible", has_text="ดาวน์โหลดเป็น Excel").first.click(); chain_clicks += 1
        last = TMP / f"chain_{k}.xlsx"; d.value.save_as(last); p.wait_for_timeout(600)
    c.close()
    chain = sheet(last)

    # อุปกรณ์รวม
    c = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True); p = c.new_page()
    p.on("pageerror", lambda e: errs.append(str(e)))
    suite_clicks = 0
    p.goto(f"{BASE}/#/thai-suite"); p.wait_for_selector("#tool", timeout=20000); p.wait_for_timeout(2000)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click(); suite_clicks += 1
    p.wait_for_selector("#tool .suite-job", timeout=20000); p.wait_for_timeout(2500)
    # คำประสมในหัวงานต้องอยู่ในก้อน nowrap ทุกคำที่เห็น (ไม่ขึ้นกับความกว้างจอ ตามโน้ต คำประสมไทยถูกตัดข้ามบรรทัด)
    loose = p.evaluate("""async () => { const { NB_WORDS } = await import('./src/tools/thai-suite.js'); const out = []; let seen = 0;
      for (const h of document.querySelectorAll('#tool .suite-head strong')) {
        const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) for (const k of NB_WORDS) if (n.data.includes(k)) { seen++; if (getComputedStyle(n.parentElement).whiteSpace !== 'nowrap') out.push(k); } }
      return { seen, out }; }""")
    check("ประชากร: หัวงานมีคำประสมในรายการให้ตรวจ", loose["seen"] >= 5, loose)
    check("คำประสมในหัวงานอยู่ในก้อนห้ามตัดครบทุกคำ", not loose["out"], loose["out"])
    ticked = p.evaluate("() => [...document.querySelectorAll('#tool .suite-on')].filter(x => x.checked).map(x => x.dataset.job)")
    check("ตั้งต้น: ไฟล์ตัวอย่างเดาคอลัมน์ได้และติ๊กให้ทั้ง 5 งาน", sorted(ticked) == sorted(["address", "name", "id", "date", "number"]), ticked)
    # ให้ชุดงานเท่ากับเส้นทางเดิม เอาบาทถ้วนออก
    p.locator('#tool .suite-on[data-job="number"]').click(); suite_clicks += 1; p.wait_for_timeout(500)
    newcols = p.inner_text("#suite-newcols")
    check("บอกจำนวนคอลัมน์ใหม่ (ที่อยู่ 4 ชื่อ 3 เลขบัตร 1 ปี 1)", "9" in newcols, newcols)
    with p.expect_download() as d:
        p.locator("#tool button:visible", has_text="ดาวน์โหลดเป็น Excel").first.click(); suite_clicks += 1
    out = TMP / "suite.xlsx"; d.value.save_as(out)
    name = d.value.suggested_filename
    suite = sheet(out)
    check("ไฟล์เดียว ชื่อสั้น ไม่ยาวขึ้นทุกขั้น", name.endswith("-จัดข้อมูลแล้ว.xlsx") and name.count("แล้ว") == 1, name)
    check("หัวคอลัมน์ตรงกับเส้นทางเดิมทุกคอลัมน์และลำดับเดียวกัน", suite[0] == chain[0], {"รวม": suite[0], "ต่อทีละตัว": chain[0]})
    diff = [(r, i) for r in range(min(len(suite), len(chain))) for i in range(max(len(suite[r]), len(chain[r])))
            if (suite[r][i] if i < len(suite[r]) else "") != (chain[r][i] if i < len(chain[r]) else "")]
    check("ทุกช่องตรงกับไฟล์สุดท้ายของเส้นทางเดิม", len(suite) == len(chain) and not diff, {"แถว": (len(suite), len(chain)), "ช่องที่ต่าง": diff[:5]})
    check("กดน้อยกว่าเส้นทางเดิม", suite_clicks < chain_clicks, {"รวม": suite_clicks, "ต่อทีละตัว": chain_clicks})
    print(f"  (การกด: ต่อทีละตัว {chain_clicks} ครั้ง 4 ไฟล์ , อุปกรณ์รวม {suite_clicks} ครั้ง 1 ไฟล์)")
    # ไม่ติ๊กงานเลย ปุ่มดาวน์โหลดต้องกดไม่ได้และบอกเหตุผล ไม่ใช่กดแล้วเงียบ
    # ‼️ หลังดาวน์โหลดหน้าเป็นสถานะ เสร็จแล้ว ตามแบบ ต้องกด กลับไปแก้ ก่อน (กับดักเดียวกับ browser_unstamp_go 07/11/2026)
    back = p.locator("#tool button:visible", has_text="กลับไปแก้")
    if back.count(): back.first.click(); p.wait_for_timeout(500)
    for j in ["address", "name", "id", "date"]:
        p.locator(f'#tool .suite-on[data-job="{j}"]').click()
    p.wait_for_timeout(300)
    btn = p.locator("#tool button:visible", has_text="ดาวน์โหลดเป็น Excel").first
    check("ไม่ติ๊กงานเลย ปุ่มดาวน์โหลดกดไม่ได้และมีเหตุผล", btn.is_disabled() and "ติ๊กงาน" in (btn.get_attribute("data-why") or ""), btn.get_attribute("data-why"))
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_thai_suite: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
