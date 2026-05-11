export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Niedozwolona metoda' });

  const { message, history } = req.body;

  const systemPrompt = `Jesteś pomocnym asystentem firmy BT Monika - rodzinnego przedsiębiorstwa transportowego działającego od 1991 roku w okolicach Szczecinka.

Firma oferuje:
- Przewóz osób na trasie Szczecinek – Czarne przez Gwdę Wielką i Gwdę Małą
- Bilety miesięczne, eKartę i ulgi ustawowe (szkolne, studenckie, emeryckie itp.)
- Przewozy szkolne i dla zakładów pracy
- Wycieczki krajowe i zagraniczne
- Wynajem autobusów i busów

ZASADY KTÓRYCH MUSISZ PRZESTRZEGAĆ:
- Odpowiadaj WYŁĄCZNIE na pytania dotyczące firmy BT Monika i jej usług transportowych
- Jeśli ktoś pyta o coś niezwiązanego z firmą (np. pogoda, polityka, inne tematy), grzecznie odmów i powiedz: "Mogę odpowiadać tylko na pytania dotyczące usług BT Monika. W innych sprawach zapraszam do kontaktu z firmą."
- Odpowiadaj krótko, konkretnie i przyjaźnie
- Zawsze pisz po polsku
- Jeśli nie znasz odpowiedzi na pytanie o firmę, powiedz: "W tej sprawie najlepiej skontaktować się bezpośrednio z firmą BT Monika."
- Nie wymyślaj cen ani szczegółów których nie znasz`;

  try {
    const contents = history && history.length > 0
      ? history
      : [{ role: 'user', parts: [{ text: message }] }];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Przepraszam, spróbuj ponownie.';
    res.status(200).json({ reply });

  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera. Spróbuj ponownie.' });
  }
}
