# Panduan Folder Laporan Keuangan

## 📁 Deskripsi

Folder ini digunakan untuk menyimpan screenshot/gambar laporan keuangan masjid yang akan ditampilkan di halaman Display (tabel laporan keuangan).

## 🖼️ Spesifikasi File

### Nama File Utama

- **Nama**: `laporan_keuangan.jpg`
- **Format**: JPG atau JPEG
- **Ukuran File**: Maksimal 2-5 MB (recommended: 500 KB - 2 MB)
- **Resolusi**: 1200x800px hingga 1600x900px (aspek ratio 4:3 atau 16:9)

### Opsi Alternatif (Untuk Multiple Laporan)

Anda dapat membuat beberapa file dengan naming convention:

- `laporan_keuangan_januari.jpg`
- `laporan_keuangan_februari.jpg`
- `laporan_keuangan_[bulan].jpg`

## 📋 Cara Menggunakan

### Langkah 1: Siapkan File Screenshot

1. Buka file Excel/Spreadsheet laporan keuangan Anda
2. Screenshot atau export bagian laporan yang ingin ditampilkan
3. Pastikan gambar mencakup:
   - Header/Judul laporan
   - Kolom: Kategori Pendapatan/Pengeluaran, Jumlah, Keterangan
   - Tanda tangan atau approval
   - Tanggal laporan

### Langkah 2: Optimalkan Ukuran Gambar

Gunakan tools seperti:

- **Online**: TinyPNG, ImageOptim, Compressor.io
- **Desktop**: IrfanView, XnConvert, atau built-in Windows Photo
- Target ukuran final: 500 KB - 2 MB

### Langkah 3: Simpan ke Folder

1. Rename file menjadi `laporan_keuangan.jpg`
2. Letakkan di folder: `public/laporan_keuangan/`
3. Refresh halaman Display di browser

## 🔄 Logika Tampilan di Display

### Fitur Otomatis:

- **Rotasi Laporan**: Laporan bergantian dengan Laporan Kegiatan setiap 5 detik
- **Fallback Icon**: Jika file tidak ditemukan, tampil icon "monitoring" (placeholder)
- **Responsive**: Gambar otomatis menyesuaikan ukuran sesuai container
- **No Stretch**: Gambar tidak akan di-stretch, hanya di-scale proportional

### URL yang digunakan di Program:

```
/laporan_keuangan/laporan_keuangan.jpg
```

## ✅ Checklist Sebelum Deploy

- [ ] File sudah dalam format JPG/JPEG
- [ ] Nama file: `laporan_keuangan.jpg` (huruf kecil, no space)
- [ ] Ukuran file < 2 MB
- [ ] Resolusi: 1200x800px atau lebih
- [ ] File sudah di folder: `public/laporan_keuangan/`
- [ ] Program Display sudah di-refresh di browser
- [ ] Gambar terlihat jelas di Display (tidak blur, tidak pixelated)

## 🐛 Troubleshooting

### Gambar Tidak Muncul

1. Cek nama file: harus `laporan_keuangan.jpg` (case-sensitive)
2. Cek folder path: harus di `public/laporan_keuangan/`
3. Refresh browser (Ctrl+F5 untuk clear cache)
4. Cek browser console (F12) untuk error messages

### Gambar Blur/Pixelated

- Naikkan resolusi sumber gambar (minimal 1200px lebar)
- Screenshot dengan zoom 100% (jangan zoom in/out)
- Gunakan save as PNG dulu, baru convert ke JPG dengan quality high

### File Terlalu Besar

- Gunakan image optimizer (TinyPNG, Compressor.io)
- Atau reduce dimensi gambar ke 1200x800px

## 📞 Support

Jika ada pertanyaan, hubungi tim developer atau lihat dokumentasi utama program.
