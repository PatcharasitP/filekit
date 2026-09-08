# ── สัญญาระหว่าง CSS กับ JS ────────────────────────────────────────────────
#
# บั๊กจริงที่จับพลาด (คืนวันที่ 07-08/09, เทส 265 ข้อตอนนั้นไม่จับ):
# ลบ CSS ของมุมมองการ์ดที่เลิกใช้แล้วเป็น "ช่วงบรรทัด" — ในช่วงนั้นมีกฎกลาง
# `.ico-svg{fill:none;stroke:currentColor}` ปนอยู่ด้วย → ไอคอนทั้ง 27 ตัวกลายเป็น
# ก้อนดำทึบ (fill กลับไปเป็นค่า default ของ SVG คือดำ, stroke หายไปเป็น none)
#
# ‼️ ทำไม regex หาชื่อ selector ไม่พอ: บั๊กคือ "กฎทั้งบรรทัดหายไป" ซึ่งการหา
#    ชื่อ ".ico-svg" ในไฟล์ก็ยังเจอ (เพราะ JS ที่ setAttribute("class","ico-svg")
#    ยังอยู่ครบ) — ต้องเปิดเบราว์เซอร์จริงแล้วอ่าน "ค่าที่เรนเดอร์จริง" เท่านั้น
#    ถึงจะรู้ว่ากฎที่คุมค่านั้นหายไปแล้ว
#
# โครงสร้างไฟล์นี้ 2 ชั้น:
#   ① สแกนสถิต (regex) — เทียบ class ที่ JS ใช้ กับ class ที่ CSS ประกาศ
#      → แค่ "เตือน" (อาจลืมสไตล์ / โค้ดตาย) ไม่ทำให้เทสตก เพราะเป็นสัญญาณอ่อน
#   ② เช็คค่าที่เรนเดอร์จริงในเบราว์เซอร์ (Playwright) — อันนี้ "ตก" ได้จริง
#      · .ico-svg ทุกตัวบนหน้าแรก + ทุกเครื่องมือ ต้อง fill:none และ stroke≠none
#      · element ที่มี class แต่ไม่มีกฎ CSS ใดจับตัวมันเลย (และควรมีหน้าตา) → ตก
#   ③ self-test — พิสูจน์ว่าตัวตรวจ ② จับบั๊กจริงได้ (ฉีด CSS ผิด/ลบกฎทั้งบรรทัด
#      แล้วต้องเจอว่าพัง) ตามหลัก "พิสูจน์เครื่องมือตรวจก่อนเชื่อผล"
#
# รัน: cd FileKit && python3 -m http.server 8955 &
#      /mnt/c/Users/USER/Desktop/Claude Code/.venv/bin/python tests/css_contract.py
# ตั้ง FK_BASE เพื่อยิงใส่เว็บจริงแทน localhost

import os, re, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8955")

P = 0
F = []   # hard-fail — ทำให้ exit code = 1
W = []   # warn — ไม่ทำให้ตก แค่โชว์


def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
        print(f"  ✅ {name}")
    else:
        F.append(name + (f"\n      {detail}" if detail else ""))
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))


def warn(name, items=None):
    W.append(name)
    print(f"  ⚠️  {name}")
    if items:
        for it in items:
            print(f"      · {it}")


# ─────────────────────────────────────────────────────────────────────────
# ① สแกนสถิต — สัญญา CSS ↔ JS (เตือนเท่านั้น)
# ─────────────────────────────────────────────────────────────────────────
def read(p):
    return p.read_text(encoding="utf-8")


