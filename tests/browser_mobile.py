# -*- coding: utf-8 -*-
"""
เทสมือถือ 390×844 — ล็อกพฤติกรรม UX มือถือของ "ทุกเครื่องมือ" หลังยกเครื่อง UX 07/09/2026
─────────────────────────────────────────────────────────────────────────────
บริบท: tests/browser_layout.py คุมเรื่องหน้าจอแตก/ปุ่มเล็ก/line-height ไทย แต่ตรวจแค่ 14 เครื่องมือ
(TOOLS_SUBSET) และไม่เคยกดใส่ไฟล์เลยสักครั้ง (แค่เปิดหน้าเปล่าแล้ว resize จอ) — เทสนี้เติมช่องว่างนั้น:
ไล่ "ครบทุกเครื่องมือ" ในทะเบียนจริง (src/registry.js) ที่จอ 390×844 ตัวเดียว ทั้ง "ก่อน" และ
"หลัง" กดปุ่ม "ลองด้วยไฟล์ตัวอย่าง" (ทุกปุ่มบนหน้า — บางเครื่องมือมี 2 dropzone เช่น word-mailmerge)
แล้วตรวจ 5 เรื่องตาม brief:
  ① ไม่มีสกอลล์แนวนอน
  ② ปุ่มลงมือทำอยู่ในจอทุกจังหวะเลื่อน (scrollY=0 / กลางหน้า / ท้ายหน้า) หลังใส่ไฟล์
  ③ ไม่มีกับดักสกอลล์ซ้อน (inner overflow-y ที่สูง <70% จอ)
  ④ tap target ปุ่ม/ลิงก์/checkbox/radio/select ≥36×36px (เน้นหลังใส่ไฟล์ ที่ browser_layout.py ไม่ครอบ)
  ⑤ ท้ายหน้าไม่ถูกแถบลอย (position:fixed/sticky) บัง
บวกล็อกพฤติกรรมที่เพิ่งแก้วันนี้ (commit 3f25295): เครื่องมือแบบ "แผง 3 ช่อง" (workspace() — pdf-pages ·
pdf-sign · pdf-watermark · pdf-compress · image-resize · pdf-split) แถบปุ่ม .ws-footer ต้อง "ไม่ลอย/ไม่ทับ"
ข้อความ "ยังไม่มีไฟล์…" ตอนยังไม่มีไฟล์ (ลอยเฉพาะหลังมีไฟล์ — CSS: .ws-body.has-file .ws-footer{sticky}).

รันปกติ:
    FK_BASE=http://localhost:8984 ../.venv/bin/python tests/browser_mobile.py

รัน self-test (พิสูจน์ว่าเทสจับของพังได้จริง — ฉีด CSS ปลอม 3 แบบ):
    FK_BASE=http://localhost:8984 ../.venv/bin/python tests/browser_mobile.py --selftest

‼️ บันทึกจากการ "เปิดดูจริงก่อนเขียน assert" (ไม่ใช่เดา):
  - screen.width/screen.height เสถียรกว่า window.innerWidth/innerHeight ภายใต้ Playwright mobile
    emulation — วัดจริงพบว่าพอฉีด CSS ให้เนื้อหากว้างเกินจอ (ไม่มี overflow-x:auto ของ ancestor คั่น)
    window.innerWidth "ขยายตาม" เนื้อหาไปด้วย (390→600/916 พร้อมกับ scrollWidth) ทำให้เช็ค
    scrollWidth>innerWidth ไม่มีทางเป็นจริงได้เลย ส่วน screen.width/screen.height นิ่งเท่าตัวจอเสมอ
    (ยืนยันด้วยการฉีดจริงแล้ววัดค่า) — เทสนี้จึงใช้ screen.width/height เป็นตัวเทียบ ไม่ใช่ window.inner*
  - ".xt-wrap{overflow-x:auto}" (ตารางพรีวิวผลลัพธ์ thai-name/thai-address/thai-number ฯลฯ) เป็นช่อง
    เลื่อนแนวนอนที่ตั้งใจ (ตัวตารางกว้างเกินกล่องแต่ตัวกล่องเองไม่ทะลุจอ) — ยกเว้นให้เมื่อ "ancestor"
    ตั้ง overflow-x:auto/scroll ไว้เองและ ancestor นั้นเองไม่ทะลุขอบจอ (ไม่ใช่แค่ตัว element เองเท่านั้น)
  - checkbox/radio ใน FileKit ถูกห่อด้วย <label class="clean-check"|"seg-item"> เสมอ (คลิกที่ label
    ก็ติ๊กได้ = tap target จริงคือกล่อง label ไม่ใช่แค่ตัว <input> 16×16px) — เทสนี้จึงวัดที่ label
    ครอบ (closest('label')) ถ้ามี ไม่ใช่วัด <input> ตรง ๆ (วัดจริงแล้ว label สูงแค่ 24px ก็ยังไม่ถึง 36
    อยู่ดี — เป็นของจริงที่ตกจริง ไม่ใช่ false positive)
  - document.documentElement.scrollHeight ยังไม่นิ่งทันทีหลังกดปุ่มตัวอย่าง (พรีวิวตาราง/ภาพย่อ render
    ต่อแบบ async) — ต้องรอจน scrollHeight นิ่ง 2 รอบติด (wait_stable) ก่อนคำนวณจุดกึ่งกลาง/ท้ายหน้า
    ไม่งั้นตัวเลขเพี้ยน (วัดจริงเจอ word-mailmerge ให้ค่าคลาดเคลื่อนหลักพัน px ถ้าไม่รอให้นิ่งก่อน)
"""
import json
import os
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
ROOT = pathlib.Path(__file__).resolve().parent.parent
VIEWPORT = {"width": 390, "height": 844}
MIN_TAP = 36
SAMPLE_BTN_TEXT = "ลองด้วยไฟล์ตัวอย่าง"

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok:
        P += 1
    else:
        F.append(f"{name}{detail}")
    print(f"  {'✅' if ok else '❌'} {name}")


