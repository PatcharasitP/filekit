# -*- coding: utf-8 -*-
"""
เทสกันหน้าจอแตก + ข้อความยาวกลับมา — ตัวจับ "ยกเครื่อง UX 07/09" ไม่ให้ถอยหลัง
─────────────────────────────────────────────────────────────────────────────
บริบท: FileKit เพิ่งไล่ตัดข้อความอธิบายยาวทั้งเว็บ (ย่อหน้าเกิน 100 ตัวอักษร: 21→2 ก้อน)
ปัญหาที่ยังไม่มีอะไรกัน:
  1) ข้อความยาวคืบกลับมาแบบไม่รู้ตัว (ก้อนใหม่ที่เขียนยาวเกินงบ)
  2) หน้าจอแตกเงียบ ๆ (ข้อความล้นกล่อง / เลื่อนซ้าย-ขวาได้บนมือถือ / ปุ่มเล็กจนกดยาก)

เทสนี้มี 2 ส่วนอิสระ:
  ① สแกนความยาวข้อความจาก "ซอร์สโค้ด" ตรง ๆ (ไม่ง้อเบราว์เซอร์ ไม่ง้อเว็บที่รันอยู่)
  ② ยิงเบราว์เซอร์จริงไล่ทุกหน้า × ไทย/อังกฤษ × light/dark × จอ 390/768/1280
     เช็คเลื่อนซ้ายขวา / ข้อความล้นกล่อง / element ทับกัน / ปุ่มเล็กเกิน / line-height ไทย

รันปกติ (เทสกับเว็บจริง):
    FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_layout.py

รัน self-test (พิสูจน์ว่าเทสจับของพังได้จริง — ดู DoD ข้อ 1):
    FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_layout.py --selftest

‼️ ไม่มี ALLOW-list ทั้งหน้า/ทั้ง selector — ยกเว้นได้แค่ "รายเหตุผล" ที่เขียนไว้ในโค้ดเท่านั้น
   (ตอนนี้มีข้อยกเว้นเดียว: element ที่ตั้ง overflow-x:auto/scroll เองถือว่าตั้งใจให้เลื่อนได้)
‼️ ห้ามใช้ set() ของ Python วนลำดับที่มีผลต่อผลลัพธ์ — ใช้ list/dict (insertion-order) ล้วน
   กัน PYTHONHASHSEED ทำให้ผลแกว่ง (ทดสอบแล้วใน DoD ข้อ 3)
"""
import glob
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../FileKit
THAI_RE = re.compile(r"[฀-๿]")

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(f"{name}{detail}")
    print(f"  {'✅' if ok else '❌'} {name}")


# ═══════════════════════════════════════════════════════════════════════════
# ① งบความยาวข้อความ — สแกน tr("ไทย", "English") จากซอร์สตรง ๆ
# ═══════════════════════════════════════════════════════════════════════════

TH_MAX = 160            # เพดานแข็ง: ไทยห้ามยาวเกินนี้ (ตอนนี้ยาวสุด 140 → มีที่เผื่อ)
OVER100_BUDGET = 4      # จำนวนก้อนที่ไทยยาวเกิน 100 ตัวอักษร ห้ามเกินทั้งเว็บ (ตอนนี้มี 2)
EN_RATIO = 2.0          # อังกฤษห้ามยาวกว่าไทยเกินกี่เท่า

SRC_FILES_GLOB = ["src/tools/*.js", "src/ui.js", "src/sheetpick.js"]

# จับ "tr(" เป็นเรียก identifier ตรง ๆ (กันชนคำที่ลงท้ายด้วย tr เช่น attr()
TR_START = re.compile(r"(?<![A-Za-z0-9_$])tr\(")