def strip_css_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def static_scan():
    index_text = read(ROOT / "index.html")
    m = re.search(r"<style>(.*?)</style>", index_text, re.S)
    critical_css = m.group(1) if m else ""
    toolcss_path = ROOT / "assets" / "css" / "tool.css"
    tool_css = read(toolcss_path) if toolcss_path.exists() else ""

    css_all = strip_css_comments(critical_css) + "\n" + strip_css_comments(tool_css)
    declared = set(re.findall(r"\.([a-zA-Z_][\w-]*)", css_all))

    used = set()

    def add_tokens(raw):
        raw = re.sub(r"\$\{[^}]*\}", " ", raw)  # ตัดส่วน interpolation ของ template literal ทิ้ง
        for tok in raw.split():
            if re.fullmatch(r"[A-Za-z][\w-]*", tok):
                used.add(tok)

    texts = {"index.html": index_text}
    for f in sorted((ROOT / "src").glob("**/*.js")):
        texts[str(f.relative_to(ROOT))] = read(f)

    patterns = [
        r'class:\s*"([^"]*)"', r"class:\s*'([^']*)'", r'class:\s*`([^`]*)`',   # el(tag, {class: "..."})
        r'class="([^"]*)"',                                                     # HTML ล้วน (index.html)
        r'className\s*=\s*"([^"]*)"', r"className\s*=\s*'([^']*)'",             # el.className = "..."
        r'cls\s*=\s*"([^"]+)"',                                                 # default param เช่น cls = "ico-svg"
    ]
    for _name, text in texts.items():
        for pat in patterns:
            for mm in re.finditer(pat, text):
                add_tokens(mm.group(1))
        for mm in re.finditer(r"classList\.add\(([^)]*)\)", text):
            for arg in re.finditer(r'["\']([^"\']+)["\']', mm.group(1)):
                add_tokens(arg.group(1))
        for mm in re.finditer(r'(?:toolIcon|uiIcon)\([^)]*?,\s*"([^"]+)"\s*\)', text):
            add_tokens(mm.group(1))  # เช่น toolIcon(tool, "ws-empty-svg")

    js_only = sorted(used - declared)   # JS ใช้ แต่ CSS ไม่มีกฎ — อาจลืมสไตล์ (หรือใช้เป็นตัวจับล้วน ๆ)
    css_only = sorted(declared - used)  # CSS ประกาศ แต่ไม่มีใครใช้ — โค้ดตาย
    return js_only, css_only


print("━━ ① สัญญา CSS ↔ JS (สแกนสถิต — เตือนเท่านั้น ไม่ทำให้เทสตก) ━━")
print("  ‼️ หมายเหตุ: CSS ที่สแกนคือ index.html <style> + assets/css/tool.css เท่านั้น")
print("     (ไม่รวม <style> ที่ฝังอยู่ในแต่ละ src/tools/*.js — ตามที่ตกลงไว้ในโค้ด)")
js_only, css_only = static_scan()
if js_only:
    warn(f"class ที่ JS/HTML ใช้ {len(js_only)} ชื่อ ไม่พบกฎ CSS ในไฟล์ที่สแกน (อาจลืมสไตล์ หรือฝังสไตล์ไว้ในโมดูลเอง หรือใช้เป็นตัวจับล้วน ๆ)", js_only)
else:
    print("  (ไม่มี class ที่ JS ใช้แล้ว CSS ที่สแกนไม่ประกาศเลย)")
if css_only:
    warn(f"กฎ CSS {len(css_only)} ชื่อ ไม่มีที่ไหนในโค้ดใช้แล้ว (โค้ดตาย ควรพิจารณาลบ)", [f".{c}" for c in css_only])
else:
    print("  (ไม่มีกฎ CSS ที่ตายแล้ว)")


# ─────────────────────────────────────────────────────────────────────────
# ② ตรวจค่าที่เรนเดอร์จริงในเบราว์เซอร์
# ─────────────────────────────────────────────────────────────────────────
ICO_CHECK_JS = """
() => [...document.querySelectorAll('.ico-svg')].map(el => {
  const cs = getComputedStyle(el);
  return { fill: cs.fill, stroke: cs.stroke, cls: el.getAttribute('class') };
})
"""

