// ==============================================================================
// CATEGORY CLASSIFIER: src/lib/ai/category-classifier.ts
// Logika murni pemisahan kategori belanja keluarga:
// Belanja Dapur vs Makan Harian vs Jajan vs Transportasi vs Tagihan vs Rumah vs Jalan-jalan vs Darurat vs Lainnya
// ==============================================================================

export interface CategoryRuleMatch {
  categoryId: string;
  categoryName: string;
  confident: boolean;
}

const SPECIFIC_RULES: Array<{
  categoryId: string;
  categoryName: string;
  pattern: RegExp;
}> = [
  // 1. Jajan (prioritaskan sebelum Makan Harian agar kopi/es cokelat/snack tidak tertangkap kata umum warung/food)
  {
    categoryId: 'b-jajan',
    categoryName: 'Jajan',
    pattern:
      /\b(?:jajan\w*|ngemil|camilan|cemilan|snack|kopi|coffee|kafe|cafe|espresso|latte|matcha|boba|bubble\s*tea|es\s*(?:cokelat|coklat|teh|jeruk|buah|kelapa|kopi|krim)|ice\s*cream|gelato|mixue|chatime|haus|esteh|kenangan|janji\s*jiwa|fore|tomoro|starbucks|point\s*coffee|tuku|j\.?co|dunkin|roti|bakery|breadtalk|mako|holland\s*bakery|kue|cake|donat|martabak|terang\s*bulan|gorengan|cilok|cimol|seblak|siomay|batagor|dimsum|pisang\s*goreng|cokelat|permen|dessert|pastry|waffle|crepes)\b/i,
  },
  // 2. Belanja Dapur (bahan mentah masak, sayur, sembako, pasar, bumbu, gas, galon)
  {
    categoryId: 'b-dapur',
    categoryName: 'Belanja Dapur',
    pattern:
      /\b(?:dapur|sembako|sayur\w*|buah\w*|pasar|tukang\s*sayur|kelontong|bumbu|beras|minyak\s*goreng|daging|ikan|ayam\s*(?:potong|mentah|segar)|telur|tepung|gula|garam|kecap|santan|bawang|cabai|cabe|tahu|tempe|superindo|hypermart|lotte\s*mart|farmer\s*market|ranch\s*market|alfamidi|dunia\s*buah|toko\s*sakti|grosir|gas\s*(?:lpg|elpiji)|elpiji|galon|aqua\s*galon|le\s*minerale\s*galon)\b/i,
  },
  // 3. Makan Harian (makanan pokok, warteg, rumah makan, lauk matang, resto makan berat)
  {
    categoryId: 'b-makan',
    categoryName: 'Makan Harian',
    pattern:
      /\b(?:makan(?:\s*harian|\s*siang|\s*malam|\s*pagi)?|sarapan|lunch|dinner|warteg|rumah\s*makan|rm\b|padang|sederhana|pecel|lamongan|geprek|penyet|soto|sop|rawon|rendang|gulai|nasi(?:\s*goreng|\s*uduk|\s*kuning|\s*padang|\s*rames|\s*campur)?|lauk|sayur\s*matang|bakmi|mie(?:\s*ayam|\s*gacoan)?|bakso|sate|seafood|bebek|ayam\s*(?:bakar|goreng|penyet)|katering|catering|kantin|warung\s*makan|resto\w*|restoran|kuliner|hokben|solaria|yoshinoya|kfc|mcd\w*|burger\s*king|richese|gofood|grabfood|shopeefood)\b/i,
  },
  // 4. Transportasi/Bensin
  {
    categoryId: 'b-trans',
    categoryName: 'Transportasi/Bensin',
    pattern:
      /\b(?:bensin|bbm|pertamax|pertalite|pertamina|solar|dexlite|spbu|shell|vivo|bp\s*akr|transpor\w*|ojek|gojek|goride|gocar|grab|grabbike|grabcar|maxim|indrive|bluebird|taksi|parkir|e-?toll|tol\b|kereta|kai|krl|mrt|lrt|transjakarta|busway|damri|bus|servis\s*(?:motor|mobil)|ganti\s*oli|tambal\s*ban)\b/i,
  },
  // 5. Tagihan & Utilitas
  {
    categoryId: 'b-tagih',
    categoryName: 'Tagihan & Utilitas',
    pattern:
      /\b(?:tagihan|listrik|pln|token\s*pln|pdam|air\s*bersih|wifi|internet|indihome|biznet|myrepublic|first\s*media|oxygen|pulsa|paket\s*data|kuota|telkomsel|indosat|xl\b|axis|smartfren|bpjs|iuran|ipl|pajak|pbb|stnk|langganan|cicilan|kartu\s*kredit)\b/i,
  },
  // 6. Kebutuhan Rumah (perabot, belanja online, anak, popok, susu)
  {
    categoryId: 'b-rumah',
    categoryName: 'Kebutuhan Rumah',
    pattern:
      /\b(?:kebutuhan\s*rumah|perabot\w*|furnitur|alat\s*rumah|detergen|sabun|shampo|pasta\s*gigi|tisu|ikea|ace\s*hardware|azko|informa|mr\.?\s*diy|belanja\s*online|tokopedia|shopee|lazada|blibli|zalora|tiktok\s*shop|bukalapak|elektronik|anak|bayi|baby|popok|pampers|susu\s*(?:formula|anak)|sekolah|spp|les\b|pendidikan)\b/i,
  },
  // 7. Jalan-jalan
  {
    categoryId: 'b-jalan',
    categoryName: 'Jalan-jalan',
    pattern:
      /\b(?:jalan-?jalan|liburan|wisata|rekreasi|hiburan|nonton|bioskop|cinema|xxi|cgv|cinepolis|hotel|penginapan|villa|resort|tiket\s*(?:masuk|pesawat|wisata)|traveloka|tiket\.com|dufan|zoo|kebun\s*binatang|taman\s*hiburan|staycation|netflix|spotify|youtube\s*premium|steam)\b/i,
  },
  // 8. Keperluan Mendadak (kesehatan, obat, dokter, perbaikan darurat)
  {
    categoryId: 'b-darurat',
    categoryName: 'Keperluan Mendadak',
    pattern:
      /\b(?:darurat|mendadak|sakit|obat|apotek|kimia\s*farma|k24|century|dokter|klinik|puskesmas|rumah\s*sakit|rs\b|rsud|rsup|kesehatan|halodoc|alodokter|lab\b|prodia|ambulance|servis\s*darurat)\b/i,
  },
];

