# แถบปุ่มล่างบนมือถือ 390 หลังกดทำงาน ของเครื่องมือที่แผงขวาว่าง (.s2-work.side-empty)
# ‼️ ที่มา 29/09/2026 ภาพจอมือถือของ PDF เป็น Markdown แถบล่างเรียงสถานะ ปุ่มหลัก และปุ่มรองในแถวเดียว
#    สถานะถูกบีบเหลือกว้าง 52px จนตัวหนังสือเรียงลงทีละคำ (สูง 331px) และทับปุ่ม "ตัวเลือก"
#    ไล่ทุกเครื่องมือแล้วพังแบบเดียวกัน 4 ตัวข้างล่าง ทุกตัวอยู่โหมดแผงขวาว่าง
#    browser_mobile.py ไม่เห็นเพราะใส่ไฟล์ตัวอย่างแล้วไม่ได้กดปุ่มทำงาน ปุ่มรองกับข้อความสถานะยังไม่โผล่
# ค่าที่วัดตอนพัง (ก่อนแก้): pdf-to-text สถานะ 52x237 px, pdf-to-markdown 52x331 px ทับปุ่มตัวเลือก,
#    pdf-ocr 175x119 px, excel-to-pq 87x308 px
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
TOOLS = ["pdf-to-text", "pdf-to-markdown", "pdf-ocr", "excel-to-pq"]
STATUS_MAX_H = 80    # สองบรรทัดเต็มกว้างจอสูงราว 50px สามบรรทัดยังไม่ถึง 80
BTN_MAX_H = 60       # ปุ่มหลักสูง 56px ปุ่มที่ข้อความถูกบีบจนตัดสามบรรทัดสูงเกิน 60
P, Fa = 0, []

def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: Fa.append(f"{name} {detail}")
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok else f"\n      {detail}"))

SCAN = """() => {
  const ft = document.querySelector('.s2-side-ft'); if (!ft) return null;
  const vis = (e) => e && e.checkVisibility && e.checkVisibility();
  const parts = [...ft.querySelectorAll('.status.show, button')].filter(vis).map((e) => {
    const r = e.getBoundingClientRect();
    return { t: (e.textContent || '').trim().slice(0, 24), cls: e.className + '', x: r.left, y: r.top, w: r.width, h: r.height };
  }).filter((p) => p.w > 0 && p.h > 0);
  const ov = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 1 && iy > 1) ov.push(a.t + ' ทับ ' + b.t);
  }
  return { sideEmpty: document.querySelector('.s2-work').classList.contains('side-empty'), parts, ov };
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
    pg = ctx.new_page()
    for tid in TOOLS:
        print(f"\n━━ {tid} ━━")
        pg.goto("about:blank")
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.locator("button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
        pg.wait_for_timeout(1500)
        pg.locator("button.s2-cta:visible").first.click()
        # ‼️ รอจนข้อความสถานะโผล่ ไม่ใช่รอเวลาตายตัว (OCR ยังโหลดชุดภาษาอยู่ก็มีสถานะแล้ว)
        pg.wait_for_selector(".s2-side-ft .status.show", timeout=15000)
        pg.wait_for_timeout(1200)
        r = pg.evaluate(SCAN)
        st = [x for x in r["parts"] if "status" in x["cls"]]
        btns = [x for x in r["parts"] if "status" not in x["cls"]]
        print(f"  วัดได้ สถานะ {[(round(x['w']), round(x['h'])) for x in st]} ปุ่ม {[(x['t'], round(x['w']), round(x['h'])) for x in btns]}")
        # ข้อประชากรไม่ว่าง ถ้าเครื่องมือไม่ได้อยู่โหมดแผงขวาว่าง หรือไม่มีของให้ตรวจ ข้ออื่นเขียวลอย ๆ
        ck("อยู่โหมดแผงขวาว่าง และมีสถานะกับปุ่มให้ตรวจ", r["sideEmpty"] and len(st) == 1 and len(btns) >= 1,
           f"side-empty={r['sideEmpty']} สถานะ {len(st)} ปุ่ม {len(btns)}")
        ck("ไม่มีชิ้นไหนทับกัน", not r["ov"], "; ".join(r["ov"]))
        ck(f"ข้อความสถานะไม่ถูกบีบ สูงไม่เกิน {STATUS_MAX_H}px", all(x["h"] <= STATUS_MAX_H for x in st),
           str([(round(x["w"]), round(x["h"])) for x in st]))
        ck(f"ปุ่มไม่ถูกบีบ สูงไม่เกิน {BTN_MAX_H}px", all(x["h"] <= BTN_MAX_H for x in btns),
           str([(x["t"], round(x["w"]), round(x["h"])) for x in btns if x["h"] > BTN_MAX_H]))
        # ‼️ แผงขวาว่าง กดปุ่มตัวเลือกแล้วได้แผ่นเปล่า ปุ่มนี้จึงต้องไม่โผล่
        ck("ไม่มีปุ่ม ตัวเลือก ที่เปิดแล้วว่างเปล่า", not any("s2-sheetbtn" in x["cls"] for x in btns))
        # ‼️ เจอ 29/09/2026 หลังแก้รอบแรก ปุ่มหลักเยื้องเข้ามา 10px เพราะ span ว่างที่จองที่ไว้ยังค้างในแถว
        cta = [x for x in btns if "s2-cta" in x["cls"]]
        ck("ปุ่มหลักตรงแนวซ้ายกับกล่องสถานะ", len(cta) == 1 and len(st) == 1 and abs(cta[0]["x"] - st[0]["x"]) <= 2,
           str([(round(x["x"]), x["t"]) for x in cta + st]))
        ck("ทุกชิ้นอยู่ในความกว้างจอ", all(x["x"] >= -1 and x["x"] + x["w"] <= 391 for x in r["parts"]),
           str([(x["t"], round(x["x"]), round(x["w"])) for x in r["parts"] if x["x"] + x["w"] > 391]))
    b.close()

print("\n" + "━" * 52)
print(f"ผ่าน {P} ตก {len(Fa)}")
if Fa:
    print("\nรายการที่ตก:"); [print(f"  {i + 1}. {f}") for i, f in enumerate(Fa)]
    raise SystemExit(1)