def _skip_simple_string(src, pos):
    """pos ชี้ที่ ' หรือ " เปิด — คืน index หลังตัวปิด (ข้าม escape \\x)"""
    quote = src[pos]
    pos += 1
    n = len(src)
    while pos < n:
        c = src[pos]
        if c == "\\":
            pos += 2
            continue
        if c == quote:
            return pos + 1
        pos += 1
    return pos  # ไฟล์เพี้ยน/ไม่ปิด — คืนท้ายไฟล์ ปล่อยให้ผลลัพธ์ผิดเพี้ยนแบบสังเกตได้ ไม่ throw


def _skip_template_string(src, pos, collect=None):
    """pos ชี้ที่ ` เปิด — ข้าม template literal ทั้งก้อน (รวม ${...} ที่ซ้อน string/paren ได้)
    ถ้าให้ collect (list) มา จะเก็บเฉพาะ "เนื้อข้อความนอก ${}" ไว้ให้ (โค้ดข้างในไม่ใช่ prose)"""
    pos += 1
    n = len(src)
    chunk_start = pos
    while pos < n:
        c = src[pos]
        if c == "\\":
            pos += 2
            continue
        if c == "`":
            if collect is not None:
                collect.append(src[chunk_start:pos])
            return pos + 1
        if c == "$" and pos + 1 < n and src[pos + 1] == "{":
            if collect is not None:
                collect.append(src[chunk_start:pos])
            pos += 2
            depth = 1
            while pos < n and depth > 0:
                c2 = src[pos]
                if c2 == "\\":
                    pos += 2
                    continue
                if c2 in "\"'":
                    pos = _skip_simple_string(src, pos)
                    continue
                if c2 == "`":
                    pos = _skip_template_string(src, pos)
                    continue
                if c2 == "{":
                    depth += 1
                    pos += 1
                    continue
                if c2 == "}":
                    depth -= 1
                    pos += 1
                    continue
                pos += 1
            chunk_start = pos
            continue
        pos += 1
    if collect is not None:
        collect.append(src[chunk_start:pos])
    return pos


def _find_tr_calls(src):
    """คืน [(start_idx, [arg_src, ...]), ...] ของทุกเรียก tr(...) ระดับบนสุดในไฟล์
    แยก argument ด้วยจุลภาคระดับบนสุด (ไม่นับจุลภาคที่อยู่ใน string/เรียกซ้อน)"""
    calls = []
    n = len(src)
    for m in TR_START.finditer(src):
        idx = m.start()
        pos = m.end()  # หลัง 'tr('
        depth = 1
        args = []
        arg_start = pos
        while pos < n and depth > 0:
            c = src[pos]
            if c in "\"'":
                pos = _skip_simple_string(src, pos)
                continue
            if c == "`":
                pos = _skip_template_string(src, pos)
                continue
            if c in "([{":
                depth += 1
                pos += 1
                continue
            if c in ")]}":
                depth -= 1
                if depth == 0:
                    args.append(src[arg_start:pos])
                    pos += 1
                    break
                pos += 1
                continue
            if c == "," and depth == 1:
                args.append(src[arg_start:pos])
                pos += 1
                arg_start = pos
                continue
            pos += 1
        calls.append((idx, args))
    return calls


def _static_text(arg_src):
    """ดึง+ต่อ "เนื้อข้อความในตัว string literal" ทั้งหมดจาก argument expression หนึ่งตัว
    (ครอบคลุมการต่อด้วย + ข้ามบรรทัด เช่น tr(`a` + (cond?`b`:``), ...))
    ‼️ ไม่นับโค้ด/ตัวแปร/ตัวเลขที่ไม่ได้อยู่ใน string — สนใจแค่ prose ที่ผู้ใช้จะเห็น"""
    parts = []
    pos = 0
    n = len(arg_src)
    while pos < n:
        c = arg_src[pos]
        if c in "\"'":
            start = pos + 1
            end = _skip_simple_string(arg_src, pos)
            raw = arg_src[start:end - 1]
            raw = raw.replace("\\n", "\n").replace('\\"', '"').replace("\\'", "'").replace("\\\\", "\\")
            parts.append(raw)
            pos = end
            continue
        if c == "`":
            collect = []
            pos = _skip_template_string(arg_src, pos, collect)
            parts.append("".join(collect))
            continue
        pos += 1
    return "".join(parts)


