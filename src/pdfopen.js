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
  // ‼️ เดิม console.error ทุกกรณี ทำให้เรื่องปกติอย่าง "ไฟล์นี้เข้ารหัสไว้" ไปโผล่เป็น error
  //    ใน console ด้วย ทั้งที่เราจัดการและอธิบายให้ผู้ใช้เรียบร้อยแล้ว
  //    เก็บ log ไว้เฉพาะกรณีที่เราเองก็ไม่รู้จัก (ท้ายฟังก์ชัน) ซึ่งเป็นตอนที่ต้องการ trace จริง
  const name = e?.name || "";
  const msg = String(e?.message || e);
  const pre = filename ? `${filename}: ` : "";
  // ไฟล์เข้ารหัส: ข้อความเต็มถูกประกอบไว้แล้วตอนโหลด ส่งต่อตรง ๆ ไม่ต้องแปลงอีก
  if (msg.includes("ถูกเข้ารหัสไว้") || msg.includes("is encrypted"))
    return new Error(pre + msg);
  if (name === "PasswordException" || /password/i.test(msg))
    return new Error(tr(`${pre}ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน ต้องใส่รหัสให้ถูกก่อนจึงจะเปิดได้`, `${pre}This file is password-protected, you need the correct password to open it`));
  if (name === "InvalidPDFException" || /invalid pdf/i.test(msg))
    return new Error(tr(`${pre}ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย, ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน`, `${pre}This isn't a valid PDF, or the file is damaged, try opening it in a PDF reader first`));
  if (/worker/i.test(msg))
    return new Error(tr(`${pre}โหลดตัวอ่าน PDF ไม่สำเร็จ ลองรีเฟรชหน้าเว็บอีกครั้ง`, `${pre}Could not load the PDF reader, try refreshing the page`));
  if (/out of memory|allocation failed|invalid (string|array|typed array) length/i.test(msg))
    return new Error(tr(`${pre}ไฟล์ใหญ่เกินไป เบราว์เซอร์ประมวลผลไม่ไหว, ลองแบ่งไฟล์ให้เล็กลงหรือใช้เครื่องแรมเยอะขึ้น`, `${pre}This file is too large for the browser to handle, try splitting it or using a device with more memory`));
  console.error(e);         // กรณีที่ยังไม่รู้จัก เก็บ trace ไว้ให้ไล่ต่อได้
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
 *
 * ‼️ ไฟล์ PDF ที่เข้ารหัสไว้ ต้องหยุดแล้วบอกผู้ใช้ ห้ามทำต่อเด็ดขาด
 * เดิมใช้ ignoreEncryption แล้วทำต่อพร้อมขึ้นคำเตือนว่า "เนื้อหาบางส่วนอาจไม่ครบ"
 * แต่ความจริงคือ pdf-lib ไม่มีโค้ดถอดรหัสอยู่เลย เนื้อในทุกหน้าจึงยังเป็นข้อมูลที่เข้ารหัสอยู่
 * ผลลัพธ์ไม่ใช่ "ไม่ครบ" แต่คือ "พังทั้งไฟล์" (ยิงจริง 09/09/2026 กับไฟล์ที่ล็อกแค่สิทธิ์
 * ซึ่งเปิดอ่านได้ปกติไม่ต้องใส่รหัส: pdf-split ได้ไฟล์ 3 หน้าว่างเปล่าสนิท
 * ส่วน pdf-page-numbers ได้ไฟล์ที่เปิดไม่ขึ้นเลย และไม่มีคำเตือนอะไรสักตัว)
 * ยัดไฟล์เสียให้ผู้ใช้โดยที่สถานะขึ้นว่าสำเร็จ แย่กว่าบอกไปตรง ๆ ว่าทำให้ไม่ได้
 *
 * คืน { doc, encrypted } โดย encrypted จะเป็น false เสมอ (คงรูปคืนค่าไว้ให้เครื่องมือเดิมใช้ได้)
 */