def _tool_ids():
    """รายชื่อเครื่องมืออ่านจากทะเบียนจริง (src/registry.js) ตรง ๆ — ห้ามฮาร์ดโค้ดจำนวน/รายชื่อ
    เพิ่มเครื่องมือใหม่แล้วเทสนี้ไล่ตามเองอัตโนมัติ ไม่ต้องแก้ไฟล์นี้"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e",
         'import {TOOLS} from "./src/registry.js"; console.log(JSON.stringify(TOOLS.map(t=>t.id)))'],
        cwd=str(ROOT), capture_output=True, text=True, check=True).stdout
    return json.loads(out)


TOOLS = _tool_ids()


# ═══════════════════════════════════════════════════════════════════════════
# JS checkers — รันในหน้าเว็บจริงผ่าน page.evaluate()
# ═══════════════════════════════════════════════════════════════════════════

# ① สกอลล์แนวนอน · ③ กับดักสกอลล์ซ้อน · ④ tap target — ตรวจพร้อมกันในจุดสแกนเดียว (ประหยัดรอบ)
SCAN_JS = """() => {
  const MIN_TAP = 36;
  const W = screen.width, H = screen.height;   // ‼️ ใช้ screen.* ไม่ใช่ window.inner* (ดูเหตุผลบนสุดไฟล์)
  function visible(el){ return !!el && (!el.checkVisibility || el.checkVisibility()); }

  // element ที่ "ตัวเองไม่ทะลุจอ" แต่ตั้ง overflow-x:auto/scroll ไว้เอง = ช่องเลื่อนที่ตั้งใจ
  // ลูกที่ทะลุกรอบของช่องนั้น (แต่ไม่ทะลุจอจริง เพราะโดนช่องเลื่อนครอบ) จึงไม่นับเป็นสกอลล์แนวนอนของทั้งหน้า
  function containedByScrollAncestor(el) {
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "auto" || cs.overflowX === "scroll") {
        const r = a.getBoundingClientRect();
        if (r.right <= W + 1) return true;
      }
      if (a === document.body) break;
    }
    return false;
  }

  const docScrollW = document.documentElement.scrollWidth;
  const bodyOverflow = docScrollW > W + 1;
  const offenders = [];
  const all = document.body.querySelectorAll("*");
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > W + 1) {
      if (containedByScrollAncestor(el)) continue;
      offenders.push({ tag: el.tagName, cls: (el.className || "") + "", right: Math.round(r.right) });
      if (offenders.length > 10) break;
    }
  }

  // ③ กับดักสกอลล์ซ้อน — element ที่ overflow-y:auto/scroll + scrollHeight>clientHeight + สูง<70% จอ
  // (ยกเว้น select/textarea/pre ตามสเปก)
  const traps = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const tag = el.tagName;
    if (tag === "SELECT" || tag === "TEXTAREA" || tag === "PRE") continue;
    const cs = getComputedStyle(el);
    if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") continue;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < H * 0.7) {
      traps.push({ tag, cls: (el.className || "") + "", h: Math.round(r.height),
        scrollH: el.scrollHeight, clientH: el.clientHeight });
      if (traps.length > 10) break;
    }
  }

  // ④ tap target — checkbox/radio วัดที่ <label> ครอบ (ถ้ามี) เพราะนั่นคือพื้นที่กดจริง ไม่ใช่แค่ input เอง
  const smalls = [];
  for (const el of document.querySelectorAll('button, a, input[type=checkbox], input[type=radio], select, [role="button"]')) {
    if (!visible(el)) continue;
    let target = el;
    if (el.tagName === "INPUT") {
      const lbl = el.closest("label");
      if (lbl) target = lbl;
    }
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.width < MIN_TAP || r.height < MIN_TAP) {
      smalls.push({ tag: el.tagName, targetTag: target.tagName, cls: (target.className || "") + "",
        text: (target.textContent || "").trim().slice(0, 34),
        w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
  }

  return { docScrollW, W, H, bodyOverflow, offenders, traps, smalls };
}"""

# ② ปุ่มลงมือทำ — คืน rect ของทุกปุ่ม/ลิงก์ที่มองเห็นได้ใน .ws-footer (ถ้ามี — แผง 3 ช่อง) หรือ .actions แรกของหน้า
BTN_JS = """() => {
  const footer = document.querySelector(".ws-footer");
  const container = footer || document.querySelector(".actions");
  if (!container) return { hasContainer: false, buttons: [] };
  function visible(el){ return !!el && (!el.checkVisibility || el.checkVisibility()); }
  const btns = Array.from(container.querySelectorAll("button, a[href]")).filter((b) => {
    if (!visible(b)) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }).map((b) => {
    const r = b.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, text: (b.textContent || "").trim().slice(0, 26) };
  });
  return { hasContainer: true, isWorkspace: !!footer, buttons: btns };
}"""

# ⑤ ท้ายหน้าไม่ถูกแถบลอยบัง — หา "ข้อความที่อยู่ท้ายสุดของเอกสาร" จริง ๆ (rect.bottom มากสุด) แล้วเช็คว่า
# จุดกึ่งกลางของมันยังคลิกโดนตัวมันเอง ไม่ใช่ element position:fixed/sticky ที่ลอยมาทับ
END_JS = """() => {
  function visible(el){ return !!el && (!el.checkVisibility || el.checkVisibility()); }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let best = null, bestBottom = -Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.nodeValue || "").trim();
    if (!t) continue;
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue;
    if (!visible(p)) continue;
    const rects = Array.from(p.getClientRects()).filter((rc) => rc.width > 0 && rc.height > 0);
    if (!rects.length) continue;
    const r = rects[rects.length - 1];
    if (r.bottom > bestBottom) { bestBottom = r.bottom; best = { el: p, text: t, r }; }
  }
  if (!best) return { found: false };
  const { el, text, r } = best;
  const cx = Math.min(Math.max((r.left + r.right) / 2, 0), window.innerWidth - 1);
  const cy = Math.min(Math.max((r.top + r.bottom) / 2, 0), window.innerHeight - 1);
  const hit = document.elementFromPoint(cx, cy);
  let covered = false, hitInfo = null;
  if (hit && hit !== el && !el.contains(hit)) {
    let cur = hit, isFloating = false;
    while (cur && cur !== document.body) {
      const pos = getComputedStyle(cur).position;
      if (pos === "fixed" || pos === "sticky") { isFloating = true; break; }
      cur = cur.parentElement;
    }
    const hitOpacity = parseFloat(getComputedStyle(hit).opacity);
    if (isFloating && !(!Number.isNaN(hitOpacity) && hitOpacity <= 0.05)) {
      covered = true;
      hitInfo = { tag: hit.tagName, cls: (hit.className || "") + "" };
    }
  }
  return { found: true, text: text.slice(0, 60), covered, hitInfo };
}"""

# ‼️ regression lock วันนี้ (commit 3f25295) — .ws-footer ต้อง "ไม่ลอย" และ "ไม่ทับ" ข้อความ
# "ยังไม่มีไฟล์…" ตอนยังไม่มีไฟล์ (เฉพาะเครื่องมือแผง 3 ช่องที่มี .ws-footer)
EMPTY_JS = """() => {
  const wb = document.querySelector(".ws-body");
  const footer = document.querySelector(".ws-footer");
  const emptyBox = document.querySelector(".ws-empty");
  if (!wb || !footer || !emptyBox) return null;
  const hasFile = wb.classList.contains("has-file");
  const fcs = getComputedStyle(footer);
  const floating = fcs.position === "fixed" || fcs.position === "sticky";
  let coversEmpty = false;
  if (!emptyBox.hidden) {
    const fr = footer.getBoundingClientRect();
    const er = emptyBox.getBoundingClientRect();
    const ox = Math.max(0, Math.min(fr.right, er.right) - Math.max(fr.left, er.left));
    const oy = Math.max(0, Math.min(fr.bottom, er.bottom) - Math.max(fr.top, er.top));
    coversEmpty = ox > 0 && oy > 0;
  }
  return { hasFile, floating, coversEmpty, position: fcs.position };
}"""

# สัญญาณ "โหลดไฟล์ตัวอย่างเสร็จแล้ว" — ต้องเป็นสากลใช้ได้ทั้งเครื่องมือธรรมดา (สร้าง .file-row เสมอ)
# และแผง 3 ช่อง (image-resize ปิด thumbs ของ dropzone ไว้ ใช้แกลเลอรีเอง — เช็คจาก .ws-body.has-file แทน)
LOADED_JS = """(n) => document.querySelectorAll(".file-row").length >= n ||
  (document.querySelector(".ws-body") && document.querySelector(".ws-body").classList.contains("has-file"))"""


def wait_loaded(pg, expect_n, tries=30, step_ms=200):
    for _ in range(tries):
        pg.wait_for_timeout(step_ms)
        if pg.evaluate(LOADED_JS, expect_n):
            return True
    return False


def wait_stable(pg, tries=25, step_ms=250):
    """รอ document.documentElement.scrollHeight นิ่ง 2 รอบติดกัน — พรีวิว/ภาพย่อ render ต่อแบบ async
    หลังกดปุ่มตัวอย่าง วัดตำแหน่งก่อนนิ่งแล้วจะได้ scrollY เพี้ยน (ดูเหตุผลบนสุดไฟล์)"""
    prev, stable = -1, 0
    for _ in range(tries):
        h = pg.evaluate("document.documentElement.scrollHeight")
        if h == prev:
            stable += 1
            if stable >= 2:
                return h
        else:
            stable = 0
        prev = h
        pg.wait_for_timeout(step_ms)
    return prev


def scroll_to(pg, y):
    pg.evaluate("(y) => window.scrollTo({top: y, left: 0, behavior: 'instant'})", y)
    pg.wait_for_timeout(200)


# ═══════════════════════════════════════════════════════════════════════════
# sweep — ไล่ทุกเครื่องมือ ก่อน+หลังใส่ไฟล์
# ═══════════════════════════════════════════════════════════════════════════

def new_results():
    return {
        "hscroll": [], "trap": [], "tap": [], "btn_off": [],
        "end_covered": [], "footer_bug": [], "load_fail": [],
    }


def record_scan(results, tag, s):
    if s["bodyOverflow"] or s["offenders"]:
        detail = f" scrollW={s['docScrollW']} จอกว้าง={s['W']}"
        if s["offenders"]:
            detail += " · " + "; ".join(
                f"<{o['tag'].lower()} class={o['cls']!r}> right={o['right']}px" for o in s["offenders"][:5])
        results["hscroll"].append(f"{tag}{detail}")
    for t in s["traps"]:
        results["trap"].append(
            f"{tag} → <{t['tag'].lower()} class={t['cls']!r}> สูง {t['h']}px "
            f"(scrollH={t['scrollH']} clientH={t['clientH']}) < 70% ของจอสูง {s['H']}px")
    for sm in s["smalls"]:
        results["tap"].append(
            f"{tag} → <{sm['targetTag'].lower()} class={sm['cls']!r}> {sm['text']!r} "
            f"{sm['w']}×{sm['h']}px (ต้อง ≥{MIN_TAP}×{MIN_TAP}px)")


def check_tool(pg, base, tid, results):
    pg.goto(f"{base}#/{tid}", wait_until="networkidle")
    pg.wait_for_timeout(300)
    scroll_to(pg, 0)

    # ---------- ก่อนใส่ไฟล์ ----------
    s = pg.evaluate(SCAN_JS)
    record_scan(results, f"{tid}·ก่อนใส่ไฟล์", s)

    is_ws = pg.evaluate("!!document.querySelector('.ws-footer')")
    if is_ws:
        e = pg.evaluate(EMPTY_JS)
        if e and not e["hasFile"] and (e["floating"] or e["coversEmpty"]):
            results["footer_bug"].append(
                f"{tid}·ก่อนใส่ไฟล์ → .ws-footer position={e['position']!r} "
                f"floating={e['floating']} coversEmpty={e['coversEmpty']} (ต้อง static และไม่ทับข้อความว่างเปล่า)")

    # ---------- กดปุ่มตัวอย่างทุกปุ่มบนหน้า (บางเครื่องมือมี >1 dropzone เช่น word-mailmerge) ----------
    btns = pg.locator("button", has_text=SAMPLE_BTN_TEXT)
    n = btns.count()
    if n == 0:
        return  # เครื่องมือไม่มีไฟล์ตัวอย่าง (ไม่พบในทะเบียนตอนนี้ — เผื่ออนาคต)
    for i in range(n):
        btns.nth(i).click()
        if not wait_loaded(pg, i + 1):
            results["load_fail"].append(f"{tid} → โหลดไฟล์ตัวอย่างปุ่มที่ {i + 1}/{n} ไม่สำเร็จภายในเวลา")
            return
    wait_stable(pg)

    # ---------- หลังใส่ไฟล์ ----------
    scroll_to(pg, 0)
    s2 = pg.evaluate(SCAN_JS)
    record_scan(results, f"{tid}·หลังใส่ไฟล์", s2)

    # ② ปุ่มลงมือทำต้องอยู่ในจอทุกจังหวะเลื่อน (scrollY=0 / กลางหน้า / ท้ายหน้า)
    for label in ("scrollY=0(บนสุด)", "กลางหน้า", "ท้ายหน้า"):
        h = pg.evaluate("document.documentElement.scrollHeight")
        target = 0 if label.startswith("scrollY") else (h / 2 if label == "กลางหน้า" else h)
        scroll_to(pg, target)
        info = pg.evaluate(BTN_JS)
        if not info["hasContainer"]:
            results["btn_off"].append(f"{tid}·{label} → ไม่พบ .actions/.ws-footer เลย")
            continue
        for bt in info["buttons"]:
            cy = (bt["top"] + bt["bottom"]) / 2
            if cy < 0 or cy > VIEWPORT["height"]:
                results["btn_off"].append(
                    f"{tid}·{label} → ปุ่ม {bt['text']!r} center-y={round(cy)}px "
                    f"(จอสูง {VIEWPORT['height']}px — อยู่นอกจอ)")

    # ⑤ ท้ายหน้าไม่ถูกแถบลอยบัง — เลื่อนสุดท้ายจริง (อ่าน scrollHeight สดอีกที กันค่านิ่งเก่า)
    h = pg.evaluate("document.documentElement.scrollHeight")
    scroll_to(pg, h)
    end = pg.evaluate(END_JS)
    if end.get("found") and end.get("covered"):
        results["end_covered"].append(
            f"{tid}·ท้ายหน้า → ข้อความ {end['text']!r} ถูกบังโดย "
            f"<{end['hitInfo']['tag'].lower()} class={end['hitInfo']['cls']!r}> (position:fixed/sticky)")


def run_sweep(base, tools):
    results = new_results()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=VIEWPORT, is_mobile=True, has_touch=True)
        ctx.add_init_script(
            "try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        for tid in tools:
            check_tool(pg, base, tid, results)
        ctx.close()
        b.close()
    return results


def check_mobile(base):
    print(f"\n━━ เทสมือถือ 390×844 — ไล่ {len(TOOLS)} เครื่องมือจากทะเบียนจริง (ก่อน+หลังใส่ไฟล์): {base} ━━")
    results = run_sweep(base, TOOLS)

    ck(f"โหลดไฟล์ตัวอย่างสำเร็จครบทุกเครื่องมือ (โหลดไม่สำเร็จ {len(results['load_fail'])} จุด)",
       len(results["load_fail"]) == 0,
       "\n      " + "\n      ".join(results["load_fail"][:10]))

    ck(f"① ไม่มีสกอลล์แนวนอน — ก่อน+หลังใส่ไฟล์ ทุกเครื่องมือ (พบ {len(results['hscroll'])} จุด)",
       len(results["hscroll"]) == 0,
       "\n      " + "\n      ".join(results["hscroll"][:10]))

    ck(f"② ปุ่มลงมือทำอยู่ในจอทุกจังหวะเลื่อน หลังใส่ไฟล์ (พบ {len(results['btn_off'])} จุด)",
       len(results["btn_off"]) == 0,
       "\n      " + "\n      ".join(results["btn_off"][:15]))

    ck(f"③ ไม่มีกับดักสกอลล์ซ้อน — ก่อน+หลังใส่ไฟล์ (พบ {len(results['trap'])} จุด)",
       len(results["trap"]) == 0,
       "\n      " + "\n      ".join(results["trap"][:10]))

    ck(f"④ tap target ≥{MIN_TAP}×{MIN_TAP}px — ก่อน+หลังใส่ไฟล์ (พบ {len(results['tap'])} จุด)",
       len(results["tap"]) == 0,
       "\n      " + "\n      ".join(results["tap"][:20]))

    ck(f"⑤ ท้ายหน้าไม่ถูกแถบลอยบัง — เลื่อนสุดท้ายหลังใส่ไฟล์ (พบ {len(results['end_covered'])} จุด)",
       len(results["end_covered"]) == 0,
       "\n      " + "\n      ".join(results["end_covered"][:10]))

    ck(f"‼️ แผง 3 ช่อง: .ws-footer ไม่ลอย/ไม่ทับ 'ยังไม่มีไฟล์…' ตอนยังไม่มีไฟล์ (พบ {len(results['footer_bug'])} จุด)",
       len(results["footer_bug"]) == 0,
       "\n      " + "\n      ".join(results["footer_bug"][:10]))


# ═══════════════════════════════════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════════════════════════════════

def main():
    t0 = time.time()
    print(f"เว็บที่ทดสอบ: {BASE}")
    check_mobile(BASE)
    elapsed = time.time() - t0
    print("\n" + "━" * 70)
    print(f"ผ่าน {P} · ตก {len(F)} · ใช้เวลา {elapsed:.1f} วินาที")
    for f in F:
        print("  ❌ " + f)
    sys.exit(1 if F else 0)


# ═══════════════════════════════════════════════════════════════════════════
# self-test — พิสูจน์ว่าเทสจับของพังได้จริง (ฉีด CSS ปลอม 3 แบบตามสเปก แล้วถอดออก)
# ‼️ ไม่แตะไฟล์จริงแม้แต่ไฟล์เดียว — ฉีด/ถอดผ่าน page.add_style_tag() ในหน่วยความจำเบราว์เซอร์เท่านั้น
# ═══════════════════════════════════════════════════════════════════════════

def _load_one_sample(pg, tool_id):
    pg.goto(f"{BASE}#/{tool_id}", wait_until="networkidle")
    pg.wait_for_timeout(400)
    pg.locator("button", has_text=SAMPLE_BTN_TEXT).first.click()
    wait_loaded(pg, 1)
    wait_stable(pg)
    scroll_to(pg, 0)


def selftest():
    t0 = time.time()
    ok = True
    print("═" * 70)
    print("SELF-TEST — พิสูจน์ว่า browser_mobile.py จับของพังได้จริง (แดงเป็น + เขียวเป็น)")
    print("═" * 70)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=VIEWPORT, is_mobile=True, has_touch=True)
        ctx.add_init_script(
            "try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()

        # ── [1/3] (ก) .actions,.ws-footer{position:static} — ต้องทำให้ข้อ ② ตก ──
        # ใช้ pdf-pages (แผง 3 ช่อง, .ws-footer) — วัดจริงแล้วปุ่ม "บันทึก" ปกติอยู่ที่ center-y≈794 (ในจอ)
        print("\n[1/3] (ก) .actions,.ws-footer{position:static} → ต้องทำให้ข้อ ② (ปุ่มอยู่ในจอ) ตก")
        _load_one_sample(pg, "pdf-pages")

        def btn_center_ok():
            info = pg.evaluate(BTN_JS)
            if not info["hasContainer"] or not info["buttons"]:
                return None
            cy = (info["buttons"][0]["top"] + info["buttons"][0]["bottom"]) / 2
            return (cy, 0 <= cy <= VIEWPORT["height"])

        green1 = btn_center_ok()
        print(f"  GREEN (ปกติ): center-y={green1[0] if green1 else None} in-view={green1[1] if green1 else None} "
              f"→ {'PASS ตามคาด' if green1 and green1[1] else 'FAIL (ผิดปกติ! ปุ่มลอยไม่ทำงานอยู่แล้ว)'}")
        tag1 = pg.add_style_tag(content=".actions,.ws-footer{position:static !important}")
        pg.wait_for_timeout(200)
        red1 = btn_center_ok()
        print(f"  RED (ฉีด position:static): center-y={red1[0] if red1 else None} "
              f"in-view={red1[1] if red1 else None} → "
              f"{'ตกจริงตามคาด (selftest ผ่าน)' if red1 and not red1[1] else 'ยังผ่าน — selftest ล้มเหลว!'}")
        tag1.evaluate("t=>t.remove()")
        pg.wait_for_timeout(200)
        back1 = btn_center_ok()
        print(f"  กลับเป็น GREEN หลังถอด CSS: in-view={back1[1] if back1 else None}")
        ok = ok and bool(green1 and green1[1]) and bool(red1 and not red1[1]) and bool(back1 and back1[1])

        # ── [2/3] (ข) .btn{min-height:20px;padding:0} — ต้องทำให้ข้อ ④ ตก ──
        print("\n[2/3] (ข) .btn{min-height:20px;padding:0} → ต้องทำให้ข้อ ④ (tap target ≥36px) ตก")
        pg.goto(f"{BASE}#/pdf-merge", wait_until="networkidle")
        pg.wait_for_timeout(400)

        def go_button_size():
            return pg.evaluate("""() => {
                const b = document.querySelector(".actions button");
                const r = b.getBoundingClientRect();
                return { w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10 };
            }""")

        green2 = go_button_size()
        green2_ok = green2["w"] >= MIN_TAP and green2["h"] >= MIN_TAP
        print(f"  GREEN (ปกติ): ปุ่ม 'รวมไฟล์' {green2['w']}×{green2['h']}px → "
              f"{'PASS ตามคาด' if green2_ok else 'FAIL (ผิดปกติ! เล็กกว่า 36px อยู่แล้ว)'}")
        tag2 = pg.add_style_tag(content=".btn{min-height:20px !important;padding:0 !important}")
        pg.wait_for_timeout(200)
        red2 = go_button_size()
        red2_ok = red2["h"] < MIN_TAP
        print(f"  RED (ฉีด min-height:20px;padding:0): ปุ่ม 'รวมไฟล์' {red2['w']}×{red2['h']}px → "
              f"{'ตกจริงตามคาด (selftest ผ่าน)' if red2_ok else 'ยังผ่าน — selftest ล้มเหลว!'}")
        tag2.evaluate("t=>t.remove()")
        pg.wait_for_timeout(200)
        back2 = go_button_size()
        back2_ok = back2["w"] >= MIN_TAP and back2["h"] >= MIN_TAP
        print(f"  กลับเป็น GREEN หลังถอด CSS: {back2['w']}×{back2['h']}px")
        ok = ok and green2_ok and red2_ok and back2_ok

        # ── [3/3] (ค) body{width:600px} — ต้องทำให้ข้อ ① ตก ──
        print("\n[3/3] (ค) body{width:600px} → ต้องทำให้ข้อ ① (ไม่มีสกอลล์แนวนอน) ตก")
        pg.goto(f"{BASE}#/pdf-merge", wait_until="networkidle")
        pg.wait_for_timeout(400)

        def hscroll():
            return pg.evaluate("document.documentElement.scrollWidth > screen.width + 1")

        green3 = hscroll()
        print(f"  GREEN (ปกติ): hscroll={green3} → {'PASS ตามคาด' if not green3 else 'FAIL (ผิดปกติ! สกอลล์แนวนอนอยู่แล้ว)'}")
        tag3 = pg.add_style_tag(content="body{width:600px !important}")
        pg.wait_for_timeout(200)
        red3 = hscroll()
        print(f"  RED (ฉีด body{{width:600px}}): hscroll={red3} → "
              f"{'ตกจริงตามคาด (selftest ผ่าน)' if red3 else 'ยังผ่าน — selftest ล้มเหลว!'}")
        tag3.evaluate("t=>t.remove()")
        pg.wait_for_timeout(200)
        back3 = hscroll()
        print(f"  กลับเป็น GREEN หลังถอด CSS: hscroll={back3}")
        ok = ok and (not green3) and red3 and (not back3)

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
