"""ชิปไฟล์ PDF ต้องบอกจำนวนหน้า โดยไม่ลากไลบรารีหนักมาเพิ่ม

‼️ ที่มา เดินเส้นทางจริงบนเว็บคู่แข่ง 11/09/2026 พบว่า iLovePDF, Smallpdf, PDF24
   บอกจำนวนหน้าของแต่ละไฟล์ตั้งแต่ยังไม่สั่งทำงาน ส่วน FileKit ต้องกดเปิดกล่องดูไฟล์
   ก่อนถึงจะรู้ และในเครื่องมืออย่างรวม PDF ที่ต้องจัดลำดับไฟล์ ชิปทุกใบหน้าตาเหมือนกันหมด

‼️ ข้อจำกัดที่ต้องเคารพ วัดจริงแล้ว pdf.min.js 312 KB + worker 1,061 KB รวม 1.37 MB
   แพงเกินกว่าจะจ่ายเพื่อข้อมูลประดับ (คู่แข่งเรนเดอร์ฝั่งเซิร์ฟเวอร์ จึงไม่จ่ายค่านี้)
   ทางแก้ของเราคือใช้เฉพาะไลบรารีที่เครื่องมือนั้นโหลดอยู่แล้ว
   กลุ่มรวม/แยก/ลายน้ำ มี pdf-lib · กลุ่มแปลง/อ่าน มี pdf.js · ทั้งคู่บอกจำนวนหน้าได้

เทสนี้ตรวจ 5 อย่าง
   ① ชิป PDF บอกจำนวนหน้า และเป็น "เลขที่ถูก" ไม่ใช่แค่มีตัวเลข
   ② ยืนยันไขว้ ผลรวมจำนวนหน้าของไฟล์เข้า ต้องเท่ากับจำนวนหน้าของไฟล์ที่รวมออกมา
   ③ ‼️ ห้ามโหลด pdf.js เพิ่มเพื่อการนี้ (ตรวจจาก network จริง)
   ④ ไฟล์ที่ไม่ใช่ PDF ต้องไม่ขึ้นจำนวนหน้า
   ⑤ ลบไฟล์ออกแล้วเลขของไฟล์ที่เหลือต้องไม่เลื่อนไปผิดใบ

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_pdfpages.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []
# ตัวอย่างจริงในคลัง — นับด้วยมือแล้ว ถ้าไฟล์ตัวอย่างเปลี่ยน เทสนี้ต้องแดงให้รู้
EXPECT = {"ตัวอย่าง-รายงานประจำเดือน.pdf": 3, "ตัวอย่าง-ใบปะหน้าเอกสาร.pdf": 2}
# เครื่องมือที่ใช้ pdf-lib (ไม่มี pdf.js) กับที่ใช้ pdf.js — ต้องได้ผลเหมือนกันทั้งสองทาง
VIA_PDFLIB = ["pdf-merge", "pdf-split", "pdf-watermark", "pdf-page-numbers"]
VIA_PDFJS  = ["pdf-to-word", "pdf-pages"]

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

def go(pg, route):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{route}", wait_until="networkidle")
    pg.wait_for_timeout(700)

def chips(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.file-row')].map(r => ({
        name: (r.querySelector('.f-name')||{}).textContent || '',
        pages: (r.querySelector('.f-pages')||{}).textContent || ''}))""")

def num(txt):
    m = re.search(r"(\d+)", txt or "")
    return int(m.group(1)) if m else None

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 950})
    pg = ctx.new_page()
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))

    seen = 0
    for tool in VIA_PDFLIB + VIA_PDFJS:
        go(pg, tool)
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
        pg.wait_for_timeout(3200)
        rows = chips(pg)
        for r in rows:
            want = EXPECT.get(r["name"].strip())
            if want is None:
                continue
            seen += 1
            got = num(r["pages"])
            if got != want:
                ck(f"① {tool}: {r['name']} ต้องขึ้น {want} หน้า", False, f"ได้ {r['pages']!r}")
    # ‼️ กันกับดักประชากรศูนย์ — ถ้าตัวอ่านชิปพัง ลูปข้างบนจะไม่ตรวจอะไรเลยแล้วเขียวหลอก
    ck(f"① ตรวจชิป PDF ได้ {seen} ใบ และจำนวนหน้าถูกทุกใบ", seen >= 6 and not fails,
       f"ตรวจได้แค่ {seen} ใบ" if seen < 6 else "")

    # ② ยืนยันไขว้กับผลลัพธ์จริงของเครื่องมือ
    go(pg, "pdf-merge")
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(3200)
    total = sum(num(r["pages"]) or 0 for r in chips(pg))
    pg.get_by_role("button", name="รวมไฟล์").first.click()
    pg.wait_for_timeout(4000)
    out = num(pg.evaluate("""() => {const s = document.querySelector('.result .r-name small');
        return s ? s.textContent : '';}"""))
    ck("② ผลรวมหน้าของไฟล์เข้า เท่ากับจำนวนหน้าของไฟล์ที่รวมออกมา",
       total > 0 and total == out, f"รวมจากชิป {total}, ไฟล์ผลลัพธ์ {out}")

    # ③ ห้ามลาก pdf.js เข้ามาเพื่อการนี้
    # ‼️ พิสูจน์แล้วว่าข้อนี้แดงเป็นจริง: บังคับให้ ensurePageCount ดึง pdfjs ก่อนเสมอ
    #    แล้วข้อนี้แดงทันทีพร้อมชื่อไฟล์ vendor/pdf.min.js
    #    (ครั้งแรกที่ลองใส่บั๊กแบบ "โหลดเมื่อไม่มีไลบรารีเลย" ไม่แดง เพราะกิ่งนั้นไม่มีวันทำงาน
    #     บนเครื่องมือที่มี pdf-lib อยู่แล้ว — บั๊กที่ใส่ไม่ถึงจุด ไม่ได้แปลว่าเทสอ่อน)
    reqs.clear()
    go(pg, "pdf-merge")
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(3500)
    pulled = [u for u in reqs if re.search(r"pdf\.(worker\.)?min\.js", u)]
    ck("③ เครื่องมือที่ใช้ pdf-lib ต้องไม่โหลด pdf.js เพิ่มเพื่อการนี้ (1.37 MB)",
       len(pulled) == 0, f"โหลดมา {len(pulled)} ไฟล์: {pulled[:2]}")

    # ④ ไฟล์ที่ไม่ใช่ PDF ต้องไม่โชว์จำนวนหน้า
    bad = []
    for tool in ["image-convert", "word-to-pdf"]:
        go(pg, tool)
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
        pg.wait_for_timeout(2500)
        bad += [r["name"] for r in chips(pg) if (r["pages"] or "").strip()]
    ck("④ ไฟล์ที่ไม่ใช่ PDF ไม่ขึ้นจำนวนหน้า", not bad, f"ขึ้นผิดที่: {bad}")

    # ⑤ ลบไฟล์แล้วเลขต้องตามใบที่เหลือ ไม่เลื่อนผิด
    go(pg, "pdf-merge")
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(3200)
    pg.evaluate("""() => {const b = document.querySelector('.file-row[data-i="0"] .icon-btn.danger'); if (b) b.click();}""")
    pg.wait_for_timeout(1500)
    left = chips(pg)
    ok5 = len(left) == 1 and num(left[0]["pages"]) == EXPECT.get(left[0]["name"].strip())
    ck("⑤ ลบไฟล์แรกแล้ว ใบที่เหลือยังโชว์เลขของตัวเอง", ok5, f"เหลือ {left}")

    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
