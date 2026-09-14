#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""คัดลอกไฟล์ฟังก์ชัน Power Query จากคลังจริงเข้า samples/powerquery/ ให้ถูกกฎข้อความ

‼️ ที่มา: ไฟล์ใน Data/ADVANCE/ เป็นคลังของพี่ปอนด์ คอมเมนต์ในนั้นใช้จุดกลาง · ได้ตามกฎ
   แต่พอเอาขึ้นเว็บ ผู้ใช้กดแท็บ "ตัวฟังก์ชัน" แล้วเห็นกับตา มันจึงกลายเป็น
   "ข้อความบนหน้าจอ" ซึ่งกฎห้ามใช้จุดกลางเป็นตัวคั่น (tests/samples.test.mjs จับข้อนี้)

‼️ ทำไมต้องเป็นสคริปต์ ไม่ใช่แก้มือตอนคัดลอก: ครั้งก่อนคัดลอก fnMultiSourceFallbackLookup
   แล้วแก้มือ ไม่มีใครบันทึกวิธีไว้ พอถึงคราวคัดลอกไฟล์ใหม่ 3 ไฟล์ก็ลืมสนิทและเทสแดงทันที
   กฎที่ไม่มีเครื่องบังคับจะลืมทุกครั้ง

แทนจุดกลางด้วยจุลภาคเมื่ออยู่กลางประโยค และเว้นวรรคเมื่อขนาบด้วยช่องว่างอยู่แล้ว
ขีดยาว — แทนด้วยจุลภาคเช่นกัน ส่วนโค้ด M ไม่ถูกแตะเลยเพราะอักขระพวกนี้ไม่ใช่ไวยากรณ์ M

รัน: python3 tools/sync_pq_samples.py [--check]
     --check = ตรวจอย่างเดียว ไม่เขียนไฟล์ (ใช้ใน CI ได้)
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT.parent / "Data" / "ADVANCE"
DST_DIR = ROOT / "samples" / "powerquery"

FILES = [
    "fnMultiSourceFallbackLookup.pq",
    "fnToDate.pq",
    "fnPickDate.pq",
    "fnGroupConcat.pq",
]

BANNED = {"·": ",", "—": ","}


def clean(text: str) -> str:
    out = text
    for bad, good in BANNED.items():
        # " · " กลายเป็น ", " ไม่ใช่ " , " จึงต้องกินช่องว่างหน้าอักขระด้วย
        out = out.replace(f" {bad} ", f"{good} ")
        out = out.replace(f" {bad}", f"{good}")
        out = out.replace(bad, good)
    return out


def main() -> int:
    check_only = "--check" in sys.argv
    problems, copied = [], []
    for name in FILES:
        src, dst = SRC_DIR / name, DST_DIR / name
        if not src.exists():
            problems.append(f"ไม่พบไฟล์ต้นทาง {src}")
            continue
        wanted = clean(src.read_text(encoding="utf-8"))
        current = dst.read_text(encoding="utf-8") if dst.exists() else None
        if current == wanted:
            continue
        if check_only:
            problems.append(f"{name} ไม่ตรงกับต้นฉบับที่ทำความสะอาดแล้ว")
            continue
        dst.write_text(wanted, encoding="utf-8")
        copied.append(name)

    for name in FILES:
        dst = DST_DIR / name
        if dst.exists():
            left = [b for b in BANNED if b in dst.read_text(encoding="utf-8")]
            if left:
                problems.append(f"{name} ยังเหลืออักขระต้องห้าม {' '.join(left)}")

    if problems:
        print("พบปัญหา:")
        for p in problems:
            print("  -", p)
        return 1
    print("ไฟล์ตัวอย่างตรงกับคลังและไม่มีอักขระต้องห้าม" if not copied
          else "คัดลอกและทำความสะอาดแล้ว: " + ", ".join(copied))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
