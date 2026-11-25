// ==============================================================================
// GOOGLE APPS SCRIPT WEBHOOK: Code.gs
// Tempelkan skrip ini ke Ekstensi -> Apps Script di Google Spreadsheet keluarga Anda,
// lalu Deploy -> New Deployment -> Web app (Execute as: Me, Who has access: Anyone).
// ==============================================================================

const SHEET_NAME = 'Transaksi';
const SYNC_SECRET = 'GANTI_DENGAN_RAHASIA_SYNC_ANDA'; // Opsional namun disarankan

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SYNC_SECRET && payload.secret !== SYNC_SECRET) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    if (sheet.getLastRow() === 0 && Array.isArray(payload.headers)) {
      sheet.appendRow(payload.headers);
      sheet.setFrozenRows(1);
    }

    const rows = payload.action === 'upsert_batch' && Array.isArray(payload.rows)
      ? payload.rows
      : (payload.row ? [payload.row] : []);

    if (rows.length === 0) {
      return jsonResponse({ ok: true, updated: 0, inserted: 0 });
    }

    const lastRow = sheet.getLastRow();
    const indexMap = {};
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        const id = String(ids[i][0] || '').trim();
        if (id) indexMap[id] = i + 2;
      }
    }

    let updated = 0;
    let inserted = 0;
    const toAppend = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const values = [
        r.tx_id || '',
        r.tanggal_wib || '',
        r.waktu_wib || '',
        r.akun || '',
        r.arah || '',
        Number(r.nominal || 0),
        r.merchant || '',
        r.kategori || '',
        r.status || '',
        r.catatan || '',
        r.sumber || '',
        r.raw_notification || '',
      ];

      const rowNum = indexMap[String(r.tx_id || '').trim()];
      if (rowNum) {
        sheet.getRange(rowNum, 1, 1, values.length).setValues([values]);
        updated++;
      } else {
        toAppend.push(values);
        inserted++;
      }
    }

    if (toAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
    }

    return jsonResponse({ ok: true, updated, inserted });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
