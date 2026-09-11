"""แผงตั้งค่าต้องหาช่องที่ต้องการเจอโดยไม่ต้องเลื่อนไล่ทีละกลุ่ม

‼️ ที่มา 11/09/2026 วัดของจริงบนเว็บแล้วพบว่า
   กราฟโดนัท 22 ช่องปรับ 5 กลุ่ม เนื้อหาสูง 2070px ช่องมองเห็น 657px = เลื่อน 3.15 เท่า
   กราฟแท่ง 2.82 เท่า บนมือถือเห็นแค่ 5 จาก 21 ช่อง
   งานวิจัย 11/09/2026 พบว่า VS Code, Chrome และ Firefox แก้เรื่องนี้เหมือนกันหมด
   คือกรองสดแล้วซ่อนกลุ่มที่ไม่มีผลลัพธ์ทั้งกลุ่ม

เทสนี้ตรวจ 4 อย่างที่เป็นพฤติกรรมจริงของช่องค้นหา ไม่ใช่เกณฑ์ลอย ๆ
   ① ค้นแล้วต้องเลื่อนน้อยลงจริง
   ② ‼️ ล้างคำค้นแล้วต้องกลับมาเท่าเดิมเป๊ะ ห้ามเปิดช่องที่เครื่องมือซ่อนไว้เอง
      (บั๊กจริงที่เจอตอนทำ ก่อนค้น 6 กลุ่ม 15 ช่อง แต่หลังล้างกลายเป็น 7 กลุ่ม 18 ช่อง)
   ③ ลืมสลับแป้นพิมพ์แล้วยังหาเจอ
   ④ ไม่เจอผลต้องมีข้อความบอก ห้ามเงียบหาย (บทเรียนจากบั๊กจริงของ GitLab)

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_configpanel.py
"""
import sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []
TOOLS = [("pbi-bar", ".pbib-right", ".pbib-group"), ("pbi-donut", ".pbid-right", ".pbid-group")]

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail: print("      " + detail)
        fails.append(label)

SNAP = """([panelSel, groupSel]) => {
  const p = document.querySelector(panelSel);
  const sc = p.closest('.ws-scroll') || p;
  const vis = e => !e.hidden && e.offsetParent !== null;
  return {
    groups: [...p.querySelectorAll(groupSel)].filter(vis).length,
    fields: [...p.querySelectorAll('.field')].filter(vis).length,
    h: sc.scrollHeight, view: sc.clientHeight,
    note: (document.querySelector('.cfs-count') || {}).textContent || '',
    marks: p.querySelectorAll('mark').length,
  };
}"""

def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 950}).new_page()
        for tid, panel, group in TOOLS:
            print(f"\n── {tid} ──")
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
            pg.wait_for_selector(".cfs-input", timeout=20000)
            pg.wait_for_timeout(1200)
            arg = [panel, group]

            before = pg.evaluate(SNAP, arg)
            ck(f"{tid}: มีช่องค้นหาในแผงตั้งค่า", pg.locator(".cfs-input").count() == 1)

            pg.fill(".cfs-input", "สี"); pg.wait_for_timeout(350)
            hit = pg.evaluate(SNAP, arg)
            ratio_before = before["h"] / max(before["view"], 1)
            ratio_after = hit["h"] / max(hit["view"], 1)
            ck(f"{tid}: ค้นแล้วเลื่อนน้อยลงจริง ({ratio_before:.2f} เหลือ {ratio_after:.2f} เท่า)",
               ratio_after < ratio_before * 0.75,
               f"ก่อน {before['h']}px หลัง {hit['h']}px")
            ck(f"{tid}: ค้นแล้วมีไฮไลต์คำที่ตรง (พบ {hit['marks']} จุด)", hit["marks"] > 0)
            ck(f"{tid}: ค้นแล้วมีข้อความบอกจำนวนที่พบ", "พบ" in hit["note"] or "found" in hit["note"])

            # ลืมสลับแป้นพิมพ์ lu = สี ต้องได้ผลเหมือนกันเป๊ะ
            pg.fill(".cfs-input", "lu"); pg.wait_for_timeout(350)
            kb = pg.evaluate(SNAP, arg)
            ck(f"{tid}: ลืมสลับแป้นพิมพ์แล้วยังหาเจอ", [kb["groups"], kb["fields"]] == [hit["groups"], hit["fields"]],
               f"lu ได้ {kb['groups']}/{kb['fields']} แต่ สี ได้ {hit['groups']}/{hit['fields']}")

            pg.fill(".cfs-input", "zzzzz"); pg.wait_for_timeout(350)
            none = pg.evaluate(SNAP, arg)
            ck(f"{tid}: ไม่เจอผลต้องมีข้อความบอก ห้ามเงียบหาย", len(none["note"]) > 10, none["note"])

            # ‼️ ข้อสำคัญที่สุด ล้างแล้วต้องกลับมาเท่าเดิมเป๊ะ
            pg.fill(".cfs-input", ""); pg.wait_for_timeout(350)
            after = pg.evaluate(SNAP, arg)
            ck(f"{tid}: ล้างคำค้นแล้วกลับมาเท่าเดิมเป๊ะ ไม่เปิดช่องที่เครื่องมือซ่อนไว้เอง",
               [after["groups"], after["fields"], after["h"]] == [before["groups"], before["fields"], before["h"]],
               f"ก่อน {before['groups']} กลุ่ม {before['fields']} ช่อง {before['h']}px "
               f"หลัง {after['groups']} กลุ่ม {after['fields']} ช่อง {after['h']}px")
        b.close()

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
