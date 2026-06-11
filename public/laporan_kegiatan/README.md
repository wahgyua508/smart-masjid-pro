# Panduan Folder Laporan Kegiatan

## 📁 Deskripsi

Folder ini digunakan untuk menyimpan screenshot/gambar laporan kegiatan masjid yang akan ditampilkan di halaman Display (tabel laporan kegiatan).

## 🖼️ Spesifikasi File

### Nama File Utama

- **Nama**: `laporan_kegiatan.jpg`
- **Format**: JPG atau JPEG
- **Ukuran File**: Maksimal 2-5 MB (recommended: 500 KB - 2 MB)
- **Resolusi**: 1200x800px hingga 1600x900px (aspek ratio 4:3 atau 16:9)

### Opsi Alternatif (Untuk Multiple Laporan)

Anda dapat membuat beberapa file dengan naming convention:

- `laporan_kegiatan_januari.jpg`
- `laporan_kegiatan_februari.jpg`
- `laporan_kegiatan_[bulan].jpg`

## 📋 Cara Menggunakan

### Langkah 1: Siapkan File Screenshot dari Word

1. Buka dokumen Word yang berisi laporan kegiatan masjid
2. Screenshot atau export bagian laporan yang ingin ditampilkan
3. Pastikan screenshot mencakup:
   - Judul laporan kegiatan
   - Daftar kegiatan yang dilaksanakan
   - Tanggal dan periode kegiatan
   - Informasi peserta/penyelenggara (jika ada)
   - Tanda tangan atau approval (jika ada)

**Tips Membuat Screenshot dari Word:**

- Gunakan Print Screen (Ctrl+PrtScn) atau Snipping Tool
- Atau gunakan "Save as Picture" feature di Word
- Pastikan semua text terbaca dengan jelas

### Langkah 2: Optimalkan Ukuran Gambar

Gunakan tools seperti:

- **Online**: TinyPNG, ImageOptim, Compressor.io
- **Desktop**: IrfanView, XnConvert, atau built-in Windows Photo
- Target ukuran final: 500 KB - 2 MB

### Langkah 3: Simpan ke Folder

1. Rename file menjadi `laporan_kegiatan.jpg`
2. Letakkan di folder: `public/laporan_kegiatan/`
3. Refresh halaman Display di browser

## 🔄 Logika Tampilan di Display

### Fitur Otomatis:

- **Rotasi Laporan**: Laporan Kegiatan bergantian dengan Laporan Keuangan setiap 5 detik
- **Fallback Icon**: Jika file tidak ditemukan, tampil icon "event" (placeholder)
- **Responsive**: Gambar otomatis menyesuaikan ukuran sesuai container
- **No Stretch**: Gambar tidak akan di-stretch, hanya di-scale proportional

### URL yang digunakan di Program:

```
/laporan_kegiatan/laporan_kegiatan.jpg
```

## ✅ Checklist Sebelum Deploy

- [ ] File sudah dalam format JPG/JPEG
- [ ] Nama file: `laporan_kegiatan.jpg` (huruf kecil, no space)
- [ ] Ukuran file < 2 MB
- [ ] Resolusi: 1200x800px atau lebih
- [ ] File sudah di folder: `public/laporan_kegiatan/`
- [ ] Program Display sudah di-refresh di browser
- [ ] Gambar terlihat jelas di Display (tidak blur, tidak pixelated)

## 🐛 Troubleshooting

### Gambar Tidak Muncul

1. Cek nama file: harus `laporan_kegiatan.jpg` (case-sensitive)
2. Cek folder path: harus di `public/laporan_kegiatan/`
3. Refresh browser (Ctrl+F5 untuk clear cache)
4. Cek browser console (F12) untuk error messages

### Gambar Blur/Pixelated

- Naikkan resolusi sumber gambar (minimal 1200px lebar)
- Screenshot dengan zoom 100% di Word (jangan zoom in/out)
- Gunakan "Save as Picture" dari Word untuk hasil lebih baik

### File Terlalu Besar

- Gunakan image optimizer (TinyPNG, Compressor.io)
- Atau reduce dimensi gambar ke 1200x800px

## 📞 Support

Jika ada pertanyaan, hubungi tim developer atau lihat dokumentasi utama program.
