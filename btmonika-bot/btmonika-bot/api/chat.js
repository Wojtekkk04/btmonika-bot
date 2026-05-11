const MODEL = "gemini-2.5-flash-lite";

const ALLOWED_ORIGINS = [
  "https://btmonika.com",
  "https://www.btmonika.com",
  "http://localhost:3000"
];

const SYSTEM_PROMPT = `
Jesteś wirtualnym asystentem firmy BT Monika / Biuro Turystyczne Monika.

Odpowiadasz krótko, jasno i uprzejmie po polsku.
Pomagasz klientom w sprawach:
- rozkładów jazdy,
- biletów,
- biletów miesięcznych,
- ulg ustawowych,
- eKarty,
- przewozów grupowych,
- wycieczek,
- wynajmu autobusów i busów,
- kontaktu z firmą.

Ważne dane kontaktowe:
- Telefon: 605 551 105
- E-mail: btmonika@onet.eu
- Firma działa lokalnie/regionalnie i zajmuje się przewozem osób.
- Firma działa od 1991 roku.

Zasady:
- Nie wymyślaj godzin odjazdów, cen biletów ani szczegółów, jeśli nie masz ich w treści pytania.
- Jeśli nie znasz dokładnej odpowiedzi, napisz, że najlepiej skontaktować się telefonicznie z firmą.
- Nie pisz, że jesteś sztuczną inteligencją, chyba że użytkownik zapyta.
- Nie odpowiadaj na tematy niezwiązane z BT Monika. Wtedy grzecznie skieruj rozmowę na przewozy, bilety, rozkłady lub kontakt.
`;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://www.btmonika.com");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      role: item.role === "model" ? "model" : "user",
      parts: [
        {
          text: item.text.slice(0, 3000)
        }
      ]
    }));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Brakuje GEMINI_API_KEY w ustawieniach Vercel."
      });
    }

    const { message, history } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Brakuje wiadomości użytkownika."
      });
    }

    if (message.length > 1200) {
      return res.status(400).json({
        error: "Wiadomość jest za długa."
      });
    }

    const contents = normalizeHistory(history);

    contents.push({
      role: "user",
      parts: [
        {
          text: message.trim()
        }
      ]
    });

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: SYSTEM_PROMPT
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600
          }
        })
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(500).json({
        error: "Błąd połączenia z Gemini.",
        details: data?.error?.message || "Nieznany błąd"
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "Nie udało się wygenerować odpowiedzi.";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Wystąpił błąd serwera."
    });
  }
}
