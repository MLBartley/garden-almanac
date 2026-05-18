# Google Sheets Sync Setup

## Bozeman Garden Almanac — full cross-device sync

---

### What this does
A free Google Apps Script acts as a tiny API between your app and a Google Sheet you own.
Every time you tap ⟳ the app **pulls** any new data from the sheet first, merges it with local
data, then **pushes** the merged result back. This keeps your phone and computer in sync
without overwriting each other's changes.

All data types are synced: journal, plants, beds, seeds, sow logs, hardening schedules,
oya pot logs, and bed designs. Seed packet photos are stored locally only (too large to sync).

---

### Step 1 — Create the Google Sheet

1. Go to **sheets.google.com** → New blank spreadsheet
2. Name it: **Bozeman Garden Almanac**
3. Leave the tabs as-is — the script creates all sheets automatically

---

### Step 2 — Create the Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**
2. Delete all existing code in the editor
3. Paste this entire script:

```javascript
const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'pull') {
      return respond(readSnapshot());
    }
    if (payload.action === 'sync') {
      writeSnapshot(payload.data);
      writeReadableSheets(payload.data);
      return respond({ status: 'ok', timestamp: new Date().toISOString() });
    }
    return respond({ status: 'error', message: 'Unknown action' });
  } catch(err) {
    return respond({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  return respond({ status: 'ok', message: 'Garden Almanac sync endpoint active' });
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// _snapshot sheet: one row per data key — source of truth for sync
function writeSnapshot(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const snap = ss.getSheetByName('_snapshot') || ss.insertSheet('_snapshot');
  snap.clearContents();
  snap.appendRow(['key', 'value', 'updated']);
  const now = new Date().toISOString();
  const keys = ['journal','plants','beds','seeds','sowLogs','hardenLogs','oyaLogs','bedDesigns'];
  keys.forEach(key => {
    let val = data[key] !== undefined ? data[key] : (key === 'oyaLogs' || key === 'bedDesigns' ? {} : []);
    // Trim journal if very large (>45k chars) to stay within cell limits
    if (key === 'journal' && Array.isArray(val) && JSON.stringify(val).length > 45000) {
      val = val.slice(0, 500);
    }
    snap.appendRow([key, JSON.stringify(val), now]);
  });
}

function readSnapshot() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const snap = ss.getSheetByName('_snapshot');
  if (!snap) return { status: 'empty' };
  const rows = snap.getDataRange().getValues().slice(1);
  const result = { status: 'ok' };
  rows.forEach(([key, value]) => {
    try { result[key] = JSON.parse(value); } catch(e) {}
  });
  return result;
}

// Human-readable individual sheets (append-only, for browsing/export in Sheets)
function writeReadableSheets(data) {
  if (data.journal && data.journal.length)
    writeSheet('journal', data.journal, ['id','date','mood','tags','text','weather']);
  if (data.plants && data.plants.length)
    writeSheet('plants', data.plants, ['id','category','common','latin','emoji','location','bloom','notes','added']);
  if (data.beds && data.beds.length) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('beds') || ss.insertSheet('beds');
    sheet.clearContents();
    sheet.appendRow(['id','name','dims','theme','currentPlants','lastUpdated']);
    data.beds.forEach(bed => sheet.appendRow([
      bed.id, bed.name, bed.dims, bed.theme,
      JSON.stringify(bed.current), new Date().toISOString()
    ]));
  }
  if (data.seeds && data.seeds.length)
    writeSheet('seeds', data.seeds,
      ['id','name','variety','days','bed','storage','source','notes','qty','addedDate']);
  if (data.sowLogs && data.sowLogs.length)
    writeSheet('sowLogs', data.sowLogs,
      ['id','date','name','bed','method','qty','germDays','status','notes']);
  if (data.hardenLogs && data.hardenLogs.length)
    writeSheet('hardenLogs', data.hardenLogs,
      ['id','name','qty','startDate','currentStep','done']);
}

function writeSheet(sheetName, rows, cols) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const existing = sheet.getDataRange().getValues();
  const existingIds = new Set(existing.slice(1).map(r => String(r[0])).filter(Boolean));
  if (existing.length <= 1) { sheet.clearContents(); sheet.appendRow(cols); }
  rows.forEach(row => {
    if (!existingIds.has(String(row.id))) {
      sheet.appendRow(cols.map(c => {
        const val = row[c];
        if (Array.isArray(val) || (val !== null && typeof val === 'object')) return JSON.stringify(val);
        return val != null ? val : '';
      }));
    }
  });
}
```

4. Click **Save** (disk icon), name the project **Garden Almanac Sync**

---

### Step 3 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Settings:
   - Description: `Garden Almanac Sync`
   - Execute as: **Me**
   - Who has access: **Anyone** *(this is safe — the URL acts as your key)*
4. Click **Deploy**
5. Click **Authorize access** → choose your Google account → click **Allow**
6. **Copy the Web App URL** — it looks like:
   `https://script.google.com/macros/s/ABC123.../exec`

---

### Step 4 — Connect the app

1. Open the app (GitHub Pages link or local file)
2. Tap **⚙** in the header
3. Paste the Web App URL into **Google Sheets sync URL** → Save
4. Tap **⟳** — the app pulls from the sheet, merges, then pushes

Repeat step 3 on your other device to connect it.

---

### Updating from the old Apps Script

If you already had sync set up with the previous version:

1. Open your Google Sheet → **Extensions → Apps Script**
2. Replace all the code with the new script above
3. Click **Deploy → Manage deployments** → click the pencil icon → set **Version** to "New version" → **Deploy**
4. The URL stays the same — no need to update the app

---

### How sync works

- **⟳ on device A**: pulls remote data → merges with local → pushes merged result
- **⟳ on device B**: same — picks up whatever device A pushed
- **Conflict rule**: if the same record exists on both devices, the local version wins
- **Offline**: all data saves instantly to the device's localStorage; sync when back online

---

### Your data in the Sheet

| Sheet | Contents |
| --- | --- |
| `_snapshot` | Full database JSON (source of truth for sync) |
| `journal` | Every entry — date, mood, tags, text, weather |
| `plants` | Perennial inventory |
| `beds` | Current planting plans |
| `seeds` | Seed inventory (no photos) |
| `sowLogs` | Germination / transplant log |
| `hardenLogs` | Hardening schedules |

`journal`, `plants`, `seeds`, `sowLogs`, and `hardenLogs` are append-only — safe to
browse, filter, and export. Do not edit the `_snapshot` sheet manually.

---

### Privacy note
Your Web App URL is private — only someone with the exact URL can read or write your Sheet.
You can revoke access anytime via Extensions → Apps Script → Manage Deployments.