/**
 * Mengklasifikasikan transaksi pengeluaran ke 9 kategori resmi secara cepat & deterministik.
 * Membedakan Dapur (bahan mentah/pasar) vs Makan Harian (makan berat/lauk) vs Jajan (kopi/snack/minuman).
 */
export function classifyExpenseCategoryRuleBased(
  merchant: string,
  fullText: string = '',
  amount: number = 0
): CategoryRuleMatch {
  const combined = `${merchant || ''} ${fullText || ''}`.trim();
  const lower = combined.toLowerCase();

  if (!lower) {
    return { categoryId: 'b-lain', categoryName: 'Lainnya', confident: false };
  }

  for (const rule of SPECIFIC_RULES) {
    if (rule.pattern.test(lower)) {
      return {
        categoryId: rule.categoryId,
        categoryName: rule.categoryName,
        confident: true,
      };
    }
  }

  // Penanganan khusus minimarket (Indomaret / Alfamart / Circle K / FamilyMart / Lawson):
  // Jika nominal kecil <= Rp 35.000 umumnya jajan/minuman harian; di atas itu condong ke Belanja Dapur/Kebutuhan.
  if (/\b(?:indomaret|alfamart|circle\s*k|family\s*mart|familymart|lawson|7-?eleven)\b/i.test(lower)) {
    if (amount > 0 && amount <= 35000) {
      return { categoryId: 'b-jajan', categoryName: 'Jajan', confident: false };
    }
    return { categoryId: 'b-dapur', categoryName: 'Belanja Dapur', confident: false };
  }

  // Kata umum "warung" atau "toko" tanpa konteks makanan: tetap tandai tidak yakin agar AI Sinkron bisa bantu
  return { categoryId: 'b-lain', categoryName: 'Lainnya', confident: false };
}