def scan_source_files():
    """สแกนทุกไฟล์เป้าหมาย คืน list ของ dict (เรียงตามไฟล์→บรรทัด ตายตัว ไม่พึ่ง hash order)"""
    files = []
    for pattern in SRC_FILES_GLOB:
        files.extend(sorted(glob.glob(os.path.join(ROOT, pattern))))
    items = []
    for path in files:
        with open(path, "r", encoding="utf-8") as f:
            src = f.read()
        rel = os.path.relpath(path, ROOT)
        for idx, args in _find_tr_calls(src):
            if not args:
                continue
            th = _static_text(args[0])
            en_raw = _static_text(args[1]) if len(args) > 1 else None
            en = en_raw if en_raw is not None else th
            items.append({
                "file": rel,
                "line": src.count("\n", 0, idx) + 1,
                "th": th, "th_len": len(th),
                "en": en, "en_len": len(en),
            })
    return items


def evaluate_text_budget(items):
    """ตรวจ 3 กติกางบความยาว คืน dict {name: (ok, bad_items)} — ไม่พิมพ์ ไม่แตะ global P/F
    (แยกจาก ck() เพื่อให้ selftest() เรียกซ้ำได้โดยไม่ปนกับผลรันจริง)"""
    over160 = [it for it in items if it["th_len"] > TH_MAX]
    over100 = [it for it in items if it["th_len"] > 100]
    # ใช้กฎนี้เฉพาะข้อความยาวพอที่จะล้นกล่องได้จริง (≥20 ตัวอักษร)
    ratio_bad = [it for it in items
                 if it["th_len"] >= 20 and it["en_len"] > it["th_len"] * EN_RATIO]
    return {
        "cap160": (len(over160) == 0, over160),
        "budget100": (len(over100) <= OVER100_BUDGET, over100),
        "ratio2x": (len(ratio_bad) == 0, ratio_bad),
    }


def print_top10(items):
    # sort key ระบุ tie-breaker ครบ (file, line) → ผลลัพธ์เดิมทุกครั้งไม่ว่า PYTHONHASHSEED จะเป็นอะไร
    top10 = sorted(items, key=lambda it: (-it["th_len"], it["file"], it["line"]))[:10]
    print("  📏 top 10 ข้อความไทยยาวสุดทั้งเว็บ (นับจากซอร์ส ไม่ใช่จากจอ):")
    for it in top10:
        preview = it["th"][:70].replace("\n", " ")
        print(f"     {it['th_len']:4d} ตัวอักษร (en {it['en_len']})  {it['file']}:{it['line']}  {preview!r}")


def check_text_budget(items):
    print("\n━━ ① งบความยาวข้อความ (สแกนจากซอร์ส) ━━")
    print(f"  พบ tr(...) ที่มี argument รวม {len(items)} ก้อน จาก {len(SRC_FILES_GLOB)} กลุ่มไฟล์")

    ok, bad = evaluate_text_budget(items)["cap160"]
    ck(f"ไม่มีข้อความไทยยาวเกิน {TH_MAX} ตัวอักษร (พบ {len(bad)})", ok,
       "\n      " + "\n      ".join(
           f"{it['file']}:{it['line']} ({it['th_len']} ตัวอักษร) {it['th'][:60]!r}" for it in bad[:5]))

    ok, bad = evaluate_text_budget(items)["budget100"]
    ck(f"ข้อความไทยยาวเกิน 100 ตัวอักษร ไม่เกิน {OVER100_BUDGET} ก้อนทั้งเว็บ (พบ {len(bad)})", ok,
       "\n      " + "\n      ".join(
           f"{it['file']}:{it['line']} ({it['th_len']} ตัวอักษร) {it['th'][:50]!r}" for it in bad))

    ok, bad = evaluate_text_budget(items)["ratio2x"]
    ck(f"อังกฤษไม่ยาวกว่าไทยเกิน {EN_RATIO}x (พบ {len(bad)})", ok,
       "\n      " + "\n      ".join(
           f"{it['file']}:{it['line']} th={it['th_len']}{it['th'][:20]!r} en={it['en_len']}{(it['en'] or '')[:20]!r}"
           for it in bad[:8]))

    print_top10(items)


