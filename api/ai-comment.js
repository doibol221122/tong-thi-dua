// Điểm gọi AI phía máy chủ (Vercel Function): soạn nhận xét chung từ
// số liệu tổng hợp của tuần. Khóa Gemini chỉ nằm ở biến môi trường phía
// máy chủ (GEMINI_API_KEY), không bao giờ xuống trình duyệt. Chỉ tài
// khoản Ban thi đua đang hoạt động mới gọi được: máy chủ kiểm tra lại
// phiên Supabase và vai trò trong bảng profiles trước khi gọi AI.

const rate = new Map(); // userId -> mốc gọi gần nhất (chống bấm dồn dập)

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

async function requireAdmin(request) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: 'Máy chủ chưa có cấu hình Supabase.' };
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Chưa đăng nhập.' };
  const userRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) return { error: 'Phiên đăng nhập không hợp lệ.' };
  const user = await userRes.json();
  if (!user?.id) return { error: 'Phiên đăng nhập không hợp lệ.' };
  const profRes = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!profRes.ok) return { error: 'Không kiểm tra được vai trò tài khoản.' };
  const rows = await profRes.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') return { error: 'Chỉ Ban thi đua mới dùng được AI nhận xét.' };
  return { userId: user.id };
}

export async function POST(request) {
  const gate = await requireAdmin(request);
  if (gate.error) return json(403, { error: gate.error });
  const now = Date.now();
  if (now - (rate.get(gate.userId) || 0) < 5000) return json(429, { error: 'Vừa gọi AI xong, chờ vài giây rồi thử lại nhé.' });
  rate.set(gate.userId, now);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(501, { error: 'Chưa đặt khóa AI trên máy chủ (GEMINI_API_KEY).' });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Dữ liệu gửi lên không đúng định dạng.' }); }
  const weekLabel = String(body?.weekLabel || '').slice(0, 80);
  const facts = String(body?.facts || '').slice(0, 6000);
  if (!facts.trim()) return json(400, { error: 'Chưa có số liệu tuần để AI soạn nhận xét.' });

  const prompt = [
    'Bạn là trợ lý soạn nhận xét thi đua tuần cho Ban thi đua một trường THPT ở Việt Nam.',
    `Tuần: ${weekLabel || 'tuần hiện tại'}.`,
    'Dưới đây là số liệu tổng hợp của tuần (chỉ gồm điểm, loại và lỗi vi phạm theo lớp, không có tên học sinh):',
    facts,
    'Hãy soạn phần Nhận xét chung gồm Ưu điểm và Nhược điểm đúng văn phong bản Tổng hợp thi đua tuần của trường: ngắn gọn, mỗi phần chỉ 1-2 câu, chỉ dựa trên số liệu trên, không bịa thêm số liệu hay tên lớp ngoài dữ liệu.',
    'Ưu điểm viết theo mẫu: "Các lớp 10B1, 10B2 đạt 100% giờ học tốt." — nêu tên các lớp đạt 100% giờ học tốt; nếu không có lớp nào đạt 100% thì nêu các lớp dẫn đầu tuần.',
    'Nhược điểm viết theo mẫu: "Vẫn còn một số học sinh vi phạm nội quy đi muộn, mang đồ ăn vào lớp." — nêu các lỗi vi phạm còn tồn tại, không nêu tên học sinh, không nêu điểm số.',
    'Trả về đúng JSON dạng {"pros":"...","cons":"..."} không kèm chữ nào khác.',
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600, responseMimeType: 'application/json' },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return json(502, { error: 'AI chưa trả lời được (mã ' + res.status + '). Thử lại sau nhé.' });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* bỏ qua */ } }
    }
    const pros = String(parsed?.pros || '').trim();
    const cons = String(parsed?.cons || '').trim();
    if (!pros && !cons) return json(502, { error: 'AI trả về nội dung chưa dùng được. Thử lại nhé.' });
    return json(200, { pros, cons });
  } catch {
    return json(502, { error: 'Không gọi được AI lúc này. App vẫn dùng nhận xét tự soạn từ số liệu.' });
  } finally {
    clearTimeout(timer);
  }
}
