#!/usr/bin/env python3
"""build_label_samples.py  สร้างไฟล์ตัวอย่างโหมดฉลากของจดหมายเวียน (05/11/2026 พี่ปอนด์ขอทำฉลากชื่อที่อยู่หลายช่องต่อหน้าจาก Excel)
ได้ samples/ตัวอย่าง-ฉลากชื่อที่อยู่.docx  ตาราง 2 คอลัมน์ 6 แถว ใส่ตัวยึดแค่ช่องแรก ช่องอื่นเป็นข้อความเก่าที่ต้องถูกแทน
     samples/ตัวอย่าง-ข้อมูลฉลาก.xlsx  15 แถว (ข้อมูลสมมติ) หัว Site ชื่อ ที่อยู่จัดส่งเอกสาร
ใช้: ../.venv/bin/python tools/build_label_samples.py [โฟลเดอร์ปลายทาง]  (ไม่ใส่ = samples/)
ใส่ --all-cells ได้เทมเพลตที่พิมพ์ตัวยึดครบทุกช่อง (ใช้ในเทส)
   --at-least ความสูงแถวแบบ At least แทน Exactly , --jitter คอลัมน์ขวากว้าง 9.4 ซม. ไม่เท่าคอลัมน์ซ้าย 9.5 ซม. (ตารางที่ทำเองใน Word)
   ใส่ตัวเลือกข้างบนแล้วชื่อไฟล์ได้คำต่อท้าย ไม่ทับไฟล์ตัวอย่าง"""
import sys, pathlib
from docx import Document
from docx.shared import Cm, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ROW_HEIGHT_RULE
from docx.oxml.ns import qn
from openpyxl import Workbook
from openpyxl.styles import Font

args = [a for a in sys.argv[1:] if not a.startswith("--")]
ALL = "--all-cells" in sys.argv
ATLEAST = "--at-least" in sys.argv
JITTER = "--jitter" in sys.argv
FONT = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--font=")), "TH Sarabun New")   # --font="Cordia New" ใช้ทดสอบทางวัดด้วยฟอนต์จริง
out = pathlib.Path(args[0]) if args else pathlib.Path(__file__).resolve().parent.parent / "samples"
out.mkdir(parents=True, exist_ok=True)

def thai_font(run, size=14):
    run.font.name = FONT; run.font.size = Pt(size)
    rf = run._element.get_or_add_rPr().get_or_add_rFonts()
    for k in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):  # ไทยต้องครบ 4 ช่องรวม cs (คลัง Proven)
        rf.set(qn(k), FONT)
    run._element.get_or_add_rPr().append(run._element.makeelement(qn("w:szCs"), {qn("w:val"): str(size * 2)}))

def para(cell, text, first=False, right=False, bold=False):
    p = cell.paragraphs[0] if first else cell.add_paragraph()
    p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
    if right: p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p.add_run(text); thai_font(r); r.bold = bold
    return p

d = Document()
sec = d.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.top_margin = sec.bottom_margin = Cm(1.2); sec.left_margin = sec.right_margin = Cm(1.0)
t = d.add_table(rows=6, cols=2); t.style = "Table Grid"
for row in t.rows:
    row.height = Cm(4.4); row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST if ATLEAST else WD_ROW_HEIGHT_RULE.EXACTLY
    for j, c in enumerate(row.cells): c.width = Cm(9.4 if JITTER and j == 1 else 9.5)
for i, row in enumerate(t.rows):
    for j, c in enumerate(row.cells):
        if (i, j) == (0, 0) or ALL:
            para(c, "ผู้รับ", first=True, bold=True)
            para(c, "{{ชื่อ}}")
            para(c, "{{ที่อยู่จัดส่งเอกสาร}}")
            para(c, "Site : {{Site}}", right=True)
        else:
            # ข้อความเก่าจากเอกสารเดิม เหมือนไฟล์จริงของพี่ที่ช่องอื่นยังมีชื่อคนเก่าค้าง
            para(c, "ผู้รับ", first=True, bold=True)
            para(c, "ชื่อเก่าที่ต้องหายไป")
            para(c, "Site : OLD0000", right=True)
name = "ตัวอย่าง-ฉลากชื่อที่อยู่" + ("-ครบทุกช่อง" if ALL else "") + ("-atleast" if ATLEAST else "") + ("-jitter" if JITTER else "") + ("-" + FONT.replace(" ", "") if FONT != "TH Sarabun New" else "") + ".docx"
d.save(out / name)

wb = Workbook(); ws = wb.active; ws.title = "รายชื่อ"
ws.append(["Site", "ชื่อ", "ที่อยู่จัดส่งเอกสาร"])
for c in ws[1]: c.font = Font(bold=True)
streets = ["ถนนสุขุมวิท", "ถนนพหลโยธิน", "ถนนเพชรเกษม", "ถนนมิตรภาพ", "ถนนรามคำแหง"]
prov = ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "ชลบุรี", "นครราชสีมา"]
for i in range(1, 16):
    ws.append([f"TRG{i:04d}", f"คุณทดสอบ ตัวอย่างที่{i}", f"{i * 7} หมู่ {i % 9 + 1} {streets[i % 5]} จังหวัด{prov[i % 5]} 10{i:03d}"])
ws.column_dimensions["B"].width = 26; ws.column_dimensions["C"].width = 60
if not (ALL or ATLEAST or JITTER or FONT != "TH Sarabun New"):
    wb.save(out / "ตัวอย่าง-ข้อมูลฉลาก.xlsx")
print("เขียน", out / name)