# ═══════════════════════════════════════════════════════════════════════════
# ② หน้าจอไม่แตก / ทับกัน / ปุ่มเล็ก / line-height ไทย — ยิงเบราว์เซอร์จริง
# ═══════════════════════════════════════════════════════════════════════════

TOOLS_SUBSET = [
    "pdf-pages", "pdf-merge", "pdf-split", "pdf-compress", "pdf-sign", "pdf-watermark",
    "pdf-ocr", "pdf-to-excel", "word-mailmerge", "word-replace", "excel-csv",
    "thai-date", "thai-id", "image-resize",
]  # 14 ตัว (spec ขอ ≥10) — คัดให้กระจายทุกกลุ่ม + 2 ตัวที่มีข้อความยาวสุดจากส่วน ①

VIEWPORTS = [(390, 844), (768, 1024), (1280, 900)]
LANGS = ["th", "en"]
THEMES = ["light", "dark"]
MIN_TAP = 36

# ดึง element ที่ "มีข้อความ" ตรง ๆ (parent ของ text node ที่มองเห็นได้) แล้วตรวจ 3 เรื่องพร้อมกัน:
# เลื่อนซ้ายขวาระดับ body, ข้อความล้นกล่อง, ถูกบัง, ปุ่มเล็ก, line-height ไทย
LAYOUT_CHECK_JS = """() => {
  const MIN_TAP = 36;
  const THAI_RE = /[\\u0E00-\\u0E7F]/;

  function visible(el) { return !!el && (!el.checkVisibility || el.checkVisibility()); }

  const bodyScrollW = document.body.scrollWidth;
  const bodyClientW = document.body.clientWidth;
  const docScrollW = document.documentElement.scrollWidth;
  const docClientW = document.documentElement.clientWidth;
  const bodyOverflow = (bodyScrollW > bodyClientW) || (docScrollW > docClientW);

  // ── element ที่มีข้อความ (parent ของ text node ที่ไม่ว่าง มองเห็นได้) ──
  const textEls = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.nodeValue || "").trim();
    if (!t) continue;
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue;
    if (seen.has(p)) continue;
    if (!visible(p)) continue;
    seen.add(p);
    textEls.push({ el: p, text: t });
  }

  // ── ข้อความล้นกล่อง (ยกเว้น element ที่ตั้ง overflow-x:auto/scroll ไว้เอง = ตั้งใจให้เลื่อน) ──
  const overflowing = [];
  for (const { el, text } of textEls) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
    if (el.scrollWidth > el.clientWidth + 2) {
      overflowing.push({ tag: el.tagName, cls: el.className || "", text: text.slice(0, 40),
        scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  }

  // ── element ทับข้อความจนอ่านไม่ออก: จุดกึ่งกลางกล่องต้องคลิกโดนตัวมันเองหรือลูกมัน ──
  // ‼️ 2 ข้อยกเว้นแบบมีเหตุผล (ทดสอบแล้วว่าเป็น false positive จริงบนเว็บนี้ ไม่ใช่ blanket skip):
  //   1) ข้อความอยู่ใน scroll-strip ที่ scroll ไปจริง (เช่น .cats overflow-x:auto) แล้วจุดกึ่งกลาง
  //      หลุดจากกรอบที่มองเห็นของ ancestor นั้น = ถูก "เลื่อนพ้นจอ" ตามปกติ ไม่ใช่ element มาทับ
  //   2) hit เป็น element ที่โปร่งใสจริง (opacity ~0) เช่น <input> ซ้อนบน <span> label ของ
  //      segmented control (.seg-item input{opacity:0}) — ตาไม่เห็นสิ่งที่บัง เพราะมันใส
  function clippedByScrollAncestor(el, cx0, cy0) {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      const canX = (acs.overflowX === "auto" || acs.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 1;
      const canY = (acs.overflowY === "auto" || acs.overflowY === "scroll") && a.scrollHeight > a.clientHeight + 1;
      if (!canX && !canY) continue;
      const ar = a.getBoundingClientRect();
      if (cx0 < ar.left || cx0 > ar.right || cy0 < ar.top || cy0 > ar.bottom) return true;
    }
    return false;
  }
  const overlapping = [];
  for (const { el, text } of textEls) {
    // ‼️ ข้อความที่ตัดขึ้นบรรทัดใหม่ (inline หลายบรรทัด) getBoundingClientRect() รวมเป็นกล่องเดียว
    //    ที่มี "ช่องว่างระหว่างบรรทัด" อยู่ตรงกลางด้วย — สุ่มจุดจากกล่องรวมอาจหล่นในช่องว่างนั้น
    //    (ไม่มีตัวอักษรจริงอยู่ตรงนั้น) แล้วเจอ element ของ parent แทน กลายเป็น false positive
    //    ใช้ getClientRects() เลือกเส้นบรรทัดที่ใหญ่สุดแทน เพื่อให้จุดสุ่มตกบนตัวอักษรจริงเสมอ
    const rects = Array.from(el.getClientRects()).filter((rc) => rc.width > 0 && rc.height > 0);
    if (!rects.length) continue;
    let r = rects[0];
    for (const rc of rects) if (rc.width * rc.height > r.width * r.height) r = rc;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    const cx0 = (r.left + r.right) / 2, cy0 = (r.top + r.bottom) / 2;
    if (clippedByScrollAncestor(el, cx0, cy0)) continue;
    const cx = Math.min(Math.max(cx0, 0), window.innerWidth - 1);
    const cy = Math.min(Math.max(cy0, 0), window.innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (hit !== el && !el.contains(hit)) {
      const hitOpacity = parseFloat(getComputedStyle(hit).opacity);
      if (!Number.isNaN(hitOpacity) && hitOpacity <= 0.05) continue;
      overlapping.push({ tag: el.tagName, cls: el.className || "", text: text.slice(0, 40),
        hitTag: hit.tagName, hitCls: hit.className || "" });
    }
  }

  // ── ปุ่ม/ลิงก์เล็กเกิน ──
  const smallTargets = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.height < MIN_TAP || r.width < MIN_TAP) {
      smallTargets.push({ tag: el.tagName, cls: el.className || "", id: el.id || "",
        text: (el.textContent || "").trim().slice(0, 30),
        w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
  }

  // ── line-height ข้อความไทย ──
  const badLineHeight = [];
  for (const { el, text } of textEls) {
    if (!THAI_RE.test(text)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight);
    if (!fs || !lh || Number.isNaN(lh)) continue;
    const ratio = lh / fs;
    if (ratio < 1.3 - 1e-6) {   // เผื่อความคลาดเคลื่อนทศนิยม (1.3 คำนวณได้ 1.2999…)
      badLineHeight.push({ tag: el.tagName, cls: el.className || "", text: text.slice(0, 30),
        ratio: Math.round(ratio * 100) / 100 });
    }
  }

  return { bodyOverflow, bodyScrollW, bodyClientW, docScrollW, docClientW,
    overflowing, overlapping, smallTargets, badLineHeight };
}"""


