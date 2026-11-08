"""จัดข้อมูลลูกค้าไทยครบในรอบเดียว (thai-suite) ห้ามติ๊กงานเองบนคอลัมน์ที่แค่ชื่อหัวคล้าย ต้องบอกแถวที่ระบบเดา
และสลับไปชีทว่างแล้วต้องกลับชีทเดิมได้ (หน้าเดี่ยวตระกูลคอลัมน์ก็เหมือนกัน)
ที่มา 08/11/2026 รีวิวโค้ด v223:
① ติ๊กงานจาก guessColumn ที่หลวม หัว Paid ติด /id/ หัว ภาษีมูลค่าเพิ่ม ติด /ภาษี/ หัว ชื่อสินค้า ติด /ชื่อ/
   ไฟล์ผลลัพธ์มีคอลัมน์ ผลตรวจ ผิดทุกแถว ทั้งที่ผู้ใช้ไม่ได้ขอ
② ช่องสถานะของงานใช้แค่ ok กับ bad แถวที่ระบบเดา (ที่อยู่ไม่ชัวร์ ปี 2 หลัก) นับเป็นสำเร็จเงียบ หน้าเดี่ยวเตือน
③ เลือกชีทว่าง แผงทั้งก้อนซ่อนรวมช่องเลือกชีท กลับชีทเดิมไม่ได้ แต่ปุ่มดาวน์โหลดยังโผล่
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_thai_suite_guard.py"""
import os, sys, json, tempfile, pathlib
import openpyxl
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:240]}]" if not ok else ""), flush=True)

d = pathlib.Path(tempfile.mkdtemp(prefix="fk_tsg_"))
def book(name, sheets):
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for title, rows in sheets:
        ws = wb.create_sheet(title)
        for r in rows: ws.append(r)
    f = d / name; wb.save(f); return f

cust = book("cust.xlsx", [("S", [["ชื่อลูกค้า", "Paid", "ที่อยู่", "วันที่"],
    ["นายสมชาย ใจดี", "yes", "55/7 ซ.สุขุมวิท 21 คลองเตยเหนือ วัฒนา กรุงเทพฯ", "15/01/69"],
    ["นางสาวพิมพ์ ทอง", "no", "1234 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร 10400", "2 ก.พ. 69"]])])
prod = book("prod.xlsx", [("S", [["รหัส", "ชื่อสินค้า", "ภาษีมูลค่าเพิ่ม", "ราคา"],
    ["P1", "ปากกาลูกลื่นสีน้ำเงิน", 7, 100], ["P2", "สมุดปกแข็ง A4", 14, 200]])])
real = book("real.xlsx", [("S", [["Paid", "เลขประจำตัวผู้เสียภาษี", "ชื่อ-นามสกุล"],
    ["yes", "1101700230708", "นายสมชาย ใจดี"], ["no", "3100600156633", "นางสาวพิมพ์ใจ ทองดี"]])])
two = book("two.xlsx", [("ลูกค้า", [["ชื่อ-นามสกุล", "ที่อยู่"], ["นายสมชาย ใจดี", "99/12 ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000"]]), ("ว่าง", [])])

JOBS = """() => Object.fromEntries([...document.querySelectorAll('.suite-job')].map(j => [j.dataset.job,
  {on: j.querySelector('.suite-on').checked, col: j.querySelector('select').selectedOptions[0]?.textContent, stat: j.querySelector('.suite-stat').textContent}]))"""
