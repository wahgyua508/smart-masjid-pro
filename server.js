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
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Konfigurasi Upstash Redis ─────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Batas maksimal gambar per kategori ───────────────────
const MAX_IMAGES = 3;

// ── Helper: ambil settings dari Redis ────────────────────
async function getSettings() {
  const data = await redis.get("masjid:settings");
  if (!data) {
    return {
      activeQR: null,
      qrLabel: "SCAN TO DONATE",
      activeBackground: null,
      activeReport: null,
      activeReport2: null,
      activeJadwal: null,
    };
  }
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function saveSettings(settings) {
  await redis.set("masjid:settings", JSON.stringify(settings));
}

// ── Helper: ambil content (ticker) dari Redis ─────────────
async function getContent() {
  const data = await redis.get("masjid:content");
  if (!data) return { ticker: "AYO RAJIN BERIBADAH DAN BERDONASI" };
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function saveContent(content) {
  await redis.set("masjid:content", JSON.stringify(content));
}

// ── Helper: daftar gambar dari Cloudinary per folder ──────
async function listCloudinaryImages(folder) {
  const result = await cloudinary.api.resources({
    type: "upload",
    prefix: `masjid/${folder}/`,
    max_results: 100,
  });
  // Urutkan dari yang terlama (created_at ascending)
  const sorted = result.resources.sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  return sorted.map((r) => ({
    path: `${folder}/${r.public_id.split("/").pop()}`,
    url: r.secure_url,
    public_id: r.public_id,
    created_at: r.created_at,
  }));
}

// ── Helper: hapus gambar terlama jika melebihi MAX_IMAGES ─
// activePublicIds: public_id gambar yang sedang aktif (tidak boleh dihapus)
async function enforceLimit(folder, activePublicIds = []) {
  try {
    const images = await listCloudinaryImages(folder);
    if (images.length < MAX_IMAGES) return; // masih di bawah limit

    // Butuh 1 slot untuk gambar baru, hitung kelebihan
    const excess = images.length - MAX_IMAGES + 1;
    const toDelete = images
      .filter((img) => !activePublicIds.includes(img.public_id))
      .slice(0, excess); // ambil yang paling lama

    for (const img of toDelete) {
      await cloudinary.uploader.destroy(img.public_id);
      console.log(`🗑️ Auto-deleted old image: ${img.public_id}`);
    }
  } catch (e) {
    console.error("enforceLimit error:", e.message);
  }
}

// ── Helper: upload buffer ke Cloudinary ──────────────────
function uploadToCloudinary(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `masjid/${folder}`,
        public_id: filename,
        overwrite: true,
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Multer pakai memoryStorage — file disimpan di RAM lalu dikirim ke Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// ── API: Baca semua setting ──────────────────────────────
app.get("/api/settings", async (req, res) => {
  try {
    const [settings, content] = await Promise.all([getSettings(), getContent()]);
    res.json({ ...settings, ...content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Update teks ticker ──────────────────────────────
app.post("/api/ticker", async (req, res) => {
  try {
    const content = await getContent();
    content.ticker = req.body.ticker;
    await saveContent(content);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Ganti background aktif ─────────────────────────
app.post("/api/background", async (req, res) => {
  try {
    const settings = await getSettings();
    settings.activeBackground = req.body.path;
    settings.activeBackgroundUrl = req.body.url;
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Upload background baru ke Cloudinary ───────────
// Auto-hapus gambar terlama jika sudah >= MAX_IMAGES
app.post("/api/upload-background", upload.single("bgImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Ambil public_id background yang sedang aktif agar tidak terhapus
    const settings = await getSettings();
    const activeIds = settings.activeBackground
      ? [`masjid/uploads/${settings.activeBackground.split("/").pop()}`]
      : [];

    // Hapus yang terlama jika melebihi limit
    await enforceLimit("uploads", activeIds);

    const filename = Date.now();
    const result = await uploadToCloudinary(req.file.buffer, "uploads", filename);
    res.json({ success: true, path: `uploads/${filename}`, url: result.secure_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Daftar background dari Cloudinary ───────────────
app.get("/api/backgrounds", async (req, res) => {
  try {
    const files = await listCloudinaryImages("uploads");
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Hapus background dari Cloudinary ────────────────
app.delete("/api/background", async (req, res) => {
  try {
    const { path: bgPath, public_id } = req.body;
    if (!bgPath) return res.status(400).json({ error: "No path provided" });

    const settings = await getSettings();
    if (settings.activeBackground === bgPath) {
      return res.status(400).json({ error: "Tidak bisa menghapus background yang sedang aktif." });
    }

    if (public_id) await cloudinary.uploader.destroy(public_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Discard / reset background aktif ───────────────
app.post("/api/background/discard", async (req, res) => {
  try {
    const settings = await getSettings();
    delete settings.activeBackground;
    delete settings.activeBackgroundUrl;
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Upload & set QR Code ke Cloudinary ──────────────
// QR hanya 1 aktif — auto-hapus QR lama saat upload baru
app.post("/api/qr", upload.single("qrImage"), async (req, res) => {
  try {
    const settings = await getSettings();
    if (req.file) {
      // Hapus QR lama dari Cloudinary jika ada
      if (settings.activeQR) {
        const oldPublicId = `masjid/qrcodes/${settings.activeQR.split("/").pop()}`;
        await cloudinary.uploader.destroy(oldPublicId).catch(() => {});
      }
      const filename = Date.now();
      const result = await uploadToCloudinary(req.file.buffer, "qrcodes", filename);
      settings.activeQR = `qrcodes/${filename}`;
      settings.activeQRUrl = result.secure_url;
    }
    settings.qrLabel = req.body.label || settings.qrLabel;
    await saveSettings(settings);
    res.json({ success: true, path: settings.activeQR, url: settings.activeQRUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Upload laporan keuangan ke Cloudinary ───────────
// Auto-hapus laporan terlama jika sudah >= MAX_IMAGES
app.post("/api/upload-report", upload.single("reportImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const settings = await getSettings();
    // Lindungi kedua laporan yang sedang aktif
    const activeIds = [
      settings.activeReport ? `masjid/laporan_keuangan/${settings.activeReport.split("/").pop()}` : null,
      settings.activeReport2 ? `masjid/laporan_keuangan/${settings.activeReport2.split("/").pop()}` : null,
    ].filter(Boolean);

    await enforceLimit("laporan_keuangan", activeIds);

    const filename = Date.now();
    const result = await uploadToCloudinary(req.file.buffer, "laporan_keuangan", filename);
    res.json({ success: true, path: `laporan_keuangan/${filename}`, url: result.secure_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Daftar semua laporan keuangan dari Cloudinary ───
app.get("/api/reports", async (req, res) => {
  try {
    const files = await listCloudinaryImages("laporan_keuangan");
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Set laporan keuangan aktif (slide 1 atau slide 2)
app.post("/api/report", async (req, res) => {
  try {
    const settings = await getSettings();
    const { path: reportPath, url: reportUrl, slide } = req.body;
    if (slide === 2) {
      settings.activeReport2 = reportPath;
      settings.activeReport2Url = reportUrl;
    } else {
      settings.activeReport = reportPath;
      settings.activeReportUrl = reportUrl;
    }
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Hapus laporan keuangan dari Cloudinary ──────────
app.delete("/api/report", async (req, res) => {
  try {
    const { path: reportPath, public_id } = req.body;
    if (!reportPath) return res.status(400).json({ error: "No path provided" });

    const settings = await getSettings();
    if (settings.activeReport === reportPath || settings.activeReport2 === reportPath) {
      return res.status(400).json({ error: "Tidak bisa menghapus laporan yang sedang aktif." });
    }

    if (public_id) await cloudinary.uploader.destroy(public_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Reset / discard laporan keuangan aktif ──────────
app.post("/api/report/discard", async (req, res) => {
  try {
    const settings = await getSettings();
    const { slide } = req.body;
    if (slide === 2) {
      delete settings.activeReport2;
      delete settings.activeReport2Url;
    } else if (slide === 1) {
      delete settings.activeReport;
      delete settings.activeReportUrl;
    } else {
      delete settings.activeReport;
      delete settings.activeReportUrl;
      delete settings.activeReport2;
      delete settings.activeReport2Url;
    }
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Upload jadwal kajian ke Cloudinary ──────────────
// Auto-hapus jadwal terlama jika sudah >= MAX_IMAGES
app.post("/api/upload-jadwal", upload.single("jadwalImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const settings = await getSettings();
    const activeIds = settings.activeJadwal
      ? [`masjid/jadwal_kajian/${settings.activeJadwal.split("/").pop()}`]
      : [];

    await enforceLimit("jadwal_kajian", activeIds);

    const filename = Date.now();
    const result = await uploadToCloudinary(req.file.buffer, "jadwal_kajian", filename);
    res.json({ success: true, path: `jadwal_kajian/${filename}`, url: result.secure_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Daftar semua jadwal kajian dari Cloudinary ──────
app.get("/api/jadwals", async (req, res) => {
  try {
    const files = await listCloudinaryImages("jadwal_kajian");
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Set jadwal kajian aktif ─────────────────────────
app.post("/api/jadwal", async (req, res) => {
  try {
    const settings = await getSettings();
    settings.activeJadwal = req.body.path;
    settings.activeJadwalUrl = req.body.url;
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Hapus jadwal kajian dari Cloudinary ─────────────
app.delete("/api/jadwal", async (req, res) => {
  try {
    const { path: jadwalPath, public_id } = req.body;
    if (!jadwalPath) return res.status(400).json({ error: "No path provided" });

    const settings = await getSettings();
    if (settings.activeJadwal === jadwalPath) {
      return res.status(400).json({ error: "Tidak bisa menghapus jadwal yang sedang aktif." });
    }

    if (public_id) await cloudinary.uploader.destroy(public_id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Reset / discard jadwal kajian aktif ────────────
app.post("/api/jadwal/discard", async (req, res) => {
  try {
    const settings = await getSettings();
    delete settings.activeJadwal;
    delete settings.activeJadwalUrl;
    await saveSettings(settings);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Smart Masjid Pro berjalan di http://localhost:${PORT}`)
);
