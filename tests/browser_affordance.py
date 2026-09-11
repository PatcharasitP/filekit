"""ปุ่มลงมือทำต้องบอกความจริงว่าตอนนี้กดได้หรือยัง

‼️ ที่มา 11/09/2026 สำรวจทั้งเว็บแล้วพบว่า 21 จาก 36 เครื่องมือที่ต้องใส่ไฟล์
   มีปุ่มลงมือทำที่ดำเข้ม cursor เป็น pointer ทั้งที่ยังไม่มีไฟล์เลยสักไฟล์
   กดแล้วเจอข้อความดุว่า "กรุณาเลือกไฟล์ก่อน" ทั้งที่ระบบรู้อยู่แล้วตั้งแต่ต้น
   ส่วนอีก 5 ตัว (เช่น pdf-split, word-clean) ทำถูกคือปุ่มจางและกดไม่ได้
   ความไม่สม่ำเสมอแบบนี้ทำให้คนใช้เรียนรู้กฎของเว็บไม่ได้เลย

เทสนี้ตรวจ 2 ทางเสมอ ปุ่มต้องกดไม่ได้ตอนยังไม่มีไฟล์ และต้องกดได้หลังใส่ไฟล์แล้ว
ถ้าตรวจแต่ทางแรก การแก้ผิดที่ทำให้ปุ่มจางตลอดกาลจะผ่านฉลุย

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_affordance.py
"""
import re, sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []

# ปุ่มช่วยที่ควรกดได้ตลอด ไม่ใช่ปุ่มลงมือทำกับไฟล์
HELPER = re.compile(r"ไทย|EN|เลือกไฟล์|โหลดไว้ใช้|เครื่องมือทั้งหมด|ลองด้วยไฟล์|คัดลอก|ดาวน์โหลด|"
                    r"คืนค่า|หยุด|รีเซ็ต|ล้าง$|อัปโหลดรูป|\+ เพิ่ม|Try a sample|Choose file")

# ‼️ เว็บนี้มีปุ่มลงมือทำ 2 โครง ต้องดูทั้งคู่
#    .actions   = เครื่องมือแบบหน้าเดียว (pdf-merge, pdf-to-text ฯลฯ)
#    .ws-footer = เครื่องมือแบบ 3 แผง (pdf-compress ฯลฯ)
#    ตัวตรวจรุ่นแรกดูแค่ .ws-footer เลยมองไม่เห็นปัญหาไปครึ่งเว็บ แล้วรายงานว่าเจอแค่ 5 ตัว
ACTION_BTNS = """() => {
  const skip = %s;
  return [...document.querySelectorAll('.ws-footer button.btn, .actions button.btn')]
    .filter(e => e.offsetParent && !e.classList.contains('ghost') && !skip.test(e.textContent.trim()))
    .map(e => ({ label: e.textContent.trim().slice(0, 24), disabled: e.disabled === true }));
}"""

# ‼️ ตัวตรวจรุ่นแรกอ่านทะเบียนได้แค่ 2 จาก 36 ตัว แล้วขึ้นเขียวเพราะไม่มีอะไรให้ตรวจ
# กับดักเดิมซ้ำอีกครั้ง ประชากรเป็นศูนย์ต้องนับเป็นตก ไม่ใช่ผ่าน จึงมีด่านกันไว้ท้ายฟังก์ชัน
MIN_TOOLS = 30

# ‼️ เครื่องมือที่ "มีไฟล์แล้วก็ยังกดไม่ได้" อย่างถูกต้อง เพราะมีเงื่อนไขอื่นค้างอยู่จริง
# ตรวจด้วยตาทีละตัวแล้ว 11/09/2026 ไม่ใช่การยกเว้นเพื่อให้เทสเขียว
#   pdf-sign        ใส่ไฟล์แล้วแต่ยังไม่ได้วางลายเซ็นลงหน้า
#   pdf-remove-blank ไฟล์ตัวอย่างไม่มีหน้าว่างเลย จึงไม่มีอะไรให้ตัด
#   word-replace    ยังไม่ได้กรอกคู่คำที่จะแทนที่ (โค้ดเช็ค getPairs().length > 0)
#   word-mailmerge  ต้องมีทั้ง Word และ Excel ตัวอย่างให้แค่ Word กล่องที่สองยังว่าง
NEEDS_MORE_THAN_A_FILE = {"pdf-sign", "pdf-remove-blank", "word-replace", "word-mailmerge"}

def tools_needing_files():
    src = open("src/registry.js", encoding="utf-8").read()
    out = []
    for m in re.finditer(r'\{\s*id:"([\w-]+)",[^}]*?\}', src, re.S):
        if "accepts:" in m.group(0): out.append(m.group(1))
    if len(out) < MIN_TOOLS:
        raise SystemExit(f"‼️ ตัวตรวจอ่านทะเบียนได้แค่ {len(out)} ตัว ซึ่งน้อยกว่า {MIN_TOOLS} "
                         f"แปลว่าตัวอ่านพัง ไม่ใช่เว็บพัง แก้ตัวอ่านก่อน ห้ามถือว่าผ่าน")
    return out

def main():
    ids = tools_needing_files()
    print(f"เครื่องมือที่ต้องใส่ไฟล์ {len(ids)} ตัว")
    assert ids, "หาเครื่องมือไม่เจอเลย ตัวตรวจพัง"
    bad_empty, bad_filled, no_sample = [], [], []

    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 950}).new_page()
        js = ACTION_BTNS % f"/{HELPER.pattern}/"
        for tid in ids:
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
            pg.wait_for_timeout(600)

            live = [x for x in pg.evaluate(js) if not x["disabled"]]
            if live: bad_empty.append((tid, [x["label"] for x in live]))

            # ใส่ไฟล์ด้วยปุ่มตัวอย่างของเว็บเอง แล้วปุ่มต้องกลับมากดได้
            sample = pg.get_by_role("button", name=re.compile("ลองด้วยไฟล์ตัวอย่าง"))
            if not sample.count():
                no_sample.append(tid); continue
            try:
                sample.first.click(timeout=4000)
                pg.wait_for_timeout(1800)
            except Exception:
                no_sample.append(tid); continue
            still = [x for x in pg.evaluate(js) if x["disabled"]]
            if still and tid not in NEEDS_MORE_THAN_A_FILE:
                bad_filled.append((tid, [x["label"] for x in still]))
        b.close()

    def ck(label, bad):
        ok = not bad
        print(("  ✅ " if ok else "  ❌ ") + label + f" (พบ {len(bad)})")
        if not ok:
            for tid, labels in bad[:8]: print(f"      {tid}: {labels}")
            fails.append(label)

    ck("ยังไม่มีไฟล์ ปุ่มลงมือทำต้องกดไม่ได้", bad_empty)
    ck("ใส่ไฟล์แล้ว ปุ่มลงมือทำต้องกลับมากดได้", bad_filled)
    print(f"  ℹ️ ไม่มีปุ่มไฟล์ตัวอย่างให้ทดสอบขาขึ้น {len(no_sample)} ตัว: {', '.join(no_sample[:10])}")

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
