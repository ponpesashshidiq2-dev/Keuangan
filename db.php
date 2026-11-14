<?php
/**
 * Aplikasi Keuangan Pondok Pesantren
 * Helper penyimpanan JSON — tanpa database, ramah shared hosting.
 */

function db_file(): string {
    return __DIR__ . '/data/db.json';
}

function db_default(): array {
    return [
        'pengaturan' => [
            'nama_pesantren' => 'Pondok Pesantren Ash-Shiddiq',
            'alamat'         => 'Jl. Raya Sukamaju No. 12, Bogor, Jawa Barat',
            'tahun_ajaran'   => '2025/2026',
            'saldo_awal'     => 5000000,
            'logo_teks'      => 'PP',
        ],
        'kategori'      => [],
        'santri'        => [],
        'kolom_custom'  => [],
        'jurnal'        => [],
        'jenis_tagihan' => [],
        'tagihan'       => [],
        'pembayaran'    => [],
        'transaksi'     => [],
        'tarik_tunai'   => [],     // riwayat penarikan tunai dari bank → cash (kartu Saldo Bank & Cash)
        'akun'          => [],     // akun pemasukan/pengeluaran tambahan & hasil rename bawaan: {id, jenis, nama, asli, aktif}
        'pengguna'      => [],     // akun login: admin & wali santri {id, peran, username, sandi, nama, santri_id, aktif}
        'sesi'          => [],     // sesi login aktif: token → {peran, pengguna_id, santri_id, kadaluarsa}
        'antre_wa'      => [],
        'surat_terbit'  => [],     // riwayat nomor surat tagihan yang diterbitkan
        'pembagian'     => [],     // riwayat pembagian uang saku kumulatif (+ file PDF di data/pembagian/)
        'kreditur'      => [],     // daftar nama kreditur (pihak yang dipinjami): {id, nama, catatan, dibuat}
        'guru'          => [],     // data guru & karyawan: {id, nama, jabatan, no_wa, gaji_pokok, tunjangan, insentif, potongan, aktif, dibuat, ubah}
        'gaji'          => [],     // batch pembayaran gaji per periode: {id, periode, tanggal, no_bkk, akun, sumber_dana, items[], total, dibuat} + slip JPG di data/gaji/
        'counters' => [
            'santri' => 0, 'transaksi' => 0, 'tagihan' => 0,
            'pembayaran' => 0, 'kategori' => 0, 'jenis_tagihan' => 0,
            'jurnal' => 0, 'kolom_custom' => 0, 'surat' => 0, 'tarik_tunai' => 0,
            'pembagian' => 0, 'pengguna' => 0, 'kreditur' => 0,
            'guru' => 0, 'gaji' => 0,
        ],
    ];
}

function db_load(): array {
    $f   = db_file();
    $dir = dirname($f);
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    if (file_exists($f)) {
        $j = json_decode((string)file_get_contents($f), true);
        if (is_array($j)) {
            $d = db_default();
            foreach ($j as $k => $v) { $d[$k] = $v; }
            foreach (db_default()['counters'] as $k => $v) {
                if (!isset($d['counters'][$k])) { $d['counters'][$k] = 0; }
            }
            return $d;
        }
    }
    return db_default();
}

function db_save(array $db): void {
    $f   = db_file();
    $dir = dirname($f);
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $json = json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $tmp  = $f . '.' . uniqid('', true) . '.tmp';
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('Folder data/ tidak bisa ditulis. Ubah permission folder data/ menjadi 755 atau 775.');
    }
    if (!@rename($tmp, $f)) {
        @copy($tmp, $f);
        @unlink($tmp);
    }
}

function uid(array &$db, string $prefix): string {
    $db['counters'][$prefix] = (int)($db['counters'][$prefix] ?? 0) + 1;
    return strtoupper(substr($prefix, 0, 3)) . '-' . str_pad((string)$db['counters'][$prefix], 5, '0', STR_PAD_LEFT);
}

function rupiah($n): string {
    return 'Rp ' . number_format((float)$n, 0, ',', '.');
}

/** Tanggal panjang Indonesia: 2026-11-02 → "2 November 2026" */
function tgl_panjang_id(string $tgl): string {
    $p = explode('-', $tgl);
    if (count($p) !== 3 || !checkdate((int)$p[1], (int)$p[2], (int)$p[0])) { return $tgl; }
    return (int)$p[2] . ' ' . bulan_nama()[(int)$p[1] - 1] . ' ' . $p[0];
}

/* ---------------------------------------------------------------
 * Kolom tagihan bawaan (Data Santri)
 * --------------------------------------------------------------- */
function bulan_nama(): array {
    return ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
}

function tagihan_kolom(): array {
    $bln   = bulan_nama();
    $kolom = [];
    foreach (['spp' => 'SPP', 'infaq' => 'Infaq Wajib', 'laundry' => 'Laundry Wajib'] as $pre => $nama) {
        for ($i = 1; $i <= 12; $i++) {
            $suf = str_pad((string)$i, 2, '0', STR_PAD_LEFT);
            $kolom[] = ['key' => $pre . '_' . $suf, 'nama' => $nama . ' ' . $bln[$i - 1], 'grup' => $pre, 'singkat' => $bln[$i - 1]];
        }
    }
    $lain = [
        'administrasi_awal'      => 'Administrasi Awal',
        'wakaf'                  => 'Wakaf',
        'daftar_ulang'           => 'Daftar Ulang',
        'tunggakan_spp'          => 'Tunggakan SPP',
        'tunggakan_infaq'        => 'Tunggakan Infaq Wajib',
        'tunggakan_laundry'      => 'Tunggakan Laundry Wajib',
        'tunggakan_daftar_ulang' => 'Tunggakan Daftar Ulang',
        'akhirusanah'            => 'Akhirusanah',
        'study_tour'             => 'Study Tour',
        'bimbel'                 => 'Bimbel',
        'rihlah'                 => 'Rihlah',
    ];
    foreach ($lain as $k => $n) {
        $kolom[] = ['key' => $k, 'nama' => $n, 'grup' => 'lainnya', 'singkat' => $n];
    }
    return $kolom;
}

