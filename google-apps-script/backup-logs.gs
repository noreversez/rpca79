/**
 * RPCA79 — Google Sheets realtime backup system
 *
 * ผูกกับ Supabase Database Webhook บนตาราง `logs` (event: INSERT) — ทุกครั้งที่
 * มีคนเลือกตำแหน่งสำเร็จ สคริปต์นี้จะ:
 *   1. เขียน audit log ลงชีต "backup_logs" (append เพิ่มไปเรื่อย ๆ ไม่มีลบ)
 *   2. ดึงข้อมูล positions + users ทั้งหมดจาก Supabase มาเขียนทับ (snapshot ล่าสุด) ลง
 *      2 ชีต: "ตำแหน่งที่เลือกแล้ว" กับ "ตำแหน่งที่เหลือ"
 *   3. อัปเดตชีต "สรุป" (จำนวนรวม/เลือกแล้ว/เหลือ)
 *
 * วิธีติดตั้ง (ทำใน Google Sheet ที่จะใช้เก็บ backup):
 *   1. เปิด Google Sheet ที่ต้องการ (หรือสร้างใหม่)
 *   2. เมนู Extensions > Apps Script
 *   3. ลบโค้ด default ทิ้ง วางไฟล์นี้แทนทั้งหมด
 *   4. แก้ค่า SHARED_SECRET ด้านล่างเป็นสตริงสุ่มของตัวเอง (อย่าใช้ค่าตัวอย่าง)
 *   5. Deploy > New deployment > เลือกประเภท "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      แล้วกด Deploy (ครั้งแรกจะต้องกด authorize สิทธิ์ตัวเอง)
 *   6. คัดลอก Web app URL ที่ได้ (ลงท้ายด้วย /exec)
 *   7. เปิด URL นั้น + "?secret=<SHARED_SECRET>&action=refresh" ในเบราว์เซอร์
 *      เพื่อทดสอบและสร้างชีตทั้งหมดครั้งแรก (ควรเห็น {"ok":true,...})
 *   8. ไปที่ Supabase Dashboard > Database > Webhooks > Create a new hook
 *        - Table: logs
 *        - Events: Insert
 *        - Type: HTTP Request, Method: POST
 *        - URL: <Web app URL จากข้อ 6>?secret=<ค่า SHARED_SECRET เดียวกับข้อ 4>
 *        - HTTP Headers: Content-Type: application/json
 *   9. ทดสอบโดยเลือกตำแหน่งจริง แล้วดูว่าทุกชีตอัปเดตตามไหม
 *
 * หมายเหตุ: ปุ่ม "?action=refresh" (ข้อ 7) ใช้รีเฟรช 2 ชีต snapshot + สรุป ได้
 * ทุกเมื่อโดยไม่ต้องรอมีคนเลือกตำแหน่งจริง เผื่ออยากกดรีเฟรชเองระหว่างงาน
 */

const SHARED_SECRET = 'เปลี่ยนเป็นรหัสลับของคุณเอง'; // ต้องตรงกับ query param ?secret= ที่ตั้งใน Supabase Webhook

const SUPABASE_URL = 'https://izujreipvtsnldgpdynu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_p7MUWJqXpImPGqkGEfbiow_EDC1iRK2'; // public anon key เดียวกับที่ฝังในตัวแอปเอง อ่านได้อย่างเดียว

const LOG_SHEET = 'backup_logs';
const LOG_HEADER = ['synced_at', 'created_at', 'user_id', 'user_name', 'pos_id', 'pos_name', 'pos_region'];

const SELECTED_SHEET = 'ตำแหน่งที่เลือกแล้ว';
const SELECTED_HEADER = ['pos_id', 'ชื่อตำแหน่ง', 'บช./ภาค', 'บก./จังหวัด', 'ผู้เลือก', 'รหัสประจำตัว', 'เวลาที่เลือก'];

const REMAINING_SHEET = 'ตำแหน่งที่เหลือ';
const REMAINING_HEADER = ['pos_id', 'ชื่อตำแหน่ง', 'บช./ภาค', 'บก./จังหวัด'];

const SUMMARY_SHEET = 'สรุป';

function doGet(e) {
  if (e.parameter.action === 'refresh') {
    if ((e.parameter.secret || '') !== SHARED_SECRET) {
      return jsonOutput({ ok: false, error: 'unauthorized' });
    }
    refreshSnapshotSheets();
    return jsonOutput({ ok: true, refreshed: true });
  }
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if ((e.parameter.secret || '') !== SHARED_SECRET) {
      return jsonOutput({ ok: false, error: 'unauthorized' });
    }

    const body = JSON.parse(e.postData.contents);
    const record = body.record || {};

    const sheet = getOrCreateSheet(LOG_SHEET, LOG_HEADER);
    sheet.appendRow([
      new Date(),
      record.created_at || '',
      record.user_id || '',
      record.user_name || '',
      record.pos_id || '',
      record.pos_name || '',
      record.pos_region || ''
    ]);

    refreshSnapshotSheets();

    return jsonOutput({ ok: true });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function refreshSnapshotSheets() {
  const positions = supabaseGet('positions', 'id,name,region,province,status,taken_by_user_id');
  const users = supabaseGet('users', 'id,name,code,selected_at');

  const userById = {};
  users.forEach(u => { userById[String(u.id)] = u; });

  const selected = [];
  const remaining = [];

  positions.forEach(p => {
    if (p.status === 'SELECTED' && p.taken_by_user_id) {
      const u = userById[String(p.taken_by_user_id)] || {};
      selected.push([p.id, p.name, p.region, p.province || '', u.name || '', u.code || '', u.selected_at || '']);
    } else {
      remaining.push([p.id, p.name, p.region, p.province || '']);
    }
  });

  // ใหม่สุดขึ้นก่อน
  selected.sort((a, b) => String(b[6]).localeCompare(String(a[6])));
  remaining.sort((a, b) => String(a[2]).localeCompare(String(b[2]), 'th') || String(a[1]).localeCompare(String(b[1]), 'th'));

  writeSnapshot(SELECTED_SHEET, SELECTED_HEADER, selected);
  writeSnapshot(REMAINING_SHEET, REMAINING_HEADER, remaining);
  writeSummary(positions.length, selected.length, remaining.length);
}

function supabaseGet(table, columns) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(columns)}`;
  const res = UrlFetchApp.fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function writeSnapshot(sheetName, header, rows) {
  const sheet = getOrCreateSheet(sheetName, header);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, header.length).clearContent();
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function writeSummary(total, selectedCount, remainingCount) {
  const sheet = getOrCreateSheet(SUMMARY_SHEET, ['อัปเดตล่าสุด', 'ตำแหน่งทั้งหมด', 'เลือกแล้ว', 'เหลือ']);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  sheet.getRange(2, 1, 1, 4).setValues([[new Date(), total, selectedCount, remainingCount]]);
}

function getOrCreateSheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
