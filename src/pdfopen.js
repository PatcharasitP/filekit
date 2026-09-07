// ── ประตูเดียวสำหรับเปิดไฟล์ PDF ทุกเครื่องมือ ─────────────────────────────
// เดิมแต่ละเครื่องมือเรียก pdfjsLib.getDocument() เองตรง ๆ ทำให้เมื่อเจอไฟล์
// ที่ล็อกรหัส ผู้ใช้เห็นข้อความดิบจากไลบรารีว่า "No password given"ซึ่งอ่าน
// ไม่รู้เรื่องและไม่มีทางไปต่อ ไฟล์นี้รวมการจัดการไว้ที่เดียว: ขอรหัสผ่าน
// เป็นภาษาไทย ลองใหม่ได้ และแปลง error ทุกชนิดเป็นข้อความที่ทำตามได้

import { el, button } from "./ui.js";

/** แปลง error ของ pdf.js เป็นข้อความไทยที่บอกว่าต้องทำอะไรต่อ */
export function friendlyPdfError(e) {
  const name = e?.name || "";
  const msg = String(e?.message || e);
  if (name === "PasswordException" || /password/i.test(msg))
    return new Error("ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน — ต้องใส่รหัสให้ถูกก่อนจึงจะเปิดได้");
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg))
    return new Error("ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน");
  if (/worker/i.test(msg))
    return new Error("โหลดตัวอ่าน PDF ไม่สำเร็จ — ลองรีเฟรชหน้าเว็บอีกครั้ง");
  return new Error(msg);
}

/** กล่องขอรหัสผ่านแบบอินไลน์ (ไม่ใช้ prompt() เพราะบางเบราว์เซอร์บล็อก) */
export function passwordBox(container) {
  return (wrongBefore) =>
    new Promise((resolve) => {
      const input = el("input", { type: "password", placeholder: "รหัสผ่านของไฟล์", autocomplete: "off" });
      const box = el("div", { class: "panel pw-box" }, [
        el("div", { class: "status show " + (wrongBefore ? "err" : "info") },
          wrongBefore ? "รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง" : "🔒 ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน กรุณาใส่รหัสเพื่อเปิด"),
        el("label", { class: "field" }, [el("span", {}, "รหัสผ่าน"), input]),
        el("div", { class: "actions" }, [
          button("ปลดล็อกแล้วทำต่อ", { onclick: () => done(input.value) }),
          button("ยกเลิก", { ghost: true, onclick: () => done(null) }),
        ]),
      ]);
      const done = (v) => { box.remove(); resolve(v); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); });
      container.appendChild(box);
      input.focus();
    });
}

/**
 * เปิดเอกสาร PDF ด้วย pdf.js — ถ้าไฟล์ล็อกจะขอรหัสผ่านจากผู้ใช้ (สูงสุด 3 ครั้ง)
 * askPassword: (wrongBefore) => Promise<string|null>   ส่ง null = ผู้ใช้ยกเลิก
 */
export async function openPdf(file, askPassword) {
  const buf = await file.arrayBuffer();
  let password;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // ส่งสำเนา buffer ทุกครั้ง เพราะ pdf.js จะ "ยึด"buffer เดิมไปหลังเรียก
      return await pdfjsLib.getDocument({ data: buf.slice(0), password }).promise;
    } catch (e) {
      if (e?.name === "PasswordException" && askPassword) {
        password = await askPassword(attempt > 0);
        if (password === null || password === undefined)
          throw new Error("ยกเลิกการเปิดไฟล์ที่ล็อกรหัสผ่าน");
        continue;
      }
      throw friendlyPdfError(e);
    }
  }
  throw new Error("ใส่รหัสผ่านไม่ถูกต้องหลายครั้ง — ลองตรวจสอบรหัสอีกครั้ง");
}

/**
 * โหลดด้วย pdf-lib สำหรับเครื่องมือที่ต้อง "ประกอบไฟล์ใหม่"
 * ลองแบบเข้มก่อน ถ้าไฟล์เข้ารหัสจะลองใหม่แบบผ่อนปรนพร้อมบอกให้ผู้ใช้รู้ตัว
 * คืน { doc, encrypted } — encrypted = true แปลว่าผลลัพธ์อาจไม่สมบูรณ์
 */
export async function loadPdfLib(file) {
  const { PDFDocument } = PDFLib;
  const buf = await file.arrayBuffer();
  try {
    return { doc: await PDFDocument.load(buf), encrypted: false };
  } catch (e) {
    if (/encrypt/i.test(String(e?.message || e))) {
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      return { doc, encrypted: true };
    }
    if (/invalid|parse/i.test(String(e?.message || e)))
      throw new Error("ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย");
    throw e;
  }
}

export const ENCRYPTED_WARNING =
  "ไฟล์ต้นฉบับถูกล็อกด้วยรหัสผ่าน ระบบทำต่อให้แล้วแต่เนื้อหาบางส่วนอาจไม่ครบ " +
  "แนะนำให้ปลดล็อกไฟล์ก่อนแล้วทำใหม่อีกครั้ง";