/** Kolom kas khusus Data Santri — saldo awal per akun kas khusus + nominal pembagian uang saku */
function kas_khusus_kolom(): array {
    return [
        ['key' => 'saldo_awal_us',  'nama' => 'Saldo Awal Uang Saku',        'singkat' => 'Saldo Awal US',  'grup' => 'kas'],
        ['key' => 'saldo_awal_tab', 'nama' => 'Saldo Awal Tabungan',         'singkat' => 'Saldo Awal Tab', 'grup' => 'kas'],
        ['key' => 'saldo_awal_lain','nama' => 'Saldo Awal Tagihan Lain',     'singkat' => 'Saldo Awal Lain','grup' => 'kas'],
        ['key' => 'nominal_us',     'nama' => 'Nominal Pembagian Uang Saku', 'singkat' => 'Nominal Bagi',   'grup' => 'kas'],
    ];
}

/** Kunci kolom saldo awal utk sebuah akun kas khusus ('Uang Saku' → saldo_awal_us, …) */
function kas_khusus_saldo_awal_key(string $akun): string {
    $map = [
        'Uang Saku'         => 'saldo_awal_us',
        'Tabungan'          => 'saldo_awal_tab',
        'Tagihan Lain-lain' => 'saldo_awal_lain',
    ];
    return $map[$akun] ?? '';
}

/** Daftar jenis tagihan untuk jurnal = kolom bawaan + kolom custom bernilai angka */
function jenis_tagihan_list(array $db): array {
    $list = tagihan_kolom();
    foreach (($db['kolom_custom'] ?? []) as $c) {
        $list[] = ['key' => $c['key'], 'nama' => $c['nama'], 'grup' => 'custom', 'singkat' => $c['nama']];
    }
    return $list;
}

/** Nama jenis tagihan dari kolom Data Santri — kolom bulanan tanpa nama bulan (spp_11 → "SPP") */
function kolom_nama(string $key, array $db = []): string {
    if (preg_match('/^(spp|infaq|laundry)_\d{2}$/', $key, $m)) {
        return ['spp' => 'SPP', 'infaq' => 'Infaq Wajib', 'laundry' => 'Laundry Wajib'][$m[1]];
    }
    foreach (tagihan_kolom() as $k) { if ($k['key'] === $key) { return $k['nama']; } }
    foreach (($db['kolom_custom'] ?? []) as $c) { if ((string)$c['key'] === $key) { return (string)$c['nama']; } }
    return $key;
}

/** Kunci pemetaan kolom → jenis_tagihan; kolom bulanan dikelompokkan (spp_11 → spp) */
function kolom_map_key(string $key): string {
    if (preg_match('/^(spp|infaq|laundry)_\d{2}$/', $key, $m)) { return $m[1]; }
    return $key;
}

/** Jenis tagihan untuk sebuah kolom Data Santri — pakai yang sudah cocok, bila belum ada buat baru */
function jenis_untuk_kolom(array &$db, string $key): string {
    $mapKey = kolom_map_key($key);
    $nama   = kolom_nama($key, $db);
    foreach ($db['jenis_tagihan'] as $j) {
        if ((string)($j['key'] ?? '') === $mapKey) { return (string)$j['id']; }
    }
    foreach ($db['jenis_tagihan'] as $j) {
        if (strtolower((string)($j['nama'] ?? '')) === strtolower($nama)) { return (string)$j['id']; }
    }
    $id = uid($db, 'jenis_tagihan');
    $db['jenis_tagihan'][] = ['id' => $id, 'nama' => $nama, 'nominal' => 0.0, 'aktif' => true, 'key' => $mapKey];
    return $id;
}

/** Jenis tagihan berdasarkan nama — pakai yang sudah cocok, bila belum ada buat baru */
function jenis_tagihan_untuk_nama(array &$db, string $nama, string $key = ''): string {
    foreach ($db['jenis_tagihan'] as $j) {
        if (strtolower((string)($j['nama'] ?? '')) === strtolower($nama)) { return (string)$j['id']; }
    }
    $id = uid($db, 'jenis_tagihan');
    $db['jenis_tagihan'][] = [
        'id'      => $id,
        'nama'    => $nama,
        'nominal' => 0.0,
        'aktif'   => true,
        'key'     => $key !== '' ? $key : strtolower(str_replace(' ', '_', $nama)),
    ];
    return $id;
}

/** Id jenis_tagihan yang cocok dengan daftar kolom Data Santri — tanpa membuat jenis baru */
function jenis_ids_untuk_kolom(array $db, array $kolom): array {
    $ids = [];
    foreach ($kolom as $key) {
        $key    = (string)$key;
        $mapKey = kolom_map_key($key);
        $nama   = strtolower(kolom_nama($key, $db));
        foreach ($db['jenis_tagihan'] as $j) {
            if ((string)($j['key'] ?? '') === $mapKey || strtolower((string)($j['nama'] ?? '')) === $nama) {
                $ids[(string)$j['id']] = true;
            }
        }
    }
    return array_keys($ids);
}

/** Akun pemasukan BAWAAN — pilihan pada jurnal kas masuk */
function akun_pemasukan_bawaan(): array {
    return [
        'Administrasi', 'SPP', 'Infaq Wajib', 'Laundry Wajib', 'Wakaf', 'Tunggakan SPP',
        'Daftar Ulang', 'Infaq & Shodaqoh', 'Tunggakan Infaq Wajib', 'Tunggakan Daftar Ulang',
        'SPP TPA', 'Ifthor', 'CashBack', 'Dana UPJ', 'Dana BOS', 'Dana Lazis',
        'Akhirussanah', 'Pengembangan pendidikan', 'Hutang', 'Zakat Mal', 'Pendaftaran',
        'Peralatan Santri Baru', 'Kalender', 'Selisih Kas', 'Tunggakan Laundry Wajib',
        'Study Tour', 'Bimbel', 'Zakat Fitrah', 'Rihlah', 'Wakaf Masjid', 'Qurban', 'Orang Tua Asuh',
        'Uang Saku', 'Tabungan', 'Tagihan Lain-lain',
    ];
}