# ‼️ รุ่นแรก (เดา matches() กับ selector "ทั้งหมด" ในหน้า) ผ่านหลอก — เกือบทุก element
#    ตรงกับ selector `*, ::before, ::after` (CSS reset) หรือ `button`/`div` เฉย ๆ อยู่แล้ว
#    ทำให้ "ไม่มี selector ใดจับเลย" แทบไม่เกิดขึ้นจริง ต่อให้ class นั้นเสียสไตล์ไปหมดแล้ว
#    (พิสูจน์แล้ว: ลบกฎ .pill ทิ้ง — ปุ่ม .pill ก็ยังโดน `button{...}` reset จับอยู่ดี)
# → รุ่นนี้กรองก่อนว่า selector นั้น "อ้างถึงชื่อ class ของ element ตัวนี้จริง ๆ" หรือเปล่า
#   (มี .ชื่อคลาส เป็นส่วนหนึ่งของ selector) แล้วค่อยเช็ค matches() เฉพาะกลุ่มนั้น —
#   วัดว่า "class นี้ยังมีกฎเจาะจงของตัวเองไหม" ไม่ใช่ "element นี้โดน CSS อะไรแตะบ้าง"
NOMATCH_JS = """
() => {
  function collect(rules, out) {
    for (const r of rules) {
      if (r.selectorText) out.push(r.selectorText);
      if (r.cssRules) collect(r.cssRules, out);
    }
  }
  const selectors = [];
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules, selectors); } catch (e) { /* cross-origin — ข้าม */ }
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const out = [];
  for (const el of document.querySelectorAll('[class]')) {
    const classes = [...el.classList];
    if (!classes.length) continue;
    const relevant = selectors.filter((sel) =>
      classes.some((c) => new RegExp('\\\\.' + esc(c) + '(?![\\\\w-])').test(sel))
    );
    let matched = false;
    for (const sel of relevant) {
      try { if (el.matches(sel)) { matched = true; break; } } catch (e) { /* selector ที่ matches() ไม่รองรับ (เช่น ::before) — ข้าม */ }
    }
    if (!matched) {
      const r = el.getBoundingClientRect();
      out.push({ tag: el.tagName, cls: el.getAttribute('class'), w: r.width, h: r.height,
                 text: (el.textContent || '').trim().slice(0, 30), nRelevant: relevant.length });
    }
  }
  return out;
}
"""


def ico_svg_problems(page):
    """คืน (รายการปัญหา, จำนวนไอคอนทั้งหมด) — รายการว่างแปลว่าไอคอนทุกตัวโอเค"""
    vals = page.evaluate(ICO_CHECK_JS)
    problems = []
    for v in vals:
        if v["fill"] != "none":
            problems.append(f"class={v['cls']!r} fill={v['fill']} (ควรเป็น none — นี่คือบั๊ก 'ไอคอนดำทึบ')")
        if v["stroke"] == "none":
            problems.append(f"class={v['cls']!r} stroke=none (ควรมีสีเส้น ไม่งั้นไอคอนหายไปเลย)")
    return problems, len(vals)


def orphan_class_elements(page):
    """คืน element ที่มี class แต่ไม่มีกฎ CSS ใดอ้างถึงชื่อ class นั้นเลย (ไม่นับ reset/tag เฉย ๆ)
    และควรมีหน้าตา (มีขนาด หรือมีข้อความ) — ‼️ นี่เป็นสัญญาณ "เตือน" ไม่ใช่ hard fail เพราะ
    ในโค้ดจริงมี wrapper div ที่ตั้งใจไม่มีสไตล์เจาะจงของตัวเอง แล้วให้ descendant selector ของ
    ตัวลูกจัดการแทน (เช่น .fact ไม่มีกฎของตัวเอง มีแต่ `.fact span`/`.fact b`) ซึ่งเป็นแบบแผนปกติ
    ไม่ใช่บั๊ก — ถ้าเอามาทำเป็น hard fail จะ "ตกทั้งที่โค้ดไม่ได้พัง" ผิดกติกาที่ห้ามไว้"""
    raw = page.evaluate(NOMATCH_JS)
    return [r for r in raw if (r["w"] > 0 and r["h"] > 0) or r["text"]]


