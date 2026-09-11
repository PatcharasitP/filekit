import { tr } from "./i18n.js";

/* ── จำค่าที่ตั้งไว้ และแชร์ด้วยลิงก์ ──────────────────────────────────────
 * ปัญหาที่แก้ 2 อย่าง
 *   ① ปรับ 20 ช่องเสร็จ ปิดหน้าไปค่าหายหมด ต้องตั้งใหม่ทุกครั้ง
 *   ② ตั้งสวยแล้วส่งให้เพื่อนในทีมดูไม่ได้ ต้องบอกปากเปล่าว่าตั้งอะไรบ้าง
 *
 * ‼️ เก็บใน query string ไม่ใช่ hash เพราะ hash เป็นเส้นทางของเว็บนี้อยู่แล้ว
 * (`#/pbi-donut`) ใส่ query ลงไปจะทำให้ router หาเครื่องมือไม่เจอแล้วเด้งกลับหน้าแรก
 * ตรวจแล้วว่า router เก็บ location.search ไว้ทุกเส้นทาง จึงอยู่รอดตลอด
 *
 * ‼️ เก็บเฉพาะค่าที่ต่างจากค่าเริ่มต้น ลิงก์จะได้สั้นและอ่านออกว่าเปลี่ยนอะไรไป
 */

const PARAM = "s";
const KEY = (toolId) => `filekit-state-${toolId}`;

const b64urlEncode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlDecode = (s) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** ค่าที่ต่างจากค่าเริ่มต้นเท่านั้น (เทียบแบบ deep ด้วย JSON เพราะค่าเป็นข้อมูลล้วน)
 *  skip = ค่าที่ไม่ควรเก็บ เช่นค่าที่ผูกกับชุดข้อมูลที่เลือกอยู่ ไม่ใช่ค่าที่ผู้ใช้ตั้งเอง
 *  ถ้าเก็บไปด้วยลิงก์จะยาวขึ้นฟรี แล้วยังไปทับค่าที่ควรมาจากชุดข้อมูลของคนเปิดลิงก์ */
const isPlainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function diffFrom(defaults, values, skip = []) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (skip.includes(k)) continue;
    const d = defaults?.[k];
    /* ‼️ ลงลึกอีกชั้นเมื่อทั้งสองฝั่งเป็น object ธรรมดา
       ไม่งั้นแก้ช่องเดียวในก้อนที่มี 6 ช่องจะเก็บทั้งก้อน ลิงก์ยาวขึ้นหลายเท่าฟรี
       (วัดจริง 11/09/2026 แก้หัวเรื่องช่องเดียวได้ลิงก์ 647 ตัวอักษร) */
    if (isPlainObject(v) && isPlainObject(d)) {
      const inner = diffFrom(d, v);
      if (Object.keys(inner).length) out[k] = inner;
    } else if (JSON.stringify(v) !== JSON.stringify(d)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param toolId  ไอดีเครื่องมือ ใช้กันไม่ให้ลิงก์ของเครื่องมือหนึ่งไปใช้กับอีกเครื่องมือ
 * @param cfg     { defaults, collect, apply }
 *                collect() คืนค่าปัจจุบันทั้งชุด · apply(values) ใส่ค่ากลับเข้าเครื่องมือ
 */
export function stateKit(toolId, cfg) {
  const { defaults, collect, apply, skip = [] } = cfg;
  let timer = null;

  /* ‼️ ทั้ง localStorage และ URL อาจพังได้ (โหมดส่วนตัว, โควตาเต็ม, ลิงก์ถูกตัดกลาง)
     ทุกทางต้องล้มแบบเงียบแล้วใช้ค่าเริ่มต้นต่อ ห้ามทำให้เครื่องมือเปิดไม่ได้ */
  function readLink() {
    try {
      const raw = new URLSearchParams(location.search).get(PARAM);
      if (!raw) return null;
      const data = JSON.parse(b64urlDecode(raw));
      if (!data || data.t !== toolId || typeof data.v !== "object") return null;
      for (const k of skip) delete data.v[k];   // กันลิงก์เก่าที่เคยพกค่าพวกนี้มา
      return data.v;
    } catch { return null; }
  }

  function readSaved() {
    try {
      const raw = localStorage.getItem(KEY(toolId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** ลิงก์มาก่อนของที่จำไว้เสมอ คนกดลิงก์มาต้องได้เห็นของที่เจ้าของลิงก์ตั้งไว้ */
  function restore() {
    const values = readLink() || readSaved();
    if (!values || !Object.keys(values).length) return null;
    apply(values);
    return values;
  }

  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const diff = diffFrom(defaults, collect(), skip);
        if (Object.keys(diff).length) localStorage.setItem(KEY(toolId), JSON.stringify(diff));
        else localStorage.removeItem(KEY(toolId));
      } catch { /* เก็บไม่ได้ก็ไม่เป็นไร ของยังใช้ได้ปกติ */ }
    }, 400);
  }

  function forget() {
    clearTimeout(timer);
    try { localStorage.removeItem(KEY(toolId)); } catch { /* ไม่มีอะไรให้ลบก็ได้ */ }
  }

  function shareLink() {
    const diff = diffFrom(defaults, collect(), skip);
    const url = new URL(location.href);
    url.search = "";
    if (Object.keys(diff).length) {
      url.searchParams.set(PARAM, b64urlEncode(JSON.stringify({ t: toolId, v: diff })));
    }
    url.hash = "#/" + toolId;
    return url.toString();
  }

  /** ล้าง s ออกจากแถบที่อยู่หลังใช้แล้ว กันผู้ใช้กดรีเฟรชแล้วย้อนกลับไปค่าของลิงก์ */
  function dropLinkParam() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has(PARAM)) return;
      url.searchParams.delete(PARAM);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch { /* ไม่สำคัญพอที่จะทำให้พัง */ }
  }

  return { restore, save, forget, shareLink, dropLinkParam, hasLink: () => readLink() !== null };
}

/** ข้อความบอกผลตอนกดปุ่มแชร์ ใช้ร่วมกันทุกเครื่องมือจะได้พูดเหมือนกัน */
export const SHARE_MSG = {
  ok: () => tr("คัดลอกลิงก์แล้ว คนที่เปิดลิงก์นี้จะเห็นค่าที่ตั้งไว้เหมือนกันเป๊ะ",
               "Link copied. Anyone who opens it sees exactly these settings"),
  plain: () => tr("ยังไม่ได้ปรับอะไร ลิงก์นี้จะเปิดมาเป็นค่าเริ่มต้น",
                  "Nothing has been changed yet, this link opens with the defaults"),
  fail: () => tr("คัดลอกไม่ได้ ลองเลือกจากแถบที่อยู่แล้วคัดลอกเอง",
                 "Couldn't copy, select it from the address bar instead"),
};