/** Akun pengeluaran BAWAAN — pilihan pada jurnal kas keluar */
function akun_pengeluaran_bawaan(): array {
    return [
        'Biaya Insentif Guru dan Karyawan', 'Biaya Listrik', 'Biaya Angsuran Hutang',
        'Biaya Konsumsi Santri', 'Biaya Konsumsi Tamu', 'Biaya Konsumsi Guru',
        'Biaya Transport', 'Biaya Perlengkapan', 'Biaya Dana Sosial', 'Biaya Peralatan',
        'Biaya Bahan Bangunan', 'Biaya Bensin', 'Biaya Iuran', 'Biaya Service',
        'Dana dibantukan/Hibahkan', 'Biaya Konsumsi Buka Puasa', 'Biaya Pembelian Buku',
        'Penyesuaian', 'Biaya Pajak', 'Biaya Administrasi', 'Biaya P3K', 'Biaya Tukang',
        'Biaya Penunjang Pembelajaran', 'Biaya Sewa', 'Biaya Iklan', 'Biaya Jasa',
        'Biaya Renovasi', 'Biaya FotoCopy', 'Biaya Air', 'Biaya Kain/Seragam',
        'Biaya Hadiah', 'Biaya Kegiatan Santri', 'Biaya Cetak', 'Biaya Pulsa/Data',
        'Biaya Lain-lain', 'Setor ke Pondok', 'Konsumsi Rapat', 'Biaya Kebersihan',
        'Pembagian Uang Saku', 'Penarikan Tabungan', 'Pengembalian Tagihan Lain-lain',
        'Tarik Tunai Kas Khusus',
    ];
}

/** Akun sistem — terkait kolom saldo awal kas khusus santri & preset: tidak boleh diubah/dihapus */
function akun_sistem(): array {
    return ['Uang Saku', 'Tabungan', 'Tagihan Lain-lain',
            'Pembagian Uang Saku', 'Penarikan Tabungan', 'Pengembalian Tagihan Lain-lain'];
}

/** Nama bawaan yang menjadi sasaran pemetaan tagihan iuran → tidak boleh dihapus
    (pembayaran tagihan akan kehilangan akunnya bila dihapus) */
function akun_terikat_tagihan(): array {
    return [
        'SPP', 'Infaq Wajib', 'Laundry Wajib', 'Administrasi', 'Wakaf', 'Daftar Ulang',
        'Tunggakan SPP', 'Tunggakan Infaq Wajib', 'Tunggakan Laundry Wajib', 'Tunggakan Daftar Ulang',
        'Akhirussanah', 'Study Tour', 'Bimbel', 'Rihlah', 'Pendaftaran', 'Zakat Mal', 'Ifthor',
        'Tagihan Lain-lain',
    ];
}

/** Peta nama bawaan → nama kini (hasil rename) — dipakai frontend utk pemetaan tagihan */
function akun_peta(array $db): array {
    $p = [];
    foreach (($db['akun'] ?? []) as $a) {
        $asli = trim((string)($a['asli'] ?? ''));
        if ($asli !== '' && (bool)($a['aktif'] ?? true)) { $p[$asli] = (string)$a['nama']; }
    }
    return $p;
}

/** Cari rekaman akun berdasarkan nama asli bawaan (null bila tak ada) */
function akun_cari_asli(array $db, string $asli): ?array {
    foreach (($db['akun'] ?? []) as $a) {
        if ((string)($a['asli'] ?? '') !== '' && (string)$a['asli'] === $asli) { return $a; }
    }
    return null;
}

/** Nama akun kini utk satu nama bawaan (rename) — $db kosong → nama bawaan apa adanya */
function akun_resolve(array $db, string $namaBawaan): string {
    if ($namaBawaan === '' || empty($db)) { return $namaBawaan; }
    $r = akun_cari_asli($db, $namaBawaan);
    if ($r && (bool)($r['aktif'] ?? true) && trim((string)($r['nama'] ?? '')) !== '') { return (string)$r['nama']; }
    return $namaBawaan;
}

/** Akun pemasukan — bawaan (terapkan rename, buang yang dihapus) + akun baru dari Pengaturan */
function akun_pemasukan_list(array $db = []): array {
    $out = [];
    foreach (akun_pemasukan_bawaan() as $a) {
        $r = !empty($db) ? akun_cari_asli($db, $a) : null;
        if ($r && !($r['aktif'] ?? true)) { continue; }          // bawaan dihapus
        $out[] = ($r && trim((string)($r['nama'] ?? '')) !== '') ? (string)$r['nama'] : $a;
    }
    foreach (($db['akun'] ?? []) as $r) {
        if ((string)($r['asli'] ?? '') !== '') { continue; }      // rekaman bawaan (sudah di atas)
        if (!($r['aktif'] ?? true)) { continue; }
        $n = trim((string)($r['nama'] ?? ''));
        if ($n !== '') { $out[] = $n; }
    }
    return $out;
}

