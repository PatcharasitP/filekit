"""เทสการเข้าถึง (accessibility) ของ FileKit — คีย์บอร์ดล้วน + โปรแกรมอ่านหน้าจอ

‼️ ตรวจ "ใช้ได้จริง" ไม่ใช่แค่ "attribute มีอยู่" — ทุกค่าที่เทียบ อ่านจาก DOM/computed style
   จริงหลัง action จริง (ไม่เดา ไม่ hardcode ค่าที่คาดหวังโดยไม่ได้วัดก่อน)
   ดู War-story วิธีวัด: tests/README.md § พิสูจน์เครื่องมือตรวจก่อนเชื่อผล

รัน: เปิดเซิร์ฟเวอร์ที่ 8922 ก่อน แล้ว
  ../.venv/bin/python tests/browser_a11y.py
ยิงใส่เว็บจริง: FK_BASE=https://... ../.venv/bin/python tests/browser_a11y.py
"""
import os, re, sys, pathlib
from collections import Counter
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8922")
SAMPLES = ROOT / "samples"
REG_IDS = re.findall(r'id:"([\w-]+)"', (ROOT / "src/registry.js").read_text(encoding="utf-8"))

P, F = 0, []
def ck(n, got, want, contains=False):
    global P
    ok = (str(want) in str(got)) if contains else (got == want)
    if ok: P += 1
    else: F.append(f"{n}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {n}")

def ck_true(n, cond, detail=""):
    global P
    if cond: P += 1
    else: F.append(f"{n}" + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if cond else '❌'} {n}" + (f"  — {detail}" if (detail and not cond) else ""))

# ── ตัววัดคอนทราสต์ของ "วงโฟกัส" (outline หรือ border ที่แทนที่ outline) ──
# ใช้เทคนิคผสม alpha แบบเดียวกับ tests/browser_ux.py (พิสูจน์มาแล้วว่าอ่าน color-mix/gradient ถูก)
# แต่เดินขึ้นจาก "พ่อ" ของ element (ไม่รวมพื้นของตัว element เอง) เพราะวงโฟกัส/ขอบมักถูกวาด
# "นอกกล่อง" (outline-offset เป็นบวก) ทับพื้นหลังหน้า ไม่ใช่พื้นของปุ่มเอง — ยืนยันด้วยการวัดจริง
# (ปุ่ม .pill พื้นขาวทึบ แต่วงโฟกัสวาดอยู่บนพื้น .stage/.hero ที่มืดกว่า วัดจากพื้นตัวเองจะได้ค่าเพี้ยน)
FOCUS_INDICATOR = """(sel)=>{
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
  const cs = getComputedStyle(el);
  const layers = []; let n = el.parentElement;
  while (n) { const st = getComputedStyle(n);
    if (/gradient/.test(st.backgroundImage)) { const c = st.backgroundImage.match(/rgba?\\([^)]+\\)/g); if (c) layers.push(px(c[0])); }
    const bc = px(st.backgroundColor);
    if (bc.length >= 3 && (bc[3] === undefined || bc[3] > 0)) layers.push(bc);
    n = n.parentElement; }
  layers.push([255,255,255]);
  let bg = layers[layers.length-1];
  for (let i = layers.length-2; i >= 0; i--) bg = over(layers[i], bg);

  const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
  if (!hasOutline && !hasBorder) return { ratio: 0, kind: 'none', bg };  // ไม่มีตัวบ่งชี้โฟกัสที่มองเห็นได้เลย
  const indicatorRaw = hasOutline ? cs.outlineColor : cs.borderTopColor;
  const fg = over(px(indicatorRaw), bg);
  const a = L(fg), b = L(bg), hi = Math.max(a,b), lo = Math.min(a,b);
  return {ratio: Math.round(((hi+0.05)/(lo+0.05))*100)/100, kind: hasOutline?'outline':'border', indicatorColor: indicatorRaw, bg};
}"""

