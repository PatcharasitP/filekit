#!/usr/bin/env python3
"""แปลง tools/toolio.json ที่ harvest_io.py เก็บมา ให้เป็น src/toolio.js ที่หน้าเว็บใช้

‼️ ทำไมต้องมีไฟล์นี้ (18/09/2026)
   harvest_io.py เก็บค่าจากการรันจริงแล้วเขียนแค่ tools/toolio.json
   แต่หน้าเว็บอ่านจาก src/toolio.js ซึ่งคนละรูปแบบกัน และไม่มีสคริปต์แปลงอยู่ในโปรเจกต์
   ใครที่เก็บค่าใหม่จึงติดตรงนี้แล้วต้องแก้มือ ซึ่งหัวไฟล์ src/toolio.js เขียนห้ามไว้ชัดเจน

‼️ ก่อนเขียนทับ สคริปต์นี้จะพิสูจน์ตัวเองก่อน
   แปลงข้อมูลของเครื่องมือที่ "ไม่ได้แตะ" แล้วเทียบกับค่าที่อยู่ใน src/toolio.js เดิม
   ถ้าตรงกันทุกตัว แปลว่าสูตรแปลงถูก ค่าใหม่ของเครื่องมือที่แก้ไปจึงเชื่อได้
   ถ้าไม่ตรงแม้แต่ตัวเดียว = หยุด ไม่เขียนทับ

รัน: python3 tools/toolio_json_to_js.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools/toolio.json"
DST = ROOT / "src/toolio.js"


def convert(entry):
    """{id, btn, ins:[{name,size,meta}], outs:[...]} -> {n, inSize, inMeta, outExt, outSize, outMeta}"""
    ins, outs = entry.get("ins") or [], entry.get("outs") or []
    if not ins or not outs:
        return None
    out = outs[0]
    ext = out["name"].rsplit(".", 1)[-1].lower() if "." in out["name"] else ""
    return {
        "n": len(ins),
        "inSize": ins[0].get("size", ""),
        "inMeta": ins[0].get("meta", ""),
        "outExt": ext,
        "outSize": out.get("size", ""),
        "outMeta": out.get("meta", ""),
    }


raw = json.loads(SRC.read_text(encoding="utf-8"))
built = {}
for tid in sorted(set(raw["th"]) & set(raw["en"])):
    th, en = convert(raw["th"][tid]), convert(raw["en"][tid])
    if th and en:
        built[tid] = {"th": th, "en": en}

# ── พิสูจน์สูตรแปลงกับของเดิมก่อน
old_js = DST.read_text(encoding="utf-8")
m = re.search(r"export const TOOL_IO_ALL = (\{.*?\n\});", old_js, re.S)
if not m:
    sys.exit("อ่านข้อมูลเดิมใน src/toolio.js ไม่ได้ หยุดก่อน ไม่เขียนทับ")
old = json.loads(m.group(1))

same, diff, new = [], [], []
for tid, v in built.items():
    if tid not in old:
        new.append(tid)
    elif old[tid] == v:
        same.append(tid)
    else:
        diff.append((tid, old[tid]["th"], v["th"]))

print(f"เครื่องมือที่แปลงได้ {len(built)} ตัว")
print(f"  ตรงกับของเดิมเป๊ะ {len(same)} ตัว")
print(f"  ค่าเปลี่ยนไป {len(diff)} ตัว")
for tid, o, n in diff:
    print(f"    {tid}")
    print(f"      เดิม  {json.dumps(o, ensure_ascii=False)}")
    print(f"      ใหม่  {json.dumps(n, ensure_ascii=False)}")
if new:
    print(f"  เครื่องมือใหม่ที่ยังไม่เคยมี {len(new)} ตัว: {new}")

# ‼️ ยอมให้ผ่านได้ 2 กรณีเท่านั้น
#    ① ตัวที่ตั้งใจแก้ฟีเจอร์ในรอบนี้
#    ② ตัวที่เปลี่ยน "แค่ขนาดไฟล์ที่ใส่เข้าไป" ซึ่งแปลว่าไฟล์ตัวอย่างถูกแก้ทีหลัง
#       โดยไม่มีใครเก็บค่าใหม่ ค่าเก่าจึงล้าสมัย ไม่ใช่เครื่องมือทำงานเปลี่ยน
#    นอกจากนี้ = หยุด เพราะแปลว่าผลลัพธ์ของเครื่องมือเปลี่ยนจริงโดยไม่ได้ตั้งใจ
EXPECTED_CHANGES = {"pdf-pages"}   # ตัวที่ตั้งใจแก้ฟีเจอร์ในรอบนี้


def only_input_size(old_th, new_th):
    """เปลี่ยนแค่ขนาดไฟล์ที่ใส่เข้าไป ซึ่งแปลว่าไฟล์ตัวอย่างเปลี่ยน ไม่ใช่เครื่องมือเปลี่ยน"""
    return all(old_th[k] == new_th[k] for k in old_th if k != "inSize")


unexpected = []
for tid, o, n in diff:
    if tid in EXPECTED_CHANGES:
        continue
    if only_input_size(o, n):
        continue           # ไฟล์ตัวอย่างถูกแก้ทีหลังโดยไม่ได้เก็บค่าใหม่ ค่าที่เก็บมาจึงใหม่กว่า
    unexpected.append(tid)
if unexpected:
    sys.exit(f"\n❌ มีเครื่องมือที่ผลลัพธ์เปลี่ยนโดยไม่ได้ตั้งใจ {sorted(unexpected)}\n"
             f"   หยุดก่อน ไม่เขียนทับ ให้ดูว่าเกิดอะไรขึ้นกับตัวนั้น")
size_only = [t for t, o, n in diff if t not in EXPECTED_CHANGES and only_input_size(o, n)]
if size_only:
    print(f"\n  ℹ️ อีก {len(size_only)} ตัวเปลี่ยนแค่ขนาดไฟล์ที่ใส่เข้าไป ซึ่งมาจากไฟล์ตัวอย่างถูกแก้ทีหลัง")
    print(f"     ไม่ใช่เครื่องมือเปลี่ยน จึงถือว่าเป็นการอัปเดตค่าที่ล้าสมัย: {size_only}")
if len(same) < 10:
    sys.exit(f"\n❌ ตรงกับของเดิมแค่ {len(same)} ตัว น้อยเกินกว่าจะเชื่อว่าสูตรแปลงถูก หยุดก่อน")

# ‼️ ด่านกันข้อมูลหาย เขียนทับทั้งไฟล์ ถ้าเก็บค่ามาไม่ครบ ตัวที่ขาดจะหายไปเงียบ ๆ
#    สคริปต์เก็บค่าข้ามเครื่องมือที่ไม่มีปุ่มไฟล์ตัวอย่าง ซึ่งมีอยู่ 18 ตัว
lost = sorted(set(old) - set(built))
if lost:
    sys.exit(f"\n❌ เขียนทับแล้วจะทำให้ {len(lost)} เครื่องมือหายไปจากไฟล์: {lost}\n"
             f"   มักเกิดเมื่อเครื่องมือนั้นไม่มีปุ่มไฟล์ตัวอย่าง สคริปต์เก็บค่าจึงข้ามไป\n"
             f"   หยุดก่อน ไม่เขียนทับ")

# ── เขียนทับ โดยคงส่วนหัวคำอธิบายกับส่วนท้ายที่เลือกภาษาไว้เหมือนเดิม
head = old_js[: old_js.index("export const TOOL_IO_ALL")]
tail = old_js[old_js.index("};", old_js.index("export const TOOL_IO_ALL")) + 2:]
body = json.dumps(built, ensure_ascii=False, indent=1)
DST.write_text(f"{head}export const TOOL_IO_ALL = {body};{tail}", encoding="utf-8")
print(f"\n✅ เขียน src/toolio.js แล้ว {len(built)} เครื่องมือ")
