"""ชี้การ์ดเครื่องมือหน้าแรกแล้วต้องยกเงาและมีวงขอบสีเน้นของตระกูล (ไอเดีย ① จาก thepexcel พี่ปอนด์เคาะ 13/09/2026)

ตรวจ 3 อย่าง
   ① ก่อนชี้: ไม่มีวงขอบสีเน้น
   ② ชี้แล้ว: transform ยก และ box-shadow มีวงสีเน้น (สีเดียวกับ --ac ของการ์ดใบนั้น ไม่ใช่สีใหม่)
   ③ ‼️ ตัวตรวจต้องแดงเป็น: ฉีด CSS ลบกฎ hover แล้วข้อ ② ต้องตก

รัน: tests/run.sh browser_hover
"""
import os, sys, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []
def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok: fails.append(label)

def probe(pg):
    return pg.evaluate("""() => { const p = document.querySelector('.pill'); const s = getComputedStyle(p);
        const ac = getComputedStyle(p).getPropertyValue('--ac').trim();
        // สีเน้นจริงของการ์ด อ่านจากไอคอน (color:var(--ac)) เพราะ --ac อาจเป็น var(--g-x) ที่ยังไม่ resolve
        const acRGB = getComputedStyle(p.querySelector('i')).color;
        return { shadow: s.boxShadow, transform: s.transform, acRGB }; }""")

with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_selector(".pill"); pg.wait_for_timeout(300)
    before = probe(pg)
    rgb = re.sub(r"\s", "", before["acRGB"]).replace("rgb(", "").replace(")", "")   # เช่น 176,58,10
    r, g, b = [int(x) for x in rgb.split(",")[:3]]
    def has_accent_ring(shadow):
        # วงขอบ 1.5px สีเน้น ‼️ Chromium serialize ผลของ color-mix เป็น color(srgb 0.69 0.23 0.04 / 0.55)
        # ไม่ใช่ rgba(...) จึงต้องอ่านทั้งสองรูปแบบแล้วเทียบเป็น 0-255 (ยอมคลาด 2)
        for m in re.finditer(r"(rgba?\([^)]*\)|color\(srgb[^)]*\))\s+0px 0px 0px 1\.5px", shadow):
            c = m.group(1)
            if c.startswith("color("):
                nums = [float(x) for x in re.findall(r"[\d.]+", c.split("srgb", 1)[1])][:3]
                rr, gg, bb = [round(v * 255) for v in nums]
            else:
                rr, gg, bb = [int(float(x)) for x in re.findall(r"[\d.]+", c)[:3]]
            if abs(rr - r) <= 2 and abs(gg - g) <= 2 and abs(bb - b) <= 2:
                return True
        return False
    ck("ก่อนชี้ ไม่มีวงขอบสีเน้น", not has_accent_ring(before["shadow"]), before["shadow"][:120])
    pg.hover(".pill"); pg.wait_for_timeout(450)
    after = probe(pg)
    ck("ชี้แล้วการ์ดยกขึ้น (transform)", after["transform"] not in ("none", "") and "matrix" in after["transform"], after["transform"])
    ck(f"ชี้แล้วมีวงขอบสีเน้นของตระกูล rgb({r},{g},{b}) ไม่ใช่สีใหม่", has_accent_ring(after["shadow"]), after["shadow"][:160])
    # ③ พิสูจน์ตัวตรวจ
    pg.add_style_tag(content=".pill:hover{box-shadow:0 2px 4px rgba(0,0,0,.09) !important}")
    pg.mouse.move(5, 5); pg.wait_for_timeout(200); pg.hover(".pill"); pg.wait_for_timeout(450)
    broken = probe(pg)
    ck("ฉีด CSS ลบกฎ hover แล้วตัวตรวจจับได้ว่าไม่มีวงสีเน้น (แดงเป็น)", not has_accent_ring(broken["shadow"]), broken["shadow"][:120])
    br.close()
print(f"\nผ่าน {0 if fails else 'ครบ'} ตก {len(fails)}")
sys.exit(1 if fails else 0)
