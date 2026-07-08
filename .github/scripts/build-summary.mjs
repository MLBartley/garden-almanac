// Garden email summary builder. Runs in GitHub Actions; reads the
// pre-computed emailDigest from the synced Gist, pulls fresh weather
// from Open-Meteo, formats an HTML email, and sends it via Resend.
//
// Required env: RESEND_API_KEY, RECIPIENT_EMAIL, SENDER_EMAIL, GIST_ID,
// GIST_PAT (read-only). Optional: TRIGGER_SCHEDULE / MANUAL_MODE.

const LAT = 45.6769, LON = -111.0429;
const BOZEMAN_LABEL = 'Bozeman, MT';

const env = process.env;
const required = ['RESEND_API_KEY', 'RECIPIENT_EMAIL', 'SENDER_EMAIL', 'GIST_ID', 'GIST_PAT'];
for (const k of required) {
  if (!env[k]) { console.error(`Missing required env: ${k}`); process.exit(1); }
}

const fmtDate = d => new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bedLabel = b => ({A:'Bed A',B:'Bed B',C:'Bed C',D:'Bed D',A1:'Bag A',B1:'Bag B',C1:'Bag C',H:'Herb Bed',P:'Perennial Beds',W1:'Serrano Box',W2:'Poblano Box 1',W3:'Poblano Box 2',W4:'Mint Box',W5:'Rosemary Box'}[b] || b || '—');

// Decide whether and what to send.
function decideMode() {
  const month = new Date().getMonth() + 1;          // 1-12
  const activeSeason = month >= 4 && month <= 9;
  const force = (env.MANUAL_MODE || '').toLowerCase();
  if (force === 'daily') return 'daily';
  if (force === 'weekly') return 'weekly';
  const sched = env.TRIGGER_SCHEDULE || '';
  if (sched === '0 13 * * *') return activeSeason ? 'daily' : 'skip';
  if (sched === '0 1 * * 1')  return activeSeason ? 'skip' : 'weekly';
  // workflow_dispatch with mode=auto, or some other trigger
  return activeSeason ? 'daily' : 'weekly';
}

async function fetchGist() {
  const url = `https://api.github.com/gists/${encodeURIComponent(env.GIST_ID)}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GIST_PAT}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'garden-almanac-email-summary',
    },
  });
  if (!res.ok) throw new Error(`Gist fetch failed (${res.status}): ${await res.text()}`);
  const gist = await res.json();
  const file = gist.files['garden-snapshot.json'];
  if (!file) throw new Error('garden-snapshot.json not found in gist');
  const content = file.truncated ? await fetch(file.raw_url).then(r => r.text()) : file.content;
  return JSON.parse(content);
}

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
    + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation`
    + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum`
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
    + `&timezone=America%2FDenver&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
  return res.json();
}

const WMO = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',51:'🌦',61:'🌧',63:'🌧',71:'🌨',73:'🌨',75:'❄️',80:'🌦',81:'🌧',82:'⛈',95:'⛈'};

// ── HTML email rendering ──────────────────────────────────────────────
function shell(title, body, snapshotAge) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f0e6;font-family:Georgia,serif;color:#0f1a0d;">
<div style="max-width:600px;margin:0 auto;padding:24px 20px;background:#f4f0e6;">
  <div style="background:#0f1a0d;color:#9fc9a0;padding:14px 18px;border-radius:8px;margin-bottom:16px;">
    <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.12em;color:#9fc9a0;opacity:.7;">${esc(BOZEMAN_LABEL)} · ${esc(fmtDate(new Date()))}</div>
    <div style="font-size:20px;font-weight:bold;margin-top:4px;color:#fff;">${esc(title)}</div>
  </div>
  ${body}
  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #d4cfc4;font-family:'Courier New',monospace;font-size:9px;color:#7a7268;text-align:center;">
    Garden snapshot synced ${snapshotAge}. <a href="https://mlbartley.github.io/garden-almanac/garden-almanac-v5.html" style="color:#3d5c42;">Open the app</a>
  </div>