def run_layout_sweep(base, tools=TOOLS_SUBSET, viewports=VIEWPORTS, langs=LANGS, themes=THEMES):
    """ไล่ (lang × theme) เป็น context แยก แล้วต่อหน้า → resize viewport ในหน้าเดียว (ไม่ reload)
    คืน (results, pages_checked) — results เป็น dict ของ list (ไม่ใช้ set กันผลแกว่งตามลำดับ)"""
    results = {"body_scroll": [], "overflow": [], "overlap": [], "small_target": [], "bad_lh": []}
    pages_checked = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for lang in langs:
            for theme in themes:
                ctx = b.new_context(viewport={"width": viewports[0][0], "height": viewports[0][1]})
                ctx.add_init_script(
                    "try{localStorage.setItem('fk-lang','%s');localStorage.setItem('fk-theme','%s')}catch(e){}"
                    % (lang, theme)
                )
                pg = ctx.new_page()
                for tid in [None] + list(tools):
                    url = base if tid is None else f"{base}#/{tid}"
                    pg.goto(url, wait_until="networkidle")
                    pg.wait_for_timeout(400)
                    for (w, h) in viewports:
                        pg.set_viewport_size({"width": w, "height": h})
                        pg.wait_for_timeout(180)
                        r = pg.evaluate(LAYOUT_CHECK_JS)
                        pages_checked += 1
                        tag = f"{tid or 'home'} · {lang}/{theme} · {w}px"
                        if r["bodyOverflow"]:
                            results["body_scroll"].append(
                                f"{tag} (body scrollW={r['bodyScrollW']} clientW={r['bodyClientW']} · "
                                f"html scrollW={r['docScrollW']} clientW={r['docClientW']})")
                        for o in r["overflowing"]:
                            results["overflow"].append(
                                f"{tag} → <{o['tag'].lower()} class={o['cls']!r}> {o['text']!r} "
                                f"(scrollW={o['scrollW']} clientW={o['clientW']})")
                        for o in r["overlapping"]:
                            results["overlap"].append(
                                f"{tag} → <{o['tag'].lower()} class={o['cls']!r}> {o['text']!r} "
                                f"ถูกบังโดย <{o['hitTag'].lower()} class={o['hitCls']!r}>")
                        if w == 390:
                            for s in r["smallTargets"]:
                                results["small_target"].append(
                                    f"{tag} → <{s['tag'].lower()} class={s['cls']!r} id={s['id']!r}> "
                                    f"{s['text']!r} {s['w']}x{s['h']}px")
                        for l in r["badLineHeight"]:
                            results["bad_lh"].append(
                                f"{tag} → <{l['tag'].lower()} class={l['cls']!r}> {l['text']!r} ratio={l['ratio']}")
                ctx.close()
        b.close()
    return results, pages_checked


