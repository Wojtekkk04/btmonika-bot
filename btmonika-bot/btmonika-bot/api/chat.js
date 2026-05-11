import { KNOWLEDGE } from "./api/knowledge.js";

const MODEL = "gemini-2.5-flash-lite";

const ALLOWED_ORIGINS = [
  "https://btmonika.com",
  "https://www.btmonika.com",
  "http://localhost:3000"
];

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
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-10)
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      role: item.role === "model" ? "model" : "user",
      parts: [
        {
          text: item.text.slice(0, 2000)
        }
      ]
    }));
}

function buildSystemPrompt() {
  return `
Jesteś wirtualnym asystentem strony internetowej BT Monika.

Odpowiadasz użytkownikom strony na pytania związane z firmą BT Monika, przewozami, biletami, rozkładami, wycieczkami, wynajmem autobusów i kontaktem.

ODPOWIADAJ ZAWSZE PO POLSKU.

NAJWAŻNIEJSZE ZASADY:
1. Odpowiadaj krótko, jasno, konkretnie i uprzejmie.
2. Korzystaj z bazy wiedzy podanej niżej.
3. Nie wymyślaj cen, dokładnych godzin odjazdów, tras, numerów przystanków, dostępności pojazdów ani terminów.
4. Jeśli pytanie dotyczy ceny, dokładnej godziny, dostępności terminu, rezerwacji lub płatności, odpowiedz ostrożnie i skieruj do właściwej zakładki strony lub kontaktu z firmą.
5. Nie odsyłaj do telefonu, jeśli możesz normalnie odpowiedzieć z bazy wiedzy.
6. Nie udawaj pracownika firmy, który może potwierdzić rezerwację.
7. Nie obiecuj, że firma oddzwoni, jeśli system realnie nie wysyła zgłoszenia.
8. Jeśli użytkownik pyta o coś niezwiązanego z BT Monika, odpowiedz krótko, że pomagasz głównie w sprawach związanych z przejazdami, biletami, rozkładami i usługami BT Monika.
9. Nie zaczynaj każdej odpowiedzi od „Jako asystent” ani „Jako sztuczna inteligencja”.
10. Jeśli nie masz dokładnej informacji, powiedz to uczciwie.

BAZA WIEDZY:
${KNOWLEDGE}
`;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");

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

    if (message.length > 1500) {
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
                text: buildSystemPrompt()
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 700
          }
        })
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini error:", JSON.stringify(data));

      return res.status(500).json({
        error: "Błąd połączenia z Gemini.",
        details: data?.error?.message || "Nieznany błąd Gemini."
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "Przepraszam, nie udało się przygotować odpowiedzi.";

    return res.status(200).json({
      reply
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Wystąpił błąd serwera."
    });
  }
}