def focus_ratio(pg, sel, focus_target=None):
    (focus_target or pg.locator(sel).first).focus()
    pg.wait_for_timeout(260)   # รอ transition ของ CSS (border-color .search มี transition อยู่จริง — วัดไม่รอ = ค่าเพี้ยน)
    return pg.evaluate(FOCUS_INDICATOR, sel)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ① คีย์บอร์ดล้วน — ทำงานให้จบได้จริงไหม ━━")
    pg.goto(BASE, wait_until="networkidle")

    ck_true("มี skip link 1 อัน", pg.locator("a.skip").count() == 1)

    # นับจำนวน Tab จากโหลดหน้าใหม่ (ไม่คลิกอะไรก่อน — สภาพจริงตอนโหลดหน้าครั้งแรก) จนถึงเครื่องมือแรก
    n_tab = 0
    found = False
    for _ in range(40):
        pg.keyboard.press("Tab")
        n_tab += 1
        cls = pg.evaluate("document.activeElement.className || ''")
        if "pill" in cls:
            found = True
            break
    ck_true(f"กด Tab ถึงเครื่องมือแรกได้ (ใช้ไป {n_tab} ครั้ง)", found)
    if n_tab > 10:
        print(f"      ⚠️  ต้องกด Tab {n_tab} ครั้งกว่าจะถึงเครื่องมือแรก (เกณฑ์ ≤10) — แม้มี skip link แล้ว "
              f"ก็ยังต้องผ่านปุ่มหมวด {8} ปุ่มก่อนถึงเครื่องมือ")
    ck_true("จำนวน Tab ไม่บวมเกินไป (≤20)", n_tab <= 20, f"วัดได้ {n_tab} ครั้ง")

    # กด Enter เข้าเครื่องมือแรกที่โฟกัสอยู่ (data-id ของมันคือ pdf-pages ตามทะเบียน แต่ไม่ hardcode — อ่านจาก DOM จริง)
    opened_id = pg.evaluate("document.activeElement.dataset.id")
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".tool-head", timeout=8000)
    ck_true(f"Enter บนป้ายเครื่องมือ → เปิดหน้าเครื่องมือ ({opened_id})",
            pg.evaluate("document.body.classList.contains('tool')"))

    # ต่อด้วยเครื่องมือที่รู้ผลลัพธ์แน่นอน (image-convert) เพื่อทดสอบให้ครบ: เลือกไฟล์ → ลงมือ → ดาวน์โหลด
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    dz = pg.locator(".dz")
    dz.focus()
    ck_true("กล่องลากไฟล์รับโฟกัสได้ด้วยคีย์บอร์ด (tabindex)", pg.evaluate("document.activeElement.className").find("dz") != -1)
    with pg.expect_file_chooser() as fcinfo:
        pg.keyboard.press("Enter")   # Enter บนกล่องลากไฟล์ต้องเปิดตัวเลือกไฟล์ได้ (ไม่ใช่แค่คลิก)
    fc = fcinfo.value
    sample_img = SAMPLES / "ตัวอย่าง-รูปภาพ-1.jpg"
    fc.set_files(str(sample_img))
    pg.wait_for_timeout(700)
    ck_true("เลือกไฟล์ด้วย Enter บนกล่องลากไฟล์ → ไฟล์เข้าไปในรายการจริง", pg.locator(".file-row").count() == 1)

    run_btn = pg.get_by_role("button", name="แปลงไฟล์")
    run_btn.focus()
    pg.keyboard.press("Enter")   # กดปุ่มลงมือทำด้วย Enter (ไม่ใช่คลิกเมาส์)
    pg.wait_for_timeout(1500)
    status_txt = pg.locator(".status").inner_text()
    ck_true("กด Enter ที่ปุ่มลงมือทำ → งานเสร็จจริง (มีข้อความสถานะ)", bool(status_txt.strip()), f"status='{status_txt}'")

    dl_btn = pg.locator(".results button").first
    dl_btn.focus()
    with pg.expect_download() as dlinfo:
        pg.keyboard.press("Enter")   # ดาวน์โหลดด้วย Enter
    dl = dlinfo.value
    ck_true("กด Enter ที่ปุ่มดาวน์โหลด → ไฟล์ถูกดาวน์โหลดจริง", bool(dl.suggested_filename), dl.suggested_filename)

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ② โฟกัสมองเห็นชัดพอไหม (คอนทราสต์วงโฟกัส WCAG 1.4.11 ≥3:1) ━━")
    pg.goto(BASE, wait_until="networkidle")
    TARGETS = [
        (".search", "ช่องค้นหา", lambda: pg.locator("#q")),
        ("button.pill", "ป้ายเครื่องมือ", None),
        (".cat", "ปุ่มหมวด", None),
        ("#theme", "ปุ่มสลับธีม", None),
        (".langopt", "ปุ่มเลือกภาษา", None),
        ("a.skip", "skip link", None),
        ("#brand", "ปุ่มโลโก้/กลับหน้าหลัก", None),
    ]
    for scheme, label in [("dark", "โหมดมืด"), ("light", "โหมดสว่าง")]:
        pg.evaluate(f"document.documentElement.dataset.theme='{scheme}'")
        pg.wait_for_timeout(200)
        for sel, name, target_fn in TARGETS:
            r = focus_ratio(pg, sel, target_fn() if target_fn else None)
            ratio = r["ratio"] if r else 0
            ck_true(f"{label} · {name} = {ratio}:1 (ต้อง ≥3:1, kind={r.get('kind') if r else '-'})", ratio >= 3.0)
    pg.evaluate("delete document.documentElement.dataset.theme")

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ③ กับดักโฟกัสในตัวดูรูปเต็มจอ (lightbox) ━━")
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    with pg.expect_file_chooser() as fcinfo:
        pg.locator(".dz").click()
    fc = fcinfo.value
    fc.set_files([str(SAMPLES / "ตัวอย่าง-รูปภาพ-1.jpg"), str(SAMPLES / "ตัวอย่าง-รูปภาพ-2.png")])
    pg.wait_for_timeout(900)
    thumb = pg.locator("button.thumb").first
    thumb.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    ck_true("Enter บนปุ่ม 'ดูรูปใหญ่' → เปิด dialog เต็มจอ", pg.evaluate("document.querySelector('dialog.pv')?.open") is True)

    # กด Tab วน 20 ครั้ง — ทุก element ที่โฟกัสต้องอยู่ใน dialog เท่านั้น
    # ‼️ ยกเว้น <body> เฉยๆ (ไม่มี class/id) ซึ่งเป็นพฤติกรรมมาตรฐานของ Chromium headless เวลา
    #    Tab หลุดออกไปยัง "browser chrome" (address bar) ที่ไม่มีจริงในโหมด headless — พิสูจน์แล้วว่า
    #    เกิดกับหน้าเปล่าธรรมดาที่ไม่มี dialog ด้วยเหมือนกัน (ไม่ใช่บั๊กของ modal นี้)
    #    ตัวชี้วัดบั๊กจริงคือ: โฟกัสไปโดนปุ่ม/ลิงก์อื่นของหน้า (เช่น .cat, .back, .next-card) ซึ่งไม่ควรเกิด
    escaped_to = None
    for i in range(20):
        pg.keyboard.press("Tab")
        info = pg.evaluate("""() => {
            const e = document.activeElement;
            const inDialog = !!e.closest('dialog.pv');
            const isBody = e.tagName === 'BODY';   // headless chrome-boundary artifact — class ไม่เกี่ยว (พิสูจน์แล้วในหน้าเปล่าธรรมดา)
            return {tag: e.tagName, cls: e.className, ok: inDialog || isBody};
        }""")
        if not info["ok"] and escaped_to is None:
            escaped_to = f"{info['tag']}.{info['cls']} (ครั้งที่ {i+1})"
    ck_true("กด Tab วน 20 ครั้ง → โฟกัสไม่หลุดไปปุ่ม/ลิงก์อื่นนอก dialog", escaped_to is None, str(escaped_to))

    # Esc: ต้องปิด dialog และคืนโฟกัสไปปุ่มเดิมที่เปิดมัน
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    ck_true("Esc → ปิด dialog", pg.evaluate("document.querySelector('dialog.pv')?.open") is False)
    ck_true("Esc → โฟกัสกลับไปปุ่ม 'ดูรูปใหญ่' เดิม",
            pg.evaluate("document.activeElement === document.querySelector('button.thumb')"),
            f"activeElement จริง = {pg.evaluate('document.activeElement.tagName + \".\" + document.activeElement.className')}")

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ④ ชื่อที่โปรแกรมอ่านหน้าจอจะอ่าน (aria-label) ━━")

    SCAN_ICON_BTNS = """() => {
      const out = [];
      document.querySelectorAll('button').forEach(el => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const text = (el.textContent || '').trim();
        if (text.length > 0) return;              // มีตัวหนังสือเห็น ไม่ใช่ icon-only ข้ามไป
        const aria = el.getAttribute('aria-label');
        const title = el.getAttribute('title');
        const accName = (aria || title || '').trim();
        out.push({cls: el.className, aria, accName});
      });
      return out;
    }"""

    print("  -- สแกนทุกหน้าเครื่องมือ (ตอนยังไม่มีไฟล์) หา icon-only button ที่ไม่มีชื่อเลย --")
    no_name_found = []
    for tid in REG_IDS:
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_selector(".tool-head", timeout=8000)
        pg.wait_for_timeout(100)
        for e in pg.evaluate(SCAN_ICON_BTNS):
            if not e["accName"]:
                no_name_found.append((tid, e["cls"]))
    ck_true(f"ทุกหน้าเครื่องมือ ({len(REG_IDS)} ตัว) ไม่มีปุ่มไอคอนล้วนที่ไร้ชื่อเลย",
            len(no_name_found) == 0, str(no_name_found[:5]))

    print("  -- ปุ่มหมุน/ลบต่อหน้าใน 'จัดการหน้า PDF' ต้องมี aria-label แยกแต่ละหน้า ไม่ใช้ title ซ้ำกันเฉยๆ --")
    pg.goto(f"{BASE}/#/pdf-pages", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    with pg.expect_file_chooser() as fcinfo:
        pg.locator(".dz").click()
    fc = fcinfo.value
    fc.set_files(str(SAMPLES / "ตัวอย่าง-รายงานประจำเดือน.pdf"))
    pg.wait_for_timeout(1800)
    page_btns = pg.evaluate("""() => [...document.querySelectorAll('button')]
        .filter(b => /หมุนซ้าย|หมุนขวา|ลบหน้านี้|เอากลับ/.test(b.title || ''))
        .map(b => ({title: b.title, aria: b.getAttribute('aria-label')}))""")
    missing_aria = [b for b in page_btns if not b["aria"]]
    ck_true(f"ปุ่มหมุน/ลบต่อหน้า ({len(page_btns)} ปุ่ม) ทุกปุ่มมี aria-label ของตัวเอง",
            len(missing_aria) == 0,
            f"{len(missing_aria)}/{len(page_btns)} ใช้แค่ title (ซ้ำกันข้ามหน้า) เช่น {missing_aria[:3]}")
    title_counts = Counter(b["title"] for b in page_btns)
    dup_titles = {t: c for t, c in title_counts.items() if c > 1}
    ck_true("ไม่มีชื่อปุ่ม (title/aria) ซ้ำกันจนแยกไม่ออกว่าเป็นหน้าไหน",
            len(dup_titles) == 0, f"ซ้ำ: {dup_titles}")

    print("  -- ปุ่มดาวน์โหลดผลลัพธ์หลายไฟล์ ต้องแยกได้ว่าเป็นไฟล์ไหน --")
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    pg.wait_for_selector(".dz")
    with pg.expect_file_chooser() as fcinfo:
        pg.locator(".dz").click()
    fc = fcinfo.value
    fc.set_files([str(SAMPLES / "ตัวอย่าง-รูปภาพ-1.jpg"), str(SAMPLES / "ตัวอย่าง-รูปภาพ-2.png")])
    pg.wait_for_timeout(700)
    pg.get_by_role("button", name="แปลงไฟล์").click()
    pg.wait_for_timeout(2000)
    dl_names = pg.evaluate("""() => [...document.querySelectorAll('.results button')]
        .map(b => b.getAttribute('aria-label')).filter(Boolean)""")
    ck_true(f"ปุ่มดาวน์โหลด {len(dl_names)} ปุ่ม มีชื่อไม่ซ้ำกัน (บอกได้ว่าไฟล์ไหน)",
            len(dl_names) == len(set(dl_names)) and len(dl_names) > 0,
            f"ชื่อที่เจอ: {dl_names}")

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ⑤ โครงหัวข้อ h1→h2→h3 ห้ามข้ามขั้น ━━")
    pg.goto(BASE, wait_until="networkidle")
    home_h1 = pg.locator("h1").count()
    ck("หน้าแรกมี h1 เดียว", home_h1, 1)

    bad_pages = []
    for tid in REG_IDS:
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_selector(".tool-head", timeout=8000)
        pg.wait_for_timeout(80)
        heads = pg.evaluate("""() => [...document.querySelectorAll('#tool h1,#tool h2,#tool h3,#tool h4,#tool h5,#tool h6')]
            .map(h => ({lvl: parseInt(h.tagName[1]), text: h.textContent.trim().slice(0,30)}))""")
        h1n = sum(1 for h in heads if h["lvl"] == 1)
        prev, skip = 0, False
        for h in heads:
            if prev and h["lvl"] > prev + 1: skip = True
            prev = h["lvl"]
        if h1n != 1 or skip:
            bad_pages.append((tid, h1n, skip, heads))
    ck_true(f"ทุกหน้าเครื่องมือ ({len(REG_IDS)} ตัว) มี h1 เดียว และไม่ข้ามขั้น",
            len(bad_pages) == 0,
            "; ".join(f"{tid} h1={n} ข้ามขั้น={s} → {[h['lvl'] for h in hs]}" for tid, n, s, hs in bad_pages))

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ⑥ สถานะที่เปลี่ยนต้องประกาศ (aria-live) ━━")
    pg.goto(f"{BASE}/#/image-convert", wait_until="networkidle")
    ck("แถบสถานะเป็น role=status", pg.locator(".status").get_attribute("role"), "status")
    ck("แถบสถานะเป็น aria-live=polite", pg.locator(".status").get_attribute("aria-live"), "polite")
    ck("ก่อนทำงาน แถบสถานะว่าง", pg.locator(".status").inner_text().strip(), "")
    pg.wait_for_selector(".dz")
    with pg.expect_file_chooser() as fcinfo:
        pg.locator(".dz").click()
    fc = fcinfo.value
    fc.set_files(str(SAMPLES / "ตัวอย่าง-รูปภาพ-1.jpg"))
    pg.wait_for_timeout(600)
    pg.get_by_role("button", name="แปลงไฟล์").click()
    pg.wait_for_timeout(1500)
    ck_true("ทำงานเสร็จ → แถบสถานะ (aria-live) มีข้อความจริง ไม่ว่างเปล่า",
            bool(pg.locator(".status").inner_text().strip()))

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ⑦ ปุ่มภาษา / ธีม — aria-current / aria-label ต้องตรงสถานะจริง ━━")
    pg.goto(BASE, wait_until="networkidle")
    langs = pg.locator(".langopt")
    ck("ปุ่มภาษามี 2 ปุ่ม", langs.count(), 2)
    cur = [langs.nth(i).get_attribute("aria-current") for i in range(2)]
    ck_true("มีปุ่มภาษาที่ aria-current=true อยู่ตัวเดียว (ไม่ใช่ทั้งคู่/ไม่มีเลย)", cur.count("true") == 1, str(cur))
    active_idx = cur.index("true")
    other_idx = 1 - active_idx
    langs.nth(other_idx).click(); pg.wait_for_timeout(200)
    cur2 = [langs.nth(i).get_attribute("aria-current") for i in range(2)]
    ck_true("สลับภาษาแล้ว aria-current ย้ายตามจริง", cur2[other_idx] == "true" and cur2[active_idx] == "false", str(cur2))

    theme_btn = pg.locator("#theme")
    label_before = theme_btn.get_attribute("aria-label")
    theme_btn.click(); pg.wait_for_timeout(200)
    label_after = theme_btn.get_attribute("aria-label")
    theme_now = pg.evaluate("document.documentElement.dataset.theme")
    ck_true("กดปุ่มธีม → aria-label เปลี่ยนไปบอกสถานะปัจจุบัน (ไม่ใช่ป้ายนิ่งค่าเดียว)",
            label_before != label_after, f"ก่อน='{label_before}' หลัง='{label_after}' theme จริง={theme_now}")
    words_dark = ["มืด", "dark"]; words_light = ["สว่าง", "light"]
    words_want = words_dark if theme_now == "dark" else words_light
    ck_true("aria-label ของปุ่มธีมพูดถึงสถานะที่ถูกต้องจริง (มืด/สว่าง — ไม่ผูกกับภาษาที่เลือกอยู่)",
            any(w.lower() in label_after.lower() for w in words_want), label_after)

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ ⑧ prefers-reduced-motion: reduce — ยังใช้งานได้ครบไหม ━━")
    pg2 = b.new_page(viewport={"width": 1280, "height": 950})
    pg2.emulate_media(reduced_motion="reduce")
    pg2.goto(BASE, wait_until="networkidle")
    pg2.locator("#q").fill("แปลงชนิดไฟล์รูป")
    pg2.wait_for_timeout(300)
    ck_true("ค้นหาเจอเครื่องมือ", pg2.locator("button.pill").count() >= 1)
    pg2.locator("button.pill").first.click()
    pg2.wait_for_selector(".dz", timeout=8000)
    ck_true("เปิดหน้าเครื่องมือได้", pg2.locator(".tool-head h1").count() == 1)
    with pg2.expect_file_chooser() as fcinfo:
        pg2.locator(".dz").click()
    fc = fcinfo.value
    fc.set_files(str(SAMPLES / "ตัวอย่าง-รูปภาพ-1.jpg"))
    pg2.wait_for_timeout(700)
    ck_true("เลือกไฟล์ได้", pg2.locator(".file-row").count() == 1)
    run2 = pg2.get_by_role("button", name=re.compile("แปลง|บีบอัด|รวม|แยก|สร้าง|ประมวลผล"))
    if run2.count():
        run2.first.click()
        pg2.wait_for_timeout(1800)
        ck_true("ลงมือทำงานจบ มีสถานะสำเร็จ", bool(pg2.locator(".status").inner_text().strip()))
    pg2.close()

    # ═══════════════════════════════════════════════════════════════
    print("\n━━ 🧪 self-test: เทสคอนทราสต์วงโฟกัสต้องจับ 'ไม่มีวงโฟกัสเลย' ได้จริง ━━")
    pg3 = b.new_page(viewport={"width": 1280, "height": 950})
    pg3.goto(BASE, wait_until="networkidle")
    before = focus_ratio(pg3, "button.pill")
    pg3.add_style_tag(content=":focus-visible{outline:none !important}")
    after = focus_ratio(pg3, "button.pill")
    ck_true("ก่อนฉีดบั๊ก: ปุ่มมีวงโฟกัสจริง (kind != none)", before["kind"] != "none", str(before))
    ck_true("ฉีดบั๊กปลอม outline:none แล้ว → ตัววัดจับได้ว่าไม่มีวงโฟกัสเลย (ratio=0)",
            after["ratio"] == 0 and after["kind"] == "none", str(after))
    pg3.close()

    real_errs = [e for e in errs if "favicon" not in e.lower()]
    print(f"\n(console error สะสมทั้งรอบ: {len(real_errs)})")
    for e in real_errs[:5]: print("   ⚠️", e[:130])

    b.close()

print("\n" + "━" * 56)
print(f"ผ่าน {P} · ตก {len(F)}")
if F:
    print("\nรายการที่ตก (เรียงตามที่เจอ):")
    for i, x in enumerate(F, 1): print(f"  {i}. {x}")
    sys.exit(1)
