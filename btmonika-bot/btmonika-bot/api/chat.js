import { KNOWLEDGE } from "./api/knowledge.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const ALLOWED_ORIGINS = [
  "https://btmonika.pl",
  "https://www.btmonika.pl",
  "https://btmonika.com",
  "https://www.btmonika.com",
  "http://localhost:3000"
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://www.btmonika.pl");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cleanHistory(history, currentMessage) {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned = history
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      role: item.role === "model" ? "model" : "user",
      text: item.text.trim().slice(0, 2000)
    }))
    .filter((item) => item.text.length > 0);

  const lastItem = cleaned[cleaned.length - 1];

  /*
    Widget zapisuje wiadomość użytkownika do historii jeszcze przed wysłaniem requestu.
    Gdybyśmy nic nie zrobili, ostatnie pytanie użytkownika trafiałoby do modelu podwójnie:
    raz w "history", drugi raz jako aktualne "message".
    Usuwamy więc duplikat ostatniej wiadomości.
  */
  if (
    lastItem &&
    lastItem.role === "user" &&
    lastItem.text === currentMessage.trim()
  ) {
    cleaned.pop();
  }

  return cleaned.slice(-10);
}

function normalizeHistoryForGemini(history) {
  return history.map((item) => ({
    role: item.role === "model" ? "model" : "user",
    parts: [
      {
        text: item.text
      }
    ]
  }));
}

function normalizeHistoryForGroq(history) {
  return history.map((item) => ({
    role: item.role === "model" ? "assistant" : "user",
    content: item.text
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
3. Nie wymyślaj cen, dokładnych godzin odjazdów, tras, numerów przystanków, dostępności pojazdów ani terminów, jeżeli nie ma ich w bazie wiedzy.
4. Jeśli pytanie dotyczy rozkładu jazdy, najpierw spróbuj udzielić konkretnej odpowiedzi albo dopytać o brakujące informacje: skąd, dokąd i kiedy.
5. Jeśli pytanie dotyczy ceny, dostępności terminu, rezerwacji lub indywidualnej wyceny, odpowiedz ostrożnie i skieruj do formularza „Zamów przejazd” lub kontaktu z firmą.
6. Nie odsyłaj do telefonu, jeśli możesz normalnie odpowiedzieć z bazy wiedzy.
7. Nie udawaj pracownika firmy, który może potwierdzić rezerwację.
8. Nie obiecuj, że firma oddzwoni, jeśli system realnie nie wysyła zgłoszenia.
9. Jeśli użytkownik pyta o coś niezwiązanego z BT Monika, odpowiedz krótko, że pomagasz głównie w sprawach związanych z przejazdami, biletami, rozkładami i usługami BT Monika.
10. Nie zaczynaj każdej odpowiedzi od „Jako asystent” ani „Jako sztuczna inteligencja”.
11. Jeśli nie masz dokładnej informacji, powiedz to uczciwie.
12. Nie przepisuj długich fragmentów bazy wiedzy, tylko odpowiadaj naturalnie i praktycznie.
13. Jeśli użytkownik pyta bardzo ogólnie, zadaj jedno krótkie pytanie doprecyzowujące, zamiast pisać długi wykład.

BAZA WIEDZY:
${KNOWLEDGE}
`;
}

function createProviderError(provider, status, message, details = null) {
  const error = new Error(message);
  error.provider = provider;
  error.status = status;
  error.details = details;
  return error;
}

function shouldFallbackToGroq(error) {
  if (!error) return true;

  const fallbackStatuses = [408, 409, 425, 429, 500, 502, 503, 504];

  if (fallbackStatuses.includes(error.status)) {
    return true;
  }

  /*
    Jeżeli wystąpił błąd sieciowy albo fetch nie zwrócił statusu,
    też przechodzimy awaryjnie na Groq.
  */
  if (!error.status) {
    return true;
  }

  return false;
}

async function askGemini({ apiKey, message, history }) {
  if (!apiKey) {
    throw createProviderError(
      "gemini",
      null,
      "Brakuje GEMINI_API_KEY w ustawieniach Vercel."
    );
  }

  const contents = normalizeHistoryForGemini(history);

  contents.push({
    role: "user",
    parts: [
      {
        text: message.trim()
      }
    ]
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw createProviderError(
      "gemini",
      response.status,
      data?.error?.message || "Błąd połączenia z Gemini.",
      data
    );
  }

  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!reply) {
    throw createProviderError(
      "gemini",
      502,
      "Gemini nie zwrócił poprawnej odpowiedzi.",
      data
    );
  }

  return reply;
}

async function askGroq({ apiKey, message, history }) {
  if (!apiKey) {
    throw createProviderError(
      "groq",
      null,
      "Brakuje GROQ_API_KEY w ustawieniach Vercel."
    );
  }

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt()
    },
    ...normalizeHistoryForGroq(history),
    {
      role: "user",
      content: message.trim()
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.25,
        max_completion_tokens: 700
      })
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw createProviderError(
      "groq",
      response.status,
      data?.error?.message || "Błąd połączenia z Groq.",
      data
    );
  }

  const reply =
    data?.choices?.[0]?.message?.content?.trim() || "";

  if (!reply) {
    throw createProviderError(
      "groq",
      502,
      "Groq nie zwrócił poprawnej odpowiedzi.",
      data
    );
  }

  return reply;
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
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    const { message, history } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Brakuje wiadomości użytkownika."
      });
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return res.status(400).json({
        error: "Wiadomość użytkownika jest pusta."
      });
    }

    if (trimmedMessage.length > 1500) {
      return res.status(400).json({
        error: "Wiadomość jest za długa."
      });
    }

    const cleanedHistory = cleanHistory(history, trimmedMessage);

    /*
      1. Najpierw próbujemy Gemini.
      2. Jeśli Gemini odpowie — kończymy.
      3. Jeśli Gemini padnie przez przeciążenie, limit, timeout albo błąd serwera —
         przełączamy się awaryjnie na Groq.
    */

    try {
      const geminiReply = await askGemini({
        apiKey: geminiApiKey,
        message: trimmedMessage,
        history: cleanedHistory
      });

      console.log("BT Monika AI provider: Gemini");

      return res.status(200).json({
        reply: geminiReply,
        provider: "gemini"
      });
    } catch (geminiError) {
      console.error("Gemini error:", {
        status: geminiError?.status || null,
        message: geminiError?.message || "Nieznany błąd Gemini.",
        details: geminiError?.details || null
      });

      if (!shouldFallbackToGroq(geminiError)) {
        return res.status(500).json({
          error: "Błąd połączenia z Gemini.",
          details: geminiError?.message || "Nieznany błąd Gemini."
        });
      }

      console.warn("Przełączam odpowiedź na Groq fallback.");
    }

    try {
      const groqReply = await askGroq({
        apiKey: groqApiKey,
        message: trimmedMessage,
        history: cleanedHistory
      });

      console.log("BT Monika AI provider: Groq fallback");

      return res.status(200).json({
        reply: groqReply,
        provider: "groq"
      });
    } catch (groqError) {
      console.error("Groq fallback error:", {
        status: groqError?.status || null,
        message: groqError?.message || "Nieznany błąd Groq.",
        details: groqError?.details || null
      });

      return res.status(500).json({
        error: "Czat chwilowo nie działa.",
        details:
          "Nie udało się uzyskać odpowiedzi ani z Gemini, ani z systemu awaryjnego Groq."
      });
    }
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Wystąpił błąd serwera."
    });
  }
}