</div></body></html>`;
}
function card(title, inner, accent='#3d5c42') {
  return `<div style="background:white;border:1px solid #d4cfc4;border-left:3px solid ${accent};border-radius:6px;padding:12px 14px;margin-bottom:10px;">
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.1em;color:#7a7268;text-transform:uppercase;margin-bottom:6px;">${title}</div>
    ${inner}
  </div>`;
}
function row(emoji, name, sub) {
  return `<div style="padding:5px 0;font-size:14px;line-height:1.4;"><span style="font-size:16px;margin-right:6px;">${emoji}</span><b>${esc(name)}</b>${sub?`<div style="color:#7a7268;font-size:12px;margin-left:24px;">${esc(sub)}</div>`:''}</div>`;
}

function weatherCard(wx) {
  if (!wx?.current || !wx?.daily) return '';
  const c = wx.current;
  const hi = Math.round(wx.daily.temperature_2m_max[0]);
  const lo = Math.round(wx.daily.temperature_2m_min[0]);
  const icon = WMO[c.weather_code] || '🌡';
  const rainProb = wx.daily.precipitation_probability_max[0];
  const rainAmt = wx.daily.precipitation_sum[0];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const forecast = wx.daily.time.slice(1, 4).map((d, i) => {
    const dt = new Date(d + 'T12:00:00');
    const dh = Math.round(wx.daily.temperature_2m_max[i+1]);
    const dl = Math.round(wx.daily.temperature_2m_min[i+1]);
    const dp = wx.daily.precipitation_probability_max[i+1];
    return `<div style="display:inline-block;width:32%;text-align:center;font-size:12px;color:#7a7268;"><div style="font-family:'Courier New',monospace;font-size:9px;">${days[dt.getDay()]}</div><div style="color:#0f1a0d;">${WMO[wx.daily.weather_code[i+1]]||''} ${dh}°/${dl}°</div>${dp>=30?`<div>💧${dp}%</div>`:''}</div>`;
  }).join('');
  return card('Today', `
    <div style="font-size:28px;font-weight:bold;line-height:1;">${icon} ${Math.round(c.temperature_2m)}°F</div>
    <div style="color:#7a7268;font-size:13px;margin-top:4px;">High ${hi}° · Low ${lo}° · Wind ${Math.round(c.wind_speed_10m)} mph · Humidity ${c.relative_humidity_2m}%</div>
    ${rainProb >= 30 || rainAmt > 0 ? `<div style="margin-top:6px;color:#5b8fa8;font-size:13px;">💧 Rain ${rainProb}% chance${rainAmt>0?` · ${rainAmt}" expected`:''}</div>` : ''}
    <div style="margin-top:12px;border-top:1px solid #efe9da;padding-top:10px;">${forecast}</div>
  `, '#5b8fa8');
}

function frostCard(wx, digest) {
  if (!wx?.daily) return '';
  const lows = wx.daily.temperature_2m_min.slice(0, 4).map(Math.round);
  const frostDays = lows.map((lo, i) => ({lo, i})).filter(x => x.lo <= 36);
  if (!frostDays.length) return '';
  const worst = Math.min(...frostDays.map(f => f.lo));
  const tender = digest?.tenderOutside || [];
  return card('🥶 Frost alert', `
    <div style="font-size:14px;line-height:1.5;color:#0f1a0d;">
      ${frostDays.length} frost night${frostDays.length===1?'':'s'} in next 4 days · lowest ${worst}°F.
      ${tender.length ? `<br><b>Cover tonight:</b> ${tender.slice(0,6).map(esc).join(', ')}${tender.length>6?` +${tender.length-6} more`:''}.` : ''}
    </div>
  `, '#a04030');
}

function readyCard(digest) {
  if (!digest?.ready?.length) return '';
  const inner = digest.ready.map(r => {
    const cropLabel = r.name + (r.variety ? ` (${r.variety})` : '');
    const since = r.daysSinceHarvest != null ? `last picked ${r.daysSinceHarvest}d ago` : (r.ready ? 'ready now' : 'entering window');
    return row(r.emoji || '🧺', cropLabel, `${bedLabel(r.bed)} · ${since}<br><i>${r.harvest}</i>`);
  }).join('');
  return card('🧺 Ready to harvest', inner);
}

function transplantCard(digest) {
  const items = (digest?.transplants || []).filter(t => t.openNudges?.length);
  if (!items.length) return '';
  const inner = items.slice(0, 6).map(t => {
    const nudges = t.openNudges.slice(0, 3).map(n => `${n.icon} ${esc(n.text)}`).join(' · ');
    return row(t.emoji || '🌱', `${t.name}${t.variety?` (${t.variety})`:''}`,
      `${bedLabel(t.bed)} · day ${t.daysAgo} · ${nudges}`);
  }).join('');
  return card('🌱 Recent transplants — open tasks', inner);
}

function sowCard(digest) {
  if (!digest?.sowOpportunityCount) return '';
  return card('🌾 Sow now', `
    <div style="font-size:14px;line-height:1.5;">${digest.sowOpportunityCount} opportunit${digest.sowOpportunityCount===1?'y':'ies'} open: succession crops, gap-fillers, and direct-sow windows. Tap the app to see specifics and log them.</div>
  `, '#c4922a');
}

function pruneCard(digest) {
  const items = digest?.pruningDue || [];
  if (!items.length) return '';
  const monthAbbr = m => new Date(2000, m-1, 1).toLocaleString('en-US',{month:'short'});
  const inner = items.map(d => {
    const windows = d.windows.map(w => `<b>${monthAbbr(w.month)}:</b> ${w.purpose}`).join('<br>');
    return row('✂️', d.plantName, windows);
  }).join('');
  return card('✂️ Prune this month', inner, '#c4922a');
}

function feedCard(digest) {
  const feeds = digest?.feedsNeeded || [];
  if (!feeds.length) return '';
  const inner = feeds.map(f => {
    const cropLabel = f.name + (f.variety ? ` (${f.variety})` : '');
    const status = f.status === 'first'
      ? `first feed · day ${f.daysSincePlant}${f.daysOverdue>0?` (${f.daysOverdue}d overdue)`:''}`
      : `${f.daysSinceFeed}d since last feed${f.daysOverdue>0?` (${f.daysOverdue}d overdue)`:''}`;
    return row(f.emoji, cropLabel, `${bedLabel(f.bed)} · ${status}<br><i>${f.note}</i>`);
  }).join('');
  return card('🥦 Feed', inner, '#c4922a');
}

function pestCard(digest) {
  const pests = (digest?.monthPests || []).slice(0, 3);
  if (!pests.length) return '';
  const inner = pests.map(p =>
    row(p.emoji, p.name + (p.hot ? ' ⚠ TARGETING YOUR BEDS' : ''), `<b>Scout:</b> ${p.scout}<br><b>Action:</b> ${p.action}`)
  ).join('');
  return card('🔍 Scout this month', inner);
}

function soilCard(digest) {
  if (!digest?.lowSoilBeds?.length) return '';
  const items = digest.lowSoilBeds.map(b => `${b.name}: ${b.score}/100`).join(' · ');
  return card('🌿 Low soil health', `<div style="font-size:13px;color:#7a7268;">${esc(items)} — top-dress, mulch, or log a recent amendment to improve.</div>`, '#c47a7a');
}

// ── Weekly digest sections ────────────────────────────────────────────
function weeklyRecap(digest) {
  const harv = digest?.recentHarvest || [];
  const sows = digest?.recentSows || [];
  const events = digest?.recentEvents || [];
  let parts = [];
  if (harv.length) {
    const byCrop = {};
    harv.forEach(h => { (byCrop[h.crop] ||= []).push(h); });
    const lines = Object.entries(byCrop).slice(0, 8).map(([crop, list]) => {
      const total = list.reduce((s, h) => s + (parseFloat(h.qty)||0), 0);
      const unit = list[0]?.unit || '';
      return `<li>${esc(crop)}${total ? ` — ${total.toFixed(1)} ${esc(unit)}` : ''} (${list.length}×)</li>`;
    }).join('');
    parts.push(card('🧺 Harvested this week', `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;">${lines}</ul>`));
  }
  if (sows.length) {
    const lines = sows.slice(0, 8).map(s =>
      `<li>${esc(s.name)} → ${bedLabel(s.bed)} (${s.method}, ${shortDate(s.date)})</li>`
    ).join('');
    parts.push(card('🌱 Sown / transplanted this week', `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;">${lines}</ul>`));
  }
  if (events.length) {
    const lines = events.slice(0, 8).map(e =>
      `<li>${esc(e.type)} ${e.auto?'<i style="color:#7a7268;">(auto)</i>':''} — ${shortDate(e.date)}${e.notes?` — ${esc(e.notes)}`:''}</li>`
    ).join('');
    parts.push(card('📋 Events logged', `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;">${lines}</ul>`));
  }
  if (!parts.length) parts.push(card('Week recap', `<div style="font-size:13px;color:#7a7268;">No activity logged in the past 7 days.</div>`));
  return parts.join('');
}

