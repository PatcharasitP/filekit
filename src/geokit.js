/* geokit — ตรรกะภูมิศาสตร์สำหรับ "แผนที่การกระจัด" ไม่แตะ DOM รันบน node ได้ตรง ๆ
 *
 * ‼️ ทำไมต้องมีไฟล์นี้
 *   งานย้ายสถานี (site relocation) ต้องตอบคำถามเดิมทุกครั้ง: ย้ายไปไกลแค่ไหน ไกลสุดคู่ไหน อยู่ตรงไหนบนแผนที่
 *   ที่ผ่านมาคำนวณใน DAX แล้วเอาขึ้น Power BI ผ่าน Icon Map Pro ซึ่งต้องเตรียมชีตหลายแบบด้วยมือทุกรอบ
 *   ไฟล์นี้ย้ายการคำนวณทั้งหมดมาไว้ที่เดียว ทั้งฝั่งเว็บ (ดูทันที) และฝั่งไฟล์ที่ส่งเข้า Power BI
 *
 * ‼️ ความจริงที่พิสูจน์แล้วและต้องรักษาไว้ (จากงานจริง 15-16/09/2026)
 *   • Icon Map Pro วาด "เส้นเชื่อมคู่" ได้ด้วย WKT LINESTRING เท่านั้น ไม่มีช่องใส่คู่พิกัดตรง ๆ
 *   • วงรัศมีต้องส่งเป็น WKT POLYGON ที่คำนวณเอง (ArcGIS ทำได้ไม่เกิน 5 จุด จึงใช้กับงานจริงไม่ได้)
 *   • ป้ายระยะทางต้องมีจุดยึดของตัวเอง (แถว KIND=LABEL ที่จุดกึ่งกลางเส้น) ไม่งั้นป้ายไปเกาะจุดสถานี
 */

const R_EARTH_KM = 6371.0088;           // รัศมีเฉลี่ยของโลกตามมาตรฐาน IUGG
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** ระยะทางวงกลมใหญ่ (haversine) หน่วยกิโลเมตร */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** จุดกึ่งกลางบนเส้นวงกลมใหญ่ (ไม่ใช่ค่าเฉลี่ยพิกัด ซึ่งเพี้ยนเมื่อระยะไกลหรือคร่อมเส้นแบ่งลองจิจูด) */
export function midpoint(lat1, lon1, lat2, lon2) {
  const φ1 = rad(lat1), φ2 = rad(lat2), λ1 = rad(lon1), Δλ = rad(lon2 - lon1);
  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  const φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2));
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  return { lat: deg(φ3), lon: ((deg(λ3) + 540) % 360) - 180 };
}

/** ทิศทางจากจุดแรกไปจุดที่สอง (0 = เหนือ, 90 = ตะวันออก) */
export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = rad(lat1), φ2 = rad(lat2), Δλ = rad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** ทิศเป็นคำไทย/อังกฤษ 8 ทิศ */
export function compass(deg8, lang = "th") {
  const th = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
  const en = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const i = Math.round(((deg8 % 360) + 360) % 360 / 45) % 8;
  return (lang === "en" ? en : th)[i];
}

const num = (x) => Number(x);
const isLatLon = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) &&
  Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/** อ่านค่าพิกัดหนึ่งช่อง รับทั้งตัวเลข, ข้อความมีจุลภาค, และรูปแบบองศาลิปดา 13°30'15"N */
