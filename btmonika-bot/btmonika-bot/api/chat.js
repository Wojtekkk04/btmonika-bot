import { readFile } from "fs/promises";
import path from "path";

const MODEL = "gemini-2.5-flash-lite";

const ALLOWED_ORIGINS = [
  "https://btmonika.com",
  "https://www.btmonika.com",
  "http://localhost:3000"
];

let cachedKnowledge = null;

async function getKnowledge() {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }

  const knowledgePath = path.join(process.cwd(), "knowledge.md");
  cachedKnowledge = await readFile(knowledgePath, "utf8");
  return cachedKnowledge;
}

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

function buildSystemPrompt(knowledge) {
  return `
Jesteś wirtualnym asystentem strony BT Monika.

Masz odpowiadać użytkownikom wyłącznie na podstawie poniższej bazy wiedzy oraz zasad bezpieczeństwa.

NAJWAŻNIEJSZE ZASADY:
1. Odpowiadaj zawsze po polsku.
2. Odpowiadaj krótko, jasno i pomocnie.
3. Nie wymyślaj cen, godzin odjazdów, tras, dostępności pojazdów ani szczegółów, których nie ma w bazie wiedzy.
4. Jeśli użytkownik pyta o dokładną cenę, godzinę, dostępność terminu lub rezerwację, skieruj go do formularza na stronie albo do kontaktu telefonicznego.
5. Nie mów ciągle "proszę zadzwonić", jeśli możesz odpowiedzieć na podstawie bazy wiedzy.
6. Jeśli pytanie jest niezwiązane z BT Monika, uprzejmie napisz, że pomagasz w sprawach przejazdów, biletów, rozkładów i usług BT Monika.
7. Nie udawaj, że rezerwujesz przejazd. Możesz tylko pomóc przygotować informacje do zapytania.
8. Nie obiecuj, że firma oddzwoni, jeśli system realnie nie wysyła zgłoszenia do firmy.
9. Jeśli użytkownik poda dane osobowe, nie powtarzaj ich niepotrzebnie i nie proś o więcej danych niż potrzeba.
10. Jeśli brakuje informacji, powiedz to uczciwie.

BAZA WIEDZY:
${knowledge}
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

    const knowledge = await getKnowledge();
    const systemPrompt = buildSystemPrompt(knowledge);

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
                text: systemPrompt
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.25,
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
