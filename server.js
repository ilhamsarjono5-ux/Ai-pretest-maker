import express from 'express';
import cors from 'cors';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 18 * 1024 * 1024 } });
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true, service: 'AI Pretest Maker' }));

app.post('/api/quiz', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY belum diatur di server.' });
    if (!req.file || req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Kirim satu file PDF.' });
    const prompt = `Anda adalah penyusun soal pretest praktikum tingkat sulit. Baca PDF terlampir dan buat TEPAT 10 soal dalam bahasa Indonesia. Gunakan hanya fakta yang didukung PDF; bila bagian tidak terbaca jangan mengarang. Utamakan analisis, penerapan, hubungan sebab-akibat, interpretasi tabel/gambar yang terbaca, dan konsep diagnostik. Variasikan target pengetahuan. Formatkan jawaban HANYA JSON valid tanpa markdown dengan bentuk: {"title":"...","questions":[{"id":"q1","type":"single_select","question":"...","options":[{"value":"A","label":"...","feedback":"Penjelasan khusus mengapa opsi ini benar/salah berdasarkan materi."},{"value":"B","label":"...","feedback":"..."},{"value":"C","label":"...","feedback":"..."},{"value":"D","label":"...","feedback":"..."}],"correctValues":["A"],"hint":"Petunjuk yang tidak membocorkan jawaban."}]}. Untuk setiap soal wajib 4 opsi berbeda dan masuk akal, tepat satu jawaban benar, feedback untuk SETIAP opsi. Buat 8 single_select dan 2 true_false bila materi mendukung; jika tidak, buat 10 single_select. Untuk true_false gunakan dua opsi value true dan false. Jangan menambahkan fakta luar PDF. Pastikan semua kunci dan penjelasan konsisten.`;
    const payload = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: 'application/pdf', data: req.file.buffer.toString('base64') } }
      ] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.35 }
    };
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(payload)
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.error?.message || 'Gemini API gagal.' });
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'Gemini tidak mengembalikan isi kuis.' });
    let quiz;
    try { quiz = JSON.parse(text); } catch { return res.status(502).json({ error: 'Respons AI bukan JSON valid.', raw: text.slice(0, 1500) }); }
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 1) return res.status(502).json({ error: 'Struktur soal tidak ditemukan.' });
    res.json({ quiz });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Kesalahan server.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AI Pretest Maker backend listening on ${port}`));