export function toCoord(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= 180 ? v : null;
  let s = String(v).trim();
  const dms = s.match(/^(-?\d+(?:\.\d+)?)\s*[°d]\s*(?:(\d+(?:\.\d+)?)\s*['m]\s*)?(?:(\d+(?:\.\d+)?)\s*["s]\s*)?([NSEWnsew])?$/);
  if (dms) {
    const sign = /[SWsw]/.test(dms[4] || "") ? -1 : 1;
    const val = Math.abs(num(dms[1])) + (num(dms[2] || 0) / 60) + (num(dms[3] || 0) / 3600);
    return sign * val * (num(dms[1]) < 0 ? -1 : 1);
  }
  // ‼️ จุลภาคในพิกัดอันตรายมาก "100,503058" ถ้าลบจุลภาคทิ้งดื้อ ๆ จะกลายเป็น 100503058
  //    ซึ่งผิดแบบเงียบ จุดหลุดออกนอกโลกโดยไม่มีอะไรฟ้อง
  //    ไฟล์ที่ส่งออกจากเครื่องที่ตั้งภาษายุโรปใช้จุลภาคเป็นจุดทศนิยมจริง จึงแปลงให้เฉพาะกรณีที่ชัดเจน
  s = s.replace(/[\s ]/g, "");
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length === 2 && !s.includes(".")) s = parts[0] + "." + parts[1];   // 100,503058 = ทศนิยมยุโรป
    else s = s.replace(/,/g, "");                                                // 1,234.5 = ตัวคั่นหลักพัน
  }
  const n = Number(s);
  // พิกัดที่หลุดขอบโลกคือค่าที่อ่านผิด ไม่ใช่ค่าที่ควรส่งต่อ
  return Number.isFinite(n) && Math.abs(n) <= 180 ? n : null;
}

/**
 * ประกอบข้อมูลคู่ย้ายจากตารางดิบ
 * rows    : แถวจากไฟล์ (array ของ array หรือ object ก็ได้ ผู้เรียกส่ง getter มา)
 * mapping : { pairId, codeOld, codeNew, latOld, lonOld, latNew, lonNew, province, nameOld, nameNew }
 *           แต่ละค่าเป็นฟังก์ชันอ่านค่าจากแถว
 * คืน { pairs, skipped } — skipped บอกเหตุผลรายแถว ห้ามกลืนเงียบ
 */
export function buildPairs(rows, get) {
  const pairs = [], skipped = [];
  rows.forEach((r, i) => {
    const latO = toCoord(get.latOld(r)), lonO = toCoord(get.lonOld(r));
    const latN = toCoord(get.latNew(r)), lonN = toCoord(get.lonNew(r));
    if (!isLatLon(latO, lonO) || !isLatLon(latN, lonN)) {
      skipped.push({ row: i, why: "coord", raw: [get.latOld(r), get.lonOld(r), get.latNew(r), get.lonNew(r)] });
      return;
    }
    const km = distanceKm(latO, lonO, latN, lonN);
    const mid = midpoint(latO, lonO, latN, lonN);
    const brg = bearing(latO, lonO, latN, lonN);
    pairs.push({
      pairId: String(get.pairId ? get.pairId(r) : `RLC${String(i + 1).padStart(3, "0")}`),
      codeOld: get.codeOld ? String(get.codeOld(r) ?? "") : "",
      codeNew: get.codeNew ? String(get.codeNew(r) ?? "") : "",
      nameOld: get.nameOld ? String(get.nameOld(r) ?? "") : "",
      nameNew: get.nameNew ? String(get.nameNew(r) ?? "") : "",
      province: get.province ? String(get.province(r) ?? "") : "",
      latOld: latO, lonOld: lonO, latNew: latN, lonNew: lonN,
      distanceKm: Math.round(km * 1000) / 1000,
      midLat: Math.round(mid.lat * 1e6) / 1e6,
      midLon: Math.round(mid.lon * 1e6) / 1e6,
      bearing: Math.round(brg * 10) / 10,
      row: i,
    });
  });
  return { pairs, skipped };
}

// ───────────────────────────────────────────────────────────── WKT

const c6 = (x) => Number(x).toFixed(6);

/** เส้นตรงเชื่อมสองจุด — รูปแบบที่ Icon Map Pro รับได้ (ลองจิจูดมาก่อนละติจูดเสมอ) */
export function lineWKT(latA, lonA, latB, lonB) {
  return `LINESTRING (${c6(lonA)} ${c6(latA)}, ${c6(lonB)} ${c6(latB)})`;
}

/** วงกลมรัศมี R กิโลเมตรรอบจุดหนึ่ง เขียนเป็น POLYGON (จุดแรกกับจุดสุดท้ายต้องซ้ำกันเพื่อปิดรูป) */
export function circleWKT(lat, lon, km, steps = 48) {
  const pts = [];
  const latR = km / 110.574;                                   // 1 องศาละติจูด ≈ 110.574 กม.
  const lonR = km / (111.320 * Math.cos(rad(lat)) || 1e-9);    // ลองจิจูดหดตามละติจูด
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    pts.push(`${c6(lon + lonR * Math.sin(t))} ${c6(lat + latR * Math.cos(t))}`);
  }
  return `POLYGON ((${pts.join(", ")}))`;
}