export async function loadPdfLib(file) {
  assertNotEmpty(file);
  const { PDFDocument } = PDFLib;
  const buf = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(buf);
    return { doc, encrypted: false, hiddenLayers: countHiddenLayers(doc) };
  } catch (e) {
    if (/encrypt/i.test(String(e?.message || e))) throw new Error(ENCRYPTED_BLOCKED);
    console.error(e);
    if (/invalid|parse/i.test(String(e?.message || e)))
      throw new Error(tr(`${file.name}: ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย, ลองเปิดด้วยโปรแกรมอ่าน PDF ดูก่อน`, `${file.name}: this isn't a valid PDF, or the file is damaged, try opening it in a PDF reader first`));
    throw new Error(`${file.name}: ${e?.message || e}`);
  }
}

/* ‼️ PDF รองรับ "ชั้น" (Optional Content Group) ที่ผู้ใช้สั่งซ่อนไว้ได้ เช่นชั้นร่าง
 * ชั้นราคาต้นทุน หรือชั้นที่ใช้ปิดทับข้อมูลส่วนตัว · ไลบรารีที่เราใช้ประกอบไฟล์ใหม่
 * ไม่ได้คัดลอกโครงสร้างชั้นไปด้วย ผลคือของที่เคยซ่อนอยู่ "กลายเป็นมองเห็นได้" ในไฟล์ผลลัพธ์
 * (ยิงจริง 09/09/2026: ไฟล์ต้นฉบับเห็นพิกเซลสีของชั้นที่ซ่อน 0% ไฟล์ผลลัพธ์เห็น 37%)
 * นี่คือเรื่องความเป็นส่วนตัว ต้องบอกผู้ใช้ก่อน ไม่ใช่ปล่อยให้รู้ตอนไฟล์หลุดไปแล้ว */
export function countHiddenLayers(doc) {
  try {
    const { PDFName } = PDFLib;
    const oc = doc.catalog.lookup(PDFName.of("OCProperties"));
    const d = oc && oc.lookup && oc.lookup(PDFName.of("D"));
    const off = d && d.lookup && d.lookup(PDFName.of("OFF"));
    return off && typeof off.size === "function" ? off.size() : 0;
  } catch {
    return 0;                 // อ่านโครงสร้างไม่ได้ ถือว่าไม่มี ดีกว่าทำให้ทั้งไฟล์แปลงไม่ผ่าน
  }
}

export const HIDDEN_LAYERS_WARNING = tr(
  "ไฟล์ต้นฉบับมีชั้นที่ถูกซ่อนไว้ เครื่องมือนี้คัดลอกโครงสร้างชั้นไปด้วยไม่ได้ " +
  "เนื้อหาที่เคยซ่อนจะมองเห็นได้ในไฟล์ผลลัพธ์ ถ้าเป็นข้อมูลที่ไม่ควรเผยแพร่ ให้ลบชั้นนั้นทิ้งก่อน",
  "The original file has hidden layers. This tool cannot carry the layer structure over, so content " +
  "that used to be hidden will be visible in the result. If it is private, delete that layer first.");

export const ENCRYPTED_BLOCKED = tr(
  "ไฟล์นี้ถูกเข้ารหัสไว้ เครื่องมือนี้แก้ไขไฟล์ที่เข้ารหัสไม่ได้ ถ้าฝืนทำต่อจะได้ไฟล์ที่เปิดไม่ขึ้น " +
  "ให้ปลดล็อกไฟล์ก่อน (เปิดไฟล์แล้วสั่งพิมพ์เป็น PDF ใหม่) แล้วลองอีกครั้ง",
  "This file is encrypted, and this tool cannot edit encrypted files. Forcing it through would " +
  "produce a file that won't open. Unlock the file first (open it and print to a new PDF), then try again.");

// ชื่อเดิม คงไว้ให้เครื่องมือที่ยัง import อยู่ ไม่พัง (ตอนนี้ไฟล์เข้ารหัสถูกหยุดตั้งแต่ตอนโหลดแล้ว)
export const ENCRYPTED_WARNING = ENCRYPTED_BLOCKED;