/** Akun pengeluaran — bawaan (terapkan rename, buang yang dihapus) + akun baru dari Pengaturan */
function akun_pengeluaran_list(array $db = []): array {
    $out = [];
    foreach (akun_pengeluaran_bawaan() as $a) {
        $r = !empty($db) ? akun_cari_asli($db, $a) : null;
        if ($r && !($r['aktif'] ?? true)) { continue; }
        $out[] = ($r && trim((string)($r['nama'] ?? '')) !== '') ? (string)$r['nama'] : $a;
    }
    foreach (($db['akun'] ?? []) as $r) {
        if ((string)($r['asli'] ?? '') !== '') { continue; }
        if (!($r['aktif'] ?? true)) { continue; }
        $n = trim((string)($r['nama'] ?? ''));
        if ($n !== '') { $out[] = $n; }
    }
    return $out;
}


/** Saran akun pemasukan dari key tagihan (mis. spp_11 → SPP) */
function akun_dari_tagihan(string $key, array $db = []): string {
    if ($key === '') { return ''; }
    if (preg_match('/^(spp|infaq|laundry)_\d{2}$/', $key, $m)) {
        return akun_resolve($db, ['spp' => 'SPP', 'infaq' => 'Infaq Wajib', 'laundry' => 'Laundry Wajib'][$m[1]]);
    }
    $map = [
        'administrasi_awal' => 'Administrasi', 'wakaf' => 'Wakaf', 'daftar_ulang' => 'Daftar Ulang',
        'tunggakan_spp' => 'Tunggakan SPP', 'tunggakan_infaq' => 'Tunggakan Infaq Wajib',
        'tunggakan_laundry' => 'Tunggakan Laundry Wajib', 'tunggakan_daftar_ulang' => 'Tunggakan Daftar Ulang',
        'akhirusanah' => 'Akhirussanah', 'study_tour' => 'Study Tour', 'bimbel' => 'Bimbel', 'rihlah' => 'Rihlah',
        'tagihan_lain' => 'Tagihan Lain-lain',
    ];
    if (isset($map[$key])) { return akun_resolve($db, $map[$key]); }
    $nama = $key;
    foreach (($db['kolom_custom'] ?? []) as $c) {
        if ($c['key'] === $key) { $nama = (string)$c['nama']; break; }
    }
    $kini = akun_pemasukan_list($db);
    foreach ($kini as $a) {
        if (strtolower($a) === strtolower($nama)) { return $a; }
    }
    return '';
}

/** Saran akun pemasukan dari nama jenis iuran (mis. "Uang Sekolah" → SPP) */
function akun_dari_jenis_iuran(string $nama, array $db = []): string {
    $n = strtolower(trim($nama));
    if ($n === '') { return ''; }
    foreach (akun_pemasukan_list($db) as $a) {
        if (strtolower($a) === $n) { return $a; }
    }
    $map = [
        'sekolah' => 'SPP', 'spp' => 'SPP',
        'infaq' => 'Infaq Wajib', 'infak' => 'Infaq Wajib',
        'laundry' => 'Laundry Wajib', 'bimbel' => 'Bimbel',
        'wakaf' => 'Wakaf', 'waqaf' => 'Wakaf',
        'study tour' => 'Study Tour', 'rihlah' => 'Rihlah',
        'akhirusanah' => 'Akhirussanah', 'akhirussanah' => 'Akhirussanah',
        'daftar ulang' => 'Daftar Ulang', 'pendaftaran' => 'Pendaftaran',
        'administrasi' => 'Administrasi', 'zakat' => 'Zakat Mal',
        'tunggakan' => 'Tunggakan SPP', 'makan' => 'Ifthor',
        'tagihan lain' => 'Tagihan Lain-lain',
    ];
    foreach ($map as $k => $akun) {
        if (strpos($n, $k) !== false) { return akun_resolve($db, $akun); }
    }
    return '';
}

/** Lengkapi record santri: field wajib + tagihan default + kolom custom */
function santri_bersih(array $s, array $db = []): array {
    $out = [
        'id'     => (string)($s['id'] ?? ''),
        'no'     => (int)($s['no'] ?? 0),
        'nis'    => (string)($s['nis'] ?? ''),
        'nama'   => (string)($s['nama'] ?? ''),
        'kelas'  => (string)($s['kelas'] ?? '-'),
        'no_wa'  => (string)($s['no_wa'] ?? ($s['telepon'] ?? '')),
        'status' => (string)($s['status'] ?? 'aktif'),
        'asrama' => (string)($s['asrama'] ?? '-'),
        'custom' => is_array($s['custom'] ?? null) ? $s['custom'] : [],
        'dibuat' => (string)($s['dibuat'] ?? ''),
    ];
    foreach (tagihan_kolom() as $k) {
        $out[$k['key']] = (float)($s[$k['key']] ?? 0);
    }
    foreach (kas_khusus_kolom() as $k) {
        $out[$k['key']] = (float)($s[$k['key']] ?? 0);
    }
    if (!empty($db)) {
        foreach (($db['kolom_custom'] ?? []) as $c) {
            if (!isset($out['custom'][$c['key']])) { $out['custom'][$c['key']] = 0; }
        }
    }
    return $out;
}

/** Total seluruh tagihan seorang santri (kolom bawaan + custom angka) */
function santri_total_tagihan(array $s, array $db): float {
    $total = 0.0;
    foreach (tagihan_kolom() as $k) { $total += (float)($s[$k['key']] ?? 0); }
    foreach (($db['kolom_custom'] ?? []) as $c) {
        $total += (float)($s['custom'][$c['key']] ?? 0);
    }
    return $total;
}

/** Nilai satu jenis tagihan milik santri */
function santri_nilai_tagihan(array $s, string $jenisKey, array $db): float {
    foreach (tagihan_kolom() as $k) {
        if ($k['key'] === $jenisKey) { return (float)($s[$jenisKey] ?? 0); }
    }
    return (float)($s['custom'][$jenisKey] ?? 0);
}

