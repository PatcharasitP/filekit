// ── ประตูเดียวสำหรับเปิดไฟล์ PDF ทุกเครื่องมือ ─────────────────────────────
// เดิมแต่ละเครื่องมือเรียก pdfjsLib.getDocument() เองตรง ๆ ทำให้เมื่อเจอไฟล์
// ที่ล็อกรหัส ผู้ใช้เห็นข้อความดิบจากไลบรารีว่า "No password given"ซึ่งอ่าน
// ไม่รู้เรื่องและไม่มีทางไปต่อ ไฟล์นี้รวมการจัดการไว้ที่เดียว: ขอรหัสผ่าน
// เป็นภาษาไทย ลองใหม่ได้ และแปลง error ทุกชนิดเป็นข้อความที่ทำตามได้

import { el, button } from "./ui.js";
import { uiIcon } from "./icons.js";
import { tr } from "./i18n.js";
import { assertNotEmpty } from "./filetype.js";

/** แปลง error ของ pdf.js เป็นข้อความไทยที่บอกว่าต้องทำอะไรต่อ (log ของจริงลง console ก่อนเสมอ) */
export function friendlyPdfError(e, filename) {
  console.error(e);
  const name = e?.name || "";
  const msg = String(e?.message || e);
  const pre = filename ? `${filename}: ` : "";
  if (name === "PasswordException" || /password/i.test(msg))
    return new Error(tr(`${pre}ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน ต้องใส่รหัสให้ถูกก่อนจึงจะเปิดได้`, `${pre}This file is password-protected, you need the correct password to open it`));
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg))
    return new Error(tr(`${pre}ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย, ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน`, `${pre}This isn't a valid PDF, or the file is damaged, try opening it in a PDF reader first`));
  if (/worker/i.test(msg))
    return new Error(tr(`${pre}โหลดตัวอ่าน PDF ไม่สำเร็จ ลองรีเฟรชหน้าเว็บอีกครั้ง`, `${pre}Could not load the PDF reader, try refreshing the page`));
  if (/out of memory|allocation failed|invalid (string|array|typed array) length/i.test(msg))
    return new Error(tr(`${pre}ไฟล์ใหญ่เกินไป เบราว์เซอร์ประมวลผลไม่ไหว, ลองแบ่งไฟล์ให้เล็กลงหรือใช้เครื่องแรมเยอะขึ้น`, `${pre}This file is too large for the browser to handle, try splitting it or using a device with more memory`));
  return new Error(pre + msg);
}

/** กล่องขอรหัสผ่านแบบอินไลน์ (ไม่ใช้ prompt() เพราะบางเบราว์เซอร์บล็อก) */
export function passwordBox(container) {
  return (wrongBefore) =>
    new Promise((resolve) => {
      const input = el("input", { type: "password", placeholder: tr("รหัสผ่านของไฟล์", "File password"), autocomplete: "off" });
      const box = el("div", { class: "panel pw-box" }, [
        el("div", { class: "status show " + (wrongBefore ? "err" : "info") },
          wrongBefore ? tr("รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง", "Wrong password, try again") : tr("ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน กรุณาใส่รหัสเพื่อเปิด", "This file is password-protected, enter the password to open it")),
        el("label", { class: "field" }, [el("span", {}, tr("รหัสผ่าน", "Password")), input]),
        el("div", { class: "actions" }, [
          button(tr("ปลดล็อกแล้วทำต่อ", "Unlock and continue"), { onclick: () => done(input.value) }),
          button(tr("ยกเลิก", "Cancel"), { ghost: true, onclick: () => done(null) }),
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
  assertNotEmpty(file);
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
          throw new Error(tr(`${file.name}: ยกเลิกการเปิดไฟล์ที่ล็อกรหัสผ่าน`, `${file.name}: cancelled opening the password-protected file`));
        continue;
      }
      throw friendlyPdfError(e, file.name);
    }
  }
  throw new Error(tr(`${file.name}: ใส่รหัสผ่านไม่ถูกต้องหลายครั้ง, ลองตรวจสอบรหัสอีกครั้ง`, `${file.name}: wrong password entered too many times, double-check the password and try again`));
}

/**
 * โหลดด้วย pdf-lib สำหรับเครื่องมือที่ต้อง "ประกอบไฟล์ใหม่"
 * ลองแบบเข้มก่อน ถ้าไฟล์เข้ารหัสจะลองใหม่แบบผ่อนปรนพร้อมบอกให้ผู้ใช้รู้ตัว
 * คืน { doc, encrypted } — encrypted = true แปลว่าผลลัพธ์อาจไม่สมบูรณ์
 */
export async function loadPdfLib(file) {
  assertNotEmpty(file);
  const { PDFDocument } = PDFLib;
  const buf = await file.arrayBuffer();
  try {
    return { doc: await PDFDocument.load(buf), encrypted: false };
  } catch (e) {
    if (/encrypt/i.test(String(e?.message || e))) {
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      return { doc, encrypted: true };
    }
    console.error(e);
    if (/invalid|parse/i.test(String(e?.message || e)))
      throw new Error(tr(`${file.name}: ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย, ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน`, `${file.name}: this isn't a valid PDF, or the file is damaged, try opening it in a PDF reader first`));
    throw new Error(`${file.name}: ${e?.message || e}`);
  }
}

export const ENCRYPTED_WARNING = tr(
  "ไฟล์ต้นฉบับถูกล็อกด้วยรหัสผ่าน ระบบทำต่อให้แล้วแต่เนื้อหาบางส่วนอาจไม่ครบ " +
  "แนะนำให้ปลดล็อกไฟล์ก่อนแล้วทำใหม่อีกครั้ง",
  "The original file is password-protected. We carried on, but some content may be missing, " +
  "unlock the file first and try again for a complete result.");
