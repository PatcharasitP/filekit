import sys, pathlib
from playwright.sync_api import sync_playwright
BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")  # ตั้ง FK_BASE เพื่อยิงใส่เว็บจริง
P, F = 0, []
def ck(n, got, want, contains=False):
    global P
    ok = (str(want) in str(got)) if contains else (got == want)
    if ok: P += 1
    else: F.append(f"{n}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {n}")

# ‼️ ตัววัดรุ่นแรกอ่านแค่ค่า R,G,B ของพื้นหลัง โดยไม่สนใจ alpha → พื้นแบบ
#    color-mix(...12%, transparent) ถูกคิดเป็นสีทึบ ทำให้ "ผ่านหลอก" (วัดได้ 11.83 ทั้งที่ของจริง 1.34)
#    รุ่นนี้ไล่เก็บพื้นหลังทุกชั้นแล้วผสมย้อนขึ้นมาแบบเดียวกับที่เบราว์เซอร์วาดจริง
CONTRAST = """(sel)=>{
  // ‼️ เบราว์เซอร์คืนสีได้ 2 รูปแบบ: rgb()/rgba() ค่า 0-255 กับ color(srgb …) ค่า 0-1
  //    ถ้าอ่านแบบเดียวจะเพี้ยนหนัก — สีขาว color(srgb 1 1 1) จะถูกอ่านเป็นเกือบดำ
  const px = s => {
    const n = (s.match(/-?[\\d.]+(?:e-?\\d+)?/g) || []).map(Number);
    if (!n.length) return [];
    if (/^color\\(/.test(s.trim())) { const [r,g,b,a] = n; return a === undefined ? [r*255,g*255,b*255] : [r*255,g*255,b*255,a]; }
    return n;
  };
  const over = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => fg[i]*a + bg[i]*(1-a)); };
  const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const el = document.querySelector(sel); if(!el) return null;
  const layers = []; let n = el;
  while (n) { const st = getComputedStyle(n);
    if (/gradient/.test(st.backgroundImage)) { const c = st.backgroundImage.match(/rgba?\\([^)]+\\)/g); if (c) layers.push(px(c[0])); }
    const bc = px(st.backgroundColor);
    if (bc.length >= 3 && (bc[3] === undefined || bc[3] > 0)) layers.push(bc);
    n = n.parentElement; }
  layers.push([255,255,255]);
  let bg = layers[layers.length-1];
  for (let i = layers.length-2; i >= 0; i--) bg = over(layers[i], bg);
  const fg = over(px(getComputedStyle(el).color), bg);
  const a = L(fg), b = L(bg), hi = Math.max(a,b), lo = Math.min(a,b);
  return Math.round(((hi+0.05)/(lo+0.05))*100)/100;
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":1280,"height":950})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(BASE, wait_until="networkidle")

    print("\n━━ ① โครงหน้าแรก ━━")
    ck("ป้ายเครื่องมือครบ 27 ใบ", pg.locator("button.pill").count(), 27)
    ck("มีแถบหมวด 9 ปุ่ม (ทั้งหมด + 8 หมวด)", pg.locator(".cat").count(), 9)
    ck("ปุ่ม 'ทั้งหมด' บอกจำนวนถูก", pg.locator(".cat").first.inner_text().replace("\n","").replace(" ",""), "ทั้งหมด27")
    ck("มีลิงก์ข้ามไปเนื้อหา (skip link)", pg.locator("a.skip").count(), 1)
    ck("แถบสถิติโชว์จำนวนเครื่องมือจริง", pg.locator("#fact-n").inner_text(), "27")

    print("\n━━ ② กรองตามหมวด ━━")
    pg.locator(".cat", has_text="งานไทย").click(); pg.wait_for_timeout(250)
    ck("กดหมวดงานไทย → เหลือ 4 ใบ", pg.locator("button.pill, button.card").count(), 4)
    ck("ปุ่มหมวดขึ้นสถานะถูกเลือก", pg.locator('.cat[aria-pressed="true"]').inner_text().replace("\n","").replace(" ",""), "งานไทย4")
    pg.locator(".cat", has_text="งานไทย").click(); pg.wait_for_timeout(250)
    ck("กดซ้ำ → กลับมาครบ 27", pg.locator("button.pill, button.card").count(), 27)

    print("\n━━ ③ ค้นหา ━━")
    q = pg.locator("#q")
    q.fill("บาทถ้วน"); pg.wait_for_timeout(300)
    ck("พิมพ์ 'บาทถ้วน' → ตัวแรกคือเครื่องมือบาทถ้วน",
       pg.locator("button.pill, button.card").first.get_attribute("data-id"), "thai-number")
    ck("บอกจำนวนที่พบ", pg.locator("#hits").inner_text(), "พบ", contains=True)
    q.fill("ไฟล์"); pg.wait_for_timeout(300)
    ck("ไฮไลต์คำที่ตรงในชื่อ", pg.locator("button.pill mark, button.card mark").first.inner_text(), "ไฟล์")
    q.fill("i;,"); pg.wait_for_timeout(300)   # ลืมสลับแป้น = พิมพ์ "รวม"
    ck("ลืมสลับแป้น 'i;,' → เจอรวมไฟล์ PDF",
       pg.locator("button.pill, button.card").first.get_attribute("data-id"), "pdf-merge")
    q.fill("zzzxyq"); pg.wait_for_timeout(300)
    ck("ไม่เจอ → ขึ้นข้อความช่วยเหลือ", pg.locator(".empty b").inner_text(), "ไม่พบเครื่องมือ", contains=True)
    pg.locator(".empty button").click(); pg.wait_for_timeout(250)
    ck("กดปุ่มล้างในหน้าไม่เจอ → กลับมาครบ", pg.locator("button.pill, button.card").count(), 27)

    print("\n━━ ④ คีย์บอร์ด ━━")
    pg.locator("body").click(position={"x":5,"y":400})
    pg.keyboard.press("/")
    ck("กด / → โฟกัสไปช่องค้นหา", pg.evaluate("document.activeElement.id"), "q")
    pg.keyboard.press("Escape")
    pg.locator("body").click(position={"x":5,"y":400})
    pg.keyboard.press("Control+k")
    ck("กด Ctrl+K → โฟกัสไปช่องค้นหา", pg.evaluate("document.activeElement.id"), "q")
    pg.locator("#q").press("ArrowDown")
    ck("ลูกศรลงจากช่องค้นหา → ไปเครื่องมือตัวแรก", pg.evaluate("document.activeElement.className"), "pill")
    first = pg.evaluate("document.activeElement.dataset.id")
    pg.keyboard.press("ArrowRight")
    ck("ลูกศรขวา → ย้ายไปการ์ดถัดไป", pg.evaluate("document.activeElement.dataset.id") != first, True)

    print("\n━━ ⑤ สลับธีม / มุมมองแบบแน่น ━━")
    pg.locator("#theme").click(); pg.wait_for_timeout(150)
    t1 = pg.evaluate("document.documentElement.dataset.theme")
    ck("กดสลับธีมครั้งแรก → โหมดสว่าง", t1, "light")
    ck("พื้นหลังเปลี่ยนเป็นสีสว่างจริง (สว่างกว่า 90%)",
       pg.evaluate("""() => { const m = getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g).map(Number);
         return (m[0]+m[1]+m[2])/3 > 230; }"""), True)
    pg.locator("#theme").click(); pg.wait_for_timeout(150)
    ck("กดอีกครั้ง → โหมดมืด", pg.evaluate("document.documentElement.dataset.theme"), "dark")
    pg.reload(wait_until="networkidle")
    ck("จำธีมไว้หลังรีเฟรช", pg.evaluate("document.documentElement.dataset.theme"), "dark")
    pg.locator("#theme").click(); pg.wait_for_timeout(150)   # กลับเป็น auto

    # ปุ่มสลับมุมมองถูกถอดออก (พี่ปอนด์ถามว่าจำเป็นไหม 08/09) — เหลือมุมมองป้ายกลมอย่างเดียว
    # แถว "เพิ่งใช้ล่าสุด" ที่เคยอยู่เฉพาะมุมมองละเอียด ย้ายมาเป็นแถวป้ายกลมบนสุดแล้ว
    ck("ไม่มีปุ่มสลับมุมมองแล้ว", pg.locator("#density").count(), 0)
    ck("มีปุ่มเปลี่ยนภาษาแทน", pg.locator("#lang").count(), 1)
    ck("เครื่องมือทุกตัวแสดงเป็นป้ายกลม", pg.locator(".pill").count(), 27)
    ck("ไม่มีการ์ดแบบเก่าเหลืออยู่", pg.locator("button.card").count(), 0)

    print("\n━━ ⑥ ความคมชัดสี (WCAG AA ต้อง ≥ 4.5) ━━")
    for scheme, label in [("dark","โหมดมืด"), ("light","โหมดสว่าง")]:
        pg.evaluate(f"document.documentElement.dataset.theme='{scheme}'"); pg.wait_for_timeout(120)
        for sel, name in [(".pill","ป้ายเครื่องมือ"), (".stage-h","หัวข้อในแผง"),
                          ("footer","ท้ายหน้า"), (".fact span","ป้ายในแถบสถิติ"), ('.cat:not([aria-pressed="true"])',"ปุ่มหมวดที่ยังไม่เลือก"),
                          (".fact b","ตัวเลขในแถบสถิติ"), (".hero p","คำโปรย")]:
            r = pg.evaluate(CONTRAST, sel)
            ck(f"{label} · {name} = {r}:1", r is not None and r >= 4.5, True)
    # ทุกหมวดมีสีของตัวเอง ต้องไล่ตรวจให้ครบทุกปุ่มตอน "ถูกเลือก" ไม่ใช่ดูแค่ปุ่มแรก
    for scheme, label in [("dark","โหมดมืด"), ("light","โหมดสว่าง")]:
        pg.evaluate(f"document.documentElement.dataset.theme='{scheme}'")
        worst, worst_name = 99, ""
        n = pg.locator(".cat").count()
        for i in range(n):
            name = pg.locator(".cat").nth(i).inner_text().split("\n")[0].strip()
            pg.locator(".cat").nth(i).click(); pg.wait_for_timeout(120)
            r = pg.evaluate(CONTRAST, '.cat[aria-pressed="true"]')
            if r and r < worst: worst, worst_name = r, name
            pg.locator(".cat").nth(i).click(); pg.wait_for_timeout(80)
        ck(f"{label} · ปุ่มหมวดตอนถูกเลือก ทุกสีผ่าน (แย่สุด “{worst_name}” = {worst}:1)", worst >= 4.5, True)
    pg.evaluate("delete document.documentElement.dataset.theme")

    print("\n━━ ⑦ มือถือ 390px ━━")
    m = b.new_page(viewport={"width":390,"height":844})
    m.goto(BASE, wait_until="networkidle"); m.wait_for_timeout(600)
    ck("ไม่ล้นแนวนอน", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True)
    h = m.evaluate("document.documentElement.scrollHeight")
    ck(f"ความสูงหน้าลดจาก 3137px เหลือ {h}px (ต้อง ≤ 2400)", h <= 2400, True)
    small = m.evaluate("""() => [...document.querySelectorAll('button, a.skip, input, select')]
      .filter(e => e.offsetParent !== null)
      .map(e => { const r = e.getBoundingClientRect(); return {t: e.className || e.tagName, w: Math.round(r.width), h: Math.round(r.height)}; })
      .filter(o => o.h < 36 && o.h > 0)""")
    small = [o for o in small if o["t"] != "INPUT"]   # input อยู่ในกล่อง .search/.dz ที่สูง 44px+ อยู่แล้ว
    ck(f"ไม่มีปุ่มที่เตี้ยกว่า 36px (พบ {len(small)})", len(small), 0)
    if small: print("      ", small[:4])
    m.close()

    real = [e for e in errs if "favicon" not in e.lower()]
    ck(f"ไม่มี error ใน console (พบ {len(real)})", len(real), 0)
    for e in real[:3]: print("      ⚠️", e[:130])
    b.close()

print("\n" + "━"*56); print(f"ผ่าน {P} · ตก {len(F)}")
if F:
    print("\nรายการที่ตก:")
    for i, x in enumerate(F,1): print(f"  {i}. {x}")
    sys.exit(1)