REG = ROOT / "src" / "registry.js"
TOOL_IDS = re.findall(r'id:"([\w-]+)"', read(REG))
# ตัวอย่างเครื่องมือที่มี <style> ฝังอยู่ในโมดูลเอง (ครอบคลุมรูปแบบ UI ที่หลากหลาย)
# ใช้เป็นชุดสุ่มตรวจ "class กำพร้า" แบบเข้มขึ้น — ไม่ตรวจครบ 27 ตัวเพราะจะช้าโดยไม่จำเป็น
SAMPLE_TOOL_IDS = [t for t in ["image-resize", "pdf-pages", "pdf-compress", "pdf-sign", "pdf-watermark", "pdf-split", "word-mailmerge"] if t in TOOL_IDS]

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 950})

    print("\n━━ ② หน้าแรก: ไอคอน .ico-svg ต้อง fill:none และมี stroke จริง ━━")
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(200)
    probs, n = ico_svg_problems(page)
    ck(f"หน้าแรกมีไอคอน .ico-svg ครบตามจำนวนเครื่องมือ ({n} ตัว == {len(TOOL_IDS)} เครื่องมือ)", n == len(TOOL_IDS), f"เจอ {n} ตัว, เครื่องมือทั้งหมด {len(TOOL_IDS)}")
    ck("ไอคอนหน้าแรกทุกตัว fill=none และ stroke≠none (ไม่ใช่ก้อนดำ)", len(probs) == 0, "; ".join(probs[:6]) + (f" ... และอีก {len(probs)-6}" if len(probs) > 6 else ""))

    print("\n━━ ③ เปิดทุกเครื่องมือ (27 ชิ้น): ไอคอนต้องไม่ดำทึบเช่นกัน ━━")
    broken_tools = []
    for t in TOOL_IDS:
        page.goto("about:blank")
        page.goto(f"{BASE}/#/{t}", wait_until="networkidle")
        try:
            page.wait_for_selector(".dz, .tool-head", timeout=12000)
        except Exception:
            broken_tools.append((t, "เปิดหน้าเครื่องมือไม่ขึ้น"))
            continue
        page.wait_for_timeout(150)
        probs, n = ico_svg_problems(page)
        if probs:
            broken_tools.append((t, f"{len(probs)} ปัญหา: " + "; ".join(probs[:2])))
    ck(f"ไอคอนในทุกเครื่องมือ ({len(TOOL_IDS)} ตัว) ไม่มีตัวไหนดำทึบ", len(broken_tools) == 0,
       "; ".join(f"{t}: {m}" for t, m in broken_tools[:8]))

    print("\n━━ ④ element ที่มี class แต่ไม่มีกฎ CSS อ้างถึงชื่อ class นั้นเลย (เตือนเท่านั้น — ดูหมายเหตุ) ━━")
    print("  ‼️ ไม่ทำให้เทสตก: บาง class เป็น wrapper ที่ตั้งใจไม่มีสไตล์ของตัวเอง (ลูกมันถูกจัดแทนผ่าน")
    print("     descendant selector เช่น .fact ไม่มีกฎเอง มีแต่ .fact span/.fact b) แบบนี้ไม่ใช่บั๊ก")
    page.goto("about:blank")
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(200)
    orphans_home = orphan_class_elements(page)
    if orphans_home:
        warn(f"หน้าแรก: มี {len(orphans_home)} element ที่ class ไม่มีกฎ CSS เจาะจงของตัวเอง (ตรวจตาว่าตั้งใจหรือไม่)",
             [f"{o['tag']}.{o['cls']} (text={o['text'][:20]!r})" for o in orphans_home[:10]])
    else:
        print("  (หน้าแรก: ไม่พบ — ทุก class ที่ควรมีหน้าตา มีกฎ CSS ของตัวเองครบ)")

    for t in SAMPLE_TOOL_IDS:
        page.goto("about:blank")
        page.goto(f"{BASE}/#/{t}", wait_until="networkidle")
        try:
            page.wait_for_selector(".dz, .tool-head", timeout=12000)
        except Exception:
            continue
        page.wait_for_timeout(150)
        orphans = orphan_class_elements(page)
        if orphans:
            warn(f"เครื่องมือ {t}: มี {len(orphans)} element ที่ class ไม่มีกฎ CSS เจาะจงของตัวเอง",
                 [f"{o['tag']}.{o['cls']}" for o in orphans[:10]])
        else:
            print(f"  (เครื่องมือ {t}: ไม่พบ)")

    # ทางเลือกสำหรับสาธิต "แดง" ด้วยตา — ตั้ง FK_INJECT_BAD_CSS=1 แล้วรันไฟล์นี้
    # จะฉีด CSS บั๊กจริงใส่หน้าแรกก่อนเช็ค (ของจริงที่เกิดคืนบั๊ก) ให้เห็นเทสตกเอง
    if os.environ.get("FK_INJECT_BAD_CSS") == "1":
        print("\n━━ ‼️ FK_INJECT_BAD_CSS=1 — สาธิตแดงด้วยของจริง (page.add_style_tag) ━━")
        page.goto("about:blank")
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(200)
        page.add_style_tag(content=".ico-svg{fill:#000;stroke:none}")
        probs, n = ico_svg_problems(page)
        ck("[สาธิต] หลังฉีด CSS บั๊ก .ico-svg{fill:#000;stroke:none} ต้องเจอว่าพัง", len(probs) == 0, "; ".join(probs[:6]))

    # ───────────────────────────────────────────────────────────────────
    # ⑤ self-test — พิสูจน์ว่าตัวตรวจ ② จับบั๊กจริงได้ (ไม่ใช่ผ่านหลอกเพราะ selector ยังเจอ)
    #    ตามหลัก "พิสูจน์เครื่องมือตรวจก่อนเชื่อผล" — ต้องคู่กับ assert ว่า "เจอของเสีย"
    #    ไม่ใช่แค่ assert ว่า "ไม่พบของเสีย" (ประชากรต้อง > 0 จริง)
    # ───────────────────────────────────────────────────────────────────
    print("\n━━ ⑤ self-test: พิสูจน์ว่าตัวตรวจข้อ ② จับบั๊กจริงได้ ━━")

    # ก. จำลองบั๊กแบบ 'override ค่า' ด้วย add_style_tag (วิธีตาม DoD)
    canary = browser.new_page(viewport={"width": 1280, "height": 950})
    canary.goto(BASE, wait_until="networkidle")
    canary.wait_for_timeout(200)
    before_probs, before_n = ico_svg_problems(canary)
    ck("self-test A ก่อนฉีดบั๊ก: หน้าแรกต้องปกติ (ไม่มีปัญหา) — เทียบฐานก่อนพัง", len(before_probs) == 0 and before_n > 0, f"n={before_n}, problems={len(before_probs)}")
    canary.add_style_tag(content=".ico-svg{fill:#000;stroke:none}")
    after_probs, after_n = ico_svg_problems(canary)
    ck(f"self-test A: ฉีด CSS 'fill:#000;stroke:none' แล้วตัวตรวจต้องจับได้ว่าพังทั้ง {after_n} ตัว (ประชากร > 0)",
       len(after_probs) > 0 and after_n == before_n, f"เจอปัญหา {len(after_probs)}/{after_n} ตัว")
    canary.close()

    # ตัวช่วยลบกฎแบบ "ทั้งบรรทัด" ให้ตรงกับบั๊กจริง — ต้องลบ "ทุกที่" ที่มี selectorText
    # ตรงเป๊ะกับชื่อที่ระบุ รวมถึงที่ซ้อนอยู่ใน @media เพราะ CSS ของ FileKit มีกฎซ้ำ
    # ชื่อเดียวกันในหลาย breakpoint จริง (เช่น .pill ปรากฏทั้งนอกและใน @media)
    # — ถ้าลบแค่ระดับบนสุด matches() จะยังเจอกฎที่ซ้อนอยู่ ทำให้ self-test หลอกตัวเอง
    # deleteRule มีอยู่บน CSSStyleSheet และ CSSGroupingRule (เช่น @media) เหมือนกัน
    # แต่ต้องเรียกผ่าน "เจ้าของ" (owner) ของ rules list นั้น ไม่ใช่ผ่าน list ตรง ๆ
    DELETE_SELECTOR_JS = """
    (targets) => {
      function walk(owner, rules) {
        for (let i = rules.length - 1; i >= 0; i--) {
          const r = rules[i];
          if (r.cssRules) walk(r, r.cssRules);
          if (targets.includes(r.selectorText)) { try { owner.deleteRule(i); } catch (e) {} }
        }
      }
      for (const sheet of document.styleSheets) {
        try { walk(sheet, sheet.cssRules); } catch (e) {}
      }
    }
    """

    # ข. จำลองบั๊กแบบ 'ลบกฎทั้งบรรทัด' — ตรงกับบั๊กจริงเมื่อคืน (ลบช่วง CSS มุมมองการ์ดแล้วดันลาก .ico-svg ไปด้วย)
    canary2 = browser.new_page(viewport={"width": 1280, "height": 950})
    canary2.goto(BASE, wait_until="networkidle")
    canary2.wait_for_timeout(200)
    canary2.evaluate(DELETE_SELECTOR_JS, [".ico-svg"])
    del_probs, del_n = ico_svg_problems(canary2)
    ck(f"self-test B: ลบกฎ '.ico-svg{{...}}' ทั้งบรรทัดออก (จำลองบั๊กจริง) แล้วตัวตรวจต้องจับได้ว่าพังทั้ง {del_n} ตัว",
       len(del_probs) > 0 and del_n > 0, f"เจอปัญหา {len(del_probs)}/{del_n} ตัว")
    canary2.close()

    # ค. self-test ของตัวตรวจ orphan-class (④) — ตัวนี้ในการรันจริงเป็นแค่ "เตือน" (มี false positive
    #    ที่ยอมรับได้จาก wrapper div ที่ตั้งใจไม่มีสไตล์เอง) แต่ตัวตรวจเองต้องยังไวพอจะจับความเปลี่ยนแปลง
    #    จริงได้ — พิสูจน์ด้วยการเทียบ "ก่อน/หลัง" ลบกฎ .pill/.pills ทิ้งทั้งบรรทัด (ทุกจุดรวม @media)
    #    บน element ที่ควรมีกฎแน่ ๆ (ป้ายเครื่องมือหน้าแรก 27 ใบ) ต้องเห็นจำนวน "กำพร้า" เพิ่มขึ้นชัดเจน
    canary3 = browser.new_page(viewport={"width": 1280, "height": 950})
    canary3.goto(BASE, wait_until="networkidle")
    canary3.wait_for_timeout(200)
    before_orphans = orphan_class_elements(canary3)
    canary3.evaluate(DELETE_SELECTOR_JS, [".pill", ".pills"])
    after_orphans = orphan_class_elements(canary3)
    ck("self-test C: ลบกฎ '.pill'/'.pills' ทั้งบรรทัด (ทุกจุดรวม @media) แล้วตัวตรวจ ④ ต้องเจอ element กำพร้าเพิ่มขึ้นจริง (ตัวตรวจไม่ใช่ no-op)",
       len(after_orphans) > len(before_orphans), f"ก่อนลบ {len(before_orphans)} → หลังลบ {len(after_orphans)}")
    canary3.close()

    browser.close()

print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"ผ่าน {P} · ตก {len(F)}" + (f" · เตือน {len(W)}" if W else ""))
if F:
    print("\nรายการที่ตก:")
    for i, f in enumerate(F, 1):
        print(f"  {i}. {f}")
    sys.exit(1)