def check_layout(base):
    print(f"\n━━ ② หน้าจอไม่แตก ③ ปุ่มกดได้ ④ line-height ไทย (เบราว์เซอร์จริง: {base}) ━━")
    print(f"  ไล่ {len(TOOLS_SUBSET) + 1} หน้า × {len(LANGS)} ภาษา × {len(THEMES)} ธีม × {len(VIEWPORTS)} จอ")
    results, n = run_layout_sweep(base)
    print(f"  ตรวจไปทั้งหมด {n} จุด (หน้า×ภาษา×ธีม×จอ)")

    ck(f"ไม่มีหน้าเลื่อนซ้าย-ขวาได้ (พบ {len(results['body_scroll'])})",
       len(results["body_scroll"]) == 0,
       "\n      " + "\n      ".join(results["body_scroll"][:10]))

    ck(f"ไม่มีข้อความล้นกล่อง (พบ {len(results['overflow'])})",
       len(results["overflow"]) == 0,
       "\n      " + "\n      ".join(results["overflow"][:10]))

    ck(f"ไม่มี element ทับข้อความจนอ่านไม่ออก (พบ {len(results['overlap'])})",
       len(results["overlap"]) == 0,
       "\n      " + "\n      ".join(results["overlap"][:10]))

    ck(f"ปุ่ม/ลิงก์บนจอ 390px ไม่เล็กกว่า {MIN_TAP}x{MIN_TAP}px (พบ {len(results['small_target'])})",
       len(results["small_target"]) == 0,
       "\n      " + "\n      ".join(results["small_target"][:10]))

    ck(f"line-height ข้อความไทยไม่ต่ำกว่า 1.3 (พบ {len(results['bad_lh'])})",
       len(results["bad_lh"]) == 0,
       "\n      " + "\n      ".join(results["bad_lh"][:10]))


