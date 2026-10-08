// ==============================================================================
// LIB: src/lib/ai/financial-advisor.ts
// Modul Analisis Keuangan Cerdas Keluarga menggunakan Google Gemini Flash
// Bekerja 100% On-Demand (Hanya berjalan jika dipanggil/diminta) untuk hemat kredit.
// ==============================================================================

function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
}

export interface FinancialAnalysisPayload {
  monthName: string;
  totalExpense: number;
  totalIncome: number;
  netDifference: number;
  dailyAverage: number;
  peakInsight: {
    dateStr: string | null;
    formattedDate: string;
    totalExpense: number;
    dailyAverage: number;
    percentageAboveAverage: number;
    transactions: Array<{
      merchant: string;
      amount: number;
      categoryName?: string;
    }>;
  };
  topCategories?: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  transactionCount?: number;
}

export interface FinancialAIAnalysisResult {
  headline: string;
  peakAnalysis: string;
  cashFlowStatus: 'surplus' | 'balanced' | 'deficit' | 'healthy';
  cashFlowEvaluation: string;
  actionableTips: string[];
  savingsOpportunity: string;
  generatedAt: string;
  modelUsed: string;
}

/**
 * Membersihkan wrapper markdown ```json ... ``` dari respons teks Gemini
 */
export function extractCleanJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Menghasilkan analisis cerdas deterministik (fallback lokal)
 * Digunakan jika GEMINI_API_KEY belum diset atau ada gangguan jaringan.
 */
export function generateLocalFallbackAnalysis(
  payload: FinancialAnalysisPayload
): FinancialAIAnalysisResult {
  const { monthName, totalExpense, totalIncome, netDifference, peakInsight, topCategories } = payload;
  const isSurplus = netDifference >= 0;
  const hasTransactions = totalExpense > 0 || totalIncome > 0;

  if (!hasTransactions || !peakInsight.dateStr || peakInsight.totalExpense === 0) {
    return {
      headline: `Arus Kas ${monthName} Sangat Terkendali & Bebas Lonjakan`,
      peakAnalysis: `Belum terdeteksi pengeluaran signifikan pada periode ${monthName}. Semua anggaran kebutuhan keluarga masih utuh dan berada dalam batas aman.`,
      cashFlowStatus: 'healthy',
      cashFlowEvaluation: `Kondisi kas keluarga saat ini tenang tanpa pengeluaran besar. Catat transaksi begitu belanja dilakukan agar rekapitulasi tetap akurat.`,
      actionableTips: [
        'Tetapkan pos alokasi dana darurat dan tabungan di awal sebelum pengeluaran rutin berjalan.',
        'Gunakan fitur foto struk atau notifikasi otomatis bank agar tidak ada pengeluaran kecil yang terlewat.',
      ],
      savingsOpportunity: 'Pertahankan disiplin ini dengan memprioritaskan kebutuhan primer keluarga.',
      generatedAt: new Date().toISOString(),
      modelUsed: 'Smart Local Analyzer (Fallback)',
    };
  }

  // Hitung kategori dominan pada hari puncak
  const topPeakMerchant = peakInsight.transactions[0]?.merchant || 'belanja harian';
  const topPeakAmount = peakInsight.transactions[0]?.amount || 0;
  const topCatName = topCategories && topCategories[0] ? topCategories[0].name : 'kebutuhan keluarga';

  const headline = isSurplus
    ? `Arus Kas ${monthName} Surplus, Lonjakan Terpusat di ${peakInsight.formattedDate}`
    : `Defisit Kas ${monthName}: Lonjakan Tajam pada ${peakInsight.formattedDate} Perlu Evaluasi`;

  const peakAnalysis = `Titik pengeluaran tertinggi terjadi pada ${peakInsight.formattedDate} senilai ${formatRupiah(
    peakInsight.totalExpense
  )} (${peakInsight.percentageAboveAverage}% di atas rata-rata harian). Pemicu utamanya adalah transaksi "${topPeakMerchant}" sebesar ${formatRupiah(
    topPeakAmount
  )}. Pengeluaran terkonsentrasi pada pos ${topCatName}, yang merupakan pembelanjaan dengan volume besar dalam satu waktu.`;

  const cashFlowEvaluation = isSurplus
    ? `Arus kas bulanan masih mencatat surplus sebesar +${formatRupiah(
        netDifference
      )}. Lonjakan pada tanggal tersebut masih mampu ditopang oleh pemasukan yang ada, namun perhatikan frekuensi belanja agar sisa surplus dapat diamankan ke tabungan.`
    : `Pengeluaran bulan ini melebihi pemasukan dengan defisit sebesar -${formatRupiah(
        Math.abs(netDifference)
      )}. Lonjakan pada ${peakInsight.formattedDate} berkontribusi besar terhadap defisit ini. Disarankan mengerem pengeluaran non-esensial hingga akhir periode.`;

  const actionableTips = [
    `Rencanakan belanja pos "${topCatName}" dengan daftar belanja terencana untuk menghindari pembelian impulsif.`,
    isSurplus
      ? `Segera alihkan 20-30% dari sisa surplus (${formatRupiah(netDifference)}) ke rekening pos tabungan atau dana darurat.`
      : `Batasi pos jajan dan hiburan keluarga untuk sisa hari di bulan ${monthName} guna memulihkan defisit kas.`,
    `Gunakan pencatatan otomatis agar transaksi harian terpantau sebelum melampaui rata-rata harian (${formatRupiah(
      payload.dailyAverage
    )}/hari).`,
  ];

  return {
    headline,
    peakAnalysis,
    cashFlowStatus: isSurplus ? 'surplus' : 'deficit',
    cashFlowEvaluation,
    actionableTips,
    savingsOpportunity: `Optimalisasi belanja pada pos "${topCatName}" dapat menghemat hingga 10-15% pengeluaran bulanan.`,
    generatedAt: new Date().toISOString(),
    modelUsed: 'Smart Local Analyzer (Fallback)',
  };
}

