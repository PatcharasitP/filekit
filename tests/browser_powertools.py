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

    # ‼️ ชุดพร้อมใช้ต้องเริ่มจากค่าเริ่มต้นใหม่ทุกครั้ง ไม่งั้นค่าจากชุดก่อนค้างมาปน
    #    และชิปต้องดับเมื่อผู้ใช้แก้ค่าเอง ไม่งั้นชิปโกหกว่ายังเป็นชุดนั้นอยู่
    def header_bg():
        return pg.evaluate("""() => {
          const t=[...document.querySelectorAll('.pah-preview table')].find(x=>(x.getAttribute('style')||'').includes('border-collapse'));
          return t ? getComputedStyle(t.querySelector('th')).backgroundColor : null;
        }""")

    has_card = lambda: pg.locator('.pah-preview [data-jump="cardValue"]').count()
    pg.get_by_role("button", name="กระชับ").click()
    pg.wait_for_timeout(600)
    ck("ชุดกระชับ ซ่อนการ์ดตัวเลขจริง", has_card(), 0)
    pg.get_by_role("button", name="เน้นสี").click()
    pg.wait_for_timeout(600)
    ck("ชุดเน้นสี เปลี่ยนพื้นหัวตารางจริง", header_bg(), "rgb(18, 35, 158)")
    ck("สลับชุดแล้วการ์ดกลับมา ไม่มีค่าค้างจากชุดก่อน", has_card(), 1)
    ck("ชิปติดทีละอันเท่านั้น", pg.locator(".ps-chip.on").count(), 1)
    pg.locator(".ck-hex").first.fill("#777777")
    pg.wait_for_timeout(500)
    ck("แก้ค่าเองแล้วชิปดับ ไม่โกหกว่ายังเป็นชุดนั้น", pg.locator(".ps-chip.on").count(), 0)

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

    # ชุดพร้อมใช้ของเครื่องนี้เปลี่ยนโครงทั้งชุด ไม่ใช่แค่หน้าตา
    pg.evaluate("localStorage.clear()")
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector(".pqm-code", timeout=15000)
    pg.wait_for_timeout(900)
    ck("เริ่มด้วยสองแหล่ง", pg.locator(".pqm-src").count(), 2)
    pg.get_by_role("button", name="สามแหล่ง").click()
    pg.wait_for_timeout(700)
    ck("ชุดสามแหล่ง เพิ่มแหล่งจริง", pg.locator(".pqm-src").count(), 3)
    ck("แถบชุดยังอยู่ครบหลังสร้างแผงใหม่", pg.locator(".ps-chip").count(), 3)
    pg.get_by_role("button", name="แหล่งเดียว key หลายชั้น").click()
    pg.wait_for_timeout(700)
    ck("ชุดแหล่งเดียว เหลือแหล่งเดียวจริง", pg.locator(".pqm-src").count(), 1)
    ck("และ key กลายเป็นหลายชั้น",
       pg.evaluate("""() => {
         const l=[...document.querySelector('.pqm-code code').textContent.split('\\n')].find(x=>x.includes('Keys'));
         return (l.match(/"/g) || []).length / 2;
       }"""), 3)

    # ── ④ ชุดพร้อมใช้ของกราฟโดนัท ──────────────────────────────────────
    print("\n━━ ④ กราฟโดนัท Deneb ━━")
    open_tool(pg, "pbi-donut", "#pbid-chart svg")
    pg.wait_for_timeout(1200)

    def center_font():
        return pg.evaluate("""() => {
          const t=[...document.querySelectorAll('#pbid-chart svg text')].find(x=>/^[\\d,]+$/.test(x.textContent));
          return t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : null;
        }""")

    base_font = center_font()
    pg.get_by_role("button", name="ขึ้นจอนำเสนอ").click()
    pg.wait_for_timeout(900)
    ck("ชุดขึ้นจอนำเสนอ ทำให้ตัวอักษรกลางวงใหญ่ขึ้นจริง", center_font() > base_font, True)
    ck("ชิปชุดโดนัทติดทีละอัน", pg.locator(".ps-chip.on").count(), 1)
    ck("กราฟยังวาดครบหลังใส่ชุด", pg.locator("#pbid-chart svg path").count(), 10)

    # ── ⑤ จำค่าและแชร์ด้วยลิงก์ ─────────────────────────────────────────
    print("\n━━ ⑤ จำค่าและแชร์ด้วยลิงก์ ━━")
    # ‼️ ต้องล้างก่อนเปิดเครื่องมือ ไม่ใช่หลัง เพราะเครื่องมือกู้ค่าตั้งแต่ตอน mount
    #    (ข้อ ④ กดชุดพร้อมใช้ไว้ ค่าจึงถูกจำไว้แล้ว ซึ่งเป็นพฤติกรรมที่ถูกของฟีเจอร์นี้)
    # ‼️ และต้องรอให้การบันทึกที่ตั้งเวลาไว้จากข้อก่อนเขียนเสร็จก่อนล้าง
    #    ไม่งั้นมันจะยิงหลังล้างแล้วเขียนค่าเก่ากลับมา (เจอจริงตอนเขียนเทสนี้)
    pg.wait_for_timeout(700)
    pg.evaluate("localStorage.clear()")
    open_tool(pg, "pbi-donut", "#pbid-chart svg")
    # ‼️ ล้างซ้ำแล้วโหลดใหม่ เพราะการล้างจากหน้าก่อนหน้าไม่ทันการกู้ค่าตอน mount รอบใหม่
    #    (พิสูจน์แล้วว่าล้างได้จริง แต่ค่ายังกลับมา แปลว่าจังหวะไม่ทัน ไม่ใช่ล้างไม่ติด)
    pg.evaluate("localStorage.clear()")
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector("#pbid-chart svg", timeout=15000)
    pg.wait_for_timeout(1500)
    ck("เริ่มจากไม่มีค่าจำไว้", pg.evaluate("localStorage.getItem('filekit-state-pbi-donut')"), None)

    # เปลี่ยนค่าหนึ่งตัวแล้วขอลิงก์ ดักตอนเขียนคลิปบอร์ดเพราะ headless อ่านกลับไม่ได้
    pg.evaluate("""() => {
      const s=[...document.querySelectorAll('.pbid-right select')].find(x=>[...x.options].some(o=>o.value==='bottom'));
      s.value='bottom'; s.dispatchEvent(new Event('change',{bubbles:true}));
    }""")
    pg.wait_for_timeout(900)
    link = pg.evaluate("""async () => {
      let cap=null;
      const orig=navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText=(t)=>{cap=t;return orig(t).catch(()=>{});};
      [...document.querySelectorAll('button')].find(b=>b.textContent.includes('คัดลอกลิงก์ค่านี้')).click();
      await new Promise(r=>setTimeout(r,500));
      return cap;
    }""")
    ck("ได้ลิงก์ที่มีค่าติดไปด้วย", isinstance(link, str) and "?s=" in link, True)
    # ‼️ ลิงก์ต้องเก็บเฉพาะค่าที่เปลี่ยน ถ้าเก็บทั้งชุดจะยาวจนแชร์ไม่ไหว
    ck("ลิงก์สั้นพอที่จะส่งให้คนอื่นได้ (ไม่เกิน 300 ตัวอักษร)", len(link or "") <= 300, True)

    saved = pg.evaluate("localStorage.getItem('filekit-state-pbi-donut')")
    ck("จำค่าไว้เฉพาะตัวที่เปลี่ยน", saved, '{"legendPosition":"bottom"}')

    # เปิดลิงก์ในสภาพที่ไม่มีของจำไว้เลย ค่าต้องมาจากลิงก์ล้วน ๆ
    pg.evaluate("localStorage.clear()")
    pg.goto(link, wait_until="networkidle")
    pg.wait_for_selector("#pbid-chart svg", timeout=15000)
    pg.wait_for_timeout(2200)
    ck("เปิดลิงก์แล้วได้ค่าตรงกับที่เจ้าของลิงก์ตั้งไว้",
       pg.evaluate("""() => {
         const s=[...document.querySelectorAll('.pbid-right select')].find(x=>[...x.options].some(o=>o.value==='bottom'));
         return s && s.value;
       }"""), "bottom")
    ck("กราฟยังวาดครบหลังกู้ค่าจากลิงก์", pg.locator("#pbid-chart svg path").count(), 10)
    # ‼️ ล้าง s ทิ้งหลังใช้ ไม่งั้นกดรีเฟรชแล้วเด้งกลับค่าของลิงก์ตลอด แก้ค่าเองไม่ได้
    ck("ล้างค่าออกจากแถบที่อยู่หลังใช้แล้ว", pg.evaluate("location.search"), "")

    print("\n━━ console ━━")
    ck("ไม่มี error ใน console", len([e for e in errs if "favicon" not in e]), 0)
    b.close()

print("\n" + "━" * 58)
print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทั้งหมด")
for f in fails:
    print("  ❌ " + f)
sys.exit(1 if fails else 0)
