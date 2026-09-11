"""เทสเจาะลึกเครื่องมือสาย Power Platform ที่ "สร้างโค้ดให้คนเอาไปใช้จริง"

ต่างจาก browser_smoke.py ที่ดูแค่ว่าเปิดได้ ไฟล์นี้ตรวจ "เนื้อโค้ดที่ผู้ใช้จะก็อปไป"
เพราะเครื่องมือกลุ่มนี้ผิดแล้วเสียหายจริง โค้ดที่ผิดจะไปโผล่ใน flow หรือรายงานของคนอื่น

รัน: python3 -m http.server 8899 &  แล้ว ../.venv/bin/python tests/browser_powertools.py
"""
import sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []


def ck(label, got, want):
    ok = got == want
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        print(f"      ได้    : {got}\n      ควรได้ : {want}")
        fails.append(label)


def open_tool(pg, tool_id, wait_for):
    pg.goto(f"{BASE}/#{tool_id}", wait_until="networkidle")
    pg.wait_for_selector(wait_for, timeout=15000)
    pg.wait_for_timeout(700)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    # ── ① ตาราง HTML สำหรับอีเมล ──────────────────────────────────────
    print("\n━━ ① ตาราง HTML สำหรับอีเมลใน flow ━━")
    open_tool(pg, "pa-html-table", ".pah-preview")

    # ‼️ ป้ายที่ใช้ทำ "คลิกแล้วกระโดดไปช่อง" ต้องอยู่แค่ในพรีวิว
    #    ถ้าหลุดไปในโค้ดที่ก็อป ผู้ใช้จะได้ attribute แปลกปลอมติดไปใน flow ด้วย
    def code_of(tab_text):
        pg.get_by_role("button", name=tab_text).click()
        pg.wait_for_timeout(400)
        return pg.locator(".pah-code code").inner_text()

    html = code_of("HTML สำหรับ Compose")
    jsn = code_of("JSON วางลง flow")
    ck("HTML ที่ก็อปไม่มีป้ายกระโดดติดไป", "data-jump" in html, False)
    ck("JSON ที่ก็อปไม่มีป้ายกระโดดติดไป", "data-jump" in jsn, False)

    # ‼️ Power Automate ไม่ตีความ backslash เป็น escape หลุดไปแล้วสไตล์พังเงียบ
    ck("HTML ที่ก็อปไม่มี backslash หน้าเครื่องหมายคำพูด", ("\\\"" in html) or ("\\'" in html), False)

    # เส้นขอบต้อง inline รายช่อง ไม่งั้น Outlook เดสก์ท็อปตัดทิ้งจนตารางไม่มีเส้น
    ck("สูตรใส่เส้นขอบให้ทั้ง th และ td", ("<th style=" in html) and ("<td style=" in html), True)

    pg.get_by_role("button", name="พรีวิว").click()
    pg.wait_for_timeout(400)

    # คลิกหัวตารางในพรีวิว ต้องพาไปช่องหัวตารางของคอลัมน์นั้นจริง
    th = pg.locator(".pah-preview th").nth(2)
    want = th.inner_text()
    th.click()
    pg.wait_for_timeout(600)
    ck("คลิกหัวตารางแล้วโฟกัสไปช่องของคอลัมน์นั้น",
       pg.evaluate("document.activeElement && document.activeElement.value"), want)

    # ทุกช่องในตารางตัวอย่างต้องมีเส้นขอบจริงตอนเรนเดอร์ ไม่ใช่แค่มีในข้อความ
    cells_no_border = pg.evaluate("""() => {
      const pv = document.querySelector('.pah-preview');
      const t = [...pv.querySelectorAll('table')].find(x => (x.getAttribute('style')||'').includes('border-collapse'));
      if (!t) return -1;
      return [...t.querySelectorAll('th,td')].filter(e => getComputedStyle(e).borderTopWidth !== '1px').length;
    }""")
    ck("ทุกช่องในตารางตัวอย่างมีเส้นขอบจริง (วัดด้วย getComputedStyle)", cells_no_border, 0)

    # ── ② ตารางเป็น Schema ของ Parse JSON ─────────────────────────────
    print("\n━━ ② ตารางเป็น Schema ของ Parse JSON ━━")
    open_tool(pg, "pa-parse-json", ".dz")
    # ยังไม่เปิดไฟล์ ต้องยังไม่มีโค้ดหลอกให้ก็อป
    ck("ยังไม่เปิดไฟล์ = ยังไม่มีโค้ดให้ก็อป", pg.locator(".paj-code code").inner_text().strip(), "")

    # ── ③ สร้างสูตรค้นข้ามหลายแหล่ง ────────────────────────────────────
    print("\n━━ ③ สร้างสูตรค้นข้ามหลายแหล่ง ━━")
    open_tool(pg, "pq-multisource-lookup", ".pqm-code")
    m = pg.locator(".pqm-code code").inner_text()
    ck("เรียกฟังก์ชันที่มีอยู่จริง ไม่ได้เขียนใหม่", "fnMultiSourceFallbackLookup(" in m, True)
    # ‼️ หัวใจของเครื่องนี้: ผลลัพธ์ชื่อเดียวรับมาจากคอลัมน์คนละชื่อในแต่ละแหล่งได้
    ck("payload ชื่อเดียวรับจากคอลัมน์คนละชื่อได้",
       ('Company = "Company"' in m) and ('Company = "CSType"' in m), True)
    # ชื่อที่ไม่ใช่ตัวระบุ M ธรรมดาต้องถูกครอบ #"..." ไม่งั้นคิวรีพัง
    ck('ชื่อที่มีเว้นวรรคถูกครอบ #"..."', '#"SITE OWNER"' in m, True)
    ck("ชื่อภาษาไทยถูกครอบด้วย", '#"ตารางหลัก"' in m, True)

    print("\n━━ console ━━")
    ck("ไม่มี error ใน console", len([e for e in errs if "favicon" not in e]), 0)
    b.close()

print("\n" + "━" * 58)
print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทั้งหมด")
for f in fails:
    print("  ❌ " + f)
sys.exit(1 if fails else 0)
