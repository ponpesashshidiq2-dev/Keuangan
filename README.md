# 🕌 Aplikasi Keuangan Pondok Pesantren (Shared Hosting)

Aplikasi kas pondok pesantren berbasis web — pemasukan/pengeluaran, iuran santri otomatis tercatat ke kas, data santri, laporan siap cetak.

**Versi ini khusus shared hosting:** murni **PHP + file JSON**, tanpa Node.js, tanpa npm, tanpa MySQL. Cukup upload lewat File Manager cPanel / FTP.

## ✨ Fitur

| Modul | Kemampuan |
|---|---|
| **Dashboard** | Saldo kas, tren arus kas 6 bulan, donat pengeluaran per kategori, progress iuran, tunggakan |
| **Kas / Transaksi** | Catat pemasukan & pengeluaran, filter tanggal/jenis/kategori/pencarian, ekspor CSV, hapus |
| **Iuran Santri** | Jenis iuran (uang makan, sekolah, kegiatan…), generate tagihan massal per bulan, bayar (tunai/transfer/QRIS), angsuran, riwayat — **setiap pembayaran otomatis jadi pemasukan kas** |
| **Data Santri** | Tambah/edit/cari, NIS, kelas, asrama, status, ringkasan iuran per santri |
| **Laporan** | Rekap pemasukan & pengeluaran per kategori, rincian transaksi, rekap iuran per periode, **cetak/PDF** (kop pesantren otomatis), ekspor CSV |
| **Pengaturan** | Profil pesantren, saldo awal, kelola kategori, **backup/restore JSON**, muat data demo, reset |

## 🚀 Cara Pasang di Shared Hosting

1. **Syarat:** hosting dengan **PHP 7.4 atau lebih baru** (hampir semua hosting). Tidak perlu MySQL.
2. Upload **seluruh isi folder ini** ke `public_html` (atau subfolder, mis. `public_html/keuangan`) via **File Manager cPanel** atau **FTP**.
3. Pastikan folder **`data/` bisa ditulis** oleh server:
   - Di File Manager: klik kanan folder `data` → *Change Permissions* → **755**.
   - Jika muncul error saat menyimpan, ubah ke **775** (atau 777 sebagai jalan terakhir).
4. Buka alamat situs, contoh: `https://domainanda.com/` atau `https://domainanda.com/keuangan/`.
5. Selesai. Saat pertama dibuka:
   - klik **Pengaturan → Muat Data Demo** untuk mencoba dengan data contoh (30 santri, kas & iuran 3 bulan), atau
   - langsung isi: **Pengaturan** (profil & saldo awal) → **Iuran → Generate Tagihan** → mulai catat kas.

> Folder `data/` dilindungi `.htaccess` agar `db.json` tidak bisa diakses publik. Jika hosting Anda menonaktifkan `.htaccess`, pindahkan folder `data/` ke luar `public_html` dan sesuaikan path di `db.php`.

## 🗂️ Struktur Folder

```
public_html/
├── index.html        # Halaman aplikasi (SPA)
├── api.php           # Semua endpoint API (GET/POST/PUT/DELETE, body JSON)
├── db.php            # Helper database JSON (tidak bisa diakses langsung)
├── .htaccess         # Proteksi file sensitif
├── assets/
│   ├── style.css     # Tema hijau-keemasan, responsif, mode cetak
│   ├── app.js        # Logika semua halaman + modal
│   └── charts.js     # Grafik bar & donat (canvas, tanpa library)
└── data/
    ├── .htaccess     # Ditolak diakses langsung
    └── db.json       # Database — dibuat otomatis saat pertama simpan
```

## 🔌 Ringkasan API (`api.php?p=...`)

- `p=pengaturan` — GET/PUT profil & saldo awal
- `p=kategori` — GET/POST; `&id=` DELETE
- `p=santri` — GET (`?q=&status=`)/POST; `&id=` PUT/DELETE
- `p=jenis-tagihan` — GET/POST; `&id=` PUT/DELETE
- `p=transaksi` — GET (`?dari=&sampai=&jenis=&kategori_id=&q=`)/POST; `&id=` DELETE
- `p=tagihan` — GET (`?periode=&status=&jenis_id=&q=`)
- `p=tagihan&act=generate` — POST `{periode, jenis_ids[], santri_ids[]}` tagihan massal
- `p=tagihan&id=XXX&act=bayar` — POST bayar iuran → otomatis catat ke kas
- `p=pembayaran&id=XXX` — DELETE hapus pembayaran (ikut hapus transaksi kas terkait)
- `p=dashboard` — GET ringkasan dashboard
- `p=laporan` — GET (`?dari=&sampai=&jenis=`)
- `p=laporan&sub=iuran` — GET rekap iuran per periode
- `p=backup` — GET unduh JSON · `p=restore`/`p=demo`/`p=reset` — POST

## 💾 Backup & Keamanan Data

- Semua data tersimpan di **`data/db.json`** (ditulis atomik + lock).
- Unduh backup kapan saja dari **Pengaturan → Backup**, pulihkan lewat **Restore**.
- **Login/otorisasi belum ada** — aplikasi ini untuk pemakaian **lokal/internal pesantren** (jaringan kantor atau VPN). Jangan diekspos ke internet publik tanpa tambahan proteksi (mis. password di level direktori via cPanel *Directory Privacy*).

## 🖨️ Cetak Laporan

Buka **Laporan Keuangan** → atur periode → klik **🖨️ Cetak / PDF** → pilih "Save as PDF" pada dialog cetak browser. Kop pesantren otomatis dicetak di atas laporan.

## ❓ Masalah Umum

| Gejala | Solusi |
|---|---|
| Error `folder data/ tidak bisa ditulis` | Ubah permission folder `data/` ke 755 → jika masih, 775/777 |
| Halaman kosong / 500 | Cek `PHP version` di cPanel (butuh ≥ 7.4), lihat `error_log` |
| `db.json` bisa dibuka publik | `.htaccess` tidak aktif → pindahkan `data/` ke luar `public_html` |
| Data hilang saat ganti hosting | Selalu unduh **Backup** dari menu Pengaturan sebelum pindah |