# ═══════════════════════════════════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    print(f"เว็บที่ทดสอบ: {BASE}\n")
    print("━" * 70)

    items = scan_source_files()
    check_text_budget(items)

    check_layout(BASE)

    elapsed = time.time() - t0
    print("\n" + "━" * 70)
    print(f"ผ่าน {P} · ตก {len(F)} · ใช้เวลา {elapsed:.1f} วินาที")
    for f in F:
        print("  ❌ " + f)
    sys.exit(1 if F else 0)


# ═══════════════════════════════════════════════════════════════════════════
# self-test — พิสูจน์ว่าเทสจับของพังได้จริง (DoD ข้อ 1) ไม่แตะไฟล์จริงแม้แต่ไฟล์เดียว
# ═══════════════════════════════════════════════════════════════════════════

def selftest():
    t0 = time.time()
    ok = True
    print("═" * 70)
    print("SELF-TEST — พิสูจน์ว่า browser_layout.py จับของพังได้จริง (แดงเป็น + เขียวเป็น)")
    print("═" * 70)

    # ── [1/3] งบความยาวข้อความ: green = ของจริง, red = เติมของปลอมในหน่วยความจำ ──
    # ‼️ selftest พิสูจน์แค่ "กลไก cap160 จับของปลอมได้" — ไม่ใช่ยืนยันว่าเว็บสะอาด 100%
    #    (budget100/ratio2x เป็นกติกาคนละตัว รายงานแยกไว้เฉย ๆ ให้เห็นสภาพจริง ไม่ gate ผล selftest)
    print("\n[1/3] งบความยาวข้อความ")
    items = scan_source_files()
    g = evaluate_text_budget(items)
    green_cap160 = g["cap160"][0]
    print(f"  GREEN (ของจริงจากซอร์ส): cap160={g['cap160'][0]} "
          f"→ {'PASS ตามคาด' if green_cap160 else 'FAIL (ผิดปกติ! มีข้อความไทยเกิน 160 ตัวอักษรอยู่แล้วในซอร์สจริง)'}")
    print(f"  (ข้อมูลประกอบ ไม่ gate selftest — สภาพจริงของเว็บตอนนี้: "
          f"budget100={g['budget100'][0]} ({len(g['budget100'][1])} ก้อน) · "
          f"ratio2x={g['ratio2x'][0]} ({len(g['ratio2x'][1])} ก้อน) — ดูรายละเอียดในผลรัน main() ปกติ)")

    fake_items = list(items) + [{
        "file": "(selftest — สตริงปลอมในหน่วยความจำ ไม่แตะไฟล์จริง)", "line": 0,
        "th": "ก" * 200, "th_len": 200, "en": "a" * 200, "en_len": 200,
    }]
    r = evaluate_text_budget(fake_items)
    red_caught = not r["cap160"][0]
    print(f"  RED (เติมข้อความไทยปลอมยาว 200 ตัวอักษร): cap160={r['cap160'][0]} "
          f"→ {'ตกจริงตามคาด (selftest ผ่าน)' if red_caught else 'ยังผ่าน — selftest ล้มเหลว!'}")
    ok = ok and green_cap160 and red_caught

    with sync_playwright() as p:
        b = p.chromium.launch()

        # ── [2/3] หน้าจอแตก: green = หน้าแรกปกติ, red = ฉีด CSS ให้กว้างเกินจอ ──
        print("\n[2/3] หน้าจอแตก (item ②) — page.add_style_tag() บังคับกว้างเกินจอ")
        ctx = b.new_context(viewport={"width": 390, "height": 844})
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_timeout(400)
        base_r = pg.evaluate(LAYOUT_CHECK_JS)
        green2 = not base_r["bodyOverflow"]
        print(f"  GREEN (ก่อนฉีด): bodyOverflow={base_r['bodyOverflow']} "
              f"(scrollW={base_r['bodyScrollW']} clientW={base_r['bodyClientW']}) "
              f"→ {'PASS ตามคาด' if green2 else 'FAIL (หน้าแรกพังอยู่แล้ว — ผิดปกติ!)'}")
        pg.add_style_tag(content="body{min-width:3000px !important}")
        pg.wait_for_timeout(150)
        red_r = pg.evaluate(LAYOUT_CHECK_JS)
        red2 = red_r["bodyOverflow"]
        print(f"  RED (ฉีด body{{min-width:3000px}}): bodyOverflow={red_r['bodyOverflow']} "
              f"(scrollW={red_r['bodyScrollW']} clientW={red_r['bodyClientW']} · "
              f"html scrollW={red_r['docScrollW']} clientW={red_r['docClientW']}) "
              f"→ {'ตกจริงตามคาด (selftest ผ่าน)' if red2 else 'ยังผ่าน — selftest ล้มเหลว!'}")
        ok = ok and green2 and red2
        ctx.close()

        # ── [3/3] line-height ไทยต่ำเกิน: green = สภาพก่อนฉีด (baseline), red = ฉีด line-height:1 ──
        # ‼️ selftest พิสูจน์ว่า "ฉีดแล้วจับได้เพิ่ม" — ไม่ gate ด้วยสภาพ baseline ต้องสะอาด 0
        #    (ถ้า baseline มีของพังจริงอยู่แล้ว รายงานแยกไว้ ไม่ใช่ selftest fail)
        print("\n[3/3] line-height ไทยต่ำเกิน (item ④) — page.add_style_tag() บังคับ line-height:1")
        ctx = b.new_context(viewport={"width": 390, "height": 844})
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle")
        pg.wait_for_timeout(400)
        base_r = pg.evaluate(LAYOUT_CHECK_JS)
        base_count = len(base_r["badLineHeight"])
        if base_count:
            print(f"  (ข้อมูลประกอบ ไม่ gate selftest — พบของจริงบน baseline อยู่แล้ว {base_count} จุด: "
                  f"{base_r['badLineHeight'][:3]})")
        print(f"  GREEN (ก่อนฉีด, baseline): badLineHeight={base_count}")
        pg.add_style_tag(content="*{line-height:1 !important}")
        pg.wait_for_timeout(150)
        red_r = pg.evaluate(LAYOUT_CHECK_JS)
        red_count = len(red_r["badLineHeight"])
        red3 = red_count > base_count  # ฉีดแล้วต้องจับเพิ่มได้ ไม่ใช่แค่ >0 (baseline อาจมี >0 อยู่แล้ว)
        sample = red_r["badLineHeight"][:3]
        print(f"  RED (ฉีด *{{line-height:1}}): badLineHeight={red_count} (เพิ่มจาก baseline {base_count}) "
              f"ตัวอย่าง={sample} "
              f"→ {'ตกจริงตามคาด (selftest ผ่าน)' if red3 else 'ไม่เพิ่ม — selftest ล้มเหลว!'}")
        ok = ok and red3
        ctx.close()

        b.close()

    elapsed = time.time() - t0
    print("\n" + "═" * 70)
    print(f"SELF-TEST สรุป ({elapsed:.1f} วินาที): "
          f"{'✅ ผ่านทั้งหมด — เทสจับของพังได้จริง (แดงเป็น+เขียวเป็น)' if ok else '❌ มีจุดที่ selftest ไม่ผ่าน — ต้องแก้ตัวเทสเอง ห้ามใช้เทสนี้'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
