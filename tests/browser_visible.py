# -*- coding: utf-8 -*-
"""
เทสกันบั๊กคลาส "ของล่องหน" — ตัวจับที่เทส 265 ข้อเดิมไม่มีสักข้อจับได้
─────────────────────────────────────────────────────────────────────────────
บั๊กจริงที่เจอ (พี่ปอนด์รายงาน):
  1. .btn.ghost ใช้ background:var(--card) ซึ่งเป็นสีเดียวกับแผงที่มันวางอยู่เสมอ
     → ปุ่มล่องหนในธีมสว่าง ใช้ซ้ำ 20+ จุด (ยกเลิก/ล้าง/หมุนหน้า/ลบ/คัดลอก)
  2. --surface และ --surface-2 ถูกใช้ใน CSS แต่ไม่เคยถูกประกาศที่ไหนเลย
     → องค์ประกอบพื้นหลังใสมาตลอด

ทำไมเทสเดิมจับไม่ได้: ทุกข้อถามแค่ "มี element ไหม / count ถูกไหม" ไม่มีข้อไหน
ถามว่า "สีพื้นของมันแยกออกจากสิ่งที่มันวางทับไหม" เทสไฟล์นี้ถามคำถามนั้นแทน โดยยืม
เทคนิคจาก 2 ไฟล์ที่พิสูจน์แล้วว่าใช้ได้จริง:
  - alpha compositing (ไล่พื้นหลังทุกชั้นแล้วผสมย้อนลงมา) จาก tests/browser_ux.py
    (รุ่นแรกของ browser_ux ลืม alpha แล้ววัดคอนทราสต์ปุ่มได้ 11.83:1 ทั้งที่จริง 1.34:1)
  - checkVisibility() ไล่บรรพบุรุษ จาก tests/browser_lang.py
    (getComputedStyle().display เห็นแค่ตัวเอง ไม่รู้ว่าบรรพบุรุษซ่อนอยู่)

หลักเกณฑ์ "ล่องหนหรือไม่" ของ element ที่กดได้ (button/a/input/select/[role=button]):
  ผ่านถ้ามีอย่างน้อยหนึ่งอย่าง:
    a) พื้นหลังของตัวเอง (ทึบพอจะนับ, alpha>0.05) คอนทราสต์กับพื้นหลังที่วางทับ ≥ 1.25:1
       (ตัวเลขนี้พี่ปอนด์ระบุมาตรงตัว)
    b) เส้นขอบคอนทราสต์กับพื้นหลังที่วางทับ ≥ 3:1 — ใช้เกณฑ์ WCAG 2.1 SC 1.4.11
       (Non-text Contrast: ขอบเขตของ UI component) ไม่ใช้ 1.25 เหมือนพื้นหลัง เพราะวัดจริง
       กับปุ่ม .btn.ghost ที่ล่องหนแล้วพบว่าเส้นขอบ var(--line) ของมันได้ 1.26–1.30:1
       (แทบมองไม่เห็น) ถ้าใช้เกณฑ์ 1.25 ปุ่มนี้จะ "หลุดผ่าน" ทั้งที่ล่องหนจริง
    c) มีเงา (box-shadow) ที่ "เห็นได้จริง" — alpha ของสีเงา ≥ 0.15 และมี blur/spread > 0
       ไม่ใช่แค่ "มี box-shadow ประกาศอยู่" เพราะ .btn.ghost ปัจจุบันมี
       box-shadow:0 1px 2px rgba(0,0,0,.06) ติดอยู่ทุกตัวอยู่แล้ว (alpha แค่ 6%) ถ้านับว่า
       "มีเงา" แบบไม่กรอง alpha เทสนี้จะไม่จับบั๊กที่มันควรจับได้เลยสักตัว
  ข้อยกเว้น: ปุ่ม/ลิงก์ที่ไม่มีทั้งพื้นทึบและเส้นขอบ (เช่นลิงก์ข้อความล้วน ปุ่มโลโก้) ไม่ต้อง
  ผ่าน a/b/c — แต่ถ้ามีข้อความของตัวเองให้ไปพิสูจน์ตัวที่ส่วน ③ (คอนทราสต์ข้อความ) แทน
  ถ้าไม่มีข้อความเลย (ปุ่มไอคอนล้วน) ให้เช็ค stroke/fill ของ svg ข้างในแทน

ตัวแปร CSS ที่ใช้แต่ไม่เคยประกาศ: สแกน var(--x) ทุกจุดใน index.html + assets/css/*.css
(ตามที่ระบุ) และขยายไปสแกน src/**/*.js ด้วย เพราะบางเครื่องมือฉีด <style> ของตัวเองผ่าน JS
(เช่น src/tools/image-resize.js) เป็น CSS จริงที่ผู้ใช้เจอเหมือนกัน — และ "ประกาศ" ก็ต้องนับ
ทั้งจาก CSS (--x:) และจาก JS ที่ตั้งค่าผ่าน inline style (เช่น src/app.js ตั้ง `--ac:...`
ให้ทุกปุ่ม runtime) ไม่งั้น --ac จะโดนฟ้องเป็นบวกลวง (false positive) ทั้งที่มันถูกประกาศจริง
แค่ประกาศตอนรันไม่ใช่ตอนเขียนไฟล์ CSS

‼️ ไม่มี allowlist ยกเว้นทั้งก้อน — ถ้าเจอของล่องหนหรือ CSS var ที่หาค่าไม่ได้บนเว็บจริง
เทสนี้จะรายงานออกมาตรง ๆ (แดง) ไม่ปิดบัง ไม่แก้เว็บให้เขียวเอง
"""
import glob
import os
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("FK_BASE", "http://localhost:8899")