VIS = """() => { const v = (s) => { const e = document.querySelector(s); return !!e && !!e.offsetParent; };
  return {sheetSel: v('#tool .panel .field select'), actions: v('#tool .actions'), dl: [...document.querySelectorAll('#tool button')].some(b => /ดาวน์โหลด/.test(b.textContent) && b.offsetParent && !b.disabled),
          status: [...document.querySelectorAll('#tool .status')].map(s => s.textContent).join(' | ')}; }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1440, "height": 1000}); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/thai-suite", wait_until="load", timeout=60000); p.wait_for_timeout(1500)
    def load(f):
        p.set_input_files(".dz input[type=file]", [str(f)]); p.wait_for_timeout(2500)
        return p.evaluate(JOBS)

    j = load(cust)
    check("ประชากร: ไฟล์ลูกค้ายังติ๊ก แยกที่อยู่ กับ แปลงวันที่ ให้เอง", j["address"]["on"] and j["date"]["on"], j)
    check("หัว Paid ไม่ใช่เลขบัตร ห้ามติ๊กงานตรวจเลขบัตรเอง", not j["id"]["on"], j["id"])
    check("ช่องสถานะแยกที่อยู่บอกแถวที่ไม่ชัวร์", "ไม่ชัวร์" in j["address"]["stat"], j["address"])
    check("ช่องสถานะแปลงวันที่บอกแถวที่ปีมี 2 หลัก (ระบบเดา)", "2 หลัก" in j["date"]["stat"], j["date"])

    j = load(prod)
    check("ไฟล์สินค้า: ห้ามติ๊กตรวจเลขบัตรบนคอลัมน์ ภาษีมูลค่าเพิ่ม", not j["id"]["on"], j["id"])
    check("ไฟล์สินค้า: ห้ามติ๊กแยกชื่อคนบน ชื่อสินค้า (แยกไม่ได้ครึ่งหนึ่ง)", not j["name"]["on"], j["name"])
    check("ประชากร: ไฟล์สินค้ายังติ๊กคำอ่านตัวเลขบน ราคา", j["number"]["on"] and j["number"]["col"] == "ราคา", j["number"])

    j = load(real)
    check("มี Paid มาก่อน ยังเลือกคอลัมน์เลขบัตรจริงและติ๊กให้", j["id"]["on"] and j["id"]["col"] == "เลขประจำตัวผู้เสียภาษี", j["id"])

    load(two)
    p.select_option("#tool .panel .field select", "1"); p.wait_for_timeout(800)
    v = p.evaluate(VIS)
    check("ชีทว่าง: ยังเห็นช่องเลือกชีท", v["sheetSel"], v)
    check("ชีทว่าง: ไม่มีปุ่มดาวน์โหลดโผล่", not v["dl"], v)
    check("ชีทว่าง: บอกว่าชีทนี้ว่าง", "ว่าง" in v["status"], v)
    if v["sheetSel"]:
        p.select_option("#tool .panel .field select", "0"); p.wait_for_timeout(800)
        j = p.evaluate(JOBS); v = p.evaluate(VIS)
        check("กลับชีทแรกได้ งานกลับมาและปุ่มดาวน์โหลดกลับมา", j["name"]["on"] and v["dl"], (j["name"], v))
    else: check("กลับชีทแรกได้ (ช่องเลือกชีทหายไป กลับไม่ได้)", False, v)

    # หน้าเดี่ยวตระกูลคอลัมน์ (thai-address) ใช้แผงแบบเดียวกัน
    p.goto(f"{BASE}/#/thai-address", wait_until="load", timeout=60000); p.wait_for_timeout(1500)
    p.set_input_files(".dz input[type=file]", [str(two)]); p.wait_for_timeout(2500)
    p.select_option("#tool .panel .field select >> nth=0", "1"); p.wait_for_timeout(800)
    v = p.evaluate(VIS)
    check("หน้าเดี่ยว ชีทว่าง: ยังเห็นช่องเลือกชีท และไม่มีปุ่มดาวน์โหลด", v["sheetSel"] and not v["dl"], v)
    if v["sheetSel"]:
        p.select_option("#tool .panel .field select >> nth=0", "0"); p.wait_for_timeout(800)
        v = p.evaluate(VIS)
        check("หน้าเดี่ยว กลับชีทแรกได้ ปุ่มดาวน์โหลดกลับมา", v["dl"], v)
    else: check("หน้าเดี่ยว กลับชีทแรกได้ (ช่องเลือกชีทหายไป กลับไม่ได้)", False, v)

    # ④ ล่าบั๊ก F7 08/11/2026: จอ 360 หัวข้องานสองบรรทัดบีบช่องติ๊กเหลือ 14px กดยาก
    m = b.new_page(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True); m.on("pageerror", lambda e: errs.append(str(e)))
    m.goto(f"{BASE}/#/thai-suite", wait_until="load", timeout=60000); m.wait_for_timeout(1500)
    m.set_input_files(".dz input[type=file]", [str(cust)]); m.wait_for_selector(".suite-on", timeout=30000); m.wait_for_timeout(1500)
    ws = m.evaluate("() => [...document.querySelectorAll('.suite-on')].map((c) => Math.round(c.getBoundingClientRect().width))")
    check("จอ 360 ช่องติ๊กทุกงานกว้างอย่างน้อย 18px เท่ากัน", len(ws) >= 5 and min(ws) >= 18 and len(set(ws)) == 1, ws)
    m.close()

    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print("BAD", bad)
sys.exit(1 if bad else 0)
