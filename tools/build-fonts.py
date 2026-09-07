#!/usr/bin/env python3
"""
สร้างฟอนต์ย่อย (subset) ของ Sarabun ให้ครอบคลุม "ทุกตัวอักษรที่เว็บนี้ใช้จริง"

‼️ บทเรียน: subset ชุดเดิมทำจากช่วง unicode ที่เดาเอา แล้วขาด "⇄" ซึ่งใช้อยู่บนหน้าแรก
   ตัวที่ขาดจะตกไปใช้ฟอนต์อื่นของระบบ → ผู้ใช้เห็นเป็น "ฟอนต์สองแบบปนกัน"
   สคริปต์นี้กวาดตัวอักษรจากซอร์สจริงทั้งหมด ไม่เดาช่วง unicode อีก

ใช้:  ../.venv/bin/python tools/build-fonts.py /path/Sarabun-Regular.ttf ...
"""
import sys, pathlib
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAN = ["index.html", "src", "assets/css"]
SKIP = {".png", ".jpg", ".ttf", ".woff2", ".webmanifest"}

def used_chars():
    chars = set()
    for target in SCAN:
        p = ROOT / target
        files = [p] if p.is_file() else [f for f in p.rglob("*") if f.is_file() and f.suffix not in SKIP]
        for f in files:
            chars |= set(f.read_text(encoding="utf-8", errors="ignore"))
    chars |= {chr(c) for c in range(0x0E00, 0x0E80)}      # อักษรไทยทั้งบล็อก
    chars |= {chr(c) for c in range(0x20, 0x7F)}          # ASCII
    chars |= set("–—…·«»“”‘’•→←↔⇄⇆↑↓≤≥≠±×÷°™®©№฿")        # เครื่องหมายที่อาจใช้ในอนาคต
    return {c for c in chars if ord(c) < 0x2500 and c.isprintable()}

def build(src, out, chars):
    font = TTFont(str(src))
    opt = Options()
    opt.layout_features = ["*"]        # ‼️ ต้องเก็บ GPOS/GSUB ไว้ ไม่งั้นสระ/วรรณยุกต์ไทยลอยผิดตำแหน่ง
    opt.name_IDs = ["*"]
    opt.notdef_outline = True
    sub = Subsetter(opt)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    font.flavor = "woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(out))
    return out.stat().st_size

if __name__ == "__main__":
    srcs = [pathlib.Path(a) for a in sys.argv[1:]]
    if not srcs: sys.exit("ต้องระบุไฟล์ .ttf ต้นฉบับ")
    chars = used_chars()
    print(f"ตัวอักษรที่เว็บใช้จริง + เผื่อไว้ = {len(chars)} ตัว")
    for s in srcs:
        key = next((k for k in ("Regular","SemiBold","Bold") if k.lower() in s.stem.lower()), None)
        if not key: print("  ข้าม:", s.name); continue
        out = ROOT / "vendor/fonts" / f"Sarabun-{key}.woff2"
        print(f"  {s.name} → {out.name}  {build(s, out, chars):,} bytes")