/** Nomor BKM: BKM/TAHUN/0001 — $terbitkan=true menaikkan counter */
function bkm_nomor(array &$db, bool $terbitkan = false): string {
    $y   = date('Y');
    $key = 'bkm_' . $y;
    $n   = (int)($db['counters'][$key] ?? 0) + 1;
    if ($terbitkan) { $db['counters'][$key] = $n; }
    return 'BKM/' . $y . '/' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

/** Seri BKK dari sumber dana kas khusus: 'Uang Saku'→US, 'Tabungan'→TAB,
    'Tagihan Lain-lain'→TL, selain itu → seri biasa (string kosong) */
function bkk_seri(string $sumber): string {
    $map = ['Uang Saku' => 'US', 'Tabungan' => 'TAB', 'Tagihan Lain-lain' => 'TL'];
    return $map[trim($sumber)] ?? '';
}

/** Nomor BKK (bukti pengeluaran kas): BKK/TAHUN/0001 — kas khusus bernomor terpisah
    per akun: BKK/US/2026/0001, BKK/TAB/2026/0001, BKK/TL/2026/0001 ($terbitkan=true menaikkan counter) */
function bkk_nomor(array &$db, bool $terbitkan = false, string $sumber = ''): string {
    $y    = date('Y');
    $seri = bkk_seri($sumber);
    $key  = 'bkk_' . ($seri !== '' ? strtolower($seri) . '_' : '') . $y;
    $n    = (int)($db['counters'][$key] ?? 0) + 1;
    if ($terbitkan) { $db['counters'][$key] = $n; }
    return 'BKK/' . ($seri !== '' ? $seri . '/' : '') . $y . '/' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

/** Seri sebuah nomor BKK: 'US' | 'TAB' | 'TL' | '' (seri biasa) — '' bila bukan nomor BKK */
function bkk_seri_dari_nomor(string $no): string {
    if (preg_match('/^BKK\/(US|TAB|TL)\/\d{4}\/\d+$/', trim($no), $m)) { return $m[1]; }
    if (preg_match('/^BKK\/\d{4}\/\d+$/', trim($no))) { return ''; }
    return '';
}

/** Sinkronkan counter dgn nomor BKM/BKK eksplisit hasil ketikan user —
    mencegah nomor berikutnya bentrok/berulang dengan nomor yang sudah dipakai */
function nomor_sinkron(array &$db, string $no): void {
    if (!preg_match('/^(BKM|BKK(?:\/US|\/TAB|\/TL)?)\/(\d{4})\/(\d+)$/', trim($no), $m)) { return; }
    $key = strtolower(str_replace('/', '_', $m[1])) . '_' . $m[2];
    $n   = (int)$m[3];
    if ($n > (int)($db['counters'][$key] ?? 0)) { $db['counters'][$key] = $n; }
}

/** Nomor Surat Tagihan: B-3/PP-ASHSH/01/XII/2026 — $terbitkan=true menaikkan counter */
function surat_tagihan_nomor(array &$db, bool $terbitkan = false): string {
    $y   = date('Y');
    $key = 'surat_tagihan_' . $y;
    $n   = (int)($db['counters'][$key] ?? 0) + 1;
    if ($terbitkan) { $db['counters'][$key] = $n; }
    $rom = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][(int)date('n') - 1];
    return 'B-3/PP-ASHSH/' . str_pad((string)$n, 2, '0', STR_PAD_LEFT) . '/' . $rom . '/' . $y;
}

/** Sinkronkan counter surat tagihan dari nomor hasil ketikan user (…/NN/ROMAN/YYYY) */
function surat_tagihan_sinkron(array &$db, string $no): void {
    if (!preg_match('/\/(\d{1,4})\/[IVX]+\/(\d{4})$/', trim($no), $m)) { return; }
    $key = 'surat_tagihan_' . $m[2];
    $n   = (int)$m[1];
    if ($n > (int)($db['counters'][$key] ?? 0)) { $db['counters'][$key] = $n; }
}

/** Label tagihan: "SPP September" — nama jenis + nama bulan utk periode bulanan */
function tagihan_label($jn, string $periode): string {
    $namaJenis = $jn ? (string)$jn['nama'] : 'Tagihan';
    $label = $namaJenis;
    $keyJenis = $jn ? (string)($jn['key'] ?? '') : '';
    $bulanKunci  = ['spp', 'infaq', 'laundry'];
    $namaBulanan = ['SPP', 'Infaq Wajib', 'Laundry Wajib'];
    $iBulan = array_search($keyJenis, $bulanKunci, true);
    if ($iBulan === false) { $iBulan = array_search($namaJenis, $namaBulanan, true); }
    if ($iBulan !== false && preg_match('/^\d{4}-(\d{2})$/', $periode, $m)) {
        $label .= ' ' . bulan_nama()[(int)$m[1] - 1];
    }
    return $label;
}

/** Kategori pemasukan untuk jurnal — dibuat bila belum ada */
function kategori_jurnal(array &$db): array {
    foreach ($db['kategori'] as $k) {
        if ($k['nama'] === 'Jurnal Pemasukan' && $k['jenis'] === 'masuk') { return $k; }
    }
    $k = ['id' => uid($db, 'kategori'), 'nama' => 'Jurnal Pemasukan', 'jenis' => 'masuk', 'warna' => '#0ea5e9'];
    $db['kategori'][] = $k;
    return $k;
}

/** Kategori pengeluaran untuk jurnal keluar — dibuat bila belum ada */
function kategori_jurnal_keluar(array &$db): array {
    foreach ($db['kategori'] as $k) {
        if ($k['nama'] === 'Jurnal Pengeluaran' && $k['jenis'] === 'keluar') { return $k; }
    }
    $k = ['id' => uid($db, 'kategori'), 'nama' => 'Jurnal Pengeluaran', 'jenis' => 'keluar', 'warna' => '#f43f5e'];
    $db['kategori'][] = $k;
    return $k;
}

function hitung_saldo(array $db): array {
    $awal  = (float)($db['pengaturan']['saldo_awal'] ?? 0);
    $masuk = 0.0;
    $keluar = 0.0;
    foreach ($db['transaksi'] as $t) {
        if (($t['jenis'] ?? '') === 'masuk') { $masuk += (float)$t['jumlah']; }
        else { $keluar += (float)$t['jumlah']; }
    }
    return [
        'saldo_awal'   => $awal,
        'total_masuk'  => $masuk,
        'total_keluar' => $keluar,
        'saldo'        => $awal + $masuk - $keluar,
    ];
}

/**
 * Saldo per kanal untuk kartu "Saldo Bank & Cash" (menu Saldo Akun Pemasukan).
 * Bank (BRI/BSI/BPD) = mutasi jurnal sesuai jenis_transaksi (masuk − keluar)
 *                      dikurangi seluruh tarik tunai dari bank tersebut.
 * Cash = saldo kas total (hitung_saldo) − total saldo seluruh bank,
 *        sehingga kas non-jurnal ikut terhitung & jumlah 4 kartu = Saldo Kas.
 * Tarik tunai tidak ditransaksikan ke kas — hanya memindahkan bank → cash,
 * jadi total kas tidak berubah.
 */
function saldo_bank_cash(array $db): array {
    $kanal = ['BRI' => 0.0, 'BSI' => 0.0, 'BPD' => 0.0];
    foreach ($db['jurnal'] as $x) {
        $jt = (string)($x['jenis_transaksi'] ?? '');
        if (!isset($kanal[$jt])) { continue; }   // Cas & lainnya → cash
        $n = (float)($x['nominal'] ?? 0);
        $kanal[$jt] += (($x['arah'] ?? 'masuk') === 'keluar') ? -$n : $n;
    }
    foreach (($db['tarik_tunai'] ?? []) as $t) {
        $b = (string)($t['bank'] ?? '');
        if (isset($kanal[$b])) { $kanal[$b] -= (float)($t['nominal'] ?? 0); }
    }
    $total = (float)hitung_saldo($db)['saldo'];
    $bank  = $kanal['BRI'] + $kanal['BSI'] + $kanal['BPD'];
    return [
        'BRI'   => $kanal['BRI'],
        'BSI'   => $kanal['BSI'],
        'BPD'   => $kanal['BPD'],
        'Cas'   => $total - $bank,
        'total' => $total,
    ];
}

function tagihan_sisa(array $db, array $tagihan): float {
    $bayar = 0.0;
    foreach ($db['pembayaran'] as $p) {
        if (($p['tagihan_id'] ?? '') === $tagihan['id']) { $bayar += (float)$p['jumlah']; }
    }
    return max(0, (float)$tagihan['nominal'] - $bayar);
}

function tagihan_status(array $db, array $tagihan): string {
    $nominal = (float)$tagihan['nominal'];
    $dibayar = $nominal - tagihan_sisa($db, $tagihan);
    if ($dibayar <= 0) { return 'belum'; }
    if ($dibayar >= $nominal) { return 'lunas'; }
    return 'sebagian';
}

function kategori_map(array $db): array {
    $m = [];
    foreach ($db['kategori'] as $k) { $m[$k['id']] = $k; }
    return $m;
}

function find_by_id(array $list, string $id) {
    foreach ($list as $x) { if (($x['id'] ?? '') === $id) { return $x; } }
    return null;
}

function ringkas_tagihan(array $db, array $t): array {
    $s = find_by_id($db['santri'], $t['santri_id']);
    $j = find_by_id($db['jenis_tagihan'], $t['jenis_id']);
    $riwayat = [];
    $totalBayar = 0.0;
    foreach ($db['pembayaran'] as $p) {
        if (($p['tagihan_id'] ?? '') === $t['id']) {
            $riwayat[]  = $p;
            $totalBayar += (float)$p['jumlah'];
        }
    }
    usort($riwayat, function ($a, $b) { return strcmp($b['tanggal'] ?? '', $a['tanggal'] ?? ''); });
    $sisa = tagihan_sisa($db, $t);
    return array_merge($t, [
        'nama_santri' => $s ? $s['nama'] : '(dihapus)',
        'nis'         => $s ? $s['nis'] : '-',
        'kelas'       => $s ? $s['kelas'] : '-',
        'jenis'       => $j ? $j['nama'] : '-',
        'total_bayar' => $totalBayar,
        'sisa'        => $sisa,
        'status'      => tagihan_status($db, $t),
        'riwayat'     => $riwayat,
    ]);
}

/* ---------------------------------------------------------------
 * Data demo — 30 santri, kas & iuran 3 bulan terakhir
 * --------------------------------------------------------------- */
function seed_demo(): array {
    $db = db_default();
    $y  = (int)date('Y');
    $m  = (int)date('n') - 1; // 0-11 seperti JavaScript

    $katDefs = [
        ['Sumbangan', 'masuk', '#16a34a'],
        ['Bazar / Kegiatan', 'masuk', '#0ea5e9'],
        ['Iuran Santri', 'masuk', '#22c55e'],
        ['Zakat / Infaq', 'masuk', '#84cc16'],
        ['Makan Santri', 'keluar', '#ef4444'],
        ['Gaji Pengajar', 'keluar', '#f97316'],
        ['Operasional', 'keluar', '#eab308'],
        ['Sarana & Prasarana', 'keluar', '#a855f7'],
        ['Kegiatan Santri', 'keluar', '#ec4899'],
    ];
    foreach ($katDefs as $kd) {
        $db['kategori'][] = ['id' => uid($db, 'kategori'), 'nama' => $kd[0], 'jenis' => $kd[1], 'warna' => $kd[2]];
    }
    $katIuranId = $db['kategori'][2]['id'];

    $asrama = ['Asrama Al-Fatih', 'Asrama Al-Hikmah', 'Asrama An-Nur', 'Asrama Ar-Rahman'];
    $kelas  = ['TMI 1', 'TMI 2', 'TMI 3', 'TMI 4', 'MTs 1', 'MTs 2', 'MA 1', 'MA 2'];
    $nama = [
        'Ahmad Fauzi', 'Muhammad Rizki', 'Abdul Rahman', 'Yusuf Maulana', 'Hafidz Alfarizi',
        'Zainal Abidin', 'Umar Said', 'Hamzah Ridwan', 'Bilal Hakim', 'Farhan Nugroha',
        'Ikhwan Setiawan', 'Rasyid Pratama', 'Galih Ramadhan', 'Ilham Maulana', 'Ridwan Kamil',
        'Deni Hermawan', 'Fajar Nurcahyo', 'Andi Saputra', 'Bagus Wicaksono', 'Chandra Kirana',
        'Dzikri Ramadhan', 'Eko Prasetyo', 'Faisal Hakim', 'Ghali Izuddin', 'Hasan Basri',
        'Irfan Hakim', 'Jamal Mirdad', 'Lukman Hakim', 'Mansur Shiddiq', 'Naufal Rasyid',
    ];
    foreach ($nama as $i => $n) {
        $s = [
            'id'      => uid($db, 'santri'),
            'no'      => $i + 1,
            'nis'     => '25' . str_pad((string)($i + 1), 4, '0', STR_PAD_LEFT),
            'nama'    => $n,
            'kelas'   => $kelas[$i % count($kelas)],
            'no_wa'   => '08' . substr((string)(1200000000 + $i * 137), 0, 10),
            'telepon' => '08' . substr((string)(1200000000 + $i * 137), 0, 10),
            'asrama'  => $asrama[$i % count($asrama)],
            'status'  => $i < 26 ? 'aktif' : 'cuti',
            'custom'  => [],
            'dibuat'  => date('c', mktime(0, 0, 0, $m + 1, 1, $y)),
        ];
        // tagihan bulanan contoh: 3 bulan terakhir (termasuk bulan ini)
        $bulanIni = (int)date('n');
        for ($b = max(1, $bulanIni - 2); $b <= $bulanIni; $b++) {
            $suf = str_pad((string)$b, 2, '0', STR_PAD_LEFT);
            $s['spp_' . $suf]     = 650000;
            $s['infaq_' . $suf]   = 150000;
            $s['laundry_' . $suf] = 50000;
        }
        $s['administrasi_awal'] = 250000;
        $s['daftar_ulang']      = 300000;
        if ($i % 5 === 0) { $s['tunggakan_spp'] = 650000; }
        if ($i % 7 === 0) { $s['wakaf'] = 100000; $s['study_tour'] = 200000; }
        if ($i % 4 === 0) { $s['bimbel'] = 350000; $s['rihlah'] = 150000; $s['akhirusanah'] = 500000; }
        $db['santri'][] = $s;
    }

    $db['jenis_tagihan'] = [
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Makan', 'nominal' => 400000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Sekolah', 'nominal' => 250000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Kegiatan', 'nominal' => 100000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Asrama', 'nominal' => 150000, 'aktif' => true],
    ];

    // 3 periode terakhir
    $periodes = [];
    for ($i = 2; $i >= 0; $i--) {
        $periodes[] = date('Y-m', mktime(0, 0, 0, $m - $i + 1, 1, $y));
    }
    $aktif = array_values(array_filter($db['santri'], function ($s) { return $s['status'] === 'aktif'; }));
    foreach ($periodes as $p) {
        foreach ($aktif as $s) {
            foreach ($db['jenis_tagihan'] as $jt) {
                $db['tagihan'][] = [
                    'id'        => uid($db, 'tagihan'),
                    'santri_id' => $s['id'],
                    'periode'   => $p,
                    'jenis_id'  => $jt['id'],
                    'nominal'   => $jt['nominal'],
                    'dibuat'    => date('c'),
                ];
            }
        }
    }

    // periode paling lama: lunas; periode tengah: setengah dibayar
    foreach ($db['tagihan'] as $t) {
        if ($t['periode'] === $periodes[0]) {
            $s = find_by_id($db['santri'], $t['santri_id']);
            $db['pembayaran'][] = [
                'id' => uid($db, 'pembayaran'), 'tagihan_id' => $t['id'],
                'tanggal' => $periodes[0] . '-05', 'jumlah' => $t['nominal'],
                'metode' => 'Tunai', 'petugas' => 'Bendahara', 'keterangan' => 'Lunas',
            ];
            $db['transaksi'][] = [
                'id' => uid($db, 'transaksi'), 'tanggal' => $periodes[0] . '-05', 'jenis' => 'masuk',
                'kategori_id' => $katIuranId, 'jumlah' => $t['nominal'],
                'keterangan' => 'Iuran ' . $periodes[0] . ' - ' . ($s ? $s['nama'] : ''),
                'ref' => $t['id'], 'dibuat' => date('c'),
            ];
        } elseif ($t['periode'] === $periodes[1]) {
            $s   = find_by_id($db['santri'], $t['santri_id']);
            $jml = (int)(round($t['nominal'] / 2 / 5000) * 5000);
            $db['pembayaran'][] = [
                'id' => uid($db, 'pembayaran'), 'tagihan_id' => $t['id'],
                'tanggal' => $periodes[1] . '-10', 'jumlah' => $jml,
                'metode' => 'Transfer', 'petugas' => 'Bendahara', 'keterangan' => 'Angsuran',
            ];
            $db['transaksi'][] = [
                'id' => uid($db, 'transaksi'), 'tanggal' => $periodes[1] . '-10', 'jenis' => 'masuk',
                'kategori_id' => $katIuranId, 'jumlah' => $jml,
                'keterangan' => 'Iuran ' . $periodes[1] . ' - ' . ($s ? $s['nama'] : ''),
                'ref' => $t['id'], 'dibuat' => date('c'),
            ];
        }
    }

    // transaksi operasional manual
    $manual = [
        [0, 3, 'keluar', 'Makan Santri', 12500000, 'Belanja beras & lauk mingguan'],
        [0, 6, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [0, 9, 'keluar', 'Operasional', 1250000, 'Listrik & air'],
        [0, 12, 'masuk', 'Sumbangan', 15000000, 'Donatur H. Sofyan'],
        [0, 15, 'keluar', 'Sarana & Prasarana', 3500000, 'Renovasi kamar mandi'],
        [0, 20, 'masuk', 'Sumbangan', 45000000, 'Waqaf Keluarga H. Abdurrahman'],
        [1, 2, 'keluar', 'Makan Santri', 11800000, 'Belanja beras & lauk mingguan'],
        [1, 5, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [1, 8, 'masuk', 'Zakat / Infaq', 12500000, 'Infaq jamaah Jumat & donatur kecil'],
        [1, 14, 'keluar', 'Kegiatan Santri', 2200000, 'Lomba keagamaan'],
        [1, 20, 'masuk', 'Bazar / Kegiatan', 8600000, 'Bazar Ramadhan pesantren'],
        [2, 2, 'keluar', 'Makan Santri', 13200000, 'Belanja beras & lauk mingguan'],
        [2, 5, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [2, 11, 'keluar', 'Operasional', 980000, 'Perlengkapan dapur'],
        [2, 18, 'masuk', 'Sumbangan', 30000000, 'Donatur Yayasan Al-Ihsan'],
        [2, 22, 'keluar', 'Sarana & Prasarana', 6400000, 'Perbaikan atap aula'],
    ];
    foreach ($manual as $mn) {
        $ds  = date('Y-m-d', mktime(0, 0, 0, $m - $mn[0] + 1, $mn[1], $y));
        $kid = null;
        foreach ($db['kategori'] as $k) { if ($k['nama'] === $mn[3]) { $kid = $k['id']; break; } }
        $db['transaksi'][] = [
            'id' => uid($db, 'transaksi'), 'tanggal' => $ds, 'jenis' => $mn[2],
            'kategori_id' => $kid, 'jumlah' => $mn[4], 'keterangan' => $mn[5], 'dibuat' => date('c'),
        ];
    }
    // jurnal pemasukan contoh
    $katJurnal  = kategori_jurnal($db);
    $jenisList  = jenis_tagihan_list($db);
    $metodeSeed = ['Cas', 'BRI', 'BSI', 'BPD'];
    $bulanTag   = str_pad((string)max(1, (int)date('n')), 2, '0', STR_PAD_LEFT);
    for ($ji = 0; $ji < 8; $ji++) {
        $s   = $db['santri'][$ji];
        $key = ['spp_' . $bulanTag, 'infaq_' . $bulanTag, 'daftar_ulang', 'bimbel'][$ji % 4];
        $nilai = santri_nilai_tagihan($s, $key, $db);
        if ($nilai <= 0) { $nilai = 50000; }
        $label = $key;
        foreach ($jenisList as $jl) { if ($jl['key'] === $key) { $label = $jl['nama']; break; } }
        $no = bkm_nomor($db, true);
        $tg = date('Y-m-d', mktime(0, 0, 0, $m + 1, min(25, $ji * 3 + 2), $y));
        $j  = [
            'id'             => uid($db, 'jurnal'),
            'tanggal'        => $tg,
            'no_bkm'         => $no,
            'arah'           => 'masuk',
            'santri_id'      => $s['id'],
            'nama'           => $s['nama'],
            'kelas'          => $s['kelas'],
            'jenis_transaksi'=> $metodeSeed[$ji % 4],
            'tagihan_jenis'  => $key,
            'akun'           => akun_dari_tagihan($key, $db),
            'nominal'        => $nilai,
            'keterangan'     => '',
            'dibuat'         => date('c'),
        ];
        $db['jurnal'][] = $j;
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tg,
            'jenis'       => 'masuk',
            'kategori_id' => $katJurnal['id'],
            'jumlah'      => $nilai,
            'keterangan'  => $no . ' • ' . $s['nama'] . ' • ' . $label,
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
    }

    // jurnal kas keluar contoh
    $katJurnalKeluar = kategori_jurnal_keluar($db);
    $keluarSeed = [
        [3, 'Biaya Listrik', 'Dana BOS', 'Cas', 950000, 'Listrik aula & asrama'],
        [8, 'Biaya Konsumsi Santri', 'Dana Lazis', 'BRI', 2500000, 'Konsumsi mingguan dapur'],
        [14, 'Biaya Kebersihan', 'Dana BOS', 'Cas', 350000, 'Perlengkapan kebersihan'],
    ];
    foreach ($keluarSeed as $ks) {
        $no  = bkk_nomor($db, true);
        $tg  = date('Y-m-d', mktime(0, 0, 0, $m + 1, $ks[0], $y));
        $j   = [
            'id'             => uid($db, 'jurnal'),
            'tanggal'        => $tg,
            'no_bkk'         => $no,
            'arah'           => 'keluar',
            'santri_id'      => '',
            'nama'           => '',
            'kelas'          => '-',
            'jenis_transaksi'=> $ks[3],
            'tagihan_jenis'  => '',
            'akun'           => $ks[1],
            'sumber_dana'    => $ks[2],
            'nominal'        => $ks[4],
            'keterangan'     => $ks[5],
            'dibuat'         => date('c'),
        ];
        $db['jurnal'][] = $j;
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tg,
            'jenis'       => 'keluar',
            'kategori_id' => $katJurnalKeluar['id'],
            'jumlah'      => $ks[4],
            'keterangan'  => $no . ' • ' . $ks[1] . ' ← ' . $ks[2] . ' • ' . $ks[5],
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
    }

    usort($db['transaksi'], function ($a, $b) { return strcmp($b['tanggal'], $a['tanggal']); });
    return $db;
}