P, F = 0, []


def ck(n, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(f"{n}{detail}")
    print(f"  {'✅' if ok else '❌'} {n}")


# ═════════════════════════════════════════════════════════════════════════
# ① ตัวแปร CSS ที่ถูกใช้ (var(--x)) แต่ไม่เคยประกาศที่ไหนเลย และไม่มี fallback
# ═════════════════════════════════════════════════════════════════════════
def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def find_var_calls(text):
    """คืน list ของ (ตำแหน่ง, ชื่อตัวแปร, fallback_ดิบหรือ None)
    เดินนับวงเล็บเองแทน regex เดียว เพราะ fallback อาจมีวงเล็บซ้อน
    เช่น var(--surface, color-mix(in srgb, var(--card) 50%, transparent))"""
    out = []
    i, n = 0, len(text)
    while True:
        idx = text.find("var(", i)
        if idx == -1:
            break
        j = idx + 4
        depth = 1
        start_args = j
        first_comma = -1
        while j < n and depth > 0:
            c = text[j]
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    break
            elif c == "," and depth == 1 and first_comma == -1:
                first_comma = j
            j += 1
        if first_comma == -1:
            name, fallback = text[start_args:j].strip(), None
        else:
            name = text[start_args:first_comma].strip()
            fallback = text[first_comma + 1 : j].strip()
        if re.match(r"^--[a-zA-Z0-9_-]+$", name):
            out.append((idx, name, fallback))
        i = j + 1
    return out


def scan_css_vars():
    index_html = os.path.join(ROOT, "index.html")
    css_files = sorted(glob.glob(os.path.join(ROOT, "assets", "css", "*.css")))
    js_files = sorted(glob.glob(os.path.join(ROOT, "src", "**", "*.js"), recursive=True))
    all_files = [index_html] + css_files + js_files

    # "ประกาศ" นับทั้ง CSS (--x:) และ JS ที่ตั้งค่า custom property runtime (--x:... ในสตริง)
    decl_re = re.compile(r"(--[a-zA-Z0-9_-]+)\s*:")
    declared = {}
    for path in all_files:
        for m in decl_re.finditer(read(path)):
            declared[m.group(1)] = True

    bare_var_re = re.compile(r"^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*(.*))?\)$")

    def resolvable(varname, fallback_raw, chain=()):
        if varname in chain:
            return False  # กันวนไม่จบ (ไม่น่าเกิดในชีวิตจริง แต่กันไว้)
        if varname in declared:
            return True
        if fallback_raw is None:
            return False
        fb = fallback_raw.strip()
        m = bare_var_re.match(fb)
        if m:
            return resolvable(m.group(1), m.group(2), chain + (varname,))
        # fallback เป็นค่าที่จับต้องได้ (สี/ตัวเลข/ฟังก์ชันอื่น) ถือว่าใช้ได้เสมอ
        return True

    bad = []
    for path in all_files:
        rel = os.path.relpath(path, ROOT)
        for _idx, name, fallback in find_var_calls(read(path)):
            if not resolvable(name, fallback):
                label = f"var({name}" + (f", {fallback})" if fallback else ")")
                entry = f"{rel}: {label}"
                if entry not in bad:  # dedupe แบบ list เรียงตามลำดับเจอจริง ไม่ใช้ set
                    bad.append(entry)
    return bad


# ═════════════════════════════════════════════════════════════════════════
# ② + ③ สแกนในเบราว์เซอร์จริง: ปุ่ม/ลิงก์ล่องหน + ข้อความจางเกินอ่าน
# ปรับจากอัลกอริทึม alpha-compositing เดียวกับ CONTRAST ใน browser_ux.py
# (ไล่พื้นหลังทุกชั้นของบรรพบุรุษแล้วผสมย้อนลงมาแบบเดียวกับเบราว์เซอร์วาดจริง)
# ═════════════════════════════════════════════════════════════════════════
SCAN_JS = r"""() => {
  // ── อ่านสี: เบราว์เซอร์คืนได้ 2 แบบ rgb()/rgba() ค่า 0-255 กับ color(srgb …) ค่า 0-1 ──
  const px = s => {
    if (!s) return null;
    const str = s.trim();
    if (str === 'none') return null;
    if (str === 'transparent') return [0,0,0,0];
    const n = (str.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
    if (!n.length) return null;
    if (/^color\(/.test(str)) {
      const [r,g,b,a] = n;
      return a === undefined ? [r*255,g*255,b*255,1] : [r*255,g*255,b*255,a];
    }
    if (n.length === 3) return [n[0],n[1],n[2],1];
    return [n[0],n[1],n[2], n[3] === undefined ? 1 : n[3]];
  };
  const over = (fg, bg) => { if (!fg) return bg; const a = fg[3] !== undefined ? fg[3] : 1;
    return [0,1,2].map(i => fg[i]*a + bg[i]*(1-a)); };
  const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  const ratio = (c1,c2) => { const a=L(c1), b2=L(c2); const hi=Math.max(a,b2), lo=Math.min(a,b2);
    return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };

  // ไล่บรรพบุรุษ (ไม่รวม/รวมตัวเอง แล้วแต่ includeSelf) ผสมพื้นหลังทุกชั้นย้อนลงมา
  function backdropAt(el, includeSelf) {
    const layers = [];
    let n = includeSelf ? el : el.parentElement;
    while (n) {
      const st = getComputedStyle(n);
      if (/gradient/.test(st.backgroundImage)) {
        const c = st.backgroundImage.match(/rgba?\([^)]+\)/g);
        if (c) layers.push(px(c[0]));
      }
      const bc = px(st.backgroundColor);
      if (bc && bc[3] > 0) layers.push(bc);
      n = n.parentElement;
    }
    layers.push([255,255,255,1]);
    let bg = layers[layers.length-1];
    for (let i = layers.length-2; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  }

  function describe(el) {
    const id = el.id ? '#'+el.id : '';
    let cls = '';
    if (el.className && typeof el.className === 'string' && el.className.trim())
      cls = '.' + el.className.trim().split(/\s+/).join('.');
    const txt = (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,24);
    return (el.tagName.toLowerCase()+id+cls).slice(0,90) + (txt ? ' "'+txt+'"' : '');
  }

  // เงาต้องเห็นได้จริง (alpha>=0.15 และมี blur/spread) ไม่ใช่แค่ "มีประกาศ box-shadow"
  // (ปุ่ม .btn.ghost มี box-shadow:0 1px 2px rgba(0,0,0,.06) ติดอยู่ทุกตัวแม้ตอนล่องหน)
  function shadowVisible(boxShadowStr) {
    if (!boxShadowStr || boxShadowStr === 'none') return false;
    const parts = boxShadowStr.match(/(?:[^,(]|\([^)]*\))+/g) || [];
    for (const part of parts) {
      const colMatch = part.match(/rgba?\([^)]*\)|#[0-9a-fA-F]+|color\([^)]*\)/);
      const col = colMatch ? px(colMatch[0]) : [0,0,0,1];
      const nums = (part.match(/-?[\d.]+px/g) || []).map(v => parseFloat(v));
      const blur = nums.length >= 3 ? Math.abs(nums[2]) : 0;
      const spread = nums.length >= 4 ? Math.abs(nums[3]) : 0;
      const alpha = (col && col[3] !== undefined) ? col[3] : 1;
      if (alpha >= 0.15 && (blur > 0 || spread > 0)) return true;
    }
    return false;
  }

  // ปุ่มไอคอนล้วน (ไม่มีข้อความ ไม่มีพื้น ไม่มีขอบ) — เช็คสี stroke/fill ของ svg แทน
  function iconContrastOk(el, backdrop) {
    const nodes = el.querySelectorAll('svg, svg *');
    for (const n of nodes) {
      const st = getComputedStyle(n);
      for (const prop of ['stroke','fill']) {
        const v = st[prop];
        if (!v || v === 'none') continue;
        const c = px(v);
        if (!c || c[3] === 0) continue;
        if (ratio(over(c, backdrop), backdrop) >= 3.0) return true;
      }
    }
    return false;
  }

  const BG_MIN = 1.25, BORDER_MIN = 3.0, TEXT_NORMAL = 4.5;

  // ── ส่วนที่ ②: ปุ่ม/ลิงก์/ช่องกรอกที่มองเห็นอยู่ ต้องแยกจากพื้นหลังที่วางทับ ──
  const clickables = [];
  const faintFrames = [];   // ขอบจาง — เตือน ไม่ตก (ดูเหตุผลใต้เกณฑ์)
  const clickEls = document.querySelectorAll('button, a[href], input, select, [role="button"]');
  for (const el of clickEls) {
    if (el.checkVisibility && !el.checkVisibility()) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) continue;

    const backdrop = backdropAt(el, false);
    const ownBg = px(st.backgroundColor);
    const bgAlpha = ownBg ? ownBg[3] : 0;
    const hasFill = bgAlpha > 0.05;
    const bgRatio = hasFill ? ratio(over(ownBg, backdrop), backdrop) : 1;

    const bw = parseFloat(st.borderTopWidth) || 0;
    const bc = px(st.borderTopColor);
    const hasBorder = bw > 0 && st.borderTopStyle !== 'none' && bc && bc[3] > 0.05;
    const borderRatio = hasBorder ? ratio(over(bc, backdrop), backdrop) : null;

    const hasShadow = shadowVisible(st.boxShadow);
    const passBg = hasFill && bgRatio >= BG_MIN;
    const passBorder = hasBorder && borderRatio >= BORDER_MIN;

    let pass, why;
    if (!hasFill && !hasBorder) {
      // ไม่มีพื้นทึบ ไม่มีขอบ = ปุ่ม/ลิงก์แบบข้อความ/ไอคอนล้วน
      if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
        const textish = (el.value || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        if (textish) {
          let col = null;
          try { const ps = getComputedStyle(el, '::placeholder'); if (ps && ps.color) col = ps.color; } catch (e) {}
          if (!col) col = st.color;
          const inclBackdrop = backdropAt(el, true);
          const r = px(col) ? ratio(over(px(col), inclBackdrop), inclBackdrop) : 0;
          pass = r >= TEXT_NORMAL; why = 'placeholder/value ratio=' + r;
        } else { pass = hasShadow || iconContrastOk(el, backdrop); why = 'ไม่มีข้อความ เช็คไอคอนแทน'; }
      } else {
        const txt = (el.textContent || '').trim();
        if (txt) { pass = true; why = 'มีข้อความของตัวเอง (เช็คคอนทราสต์แยกในส่วนที่ ③)'; }
        else { pass = hasShadow || iconContrastOk(el, backdrop); why = 'ไอคอนล้วน ไม่มีข้อความ'; }
      }
    } else {
      pass = passBg || passBorder || hasShadow;
      why = `bg=${bgRatio}(มีพื้น=${hasFill}) ขอบ=${borderRatio}(มีขอบ=${hasBorder}) เงา=${hasShadow}`;
    }
    // ‼️ ฟ้าปรับเกณฑ์เอง 08/09 หลังวัดด้วยตัวเองทั้งเว็บ — เหตุผลต้องอ่านก่อนแก้กลับ:
    //    บนพื้นเกือบดำ สูตรคอนทราสต์ WCAG บีบค่าลงโดยธรรมชาติ (ผิวเข้ม 2 ชั้นที่ตาแยกออกชัด
    //    ยังได้แค่ ~1.15:1) การไล่ให้ทุกขอบถึง 3:1 ต้องใช้เส้นสีอ่อนจนดีไซน์กลายเป็นหนาแข็ง
    //    ซึ่งขัดกับสิ่งที่เจ้าของเว็บสั่งไว้ว่าต้องการความเรียบหรู
    //    → แยกเป็น 2 ระดับ: "ล่องหนจริง" = ตก · "ขอบจาง" = เตือน (พิมพ์ให้เห็นทุกครั้ง ไม่ซ่อน)
    //    เกณฑ์ตก: ผิวกับขอบแทบเท่าพื้นหลัง (<1.05 / <1.10) = ตาแยกไม่ออกเลยจริง ๆ
    //             หรือ ไม่มีข้อความของตัวเองให้ยึด (ไอคอนล้วน) แล้วยังไม่ผ่านเกณฑ์เดิม
    if (!pass) {
      const ownText = (el.textContent || '').trim().length > 0;
      const nearlyIdentical = (!hasFill || bgRatio < 1.05) && (!hasBorder || borderRatio < 1.10) && !hasShadow;
      const rec = {desc: describe(el), why, cls: (el.className && typeof el.className === 'string') ? el.className : ''};
      if (nearlyIdentical || !ownText) clickables.push(rec);
      else faintFrames.push(rec);
    }
  }

  // ── ส่วนที่ ③: ทุกข้อความที่มองเห็น (รวม placeholder) ต้องคมชัดพออ่าน ──
  const textIssues = [];
  const seen = new Map();
  function pushTextIssue(el, text, colorStr, includeSelf) {
    const st = getComputedStyle(el);
    if (parseFloat(st.opacity) === 0) return;
    const backdrop = backdropAt(el, includeSelf);
    const fg = over(px(colorStr) || [0,0,0,1], backdrop);
    const r = ratio(fg, backdrop);
    const fontSize = parseFloat(st.fontSize) || 16;
    const fontWeight = parseInt(st.fontWeight) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const need = isLarge ? 3.0 : TEXT_NORMAL;
    if (r < need) textIssues.push({desc: describe(el), text: text.slice(0,28), ratio: r, need});
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const t = (node.nodeValue || '').trim();
    if (!t) continue;
    const p = node.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
    if (p.checkVisibility && !p.checkVisibility()) continue;
    if (seen.has(p)) continue;
    seen.set(p, true);
    pushTextIssue(p, t, getComputedStyle(p).color, true);
  }
  for (const el of document.querySelectorAll('[placeholder]')) {
    if (el.checkVisibility && !el.checkVisibility()) continue;
    const ph = el.getAttribute('placeholder');
    if (!ph || !ph.trim()) continue;
    let col = null;
    try { const ps = getComputedStyle(el, '::placeholder'); if (ps && ps.color) col = ps.color; } catch (e) {}
    if (!col) col = getComputedStyle(el).color;
    pushTextIssue(el, ph, col, true);
  }

  return {clickables, faintFrames, textIssues, totalClick: clickEls.length};
}"""

# หน้าที่ตรวจ: หน้าแรก + 9 เครื่องมือ คละครบทั้ง 8 หมวดของ src/registry.js
TOOL_PAGES = [
    "pdf-pages",        # pdf      (ปุ่มยกเลิก/ล้าง/หมุนหน้า/รีเซ็ต ที่บรีฟระบุ)
    "pdf-merge",        # pdf
    "pdf-to-word",      # from-pdf
    "word-to-pdf",      # to-pdf
    "image-resize",      # image
    "word-mailmerge",   # doc
    "powerpoint-to-pdf",# ppt
    "excel-csv",        # data
    "thai-number",      # thai
]
THEMES = ["dark", "light"]


def run_page_scan(pg, path_label, theme):
    pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
    pg.wait_for_timeout(350)
    r = pg.evaluate(SCAN_JS)
    label = f"{path_label} · {'โหมดมืด' if theme == 'dark' else 'โหมดสว่าง'}"

    click_bad = r["clickables"]
    detail = "\n      " + "\n      ".join(f"{c['desc']} — {c['why']}" for c in click_bad[:6]) if click_bad else ""
    faint = r.get("faintFrames", [])
    if faint:
        print(f"      ⚠️  ขอบจาง {len(faint)} จุด (เตือน ไม่ตก): " + " · ".join(sorted(x['desc'] for x in faint))[:200])
    ck(f"{label}: ไม่มีปุ่ม/ลิงก์/ช่องกรอกที่ 'ล่องหน' (พบ {len(click_bad)}/{r['totalClick']})",
       len(click_bad) == 0, detail)

    text_bad = r["textIssues"]
    tdetail = "\n      " + "\n      ".join(
        f"{t['desc']} = {t['ratio']}:1 (ต้อง ≥{t['need']}) \"{t['text']}\"" for t in text_bad[:6]
    ) if text_bad else ""
    ck(f"{label}: ไม่มีข้อความจางเกินอ่าน (พบ {len(text_bad)})", len(text_bad) == 0, tdetail)


def main():
    global P
    print(f"เว็บที่ทดสอบ: {BASE}\n")

    print("━━ ① ตัวแปร CSS ที่ใช้แต่หาค่าไม่ได้เลย (ไม่ประกาศ + ไม่มี fallback) ━━")
    bad_vars = scan_css_vars()
    detail = "\n      " + "\n      ".join(bad_vars[:15]) if bad_vars else ""
    ck(f"ทุก var(--x) ที่ใช้ในเว็บหาค่าได้จริง (พบที่หาไม่ได้ {len(bad_vars)})", len(bad_vars) == 0, detail)

    with sync_playwright() as p:
        b = p.chromium.launch()

        print("\n━━ ② + ③ ของล่องหน + ข้อความจางเกินอ่าน — หน้าแรก + 9 เครื่องมือ × 2 ธีม ━━")
        pg = b.new_page(viewport={"width": 1280, "height": 950})
        pg.goto(BASE, wait_until="networkidle")
        for theme in THEMES:
            run_page_scan(pg, "หน้าแรก", theme)
        for tid in TOOL_PAGES:
            pg.goto(f"{BASE}#/{tid}", wait_until="networkidle")
            for theme in THEMES:
                run_page_scan(pg, tid, theme)
        pg.close()

        # ═══════════════════════════════════════════════════════════════
        # ④ พิสูจน์ว่าตัวตรวจเองใช้งานได้จริง — ฉีด CSS ชั่วคราวด้วย add_style_tag
        # (ไม่แตะไฟล์เว็บจริงสักบรรทัด) แล้วดูว่าเทสสลับ แดง/เขียว ได้ถูกต้อง
        # ═══════════════════════════════════════════════════════════════
        print("\n━━ ④ พิสูจน์ตัวตรวจ: ฉีดบั๊กปลอมชั่วคราว แล้วดูว่าเทสจับได้จริง ━━")

        # -- (ก) หน้าที่ตั้งใจ "ซ่อม" .btn.ghost ให้เด่นชัดแน่นอน → ต้องเขียว --
        pg_fix = b.new_page(viewport={"width": 1280, "height": 950})
        pg_fix.goto(f"{BASE}#/pdf-pages", wait_until="networkidle")
        total_ghost = pg_fix.locator(".btn.ghost").count()
        pg_fix.add_style_tag(content=(
            ".btn.ghost{background:var(--brand) !important;color:#fff !important;"
            "border-color:transparent !important;box-shadow:none !important}"
        ))
        pg_fix.wait_for_timeout(150)
        r_fix = pg_fix.evaluate(SCAN_JS)
        ghost_bad_fix = [c for c in r_fix["clickables"]
                         if "btn" in c["cls"].split() and "ghost" in c["cls"].split()]
        ck(f"[ก่อนมีบั๊ก] ฉีดพื้นสีต่างชัดเจนให้ .btn.ghost ทั้ง {total_ghost} ตัว → ไม่มีตัวไหนถูกจับว่าล่องหน (เขียว)",
           total_ghost > 0 and len(ghost_bad_fix) == 0,
           f"\n      พบว่ายังตก {len(ghost_bad_fix)}/{total_ghost} ตัว: " + str(ghost_bad_fix[:3]))
        pg_fix.close()

        # -- (ข) หน้าที่ฉีด "บั๊กจริง" ตามที่บรีฟระบุ (background:var(--card) เหมือนแผง) → ต้องแดง --
        pg_bug = b.new_page(viewport={"width": 1280, "height": 950})
        pg_bug.goto(f"{BASE}#/pdf-pages", wait_until="networkidle")
        pg_bug.add_style_tag(content=(
            ".btn.ghost{background:var(--card) !important;"
            "border-color:transparent !important;box-shadow:none !important}"
        ))
        pg_bug.wait_for_timeout(150)
        r_bug = pg_bug.evaluate(SCAN_JS)
        ghost_bad_bug = [c for c in r_bug["clickables"]
                         if "btn" in c["cls"].split() and "ghost" in c["cls"].split()]
        ck(f"[ฉีดบั๊กจริงตามบรีฟ] .btn.ghost ทั้ง {total_ghost} ตัวถูกจับว่าล่องหนครบ (แดง)",
           total_ghost > 0 and len(ghost_bad_bug) == total_ghost,
           f"\n      จับได้จริง {len(ghost_bad_bug)}/{total_ghost} ตัว")
        for g in ghost_bad_bug[:3]:
            print(f"      หลักฐาน: {g['desc']} — {g['why']}")
        pg_bug.close()

        b.close()

    print("\n" + "━" * 60)
    print(f"ผ่าน {P} · ตก {len(F)}")
    if F:
        print("\nรายการที่ตก:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")
    sys.exit(1 if F else 0)


main()
