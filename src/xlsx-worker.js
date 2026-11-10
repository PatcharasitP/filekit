// worker ของ sheetpick.js readWorkbook: อ่าน Excel นอกเธรดหลัก หน้าเว็บไม่ค้างนิ่งตอนเปิดไฟล์ใหญ่
// ‼️ วัด 10/11/2026 Pixel 7 CPU ช้า 4 เท่า 50,000 แถว อ่านบนเธรดหลักค้าง 3,575 ms ย้ายมาที่นี่ค้างเหลือ 1,292 ms (ช่วงรับของกลับ)
//    หลักฐาน .claude/evidence/2026-11-09-fk-xlsx-worker/probe_run.log ในโฟลเดอร์งาน , เทส tests/browser_xlsx_worker.py
// worker แบบคลาสสิก เพราะ xlsx.full.min.js เป็นสคริปต์ตั้งตัวแปรกลาง ไม่ใช่ ES module
// อ่านไม่ได้ (ไฟล์เสีย รหัสผ่าน) ตอบกลับว่าไม่ได้ ให้ฝั่งหน้าอ่านซ้ำแบบเดิม จะได้ข้อความ error เหมือนเดิมทุกตัวอักษร
importScripts("../vendor/xlsx.full.min.js");

// op read: อ่านไบต์หรือข้อความเป็นสมุดงาน , op write: เขียนสมุดงานเป็นไบต์ xlsx ส่งกลับแบบ transfer ไม่ต้องคัดลอก
self.onmessage = ({ data: { id, op, data, wb, opts } }) => {
  try {
    if (op === "write") {
      const buf = XLSX.write(wb, opts);
      self.postMessage({ id, buf }, [buf]);
    } else {
      self.postMessage({ id, wb: XLSX.read(data, opts) });
    }
  } catch (e) {
    self.postMessage({ id, err: String((e && e.message) || e) });
  }
};
