<?php
/**
 * Generator PDF mentah tanpa library eksternal (ramah shared hosting).
 * Khusus dokumen Pembagian Uang Saku: kop judul, tabel No/Kode/Nama/Jumlah
 * (28 baris/halaman), subtotal per halaman, total akhir + TTD Bendahara/Mudir.
 * Font: Helvetica / Helvetica-Bold (core font PDF, encoding WinAnsi).
 */

const PDF_PAGE_W     = 595.28;   // A4 portrait (pt)
const PDF_PAGE_H     = 841.89;
const PDF_BARIS_PER_H = 28;      // baris tabel per halaman

/** Teks aman utk string PDF (kurung & backslash) */
function pdf_str(string $s): string {
    return '(' . str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $s) . ')';
}

/** Normalisasi ke Windows-1252 (encoding WinAnsi) — bulet/strip/tanda kutip → ASCII */
function pdf_win1252(string $s): string {
    $s = str_replace(
        ["\u{2022}", "\u{2013}", "\u{2014}", "\u{2018}", "\u{2019}", "\u{201C}", "\u{201D}", "\u{2026}"],
        ['-', '-', '-', "'", "'", '"', '"', '...'],
        $s
    );
    if (function_exists('mb_convert_encoding')) {
        $out = @mb_convert_encoding($s, 'Windows-1252', 'UTF-8');
        if (is_string($out)) { return $out; }
    }
    return (string)preg_replace('/[^\x20-\x7E]/', '?', $s);
}

/** Lebar teks (pt) memakai lebar AFM Helvetica utk kode 32..126 */
function pdf_lebar(string $s, float $size, bool $bold = false): float {
    static $w = [];
    $k = $bold ? 'b' : 'r';
    if (!isset($w[$k])) {
        /* Helvetica / Helvetica-Bold — 95 nilai utk kode karakter 32..126 */
        $src = $bold
            ? '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,'
              . '556,556,556,556,556,556,556,556,556,556,'
              . '333,333,584,584,584,611,975,'
              . '722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,'
              . '333,278,333,584,556,333,'
              . '556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,'
              . '389,280,389,584'
            : '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,'
              . '556,556,556,556,556,556,556,556,556,556,'
              . '278,278,584,584,584,556,1015,'
              . '667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,'
              . '278,278,278,469,556,333,'
              . '556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,'
              . '334,260,334,584';
        $t = [];
        foreach (explode(',', $src) as $i => $v) { $t[32 + $i] = (int)$v; }
        $w[$k] = $t;
    }
    $total = 0;
    $len   = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $c   = ord($s[$i]);
        $total += $w[$k][$c] ?? 556;
    }
    return $total * $size / 1000;
}

function pdf_fill_rect(float $x, float $y, float $w, float $h, float $r, float $g, float $b): string {
    return sprintf("%.3f %.3f %.3f rg\n%.2f %.2f %.2f %.2f re f\n", $r, $g, $b, $x, $y, $w, $h);
}

function pdf_stroke_rect(float $x, float $y, float $w, float $h, float $gray = 0.55, float $lw = 0.6): string {
    return sprintf("%.2f w\n%.2f G\n%.2f %.2f %.2f %.2f re S\n", $lw, $gray, $x, $y, $w, $h);
}

function pdf_line(float $x1, float $y1, float $x2, float $y2, float $gray = 0.55, float $lw = 0.6): string {
    return sprintf("%.2f w\n%.2f G\n%.2f %.2f m %.2f %.2f l S\n", $lw, $gray, $x1, $y1, $x2, $y2);
}

/** Teks; $align: l (left), c (center), r (right) terhadap $x */
function pdf_text(string $t, float $x, float $y, float $size, bool $bold = false, array $col = [0, 0, 0], string $align = 'l'): string {
    $t = pdf_win1252($t);
    if ($t === '') { return ''; }
    $w = pdf_lebar($t, $size, $bold);
    if ($align === 'c') { $x -= $w / 2; }
    elseif ($align === 'r') { $x -= $w; }
    return sprintf("%.3f %.3f %.3f rg\nBT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm %s Tj ET\n",
        $col[0], $col[1], $col[2], $bold ? 'F2' : 'F1', $size, $x, $y, pdf_str($t));
}

