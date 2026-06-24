const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const { v2: cloudinary } = require("cloudinary");
const { Redis } = require("@upstash/redis");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Konfigurasi Cloudinary ────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Konfigurasi Upstash Redis ─────────────────────────────
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Webhook Secret (opsional, direkomendasikan) ───────────
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const MAX_IMAGES = 3;

// ────────────────────────────────────────────────────────────
// HELPERS Redis
// ────────────────────────────────────────────────────────────
async function getSettings() {
  const data = await redis.get("masjid:settings");
  if (!data) return { activeQR: null, qrLabel: "SCAN TO DONATE", activeBackground: null, activeReport: null, activeJadwal: null };
  return typeof data === "string" ? JSON.parse(data) : data;
}
async function saveSettings(settings) {
  await redis.set("masjid:settings", JSON.stringify(settings));
}

async function getContent() {
  const data = await redis.get("masjid:content");
  if (!data) return { ticker: "AYO RAJIN BERIBADAH DAN BERDONASI" };
  return typeof data === "string" ? JSON.parse(data) : data;
}
async function saveContent(content) {
  await redis.set("masjid:content", JSON.stringify(content));
}

// ────────────────────────────────────────────────────────────
// HELPERS Cloudinary
// ────────────────────────────────────────────────────────────
async function listCloudinaryImages(folder) {
  const result = await cloudinary.api.resources({ type: "upload", prefix: `masjid/${folder}/`, max_results: 100 });
  const sorted = result.resources.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return sorted.map(r => ({ path: `${folder}/${r.public_id.split("/").pop()}`, url: r.secure_url, public_id: r.public_id, created_at: r.created_at }));
}

async function enforceLimit(folder, activePublicIds = []) {
  try {
    const images = await listCloudinaryImages(folder);
    if (images.length < MAX_IMAGES) return;
    const excess = images.length - MAX_IMAGES + 1;
    const toDelete = images.filter(img => !activePublicIds.includes(img.public_id)).slice(0, excess);
    for (const img of toDelete) { await cloudinary.uploader.destroy(img.public_id); console.log(`🗑️ Auto-deleted: ${img.public_id}`); }
  } catch (e) { console.error("enforceLimit error:", e.message); }
}

function uploadToCloudinary(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `masjid/${folder}`, public_id: filename, overwrite: true, resource_type: "image" },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    stream.end(buffer);
  });
}

// ────────────────────────────────────────────────────────────
// MIDDLEWARE
// ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
const upload = multer({ storage: multer.memoryStorage() });

// Middleware validasi webhook secret (jika dikonfigurasi)
function checkWebhookSecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // skip jika tidak diset
  const secret = req.headers["x-webhook-secret"] || req.body?.secret;
  if (secret !== WEBHOOK_SECRET) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ────────────────────────────────────────────────────────────
