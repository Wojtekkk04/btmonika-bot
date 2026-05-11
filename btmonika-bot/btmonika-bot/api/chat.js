export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { history } = req.body;
  const key = process.env.GEMINI_API_KEY;

  const systemText = `Jesteś pomocnym asystentem firmy BT Monika - rodzinnego przedsiębiorstwa transportowego działającego od 1991 roku w okolicach Szczecinka. Firma oferuje: przewóz osób na trasie Szczecinek-Czarne przez Gwdę, bilety miesięczne i eKartę z ulgami, przewozy szkolne i dla firm, wycieczki krajowe i zagraniczne, wynajem autobusów i busów. Odpowiadaj TYLKO na pytania o firmę BT Monika. Jeśli pytanie nie dotyczy firmy, grzecznie odmów. Odpowiadaj po polsku, krótko i przyjaźnie.`;

  // Budujemy historię z instrukcją systemową jako pierwsza wiadomość
  const contents = [];
  
  // Dodaj system prompt jako pierwszą wymianę
  contents.push({ role: 'user', parts: [{ text: 'Kim jesteś i co robisz?' }] });
  contents.push({ role: 'model', parts: [{ text: systemText }] });
  
  // Dodaj historię rozmowy
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push(msg);
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 500 } })
      }
    );

    const data = await response.json();
    console.log('Gemini response status:', response.status);
    console.log('Gemini data:', JSON.stringify(data).substring(0, 500));

    if (data.error) {
      console.error('Gemini error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Przepraszam, spróbuj ponownie.';
    res.status(200).json({ reply });

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
