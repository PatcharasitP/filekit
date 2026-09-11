import sys, pathlib
from playwright.sync_api import sync_playwright

# จำนวนเครื่องมืออ่านจากทะเบียนจริง ไม่ฮาร์ดโค้ด — เพิ่มเครื่องมือแล้วเทสไม่แดงเอง
def _tool_count():
    import subprocess, json, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    out = subprocess.run(["node", "--input-type=module", "-e",
        'import {TOOLS} from "./src/registry.js"; console.log(TOOLS.length)'],
        cwd=str(root), capture_output=True, text=True, check=True).stdout.strip()
    return int(out)

# จำนวนหมวดก็อ่านจากทะเบียนเช่นกัน — เดิมฮาร์ดโค้ดไว้ 9 พอเพิ่มหมวด Power Query
# กับ Power Automate เทสก็แดงเองทั้งที่หน้าเว็บถูกต้อง (เจอจริง 11/09/2026)
def _group_count():
    import subprocess, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    out = subprocess.run(["node", "--input-type=module", "-e",
        'import {GROUPS} from "./src/registry.js"; console.log(GROUPS.length)'],
        cwd=str(root), capture_output=True, text=True, check=True).stdout.strip()
    return int(out)

N_TOOLS = _tool_count()
N_GROUPS = _group_count()