/**
 * Menganalisis keuangan menggunakan Google Gemini Flash REST API (On-Demand).
 * Model prioritas: gemini-2.5-flash, gemini-1.5-flash, gemini-flash-latest.
 */
export async function analyzeFinancesWithGemini(
  payload: FinancialAnalysisPayload,
  apiKeyOverride?: string
): Promise<FinancialAIAnalysisResult> {
  const apiKey =
    apiKeyOverride ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return generateLocalFallbackAnalysis(payload);
  }

  const promptSystem = `Anda adalah penasihat keuangan keluarga pribadi "Keuangan Keluarga Ajian".
Karakter Anda: Sangat bijak, realistis, hangat, empatik, berbasis data, dan to-the-point dalam Bahasa Indonesia.
Tugas Anda: Menganalisis data keuangan bulanan pengguna, khususnya mengevaluasi KENAPA PENGELUARAN TERTINGGI TERJADI PADA HARI TERSEBUT, bagaimana kondisi arus kasnya, dan memberikan saran praktis penghematan.

Format respons WAJIB berupa JSON murni tanpa markdown wrapper, dengan skema berikut:
{
  "headline": "Ringkasan 1 kalimat tajam tentang kondisi finansial bulan ini",
  "peakAnalysis": "Uraian mendalam dan lugas (2-3 kalimat) mengevaluasi tanggal puncak: kenapa hari itu tertinggi, apakah transaksinya wajar (kebutuhan bulanan/darurat) atau konsumtif/impulsif, dan dampaknya",
  "cashFlowStatus": "surplus" | "balanced" | "deficit" | "healthy",
  "cashFlowEvaluation": "Evaluasi kesehatan arus kas bulan ini (apakah aman, surplus, atau defisit dan apa penyebab utamanya)",
  "actionableTips": [
    "Saran konkret nomor 1 yang realistis untuk keluarga",
    "Saran konkret nomor 2",
    "Saran konkret nomor 3"
  ],
  "savingsOpportunity": "1 potensi penghematan spesifik yang paling berdampak berdasarkan data",
  "modelUsed": "gemini-flash"
}`;

  const promptUser = `Berikut data keuangan keluarga untuk periode: ${payload.monthName}
- Total Pemasukan: ${formatRupiah(payload.totalIncome)}
- Total Pengeluaran: ${formatRupiah(payload.totalExpense)}
- Selisih Kas (Net): ${formatRupiah(payload.netDifference)} (${payload.netDifference >= 0 ? 'Surplus' : 'Defisit'})
- Rata-rata Pengeluaran Harian: ${formatRupiah(payload.dailyAverage)}/hari
- Hari Pengeluaran Tertinggi (Peak Day):
  * Tanggal: ${payload.peakInsight.formattedDate || payload.peakInsight.dateStr || 'Tidak ada'}
  * Total Pengeluaran Hari Itu: ${formatRupiah(payload.peakInsight.totalExpense)}
  * Deviasi: +${payload.peakInsight.percentageAboveAverage}% di atas rata-rata harian
  * Daftar Transaksi pada Hari Tersebut: ${JSON.stringify(payload.peakInsight.transactions || [])}
- Kategori Pengeluaran Teratas: ${JSON.stringify(payload.topCategories || [])}
- Jumlah Transaksi Tercatat: ${payload.transactionCount || 0}

Berikan analisis keuangan yang mendalam, ramah, dan solutif sesuai skema JSON yang diminta.`;

  const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: promptSystem }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: promptUser }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API (${model}) HTTP ${response.status}: ${errorText}`);
      }

      const resJson = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error(`Model ${model} tidak mengembalikan teks konten.`);
      }

      const cleaned = extractCleanJson(rawText);
      const parsed = JSON.parse(cleaned);

      return {
        headline: parsed.headline || `Analisis Keuangan ${payload.monthName}`,
        peakAnalysis: parsed.peakAnalysis || 'Analisis puncak pengeluaran berhasil dibuat.',
        cashFlowStatus: parsed.cashFlowStatus || (payload.netDifference >= 0 ? 'surplus' : 'deficit'),
        cashFlowEvaluation: parsed.cashFlowEvaluation || 'Arus kas terpantau.',
        actionableTips: Array.isArray(parsed.actionableTips) && parsed.actionableTips.length > 0
          ? parsed.actionableTips
          : ['Pantau pengeluaran harian.', 'Sisihkan dana darurat.'],
        savingsOpportunity: parsed.savingsOpportunity || 'Jaga pengeluaran pos belanja kebutuhan.',
        generatedAt: new Date().toISOString(),
        modelUsed: `Google Gemini Flash (${model})`,
      };
    } catch (err: any) {
      lastError = err;
      // Coba model berikutnya jika model ini bermasalah
    }
  }

  console.warn('[Gemini Financial Advisor Warning]:', lastError?.message, '- Menggunakan fallback cerdas.');
  return generateLocalFallbackAnalysis(payload);
}
