// ==============================================================================
// API ROUTE: src/app/api/rekap/ai-analysis/route.ts
// Endpoint On-Demand AI Financial Analysis (Google Gemini Flash)
// Hemat kuota: Hanya dieksekusi saat pengguna menekan tombol "Minta Analisis AI"
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeFinancesWithGemini,
  FinancialAnalysisPayload,
} from '@/lib/ai/financial-advisor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as FinancialAnalysisPayload;

    if (!payload || !payload.monthName) {
      return NextResponse.json(
        { error: 'Payload tidak valid: monthName wajib disertakan.' },
        { status: 400 }
      );
    }

    // Panggil Gemini Flash AI Analyzer (akan otomatis beralih ke local fallback jika API key belum diset)
    const result = await analyzeFinancesWithGemini(payload);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API Rekap AI Analysis Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal menghasilkan analisis keuangan.',
      },
      { status: 500 }
    );
  }
}