async function send(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.SENDER_EMAIL, to: env.RECIPIENT_EMAIL, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${await res.text()}`);
  const out = await res.json();
  console.log(`Sent: ${out.id}`);
}

(async function main() {
  const mode = decideMode();
  if (mode === 'skip') { console.log('Outside the cadence for this trigger — no email.'); return; }
  console.log(`Mode: ${mode}`);
  const [snapshot, wx] = await Promise.all([fetchGist(), fetchWeather()]);
  const digest = snapshot?.emailDigest || {};
  const synced = snapshot?.generatedAt ? new Date(snapshot.generatedAt) : null;
  const ageMs = synced ? Date.now() - synced.getTime() : Infinity;
  const ageStr = !synced ? 'never' : ageMs < 36e5 ? `${Math.round(ageMs/6e4)}m ago`
    : ageMs < 864e5 ? `${Math.round(ageMs/36e5)}h ago` : `${Math.round(ageMs/864e5)}d ago`;
  let body, subject;
  if (mode === 'daily') {
    body = weatherCard(wx) + frostCard(wx, digest) + readyCard(digest)
      + transplantCard(digest) + feedCard(digest) + pruneCard(digest) + sowCard(digest) + pestCard(digest) + soilCard(digest);
    const title = `🌱 Today in the garden — ${digest.monthName || ''}`;
    subject = `Garden ${shortDate(new Date())} · ${Math.round(wx.daily.temperature_2m_max[0])}/${Math.round(wx.daily.temperature_2m_min[0])}°`;
    body = shell(title, body, ageStr);
  } else {
    const title = `📅 Garden week ahead — ${shortDate(new Date())}`;
    subject = `Garden weekly · ${shortDate(new Date())}`;
    body = shell(title, weatherCard(wx) + frostCard(wx, digest) + weeklyRecap(digest) + pruneCard(digest) + pestCard(digest), ageStr);
  }
  await send(subject, body);
})().catch(e => { console.error(e); process.exit(1); });
