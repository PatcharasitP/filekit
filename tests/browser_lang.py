# -*- coding: utf-8 -*-
"""
เทสระบบ 2 ภาษา — ตัวจับ "แปลตกหล่น" ของทั้งเว็บ
─────────────────────────────────────────────────────────────────────────────
‼️ บทเรียนจากระบบก่อนหน้า: scanner ที่ "ยกเว้นตามเจตนา" คือที่ซ่อนบั๊กชั้นดี
   ครั้งนั้นยกเว้นทั้งก้อนเพราะตัดสินเองว่า "เป็นข้อมูลประวัติ" → เทส 447 เขียวหมด
   แต่เจ้าของเว็บเปิดมาเห็นภาษาไทยเต็มจอ
   เทสนี้จึงไม่ยกเว้นอะไร "ทั้งก้อน" — มีรายการคำที่อนุญาตเป็นรายคำ (ALLOW)
   ทุกคำในรายการนั้นต้องเป็น "ผลลัพธ์ที่ผู้ใช้ต้องการให้เป็นภาษาไทย" ไม่ใช่ "คำที่เราขี้เกียจแปล"
   ถ้าเจอไทยที่ไม่อยู่ในรายการ = ตก และเทสจะพิมพ์ออกมาให้เห็นว่าคำไหน อยู่หน้าไหน
"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
THAI = re.compile(r"[฀-๿]")
P, F = 0, []

def ck(n, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(f"{n}{detail}")
    print(f"  {'✅' if ok else '❌'} {n}")

# เครื่องมือ 4 ตัวนี้ "ผลิตภาษาไทย" เป็นเนื้องาน — คนเลือกอังกฤษก็ยังต้องได้ผลลัพธ์ไทย
# ‼️ อนุญาตเป็นรายคำ ไม่ใช่ยกเว้นทั้งหน้า · ทุกบรรทัดต้องตอบได้ว่าทำไมมันควรเป็นไทย
ALLOW = {
    # thai-number: ตัวอย่างผลลัพธ์บาทถ้วน/เลขไทย — นี่คือสินค้าของเครื่องมือ
    "หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน", "บาทถ้วน", "สตางค์", "๑๒๓", "๐๑๒๓๔๕๖๗๘๙",
    # thai-date: รูปแบบวันที่ไทยที่เครื่องมือต้องอ่าน/เขียนได้
    "ม.ค.", "๑๕/๐๑/๒๕๖๙", "15 ม.ค. 2569", "พ.ศ.", "ค.ศ.",
    # thai-encoding: ตัวอย่างข้อความเพี้ยนที่ผู้ใช้เอามาเทียบกับไฟล์ตัวเอง
    "เธชเธงเธฑ", "à¸ªà¸§",
    # ปุ่มสลับภาษา — ต้องเขียนว่า "ไทย" ในโหมดอังกฤษ ไม่งั้นคนไทยที่กดพลาดหาทางกลับไม่เจอ
    "ไทย",
    # จดหมายเวียน: คำไทยที่ "ตัวโปรแกรมรับจริง" จากไฟล์ Excel ของผู้ใช้
    # ยืนยันแล้วใน src/docxmerge.js:91-92 (TRUE_WORDS / FALSE_WORDS) — ไม่ใช่คำที่ขี้เกียจแปล
    # คนใช้ภาษาอังกฤษที่ได้ไฟล์ Excel มาจากคนไทย ต้องรู้ว่าคำพวกนี้ใช้ได้
    "ใช่", "ไม่ใช่", "มี", "ไม่มี",
    # คำนำหน้าเงื่อนไขตรงข้ามฝั่งไทย — โปรแกรมใช้จริง (src/docxmerge.js negName)
    # เอกสารอังกฤษต้องบอกความจริงว่าเทมเพลตไทยใช้คำนี้ ไม่ใช่ "not"
    "ไม่",
    # ฿ คือสัญลักษณ์สกุลเงิน (U+0E3F) บังเอิญอยู่ในบล็อกอักษรไทย — ไม่ใช่ตัวหนังสือ
    "฿",
}

TOOLS = ["pdf-pages","pdf-merge","pdf-split","pdf-compress","pdf-sign","pdf-watermark","pdf-ocr",
         "pdf-to-images","pdf-to-text","pdf-to-word","pdf-to-excel","word-to-pdf","excel-to-pdf",
         "images-to-pdf","image-convert","image-resize","word-join","word-replace","word-clean",
         "word-mailmerge","powerpoint-to-word","powerpoint-to-pdf","excel-csv",
         "thai-encoding","thai-date","thai-id","thai-number"]

# ดึงเฉพาะ "ตัวอักษรที่ตามนุษย์มองเห็น" — ข้าม script/style และของที่ถูกซ่อน
VISIBLE_TEXT = """() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.nodeValue || "").trim();
    if (!t) continue;
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue;
    if (p.closest("[hidden]")) continue;
    // checkVisibility ไล่ดูบรรพบุรุษให้ครบ ต่างจาก getComputedStyle ที่ดูแค่ตัวมันเอง
    if (p.checkVisibility && !p.checkVisibility()) continue;
    out.push(t);
  }
  // placeholder / aria-label / title ก็เป็นสิ่งที่ผู้ใช้เจอ ต้องนับด้วย
  for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
    if (el.checkVisibility && !el.checkVisibility()) continue;
    for (const a of ["placeholder","aria-label","title"]) {
      const v = el.getAttribute(a); if (v) out.push(v);
    }
  }
  return out;
}"""

def thai_leftovers(texts):
    """คืนรายการข้อความที่ยังมีอักษรไทย หลังตัดคำที่อนุญาตออกแล้ว"""
    bad = []
    allow = sorted(ALLOW, key=len, reverse=True)
    for t in texts:
        s = t
        for a in allow:
            s = s.replace(a, "")
        if THAI.search(s):
            bad.append(t)
    return bad

def main():
    global P
    print(f"เว็บที่ทดสอบ: {BASE}\n")
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ── ① ค่าตั้งต้นต้องเป็นภาษาไทย ──
        print("━━ ① ค่าตั้งต้นและปุ่มสลับ ━━")
        ctx = b.new_context(); pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(500)
        ck("ยังไม่เคยเลือกภาษา → ได้ภาษาไทย", pg.evaluate("document.documentElement.lang") == "th")
        ck("ปุ่มบนแถบบนเขียนว่า EN (ภาษาที่จะเปลี่ยนไป)", pg.locator("#lang").inner_text().strip() == "EN")
        ck("ปุ่มสลับมุมมองแบบเก่าถูกถอดออกแล้ว", pg.locator("#density").count() == 0)

        pg.locator("#lang").click(); pg.wait_for_timeout(900)
        ck("กดแล้วเปลี่ยนเป็นอังกฤษ", pg.evaluate("document.documentElement.lang") == "en")
        ck("ปุ่มเปลี่ยนเป็น ไทย", pg.locator("#lang").inner_text().strip() == "ไทย")
        pg.reload(wait_until="networkidle"); pg.wait_for_timeout(400)
        ck("จำภาษาไว้หลังรีเฟรช", pg.evaluate("document.documentElement.lang") == "en")
        pg.locator("#lang").click(); pg.wait_for_timeout(900)
        ck("กดกลับเป็นไทยได้", pg.evaluate("document.documentElement.lang") == "th")
        ctx.close()

        # ── ② โหมดอังกฤษ: ไล่ทุกหน้าแล้วต้องไม่เหลือภาษาไทยที่ไม่ได้ตั้งใจ ──
        print("\n━━ ② โหมดอังกฤษ ไล่ทั้ง 28 หน้า ━━")
        ctx = b.new_context()
        ctx.add_init_script("try{localStorage.setItem('fk-lang','en')}catch(e){}")
        pg = ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(700)
        left = thai_leftovers(pg.evaluate(VISIBLE_TEXT))
        ck(f"หน้าแรก ไม่มีไทยตกค้าง", not left, "\n      เจอ: " + " | ".join(left[:8]))

        ck("ชื่อเครื่องมือบนหน้าแรกเป็นอังกฤษครบ 27",
           len([t for t in pg.locator(".pill").all_inner_texts() if not THAI.search(t)]) == 27)

        for tid in TOOLS:
            pg.goto(f"{BASE}#/{tid}", wait_until="networkidle"); pg.wait_for_timeout(650)
            texts = pg.evaluate(VISIBLE_TEXT)
            left = thai_leftovers(texts)
            ck(f"{tid} ไม่มีไทยตกค้าง", not left, "\n      เจอ: " + " | ".join(left[:8]))

        ck("ไม่มี error ใน console", not errs, "\n      " + " | ".join(errs[:4]))
        ctx.close()

        # ── ③ โหมดไทยต้องไม่พังและต้องยังเป็นไทยจริง ──
        print("\n━━ ③ โหมดไทย ยังเหมือนเดิม ━━")
        ctx = b.new_context()
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th')}catch(e){}")
        pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(700)
        ck("หน้าแรกยังเป็นภาษาไทย", THAI.search(pg.locator(".hero h1").inner_text()) is not None)
        opened = 0
        for tid in TOOLS:
            pg.goto(f"{BASE}#/{tid}", wait_until="networkidle"); pg.wait_for_timeout(450)
            # เครื่องมือแบบแผงทำงานใช้ h2 ไม่ใช่ h1 — ดูทั้งกล่องแทนการเจาะ selector เดียว
            if pg.locator("#tool").count() and THAI.search(pg.locator("#tool").inner_text()):
                opened += 1
        ck(f"เปิดครบ 27 เครื่องมือและหัวเรื่องยังเป็นไทย (ได้ {opened})", opened == 27)
        ck("โหมดไทยไม่มี error ใน console", not errs, "\n      " + " | ".join(errs[:4]))
        ctx.close()
        b.close()

    print("\n" + "━" * 60)
    print(f"ผ่าน {P} · ตก {len(F)}")
    for f in F: print("  ❌ " + f)
    sys.exit(1 if F else 0)

main()