// ───────────────────────────────────────────────────────────── ชีตสำหรับ Power BI

/** ตาราง PAIR — หนึ่งแถวต่อหนึ่งคู่ย้าย ใช้เป็นตารางหลักและตัวกรอง */
export function sheetPAIR(pairs) {
  return {
    header: ["PAIR_ID", "SITE_CODE_OLD", "SITE_NAME_OLD", "LAT_OLD", "LON_OLD",
             "SITE_CODE_NEW", "SITE_NAME_NEW", "LAT_NEW", "LON_NEW", "PROVINCE", "DISTANCE_KM", "BEARING"],
    rows: pairs.map((p) => [p.pairId, p.codeOld, p.nameOld, p.latOld, p.lonOld,
                            p.codeNew, p.nameNew, p.latNew, p.lonNew, p.province, p.distanceKm, p.bearing]),
  };
}

/**
 * ตาราง MAPSHAPES — ตารางที่ Icon Map Pro กินจริง หนึ่งคู่ให้ 3 แถว
 *   OLD   = จุดสถานีเดิม (สีส้ม)
 *   NEW   = จุดสถานีใหม่ (สีน้ำเงิน)
 *   LINE  = เส้นเชื่อม WKT พร้อมความหนาตามระยะทาง
 *   LABEL = จุดยึดป้ายที่กึ่งกลางเส้น (ถ้าไม่มีแถวนี้ ป้ายจะไปเกาะจุดสถานีแทน)
 */
export function sheetMAPSHAPES(pairs, opt = {}) {
  const {
    colorOld = "#e8763c", colorNew = "#2e6db4", lineColors = ["#cfd6dd", "#9fb0c0", "#6d8296", "#42586c"],
    unit = " กม.", decimals = 2, withLabel = true,
  } = opt;
  const max = Math.max(1, ...pairs.map((p) => p.distanceKm));
  const header = ["ID", "PAIR_ID", "KIND", "LATITUDE", "LONGITUDE", "WKT", "LABEL_TEXT",
                  "COLOR", "PROVINCE", "DISTANCE_KM", "SITE_CODE", "SITE_NAME", "LINE_WIDTH"];
  const rows = [];
  for (const p of pairs) {
    const tier = Math.min(lineColors.length - 1, Math.floor((p.distanceKm / max) * lineColors.length));
    const width = 1 + Math.round((p.distanceKm / max) * 3);          // 1 ถึง 4
    rows.push([`OLD_${p.pairId}`, p.pairId, "OLD", p.latOld, p.lonOld, null, null,
               colorOld, p.province, p.distanceKm, p.codeOld, p.nameOld, null]);
    rows.push([`NEW_${p.pairId}`, p.pairId, "NEW", p.latNew, p.lonNew, null, null,
               colorNew, p.province, p.distanceKm, p.codeNew, p.nameNew, null]);
    rows.push([`LINE_${p.pairId}`, p.pairId, "LINE", null, null,
               lineWKT(p.latOld, p.lonOld, p.latNew, p.lonNew), null,
               lineColors[tier], p.province, p.distanceKm, p.codeOld, p.nameOld, width]);
    if (withLabel) {
      rows.push([`LABEL_${p.pairId}`, p.pairId, "LABEL", p.midLat, p.midLon, null,
                 `${p.distanceKm.toFixed(decimals)}${unit}`,
                 "#5a6b7a", p.province, p.distanceKm, p.codeOld, p.nameOld, null]);
    }
  }
  return { header, rows };
}

/** ตาราง PATH_UNPIVOT — สองแถวต่อคู่ สำหรับวิชวลที่วาดเส้นจากลำดับจุด (เช่น Deneb) */
export function sheetPATH(pairs) {
  const header = ["PATH_ID", "POINT_ORDER", "SITE_KIND", "SITE_CODE", "SITE_NAME", "LATITUDE", "LONGITUDE", "PROVINCE", "DISTANCE_KM"];
  const rows = [];
  for (const p of pairs) {
    rows.push([p.pairId, 0, "เดิม", p.codeOld, p.nameOld, p.latOld, p.lonOld, p.province, p.distanceKm]);
    rows.push([p.pairId, 1, "ใหม่", p.codeNew, p.nameNew, p.latNew, p.lonNew, p.province, p.distanceKm]);
  }
  return { header, rows };
}