/** Susun objek PDF dari daftar content-stream (satu per halaman) */
function pdf_assemble(array $streams): string {
    $objs  = [];
    $kids  = [];
    $n     = count($streams);
    foreach ($streams as $i => $s) { $kids[] = (5 + $i * 2) . ' 0 R'; }

    $objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objs[2] = '<< /Type /Pages /Count ' . $n . ' /Kids [' . implode(' ', $kids) . '] >>';
    $objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    $objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    foreach ($streams as $i => $s) {
        $p = 5 + $i * 2;
        $objs[$p] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' . PDF_PAGE_W . ' ' . PDF_PAGE_H
                  . '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' . ($p + 1) . ' 0 R >>';
        $objs[$p + 1] = 'STREAM:' . $s;
    }

    $out  = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    $offs = [];
    $max = 4 + $n * 2;
    for ($k = 1; $k <= $max; $k++) {
        $offs[$k] = strlen($out);
        $isi = isset($objs[$k]) ? $objs[$k] : '';
        if (strncmp($isi, 'STREAM:', 7) === 0) {
            $body = substr($isi, 7);
            $out .= $k . " 0 obj\n<< /Length " . strlen($body) . " >>\nstream\n" . $body . "\nendstream\nendobj\n";
        } else {
            $out .= $k . " 0 obj\n" . $isi . "\nendobj\n";
        }
    }
    $xref = strlen($out);
    $out .= "xref\n0 " . ($max + 1) . "\n0000000000 65535 f \n";
    for ($k = 1; $k <= $max; $k++) { $out .= sprintf("%010d 00000 n \n", $offs[$k]); }
    $out .= "trailer\n<< /Size " . ($max + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";
    return $out;
}

/** Potong teks agar muat pada lebar (pt) — perkiraan lebar huruf */
function pdf_potong(string $t, float $maxW, float $size, bool $bold = false): string {
    if (pdf_lebar($t, $size, $bold) <= $maxW) { return $t; }
    while ($t !== '' && pdf_lebar($t . '...', $size, $bold) > $maxW) {
        $t = substr($t, 0, -1);
    }
    return $t . '...';
}

/** Satu halaman: kop judul, tabel baris, subtotal, total (halaman terakhir) + TTD */
function pdf_halaman_pembagian(array $batch, array $rows, int $idx, int $hal, int $totalSantri, float $totalNilai, array $peng): string {
    $ops = [];
    $cx  = PDF_PAGE_W / 2;
    $L   = 40.0;                       // tepi kiri tabel
    $R   = 555.0;                      // tepi kanan tabel
    $col = [40.0, 75.0, 150.0, 400.0, 555.0];   // No, Kode, Nama, (Jumlah kanan)

    /* ---- kop judul ---- */
    $ops[] = pdf_text(strtoupper(trim((string)($peng['nama_pesantren'] ?? ''))), $cx, 798, 15, true, [0, 0, 0], 'c');
    $ops[] = pdf_text('PEMBAGIAN UANG SAKU', $cx, 778, 13.5, true, [0.13, 0.45, 0.18], 'c');
    $yJ = 762;
    $kelompok = trim((string)($batch['kelompok'] ?? ''));
    if ($kelompok !== '') {
        $ops[] = pdf_text(strtoupper($kelompok), $cx, $yJ, 11.5, true, [0.13, 0.45, 0.18], 'c');
        $yJ -= 16;
    }
    $ts = (int)strtotime((string)($batch['dibuat'] ?? ''));
    if ($ts > 0) { $ops[] = pdf_text(date('d/m/Y H:i:s', $ts), $cx, $yJ, 9.5, false, [0.42, 0.47, 0.45], 'c'); }
    $ops[] = pdf_line($L, 736, $R, 736, 0.45, 0.8);

    /* ---- tabel ---- */
    $top  = 730.0;
    $hh   = 20.0;
    $rh   = 19.0;
    $hbot = $top - $hh;                                   // 710 — alas header
    $bot  = $hbot - $rh * count($rows);

    $ops[] = pdf_fill_rect($L, $hbot, $R - $L, $hh, 0.16, 0.47, 0.21);   // header hijau
    $hb = $hbot + 6.5;
    $ops[] = pdf_text('No', ($col[0] + $col[1]) / 2, $hb, 9.5, true, [1, 1, 1], 'c');
    $ops[] = pdf_text('Kode', ($col[1] + $col[2]) / 2, $hb, 9.5, true, [1, 1, 1], 'c');
    $ops[] = pdf_text('Nama', ($col[2] + $col[3]) / 2, $hb, 9.5, true, [1, 1, 1], 'c');
    $ops[] = pdf_text('Jumlah', $R - 6, $hb, 9.5, true, [1, 1, 1], 'r');

    foreach ($rows as $i => $it) {
        $yb = $hbot - $rh * ($i + 1);
        if ($i % 2 === 1) { $ops[] = pdf_fill_rect($L, $yb, $R - $L, $rh, 0.94, 0.97, 0.94); }
        $no = $idx * PDF_BARIS_PER_H + $i + 1;
        $ops[] = pdf_text((string)$no, ($col[0] + $col[1]) / 2, $yb + 6, 9.5, false, [0, 0, 0], 'c');
        $ops[] = pdf_text(pdf_potong((string)($it['kode'] ?? ''), $col[2] - $col[1] - 10, 9.5), $col[1] + 5, $yb + 6, 9.5);
        $ops[] = pdf_text(pdf_potong((string)($it['nama'] ?? ''), $col[3] - $col[2] - 10, 9.5), $col[2] + 5, $yb + 6, 9.5);
        $ops[] = pdf_text(rupiah((float)($it['nominal'] ?? 0)), $R - 6, $yb + 6, 9.5, false, [0, 0, 0], 'r');
    }

    /* garis grid tabel */
    $ops[] = pdf_stroke_rect($L, $bot, $R - $L, $top - $bot, 0.5, 0.7);
    for ($i = 1; $i < count($rows); $i++) {
        $yy = $hbot - $rh * $i;
        $ops[] = pdf_line($L, $yy, $R, $yy, 0.7, 0.4);
    }
    $ops[] = pdf_line($L, $hbot, $R, $hbot, 0.5, 0.7);           // bawah header
    foreach ($col as $k => $x) {
        if ($k === 0) { continue; }                                // tepi luar sudah dari stroke rect
        $ops[] = pdf_line($x, $bot, $x, $top, 0.7, 0.4);
    }

    /* ---- subtotal halaman ---- */
    $sub = 0.0;
    foreach ($rows as $it) { $sub += (float)($it['nominal'] ?? 0); }
    $ys = $bot - 20;
    $ops[] = pdf_text($hal > 1 ? ('Jumlah halaman ' . ($idx + 1) . ' dari ' . $hal) : 'Jumlah', $L, $ys, 9.5, true);
    $ops[] = pdf_text(number_format($sub, 2, ',', '.'), $R - 6, $ys, 10.5, true, [0, 0, 0], 'r');

    /* ---- total akhir (halaman terakhir) ---- */
    if ($idx === $hal - 1) {
        $yt = $bot - 40;
        $ops[] = pdf_text('TOTAL PEMBAGIAN (' . $totalSantri . ' santri)', $L, $yt, 10.5, true, [0.13, 0.45, 0.18]);
        $ops[] = pdf_text('Rp ' . number_format($totalNilai, 2, ',', '.'), $R - 6, $yt, 12, true, [0.13, 0.45, 0.18], 'r');

        /* TTD Bendahara & Mudir */
        $cx1 = 165.0; $cx2 = 430.0;
        $ops[] = pdf_text('Bendahara', $cx1, 112, 10, true, [0, 0, 0], 'c');
        $ops[] = pdf_text('Mudir', $cx2, 112, 10, true, [0, 0, 0], 'c');
        $ops[] = pdf_line($cx1 - 85, 74, $cx1 + 85, 74, 0.3, 0.8);
        $ops[] = pdf_line($cx2 - 85, 74, $cx2 + 85, 74, 0.3, 0.8);
        $nb = trim((string)($peng['nama_bendahara'] ?? ''));
        $nm = trim((string)($peng['nama_mudir'] ?? ''));
        if ($nb !== '') { $ops[] = pdf_text($nb, $cx1, 64, 9.5, false, [0, 0, 0], 'c'); }
        if ($nm !== '') { $ops[] = pdf_text($nm, $cx2, 64, 9.5, false, [0, 0, 0], 'c'); }
    }

    $ops[] = pdf_text('Halaman ' . ($idx + 1) . ' dari ' . $hal, $cx, 42, 8.5, false, [0.5, 0.5, 0.5], 'c');
    return implode("\n", $ops);
}

/** Dokumen lengkap: potong items jadi halaman lalu rakit PDF */
function pdf_pembagian(array $batch, array $peng): string {
    $items = is_array($batch['items'] ?? null) ? array_values($batch['items']) : [];
    $total = 0.0;
    foreach ($items as $it) { $total += (float)($it['nominal'] ?? 0); }

    $chunks = array_chunk($items, PDF_BARIS_PER_H);
    if (!$chunks) { $chunks = [[]]; }
    $hal = count($chunks);

    $streams = [];
    foreach ($chunks as $i => $rows) {
        $streams[] = pdf_halaman_pembagian($batch, $rows, $i, $hal, count($items), $total, $peng);
    }
    return pdf_assemble($streams);
}
