module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { history } = req.body;
  const key = process.env.GEMINI_API_KEY;

  const systemText = 'Jestes pomocnym asystentem firmy BT Monika - przedsiebiorstwa transportowego od 1991 roku. Firma oferuje: przewoz osob na trasie Szczecinek-Czarne przez Gwde, bilety miesięczne, przewozy szkolne, wycieczki, wynajem autobusow. Odpowiadaj TYLKO na pytania o firme BT Monika. Jezeli pytanie nie dotyczy firmy, grzecznie odmow. Odpowiadaj po polsku, krotko i przyjazni.';

  const contents = [
    { role: 'user', parts: [{ text: 'Kim jestes?' }] },
    { role: 'model', parts: [{ text: systemText }] }
  ];

  if (history && history.length > 0) {
    for (var i = 0; i < history.length; i++) {
      contents.push(history[i]);
    }
  }

  try {
    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents })
      }
    );

    var data = await response.json();

    if (data.error) {
      console.error('Gemini error:', JSON.stringify(data.error));
      return res.status(500).json({ error: data.error.message });
    }

    var reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : 'Przepraszam, sprobuj ponownie.';
    res.status(200).json({ reply: reply });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

