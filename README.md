# 🕌 Aplikasi Keuangan Pondok Pesantren (Shared Hosting)

Aplikasi kas pondok pesantren berbasis web — **jurnal kas masuk (BKM) & kas keluar (BKK)** dengan pilihan **akun pemasukan/pengeluaran**, pemasukan/pengeluaran, iuran santri otomatis tercatat ke kas, data santri lengkap dengan kolom tagihan (SPP/Infaq/Laundry per bulan + impor Excel), **mutasi khusus uang saku / tabungan / tagihan lain-lain per santri (saldo akhir)**, laporan siap cetak.

**Versi ini khusus shared hosting:** murni **PHP + file JSON**, tanpa Node.js, tanpa npm, tanpa MySQL. Cukup upload lewat File Manager cPanel / FTP.

## ✨ Fitur

| Modul | Kemampuan |
|---|---|
| **Dashboard** | Saldo kas, tren arus kas 6 bulan, donat pengeluaran per kategori, progress iuran, tunggakan |
| **Jurnal Kas** | Satu menu untuk semua kas. **Kas Masuk (BKM):** pilih nama santri → daftar **tagihan yang belum terbayar s/d bulan berjalan** otomatis muncul dan **bisa dicentang lebih dari satu** — satu klik Entry menerbitkan **SATU nomor BKM untuk semua tagihan yang dicentang** (beberapa transaksi berbagi satu BKM — tampil sebagai **rincian di halaman Kwitansi**) + kas masuk, dan tagihan otomatis **ditandai terbayar** (batal bila jurnal dihapus). Nomor BKM/BKK hasil ketikan manual disinkronkan ke counter — nomor berikutnya tidak pernah bentrok. Nama dicocokkan otomatis walau diketik sebagian (awalan unik) dan bekerja di browser yang hanya mengirim event `input`; **tagihan periode berikutnya ditampilkan abu-abu** (belum bisa di-entry). Nominal yang diketik sendiri **tidak pernah dihapus/ditimpa** oleh auto-fill tagihan. Bila tidak ada tagihan yang bisa dicentang, kotak langsung menjelaskan sebabnya: **"Belum ada tagihan"** + tombol ke Generate, **"semua tagihan sudah lunas"** (jumlah & total), atau **peringatan santri bernama sama** (tagihan tercatat di santri lain / santri_id berbeda), plus indikator "N sudah lunas" di judul kotak. **Chip kas khusus** (🪙 Uang Saku / 🏦 Tabungan / 📄 Tagihan Lain) mengeset akun pemasukan/pengeluaran + sumber dana otomatis (nominal diisi manual). Nama di luar data santri (donatur, dst.) tetap bisa diisi manual: tanggal, jenis tagihan, nominal & **Akun Pemasukan** (Administrasi, SPP, Infaq Wajib, … Orang Tua Asuh, Uang Saku, Tabungan, Tagihan Lain-lain) sendiri. **Kas Keluar (BKK):** **Akun Pengeluaran** (Biaya Listrik, Biaya Konsumsi Santri, … Biaya Kebersihan) + **sumber dana** (Dana BOS, Dana Lazis, …), **No BKK otomatis**. Saat **chip kas khusus** dipilih, muncul field **Nama Santri** (wajib diisi, cocok otomatis ke Data Santri, ikut tersimpan & tampil di tabel jurnal). Jenis transaksi **Cas/BRI/BSI/BPD**, setiap entry **langsung jadi transaksi kas**; Edit & Hapus per baris (kas ikut menyesuaikan) |
| **Kwitansi** | Pratinjau & **cetak kwitansi penerimaan** per nomor BKM (kop **logo gambar bila diunggah**, terbilang, **tanda tangan bendahara + gambar TTD + cap di samping kiri tanda tangan** sesuai Pengaturan) — **satu BKM bisa memuat beberapa transaksi** ditampilkan sebagai **tabel rincian + total**; **simpan PNG** (digambar mandiri di canvas), **kirim WhatsApp** lewat `wa.me` / **WhatsApp Web** atau **antre ke bot WA Web** (gambar kwitansi diambil bot dari `data/kwitansi`), plus **riwayat kirim** (menampilkan jenis dokumen: Kwitansi BKM / Surat Tagihan + nomornya) & **No WA wali otomatis dari Data Santri**. Bisa dibuka dari tombol **Kwitansi** di Jurnal Kas & menu Kas Khusus (Uang Saku / Tabungan / Tagihan Lain) |
| **Iuran Santri** | Jenis iuran (uang makan, sekolah, kegiatan…), **generate tagihan massal per bulan dengan nominal diambil dari kolom Data Santri** (SPP/Infaq/Laundry per bulan menyesuaikan periode + kolom lain & custom — nilai 0 dilewati, tagihan lama tidak digandakan), bayar (tunai/transfer/QRIS), angsuran, riwayat — **setiap pembayaran otomatis jadi pemasukan kas**. **Tidak ada item menu di sidebar** — halaman dibuka lewat tombol **Generate** pada kotak tagihan Jurnal Kas, tombol **Lihat Tunggakan** di Dashboard, atau langsung `#/iuran` |
| **Rekap Pembayaran** | Matriks **santri × jenis iuran** seperti tabel Data Santri (kolom sticky, subtotal per kolom): sel **hijau terisi nominal bila santri sudah bayar**, sel **merah = tagihan belum dibayar** → langsung terlihat mana yang **muncul di daftar Entry Kas Jurnal Kas** (tombol shortcut ke Jurnal Kas). Filter periode (kumulatif s/d bulan berjalan / per bulan / semua), kelas, status (belum/lunas/tanpa tagihan), pencarian, ekspor CSV |
| **Data Santri** | Kolom: **No, Nama, Kelas, No WA**, **SPP Januari–Desember**, **Infaq Wajib Januari–Desember**, **Laundry Wajib Januari–Desember**, Administrasi Awal, Wakaf, Daftar Ulang, Tunggakan (SPP/Infaq/Laundry/Daftar Ulang), Akhirusanah, Study Tour, Bimbel, Rihlah + **tambah kolom sendiri**; tab grup kolom, subtotal per kolom, **import Excel (.xlsx/.csv)** dengan preview & template, ekspor CSV |
| **Kas Khusus** | Tiga menu terpisah — **Uang Saku**, **Tabungan**, **Tagihan Lain** (tanpa kata "Mutasi" pada nama menu). Tiap halaman punya **submenu tab**: tab **Mutasi** (tabel mutasi + saldo berjalan per baris + tombol Entry Kas) dan tab **Rekap Saldo per Santri** (saldo awal, masuk, keluar, **saldo akhir** tiap santri — selalu sama dengan saldo akun); tab aktif yang tercetak ke **cetak/PDF**. Akun pemasukan **Uang Saku / Tabungan / Tagihan Lain-lain** + akun pengeluaran **Pembagian Uang Saku / Penarikan Tabungan / Pengembalian Tagihan Lain-lain**. **Entry tidak di halaman ini** — lewat tombol **Entry Kas Masuk / Entry Kas Keluar** di tab Mutasi yang langsung membuka **Jurnal Kas dengan akun & sumber dana terpreset** (chip 🪙/🏦/📄), sehingga nominal diisi di satu form yang sama. Filter tanggal/cari/jenis transaksi/**santri (dropdown per nama — daftar, total & Rekap Saldo per Santri ikut menyempit)**, **ekspor CSV** (mutasi + rekap); Edit & Hapus per baris ikut menyesuaikan saldo akun & buku kas |
| **Laporan** | Rekap pemasukan & pengeluaran per kategori, rincian transaksi, rekap iuran per periode, **cetak/PDF** (kop pesantren otomatis), ekspor CSV |
| **Saldo Akun Pemasukan** | **Kartu Saldo Bank & Cash** di paling atas: **Saldo BRI, BSI, BPD & CASH** (saldo saat ini — bank dari mutasi jurnal per jenis transaksi, cash = total kas − saldo bank) dengan tombol **⬇ Tarik Tunai** di tiap kartu bank (pindahkan dana bank → cash: **saldo bank berkurang, saldo cash otomatis bertambah**, total kas tidak berubah) + **Riwayat Tarik Tunai** (bisa dibatalkan). Di bawahnya rekap **NO, Nama Akun, Saldo Awal, Masuk, Keluar, Saldo Akhir** untuk semua akun pemasukan (termasuk sumber dana BKK) — filter tanggal, total di bawah tabel, **cetak/PDF** berkop pesantren + **ekspor CSV** |
| **Surat Tagihan Santri** | Surat resmi **Informasi Administrasi Keuangan** per santri: kop pesantren (logo, web/telp), No/Lamp/Hal, Yth. wali, tabel **tagihan belum lunas** (semua jenis sisa > 0 — termasuk tagihan lain bila ada saldonya), total, tanda tangan Mudir & Bendahara — **nomor surat otomatis** `B-3/PP-ASHSH/NN/ROMAN/TAHUN`, **riwayat nomor terbit** (tombol 🕓 + pilih cepat nomor lama lewat daftar di kolom No), **cetak = pratinjau = JPG** (tombol Cetak mencetak gambar JPG hasil render yang identik dengan tampilan layar), **unduh JPG**, dan **kirim WhatsApp** (antre ke bot WA Web — lampiran JPG surat disimpan di `data/surat`) |
| **Pengaturan** | Profil pesantren + **upload gambar**: logo (tampil di kop kwitansi), **nama & tanda tangan Mudir**, **nama & tanda tangan Bendahara**, **foto cap** (TTD & cap otomatis tampil di kwitansi), saldo awal, kelola kategori, **backup/restore JSON**, muat data demo, reset. **🔗 Koneksi WA Bridge**: panel **URL Bridge** + **Key Bridge (X-WA-Key)** (disimpan di pengaturan, dipanggil lewat server — bukan dari browser), **sakelar WhatsApp Aktif** hasil cek status bridge, tombol **Cek Status Bridge** & **Tes Koneksi** (HTTP + waktu respons), **Tes Kirim Rekap (Pilih Santri)** & **Kirim Rekap Sekarang (Semua)** (pesan ringkasan tagihan sisa per santri → antrean bot), serta kotak **Status Antrian Pengiriman** dengan **Perbarui Antrian** & **Batalkan Pengiriman**. Di bawahnya: **Login / QR & Kode Pairing** — panel **QR barcode** (dimuat ulang otomatis tiap 4 detik) + **kode pairing 8 karakter resmi dari WhatsApp** — isi **nomor telepon** lalu klik **Minta Kode Pairing**, kode diproses oleh **bot Node.js di folder [`bot/`](bot/)** (Baileys `requestPairingCode`): `cd bot && npm install && API_URL=https://domain.com/api.php node index.js`; scan di WhatsApp → Perangkat tertaut → Tautkan perangkat, atau masukkan kode pairing di HP → Perangkat tertaut → Tautkan dengan nomor telepon. Bot juga **mengirim kwitansi, surat tagihan & rekap dari antrean** (`GET p=kwitansi&act=antre` — tiap antrean membawa `tipe`/`ref` + `gambar_url`), dan **bisa dijalankan di shared hosting yang menyediakan Node.js** (lihat bagian **Bot WhatsApp**). Folder `bot/` dilindungi `.htaccess` (berisi kredensial WhatsApp di `bot/sesi/`) |

> **Import Excel:** baris pertama = judul kolom. Judul yang dikenal: `Nama, Kelas, No WA, SPP Januari … SPP Desember, Infaq Wajib Januari …, Laundry Wajib Januari …, Administrasi Awal, Wakaf, Daftar Ulang, Tunggakan …, Akhirusanah, Study Tour, Bimbel, Rihlah` (boleh singkat: `Infaq Januari`, `SPP Des`, `WA`, dst). Judul di luar daftar otomatis menjadi **kolom custom baru**. Santri dikenali dari **nama** (yang sudah ada = diperbarui, bisa dimatikan lewat centang). Nilai boleh ditulis `700000`, `700.000`, `Rp 700.000`, atau `700,000`. File `.xlsx` dibaca via library SheetJS (CDN) — bila offline, simpan dulu sebagai **CSV**.

## 🚀 Cara Pasang di Shared Hosting

1. **Syarat:** hosting dengan **PHP 7.4 atau lebih baru** (hampir semua hosting). Tidak perlu MySQL.
2. Upload **seluruh isi folder ini** ke `public_html` (atau subfolder, mis. `public_html/keuangan`) via **File Manager cPanel** atau **FTP**.
3. Pastikan folder **`data/` bisa ditulis** oleh server:
   - Di File Manager: klik kanan folder `data` → *Change Permissions* → **755**.
   - Jika muncul error saat menyimpan, ubah ke **775** (atau 777 sebagai jalan terakhir).
4. Buka alamat situs, contoh: `https://domainanda.com/` atau `https://domainanda.com/keuangan/`.
5. Selesai. Saat pertama dibuka:
   - klik **Pengaturan → Muat Data Demo** untuk mencoba dengan data contoh (30 santri, kas & iuran 3 bulan), atau
   - langsung isi: **Pengaturan** (profil & saldo awal) → **Data Santri** (isi kolom tagihan atau **Import Excel**) → **Jurnal Kas** (pilih nama santri → **centang tagihan yang belum terbayar, boleh lebih dari satu** → Entry; atau isi manual BKM/BKK sendiri) → mulai catat kas.

> Folder `data/` dilindungi `.htaccess` agar `db.json` tidak bisa diakses publik. Jika hosting Anda menonaktifkan `.htaccess`, pindahkan folder `data/` ke luar `public_html` dan sesuaikan path di `db.php`.

## 🗂️ Struktur Folder

```
public_html/
├── index.html        # Halaman aplikasi (SPA)
├── api.php           # Semua endpoint API (GET/POST/PUT/DELETE, body JSON)
├── db.php            # Helper database JSON (tidak bisa diakses langsung)
├── .htaccess         # Proteksi file sensitif + folder bot/
├── assets/
│   ├── style.css     # Tema hijau-keemasan, responsif, mode cetak
│   ├── app.js        # Logika semua halaman + modal
│   └── charts.js     # Grafik bar & donat (canvas, tanpa library)
├── bot/              # Bot WhatsApp Node.js (opsional — lihat bagian Bot WhatsApp)
│   ├── index.js      # QR/pairing + kirim antrean kwitansi & surat
│   ├── package.json
│   ├── .htaccess     # Ditolak akses web (berisi kredensial di sesi/)
│   └── sesi/         # Kredensial WhatsApp (dibuat otomatis)
└── data/
    ├── .htaccess     # Ditolak diakses langsung
    ├── db.json       # Database — dibuat otomatis saat pertama simpan
    ├── kwitansi/     # PNG kwitansi untuk lampiran bot (dibuat otomatis)
    └── surat/        # JPG surat tagihan untuk lampiran bot (dibuat otomatis)
```

## 📱 Bot WhatsApp (opsional)

Bot WA Web memproses **antrean kirim** dari tombol **Antre ke Bot** (Kwitansi & Surat Tagihan) serta **rekap tagihan** dari panel **Koneksi WA Bridge**: tiap 5 detik mengambil `GET api.php?p=kwitansi&act=antre&token=…`, mengirim teks + lampiran (PNG kwitansi / JPG surat) lalu menandai `selesai`/`gagal`. Login lewat **Pengaturan → Koneksi WA Bridge → Login / QR** (scan QR atau kode pairing 8 karakter).

**Syarat:** Node.js 18+ — bisa di **komputer lokal/VPS**, atau di **shared hosting yang menyediakan Node.js** (mis. cPanel *Setup Node.js App*, App Node, dkk).

**Langkah:**

1. Upload folder `bot/` ke hosting (atau pakai salinan lokal).
2. Jalankan `npm install` di folder `bot/` (terminal hosting atau lokal).
3. Atur environment:
   - `API_URL=https://domainanda.com/api.php` — alamat aplikasi (atau buat `bot/config.json` berisi `{ "api_url": "…" }`)
   - `PORT=<port yang diberi host>` — **disarankan di shared hosting**: bot membuka server status sederhana di port tersebut (banyak host mewajibkan proses Node listen port agar dianggap hidup). `GET /` membalas JSON `{login, no, antre, api, waktu}`.
   - `WA_KEY=<kunci rahasia>` — **opsional**: bila diisi, server status hanya menerima request dengan header **`X-WA-Key`** yang sama. Isi kunci yang sama di kolom **Key Bridge** panel Pengaturan (aplikasi mengirimnya lewat server, bukan dari browser).
4. Jalankan `node index.js` (atau `npm start`) dan biarkan proses terus berjalan.
5. Buka **Pengaturan → Koneksi WA Bridge** → isi **URL Bridge** (`http://127.0.0.1:<PORT>` lokal/VPS, atau alamat yang diberi host) + **Key Bridge** → klik **Cek Status Bridge**, lalu scan QR di bagian **Login / QR** (WhatsApp → Perangkat tertaut → Tautkan perangkat), **atau** isi nomor telepon → **Minta Kode Pairing** → masukkan kode 8 karakter di HP (WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon).

**Catatan:**

- Kredensial WhatsApp ada di `bot/sesi/` — **jangan dibagikan**; kedua lapisan `.htaccess` (root & `bot/`) melarang folder `bot/` diakses via web.
- Saat **logout**, bot otomatis menghapus `bot/sesi/` lalu memulai ulang dirinya sendiri → QR baru tanpa perlu akses terminal.
- Token antrean dibuat otomatis saat pertama diminta (tampil di respons `p=kwitansi`) dan disimpan di `data/db.json`.
- Tanpa bot, tombol **WhatsApp (wa.me)** / **WhatsApp Web** tetap berfungsi — gambar dikirim manual dari hasil **unduh JPG/PNG**.

## 🔌 Ringkasan API (`api.php?p=...`)

- `p=pengaturan` — GET/PUT profil & saldo awal (termasuk `wa_bridge_url`, `wa_bridge_key` utk panel Koneksi WA Bridge)
- `p=kategori` — GET/POST; `&id=` DELETE
- `p=santri` — GET (`?q=&status=&kelas=`)/POST; `&id=` PUT/DELETE
- `p=santri&act=import` — POST `{rows[], overwrite}` import Excel (baris hasil parse)
- `p=kolom-custom` — GET/POST; `&id=` PUT/DELETE (kolom tagihan tambahan)
- `p=akun` — GET daftar **akun pemasukan** & **akun pengeluaran** (pilihan jurnal)
- `p=jurnal` — GET (`?dari=&sampai=&q=&jenis_transaksi=&arah=masuk|keluar`); `&act=next&arah=` nomor BKM/BKK berikutnya
- `p=jurnal` — POST entry `{arah:'masuk'|'keluar', akun, sumber_dana, nama, santri_id, …}` (otomatis buat transaksi kas — `nama`/`santri_id` pada kas keluar dipakai sebagai **penerima** untuk rekap mutasi per santri); **POST multi kas masuk** `{arah:'masuk', items:[{tagihan_id}, …]}` → satu BKM per tagihan + pembayaran iuran otomatis; `&id=` PUT/DELETE (sinkron kas & pembayaran iuran terkait)
- `p=jenis-tagihan` — GET/POST; `&id=` PUT/DELETE
- `p=transaksi` — buku kas internal (dipakai dashboard/laporan/saldo). GET (`?dari=&sampai=&jenis=&kategori_id=&q=`)/POST; `&id=` DELETE — pencatatan kas manual sekarang lewat **Jurnal Kas**
- `p=tagihan` — GET (`?periode=&periode_sampai=&status=&santri_id=&jenis_id=&q=`)
- `p=tagihan&act=generate` — POST `{periode, kolom[], santri_ids[]}` tagihan massal **dari kolom Data Santri**: nominal per santri dari kolomnya (grup bulanan `spp|infaq|laundry` → kolom bulan periode; kolom lain pakai key-nya), nilai ≤ 0 dilewati, duplikat tidak digandakan, jenis tagihan otomatis dibuat bila belum ada
- `p=tagihan&id=XXX&act=bayar` — POST bayar iuran → otomatis catat ke kas
- `p=pembayaran&id=XXX` — DELETE hapus pembayaran (ikut hapus transaksi kas terkait; bila pembayaran berasal dari jurnal BKM, baris jurnal & kas ikut tercabut)
- `p=dashboard` — GET ringkasan dashboard
- `p=mutasi` — GET (`?sub=uang-saku|tabungan|tagihan-lain&dari=&sampai=&q=&jenis_transaksi=&arah=masuk|keluar`) rincian mutasi per akun khusus: **saldo awal, saldo berjalan tiap baris, saldo akhir**, plus `per_santri[]` rekap **saldo akhir per santri** (saldo_awal/masuk/keluar/saldo) yang selalu menjumlah ke saldo akun
- `p=saldo-akun` — GET (`?dari=&sampai=`) rekap **saldo per akun pemasukan**: `list[]` {nama, saldo_awal, masuk, keluar, saldo_akhir} + total
- `p=saldo-bank` — GET kartu **Saldo Bank & Cash**: `banks[]` {kode, nama, saldo} (BRI/BSI/BPD), `cash`, `total`, `riwayat[]` tarik tunai; POST (`?act=tarik-tunai`, `{bank, tanggal, nominal, keterangan}`) **tarik tunai dari bank → cash** (ditolak bila melebihi saldo bank); `&id=` DELETE batalkan tarik tunai
- `p=surat-tagihan` — GET (`?santri_id=`) data surat tagihan: `santri`, `rows[]` {label, jenis, periode, nominal, dibayar, sisa, status} (hanya sisa > 0 — semua jenis ikut bila ada saldonya), `total`, `nomor` berikutnya; GET (`?act=riwayat`) **riwayat nomor terbit** (terbaru dulu, maks. 300); POST (`&act=terbit`, `{nomor, santri_id, nama, kelas, tanggal, lamp, hal, total}`) sinkronkan counter + **upsert riwayat** (nomor sama tidak digandakan); POST (`&act=kirim-wa`, `{nomor, no_hp, nama, pesan, gambar, total}`) simpan **JPG surat** ke `data/surat/` + antre kirim WhatsApp (pesan default memuat nomor surat)
- `p=kwitansi` — GET daftar BKM + `token` bot; GET (`&act=antre&token=`) antrean bot (isi: `tipe`, `ref`, `gambar_url` bila ada gambar); GET (`&act=gambar&token=&tipe=&ref=`) PNG kwitansi / **JPG surat** untuk bot (`&no_bkm=` tetap diterima); GET (`&act=riwayat`) riwayat kirim; GET (`&act=status-antre`) **hitungan antrean** utk panel Pengaturan (`counts` + `pending[]`); POST (`{act:'kirim-wa', no_bkm, no_hp, nama, pesan, gambar}`) antre kirim kwitansi; POST (`{act:'batal-antre'}`) batalkan semua pesan antre/proses; POST (`{act:'selesai'|'gagal', id, token, pesan}`) status dari bot
- `p=wa` — GET state login bot (`status`, `qr`, `kode`, `no`); GET (`&act=bridge`) **proxy status WA Bridge** (server mengambil `wa_bridge_url` + header `X-WA-Key` → `{ok, http, rtt_ms, data, error}`); POST (`{act:'qr'|'pair'|'kodepair'|'status'|'logout'}`) state QR/pairing; POST (`{act:'rekap', santri_ids[]|santri_id}` atau `{act:'rekap', semua:true}`) **antre pesan rekap tagihan** per santri (ringkasan sisa tagihan + total → No WA wali; mode `semua` hanya santri dengan sisa > 0 & punya No WA)
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
