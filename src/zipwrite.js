// ── ตัวเขียน ZIP แบบเบา สำหรับจดหมายเวียนข้อมูลใหญ่ ─────────────────────────
// ทำไมไม่ใช้ JSZip: JSZip ต้องถือทุกไฟล์ไว้ในหน่วยความจำจนสั่ง generate ครั้งเดียว
// จดหมายเวียนหลายหมื่นถึงหลักล้านฉบับ ผลรวมหลาย GB เบราว์เซอร์รับไม่ไหว (วัดจริง 07/11/2026
// 5,000 ฉบับ ผล 188 MB ค้างในหน่วยความจำทั้งหมดจนกดโหลด) ตัวนี้เขียนออกทีละไฟล์แล้วลืมได้ทันที
// และให้ไฟล์ในแพ็ก docx ที่เหมือนกันทุกฉบับ (styles theme fonts) บีบครั้งเดียวแล้วใช้ไบต์ซ้ำ
//
// รองรับเฉพาะที่ต้องใช้: เก็บตรง (method 0) กับไฟล์ที่บีบไว้แล้ว (method 8 deflate-raw)
// ชื่อไฟล์ UTF-8 (ธง bit 11) ไม่มี ZIP64 ผู้เรียกต้องแบ่งชุดให้ต่ำกว่า 65,535 ไฟล์และ 4 GB ต่อชุด

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** CRC32 แบบเดียวกับ ZIP คืนเลขไม่ติดลบ */
export function crc32(u8, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0;
}

const enc = new TextEncoder();
// เวลาในไฟล์ตายตัว 01/01/2024 00:00 ทุกฉบับเหมือนกัน ผลซ้ำได้ (DOS time)
const DOS_TIME = 0, DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

/** ไฟล์เก็บตรงไม่บีบ */
export function storeEntry(name, data) {
  return { name, nameBytes: enc.encode(name), method: 0, data, crc: crc32(data), size: data.length };
}

/** บีบด้วย deflate-raw ของเบราว์เซอร์ (CompressionStream) เก็บผลไว้ใช้ซ้ำทุกฉบับ */
export async function deflateEntry(name, data) {
  const cs = new CompressionStream("deflate-raw");
  const out = await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
  const z = new Uint8Array(out);
  // บีบแล้วไม่เล็กลง เก็บตรงดีกว่า
  if (z.length >= data.length) return storeEntry(name, data);
  return { name, nameBytes: enc.encode(name), method: 8, data: z, crc: crc32(data), size: data.length };
}

function localHeader(e) {
  const h = new Uint8Array(30 + e.nameBytes.length), v = new DataView(h.buffer);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, e.method, true);
  v.setUint16(10, DOS_TIME, true); v.setUint16(12, DOS_DATE, true); v.setUint32(14, e.crc, true);
  v.setUint32(18, e.data.length, true); v.setUint32(22, e.size, true); v.setUint16(26, e.nameBytes.length, true); v.setUint16(28, 0, true);
  h.set(e.nameBytes, 30);
  return h;
}
function centralHeader(e, offset) {
  const h = new Uint8Array(46 + e.nameBytes.length), v = new DataView(h.buffer);
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(10, e.method, true);
  v.setUint16(12, DOS_TIME, true); v.setUint16(14, DOS_DATE, true); v.setUint32(16, e.crc, true);
  v.setUint32(20, e.data.length, true); v.setUint32(24, e.size, true); v.setUint16(28, e.nameBytes.length, true);
  v.setUint32(42, offset, true);
  h.set(e.nameBytes, 46);
  return h;
}
function endRecord(count, cdSize, cdOffset) {
  const h = new Uint8Array(22), v = new DataView(h.buffer);
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, count, true); v.setUint16(10, count, true);
  v.setUint32(12, cdSize, true); v.setUint32(16, cdOffset, true);
  return h;
}

/** ประกอบ ZIP ทั้งไฟล์ในหน่วยความจำ (ใช้กับ docx หนึ่งฉบับ ขนาดเล็ก) */
export function makeZip(entries) {
  const parts = [], cd = [];
  let off = 0;
  for (const e of entries) {
    const lh = localHeader(e);
    cd.push(centralHeader(e, off));
    parts.push(lh, e.data); off += lh.length + e.data.length;
  }
  const cdSize = cd.reduce((n, c) => n + c.length, 0);
  parts.push(...cd, endRecord(entries.length, cdSize, off));
  const out = new Uint8Array(off + cdSize + 22);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const ZIP_MAX_FILES = 65000;          // ต่ำกว่าเพดาน 65,535 ของ ZIP ที่ไม่มี ZIP64
export const ZIP_MAX_BYTES = 3.8 * 1024 ** 3; // เผื่อสารบัญท้ายไฟล์ ต่ำกว่า 4 GB

/**
 * ZIP แบบสตรีม: add(name, bytes) เขียนหัวกับเนื้อออกทันทีผ่าน write(u8) แล้วไม่ถือเนื้อไว้
 * ถือแค่สารบัญ (ราว 80 ไบต์ต่อไฟล์) จนสั่ง finish() เขียนสารบัญท้ายไฟล์
 * write คืน Promise ได้ (FileSystemWritableFileStream) ตัวนี้รอให้เขียนเสร็จก่อนไปไฟล์ถัดไป
 */
export function zipStream(write) {
  const cd = [];
  let off = 0;
  return {
    get count() { return cd.length; },
    get bytes() { return off; },
    async add(name, data) {
      if (cd.length >= ZIP_MAX_FILES) throw new Error("ZIP นี้ครบจำนวนไฟล์สูงสุดแล้ว ต้องขึ้นชุดใหม่");
      const e = storeEntry(name, data); // docx บีบมาแล้ว บีบซ้ำไม่ได้เล็กลง
      const lh = localHeader(e);
      cd.push(centralHeader(e, off));
      await write(lh); await write(data);
      off += lh.length + data.length;
    },
    async finish() {
      let size = 0;
      for (const c of cd) { await write(c); size += c.length; }
      await write(endRecord(cd.length, size, off));
    },
  };
}