/** ตาราง RADIUS_WKT — วงรัศมีรอบจุดเดิมและจุดใหม่ */
export function sheetRADIUS(pairs, km = 3, opt = {}) {
  const { colorOld = "#e8763c", colorNew = "#2e6db4" } = opt;
  const header = ["ID", "PAIR_ID", "KIND", "SITE_CODE", "RADIUS_KM", "COLOR", "WKT", "PROVINCE", "DISTANCE_KM"];
  const rows = [];
  for (const p of pairs) {
    rows.push([`RAD_OLD_${p.pairId}`, p.pairId, "RADIUS_OLD", p.codeOld, km, colorOld,
               circleWKT(p.latOld, p.lonOld, km), p.province, p.distanceKm]);
    rows.push([`RAD_NEW_${p.pairId}`, p.pairId, "RADIUS_NEW", p.codeNew, km, colorNew,
               circleWKT(p.latNew, p.lonNew, km), p.province, p.distanceKm]);
  }
  return { header, rows };
}

// ───────────────────────────────────────────────────────────── การวาดบนจอ

/** Web Mercator (เท่าที่ต้องใช้) — คืนค่าที่ยังไม่สเกล */
export function mercator(lat, lon) {
  const x = lon;
  const y = deg(Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, lat))) / 2)));
  return { x, y };
}

/**
 * คำนวณตัวแปลงพิกัดให้ทุกจุดอยู่ในกรอบที่กำหนด โดยคงสัดส่วนจริงไว้
 * (ถ้าไม่คงสัดส่วน ประเทศไทยจะดูแบนหรือผอมผิดรูปทันที)
 */
export function fitProjection(points, width, height, pad = 24) {
  const ms = points.map((p) => mercator(p.lat, p.lon));
  const xs = ms.map((m) => m.x), ys = ms.map((m) => m.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(1e-9, maxX - minX), h = Math.max(1e-9, maxY - minY);
  const s = Math.min((width - pad * 2) / w, (height - pad * 2) / h);
  const offX = (width - w * s) / 2 - minX * s;
  const offY = (height - h * s) / 2 + maxY * s;
  return {
    scale: s,
    project: (lat, lon) => {
      const m = mercator(lat, lon);
      return { x: m.x * s + offX, y: offY - m.y * s };
    },
  };
}

/** กรอบพิกัดของชุดจุด เผื่อขอบเป็นสัดส่วนของขนาดกรอบ */
export function boundsOf(points, padRatio = 0.08) {
  if (!points.length) return null;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const dLat = Math.max(0.02, (maxLat - minLat) * padRatio);
  const dLon = Math.max(0.02, (maxLon - minLon) * padRatio);
  return { minLat: minLat - dLat, maxLat: maxLat + dLat, minLon: minLon - dLon, maxLon: maxLon + dLon };
}

/** สรุปภาพรวมชุดคู่ย้าย — ตัวเลขที่ต้องพูดถึงทุกครั้งเวลารายงาน */
export function summarize(pairs) {
  if (!pairs.length) return { n: 0 };
  const d = pairs.map((p) => p.distanceKm).sort((a, b) => a - b);
  const sum = d.reduce((s, x) => s + x, 0);
  const mid = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  const far = pairs.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a));
  const near = pairs.reduce((a, b) => (b.distanceKm < a.distanceKm ? b : a));
  const byProv = new Map();
  for (const p of pairs) {
    const k = p.province || "";
    const e = byProv.get(k) || { province: k, n: 0, total: 0 };
    e.n++; e.total += p.distanceKm;
    byProv.set(k, e);
  }
  return {
    n: pairs.length,
    totalKm: Math.round(sum * 1000) / 1000,
    avgKm: Math.round((sum / d.length) * 1000) / 1000,
    medianKm: Math.round(mid * 1000) / 1000,
    minKm: d[0], maxKm: d[d.length - 1],
    farthest: far, nearest: near,
    provinces: [...byProv.values()]
      .map((e) => ({ ...e, avg: Math.round((e.total / e.n) * 1000) / 1000 }))
      .sort((a, b) => b.n - a.n || b.total - a.total),
  };
}
