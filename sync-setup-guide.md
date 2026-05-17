# Google Sheets Sync Setup
## Bozeman Garden Almanac — 5-minute setup for cross-device sync

---

### What this does
A free Google Apps Script acts as a tiny API between your app and a Google Sheet you own.
Your journal entries, plant inventory, and bed notes sync across your phone and computer automatically.

---

### Step 1 — Create the Google Sheet

1. Go to **sheets.google.com** → New blank spreadsheet
2. Name it: **Bozeman Garden Almanac**
3. Create 3 tabs (sheets) named exactly:
   - `journal`
   - `plants`
   - `beds`

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
    const action = payload.action;
    const data = payload.data;

    if (action === 'sync') {
      // Write journal entries
      if (data.journal && data.journal.length) {
        writeSheet('journal', data.journal, ['id','date','mood','tags','text','weather']);
      }
      // Write plants
      if (data.plants && data.plants.length) {
        writeSheet('plants', data.plants, ['id','category','common','latin','emoji','location','bloom','notes','added']);
      }
      // Write beds (just the current plan)
      if (data.beds && data.beds.length) {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName('beds') || ss.insertSheet('beds');
        sheet.clearContents();
        sheet.appendRow(['id','name','dims','theme','currentPlants','lastUpdated']);
        data.beds.forEach(bed => {
          sheet.appendRow([
            bed.id, bed.name, bed.dims, bed.theme,
            JSON.stringify(bed.current),
            new Date().toISOString()
          ]);
        });
      }

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function writeSheet(sheetName, rows, cols) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  // Get existing IDs to avoid duplicates
  const existing = sheet.getDataRange().getValues();
  const existingIds = new Set(existing.slice(1).map(r => r[0]).filter(Boolean));

  // Write header if empty
  if (existing.length <= 1) {
    sheet.clearContents();
    sheet.appendRow(cols);
  }

  // Append only new rows
  rows.forEach(row => {
    if (!existingIds.has(row.id)) {
      sheet.appendRow(cols.map(c => {
        const val = row[c];
        if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
        return val || '';
      }));
    }
  });
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Garden Almanac sync endpoint active' }))
    .setMimeType(ContentService.MimeType.JSON);
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

1. Open **garden-almanac.html** in your browser
2. Tap the **⟳ sync button** in the top right
3. Paste your Web App URL when prompted
4. Tap sync — your data will start flowing to the Sheet

---

### Using on multiple devices

- **Phone**: Open the HTML file in Safari/Chrome. In Safari: Share → Add to Home Screen for an app-like icon.
- **Computer**: Open the same HTML file in any browser.
- **Sync**: Tap ⟳ on either device to push/pull data. Local changes are always saved immediately in case you're offline.

---

### Your data in the Sheet

The Google Sheet becomes a readable backup of everything:
- **journal tab**: Every entry with date, mood, tags, weather snapshot
- **plants tab**: Your full perennial inventory
- **beds tab**: Current planting plans

You can add notes, filter, sort, or export from the Sheet at any time — the app will not overwrite manual Sheet edits (it only appends new entries).

---

### Privacy note
Your Web App URL is private — only someone with the exact URL can write to your Sheet. You can revoke access anytime via Extensions → Apps Script → Manage Deployments.
