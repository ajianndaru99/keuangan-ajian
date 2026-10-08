// ==============================================================================
// UTILITY: src/lib/export-excel.ts
// Generator ekspor data transaksi ke format CSV / Excel dengan encoding UTF-8 BOM
// Kompatibel penuh dengan Microsoft Excel, Google Sheets, & Apple Numbers
// ==============================================================================

export interface ExportableTransaction {
  id: string;
  transaction_date: string;
  merchant: string | null;
  direction: 'in' | 'out';
  amount: number;
  status: string;
  account_name?: string;
  owner?: string;
  category_name?: string;
  raw_notification?: string | null;
}

/**
 * Mengonversi daftar transaksi menjadi file CSV ber-BOM UTF-8 dan memicu unduhan otomatis.
 */
export function exportTransactionsToCsv(
  transactions: ExportableTransaction[],
  filenamePrefix = 'Transaksi_Keluarga_Ajian'
): void {
  if (!transactions || transactions.length === 0) {
    alert('Tidak ada transaksi untuk diekspor pada filter ini.');
    return;
  }

  // Header kolom tabel spreadsheet
  const headers = [
    'ID Transaksi',
    'Tanggal & Waktu',
    'Nama Transaksi / Merchant',
    'Arah Arus Kas',
    'Nominal (Rp)',
    'Kategori',
    'Rekening / Sumber Kas',
    'Pemilik',
    'Status',
    'Catatan Notifikasi',
  ];

  const rows = transactions.map((tx) => {
    const dateFormatted = new Date(tx.transaction_date).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const directionLabel = tx.direction === 'in' ? 'Pemasukan' : 'Pengeluaran';
    const statusLabel =
      tx.status === 'reconciled'
        ? 'Tervalidasi'
        : tx.status === 'pending'
        ? 'Menunggu Review'
        : 'Diabaikan';

    const escapeCsv = (str: string | null | undefined) => {
      if (!str) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    return [
      escapeCsv(tx.id),
      escapeCsv(dateFormatted),
      escapeCsv(tx.merchant || 'Transaksi Digital'),
      escapeCsv(directionLabel),
      tx.amount, // Simpan angka murni agar bisa langsung di-SUM di Excel
      escapeCsv(tx.category_name || '-'),
      escapeCsv(tx.account_name || 'Rekening'),
      escapeCsv(tx.owner === 'suami' ? 'Suami' : tx.owner === 'istri' ? 'Istri' : 'Keluarga'),
      escapeCsv(statusLabel),
      escapeCsv(tx.raw_notification || ''),
    ].join(',');
  });

  // Gabungkan dengan UTF-8 BOM (\uFEFF) agar simbol dan karakter Indonesia terbaca sempurna di Excel
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `${filenamePrefix}_${dateStamp}.csv`;

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