# จำนวนเครื่องมือในหมวดหนึ่ง ๆ — อ่านจากทะเบียนเช่นกัน
def _group_count(gid):
    import subprocess, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    out = subprocess.run(["node", "--input-type=module", "-e",
        f'import {{TOOLS}} from "./src/registry.js"; console.log(TOOLS.filter(t=>t.group==="{gid}").length)'],
        cwd=str(root), capture_output=True, text=True, check=True).stdout.strip()
    return int(out)

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
    ck(f"ป้ายเครื่องมือครบ {N_TOOLS} ใบ", pg.locator("button.pill").count(), N_TOOLS)
    ck(f"มีแถบหมวด {N_GROUPS + 1} ปุ่ม (ทั้งหมด + {N_GROUPS} หมวด)", pg.locator(".cat").count(), N_GROUPS + 1)
    ck("ปุ่ม 'ทั้งหมด' บอกจำนวนถูก", pg.locator(".cat").first.inner_text().replace("\n","").replace(" ",""), f"ทั้งหมด{N_TOOLS}")
    ck("มีลิงก์ข้ามไปเนื้อหา (skip link)", pg.locator("a.skip").count(), 1)
    ck("แถบสถิติโชว์จำนวนเครื่องมือจริง", pg.locator("#fact-n").inner_text(), str(N_TOOLS))

    print("\n━━ ② กรองตามหมวด ━━")
    pg.locator(".cat", has_text="งานไทย").click(); pg.wait_for_timeout(250)
    _thai_n = _group_count("thai")
    ck(f"กดหมวดงานไทย → เหลือ {_thai_n} ใบ", pg.locator("button.pill, button.card").count(), _thai_n)
    ck("ปุ่มหมวดขึ้นสถานะถูกเลือก", pg.locator('.cat[aria-pressed="true"]').inner_text().replace("\n","").replace(" ",""), f"งานไทย{_thai_n}")
    pg.locator(".cat", has_text="งานไทย").click(); pg.wait_for_timeout(250)
    ck(f"กดซ้ำ → กลับมาครบ {N_TOOLS}", pg.locator("button.pill, button.card").count(), N_TOOLS)

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
    ck("กดปุ่มล้างในหน้าไม่เจอ → กลับมาครบ", pg.locator("button.pill, button.card").count(), N_TOOLS)

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
    # ‼️ ปุ่มธีมเหลือ 2 สถานะ (สว่าง/มืด) · ก่อนเลือกเองยังตามเครื่อง
    #    กดครั้งแรก = สลับไปตรงข้ามกับ "ที่เห็นอยู่ตอนนี้" ไม่ใช่ไปสว่างเสมอ
    sysDark = pg.evaluate("matchMedia('(prefers-color-scheme: dark)').matches")
    want1 = "light" if sysDark else "dark"
    pg.locator("#theme").click(); pg.wait_for_timeout(150)
    ck(f"กดครั้งแรก → สลับตรงข้ามกับที่เห็นอยู่ ({want1})",
       pg.evaluate("document.documentElement.dataset.theme"), want1)
    bright = pg.evaluate("""() => { const m = getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g).map(Number);
         return (m[0]+m[1]+m[2])/3; }""")
    ck(f"พื้นหลังเปลี่ยนตามจริง ({'มืด' if want1=='dark' else 'สว่าง'})",
       (bright < 60) if want1 == "dark" else (bright > 230), True)
    want2 = "dark" if want1 == "light" else "light"
    pg.locator("#theme").click(); pg.wait_for_timeout(150)
    ck(f"กดอีกครั้ง → กลับไปอีกโหมด ({want2})", pg.evaluate("document.documentElement.dataset.theme"), want2)
    pg.reload(wait_until="networkidle")
    ck("จำธีมไว้หลังรีเฟรช", pg.evaluate("document.documentElement.dataset.theme"), want2)
    ck("ปุ่มธีมโชว์ไอคอนเดียวเสมอ (ไม่มีไอคอนที่สามที่ต้องเดาความหมาย)",
       pg.evaluate("""() => [...document.querySelectorAll('#theme svg')]
         .filter(s => getComputedStyle(s).display !== 'none').length"""), 1)

    # ปุ่มสลับมุมมองถูกถอดออก (พี่ปอนด์ถามว่าจำเป็นไหม 08/09) — เหลือมุมมองป้ายกลมอย่างเดียว
    # แถว "เพิ่งใช้ล่าสุด" ที่เคยอยู่เฉพาะมุมมองละเอียด ย้ายมาเป็นแถวป้ายกลมบนสุดแล้ว
    ck("ไม่มีปุ่มสลับมุมมองแล้ว", pg.locator("#density").count(), 0)
    ck("มีปุ่มเปลี่ยนภาษาแทน", pg.locator("#lang").count(), 1)
    ck(f"เครื่องมือทุกตัวแสดงเป็นป้ายกลม", pg.locator(".pill").count(), N_TOOLS)
    ck("ไม่มีการ์ดแบบเก่าเหลืออยู่", pg.locator("button.card").count(), 0)

    # ‼️ ไอคอนทุกตัวต้องถูก "ลากเส้น" ไม่ใช่ "ระบายทึบ"
    #    08/09 ลบกฎ .ico-svg ทิ้งพร้อมบล็อกมุมมองการ์ด (มันเป็นกฎกลาง ไม่ใช่ของการ์ด)
    #    → path ถูก fill ดำแทน stroke ไอคอนกลายเป็นก้อนทึบเหมือนกันหมดทั้ง 27 ตัว
    #    เทสเดิมทั้งชุดไม่มีใครจับได้เลย เพราะทุกตัวเช็คแค่ว่า "มี svg อยู่ไหม"
    ICON_STROKE = """() => {
      const bad = [];
      for (const s of document.querySelectorAll(".ico-svg")) {
        const c = getComputedStyle(s);
        if (c.fill !== "none" || c.stroke === "none")
          bad.push((s.closest(".pill")?.textContent || "?").trim() + " fill=" + c.fill + " stroke=" + c.stroke);
      }
      return bad;
    }"""
    ck("ไอคอนทุกตัววาดเป็นเส้น ไม่ใช่ก้อนทึบ", pg.evaluate(ICON_STROKE), [])
    ck("มีไอคอนครบทุกป้าย", pg.locator(".pill .ico-svg").count(), N_TOOLS)

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
    # ‼️ เดิมคุมเป็นเพดานตายตัว 2400px ซึ่งเป็นค่าที่ถูกล็อกไว้ตอนมีเครื่องมือน้อยกว่านี้
    #    พอเพิ่มเครื่องมือตามที่พี่ปอนด์สั่ง เพดานก็แตกทุกครั้งทั้งที่หน้าไม่ได้หลวมขึ้นเลย
    #    สิ่งที่ตั้งใจจะคุมจริงคือ "ความแน่น" ไม่ใช่ความสูงดิบ จึงวัดเป็นพิกเซลต่อเครื่องมือแทน
    #    (11/09/2026 วัดได้ 67.8 px/ตัว ที่ 39 เครื่องมือ · เพดาน 75 ยังจับการถอยหลังได้สบาย)
    per = h / N_TOOLS
    ck(f"ความแน่นหน้าแรก {per:.1f} px ต่อเครื่องมือ ที่ {N_TOOLS} ตัว รวม {h}px (ต้อง ≤ 75)", per <= 75, True)
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