// API: Baca semua settings (dipakai display.html polling)
// ────────────────────────────────────────────────────────────
app.get("/api/settings", async (req, res) => {
  try {
    const [settings, content] = await Promise.all([getSettings(), getContent()]);

    // Ambil data tabel dari Redis (jika ada dari webhook)
    const financeRaw = await redis.get("masjid:finance");
    const kajianRaw  = await redis.get("masjid:kajian");

    const financeData = financeRaw ? (typeof financeRaw === "string" ? JSON.parse(financeRaw) : financeRaw) : null;
    const kajianData  = kajianRaw  ? (typeof kajianRaw  === "string" ? JSON.parse(kajianRaw)  : kajianRaw)  : null;

    res.json({
      ...settings,
      ...content,
      // Data tabel keuangan dari Google Sheet
      financeRows:      financeData?.rows      || [],
      financeHeaders:   financeData?.headers   || [],
      financeUpdatedAt: financeData?.updatedAt || null,
      financeETag:      financeData?.etag      || null,
      // Data tabel kajian dari Google Sheet
      kajianRows:       kajianData?.rows       || [],
      kajianHeaders:    kajianData?.headers    || [],
      kajianUpdatedAt:  kajianData?.updatedAt  || null,
      kajianETag:       kajianData?.etag       || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// WEBHOOK: Google Apps Script kirim data Keuangan
//
// POST /api/webhook/finance
// Header: x-webhook-secret: <secret>  (opsional tapi direkomendasikan)
// Body (JSON):
// {
//   "rows": [
//     { "tanggal": "01/07/2025", "keterangan": "Infaq Jumat", "masuk": 500000, "keluar": 0, "saldo": 2500000 },
//     ...
//   ]
// }
// ────────────────────────────────────────────────────────────
app.post("/api/webhook/finance", checkWebhookSecret, async (req, res) => {
  try {
    const { rows, headers } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows harus array" });

    const etag = Date.now().toString();
    const payload = { rows, headers: headers || [], updatedAt: new Date().toISOString(), etag };
    await redis.set("masjid:finance", JSON.stringify(payload));

    console.log(`💰 Finance data updated: ${rows.length} baris`);
    res.json({ success: true, rows: rows.length, updatedAt: payload.updatedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// WEBHOOK: Google Apps Script kirim data Jadwal Kajian
//
// POST /api/webhook/kajian
// Header: x-webhook-secret: <secret>
// Body (JSON):
// {
//   "rows": [
//     { "hari": "Minggu, 06/07/2025", "waktu": "08:00 - 10:00", "materi": "Tafsir Juz Amma", "ustadz": "Ust. Fauzan", "tempat": "Aula Utama" },
//     ...
//   ]
// }
// ────────────────────────────────────────────────────────────
app.post("/api/webhook/kajian", checkWebhookSecret, async (req, res) => {
  try {
    const { rows, headers } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows harus array" });

    const etag = Date.now().toString();
    const payload = { rows, headers: headers || [], updatedAt: new Date().toISOString(), etag };
    await redis.set("masjid:kajian", JSON.stringify(payload));

    console.log(`📅 Kajian data updated: ${rows.length} baris`);
    res.json({ success: true, rows: rows.length, updatedAt: payload.updatedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// WEBHOOK GABUNGAN (alternatif — 1 sheet kirim keduanya)
//
// POST /api/webhook/sheets
// Body: { "finance": { "rows": [...] }, "kajian": { "rows": [...] } }
// ────────────────────────────────────────────────────────────
app.post("/api/webhook/sheets", checkWebhookSecret, async (req, res) => {
  try {
    const results = {};
    if (req.body.finance?.rows) {
      const { rows, headers } = req.body.finance;
      await redis.set("masjid:finance", JSON.stringify({ rows, headers: headers || [], updatedAt: new Date().toISOString(), etag: Date.now().toString() }));
      results.finance = rows.length;
    }
    if (req.body.kajian?.rows) {
      const { rows, headers } = req.body.kajian;
      await redis.set("masjid:kajian", JSON.stringify({ rows, headers: headers || [], updatedAt: new Date().toISOString(), etag: Date.now().toString() }));
      results.kajian = rows.length;
    }
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// API: Reset data tabel (dari dashboard admin)
// ────────────────────────────────────────────────────────────
app.delete("/api/finance", async (req, res) => {
  try { await redis.del("masjid:finance"); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/kajian", async (req, res) => {
  try { await redis.del("masjid:kajian"); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// API YANG SUDAH ADA (tidak berubah)
// ────────────────────────────────────────────────────────────
app.post("/api/ticker", async (req, res) => {
  try { const c=await getContent(); c.ticker=req.body.ticker; await saveContent(c); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/location", async (req, res) => {
  try {
    const s=await getSettings();
    if(req.body.city!==undefined){ const c=(req.body.city||"").trim(); if(c) s.prayerCity=c; else delete s.prayerCity; }
    if(req.body.method!==undefined) s.prayerMethod=parseInt(req.body.method)||11;
    await saveSettings(s);
    res.json({success:true, prayerCity:s.prayerCity||null, prayerMethod:s.prayerMethod||11});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/background", async (req, res) => {
  try { const s=await getSettings(); s.activeBackground=req.body.path; s.activeBackgroundUrl=req.body.url; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/upload-background", upload.single("bgImage"), async (req, res) => {
  try {
    if(!req.file) return res.status(400).json({error:"No file uploaded"});
    const s=await getSettings();
    const activeIds=s.activeBackground?[`masjid/uploads/${s.activeBackground.split("/").pop()}`]:[];
    await enforceLimit("uploads",activeIds);
    const fn=Date.now();
    const result=await uploadToCloudinary(req.file.buffer,"uploads",fn);
    res.json({success:true,path:`uploads/${fn}`,url:result.secure_url});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/backgrounds", async (req, res) => {
  try { res.json(await listCloudinaryImages("uploads")); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.delete("/api/background", async (req, res) => {
  try {
    const {path:p,public_id}=req.body;
    if(!p) return res.status(400).json({error:"No path"});
    const s=await getSettings();
    if(s.activeBackground===p) return res.status(400).json({error:"Tidak bisa hapus background aktif."});
    if(public_id) await cloudinary.uploader.destroy(public_id);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/background/discard", async (req, res) => {
  try { const s=await getSettings(); delete s.activeBackground; delete s.activeBackgroundUrl; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/qr", upload.single("qrImage"), async (req, res) => {
  try {
    const s=await getSettings();
    if(req.file){
      if(s.activeQR){ const oldId=`masjid/qrcodes/${s.activeQR.split("/").pop()}`; await cloudinary.uploader.destroy(oldId).catch(()=>{}); }
      const fn=Date.now();
      const result=await uploadToCloudinary(req.file.buffer,"qrcodes",fn);
      s.activeQR=`qrcodes/${fn}`; s.activeQRUrl=result.secure_url;
    }
    s.qrLabel=req.body.label||s.qrLabel;
    await saveSettings(s);
    res.json({success:true,path:s.activeQR,url:s.activeQRUrl});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/upload-report", upload.single("reportImage"), async (req, res) => {
  try {
    if(!req.file) return res.status(400).json({error:"No file"});
    const s=await getSettings();
    const activeIds=[s.activeReport?`masjid/laporan_keuangan/${s.activeReport.split("/").pop()}`:null].filter(Boolean);
    await enforceLimit("laporan_keuangan",activeIds);
    const fn=Date.now();
    const result=await uploadToCloudinary(req.file.buffer,"laporan_keuangan",fn);
    res.json({success:true,path:`laporan_keuangan/${fn}`,url:result.secure_url});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/reports", async (req, res) => {
  try { res.json(await listCloudinaryImages("laporan_keuangan")); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/report", async (req, res) => {
  try { const s=await getSettings(); s.activeReport=req.body.path; s.activeReportUrl=req.body.url; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.delete("/api/report", async (req, res) => {
  try {
    const {path:p,public_id}=req.body;
    if(!p) return res.status(400).json({error:"No path"});
    const s=await getSettings();
    if(s.activeReport===p) return res.status(400).json({error:"Tidak bisa hapus laporan aktif."});
    if(public_id) await cloudinary.uploader.destroy(public_id);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/report/discard", async (req, res) => {
  try { const s=await getSettings(); delete s.activeReport; delete s.activeReportUrl; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/upload-jadwal", upload.single("jadwalImage"), async (req, res) => {
  try {
    if(!req.file) return res.status(400).json({error:"No file"});
    const s=await getSettings();
    const activeIds=s.activeJadwal?[`masjid/jadwal_kajian/${s.activeJadwal.split("/").pop()}`]:[];
    await enforceLimit("jadwal_kajian",activeIds);
    const fn=Date.now();
    const result=await uploadToCloudinary(req.file.buffer,"jadwal_kajian",fn);
    res.json({success:true,path:`jadwal_kajian/${fn}`,url:result.secure_url});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/jadwals", async (req, res) => {
  try { res.json(await listCloudinaryImages("jadwal_kajian")); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/jadwal", async (req, res) => {
  try { const s=await getSettings(); s.activeJadwal=req.body.path; s.activeJadwalUrl=req.body.url; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.delete("/api/jadwal", async (req, res) => {
  try {
    const {path:p,public_id}=req.body;
    if(!p) return res.status(400).json({error:"No path"});
    const s=await getSettings();
    if(s.activeJadwal===p) return res.status(400).json({error:"Tidak bisa hapus jadwal aktif."});
    if(public_id) await cloudinary.uploader.destroy(public_id);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/jadwal/discard", async (req, res) => {
  try { const s=await getSettings(); delete s.activeJadwal; delete s.activeJadwalUrl; await saveSettings(s); res.json({success:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.listen(PORT, () => console.log(`✅ Smart Masjid Pro → http://localhost:${PORT}`));
