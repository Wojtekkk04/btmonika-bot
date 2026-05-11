import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const MODEL = "gemini-2.5-flash-lite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const possiblePaths = [
    path.join(__dirname, "..", "knowledge.md"),
    path.join(process.cwd(), "knowledge.md"),
    path.join(process.cwd(), "btmonika-bot", "knowledge.md"),
    path.join(process.cwd(), "btmonika-bot", "btmonika-bot", "knowledge.md"),
    path.join(process.cwd(), "btmonika-bot", "btmonika-bot", "btmonika-bot", "knowledge.md")
  ];

  for (const filePath of possiblePaths) {
    try {
      cachedKnowledge = await readFile(filePath, "utf8");
      console.log("Knowledge loaded from:", filePath);
      return cachedKnowledge;
    } catch (error) {
      // Sprawdzamy kolejną możliwą lokalizację pliku.
    }
  }

  console.error("Knowledge file not found. Checked paths:", possiblePaths);

  // Awaryjna baza, żeby bot nie wywalał błędu 500, nawet jeśli plik knowledge.md nie zostanie znaleziony.
  cachedKnowledge = `
# Awaryjna baza wiedzy BT Monika

BT Monika to lokalna firma zajmująca się przewozem osób.

Firma oferuje:
- przewozy lokalne i regionalne,
- bilety miesięczne,
- przewozy szkolne,
- wycieczki,
- przewozy grupowe,
- wynajem autobusów i busów.

Kontakt:
Telefon: 605 551 105
E-mail: btmonika@onet.eu

Jeśli użytkownik pyta o ceny, dokładne godziny odjazdów, dostępność terminów lub rezerwację, nie wymyślaj danych. Skieruj go do kontaktu z firmą.
`;

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
Jesteś wirtualnym asystentem strony internetowej BT Monika.

Twoim zadaniem jest pomagać użytkownikom strony w sprawach związanych z firmą BT Monika.

ODPOWIADAJ ZAWSZE PO POLSKU.

================================
NAJWAŻNIEJSZE ZASADY
================================

1. Odpowiadaj krótko, jasno, konkretnie i uprzejmie.
2. Korzystaj przede wszystkim z bazy wiedzy podanej niżej.
3. Nie wymyślaj cen, dokładnych godzin odjazdów, tras, numerów przystanków, dostępności pojazdów ani terminów.
4. Jeśli użytkownik pyta o cenę, dokładną godzinę, dostępność terminu, rezerwację lub szczegóły wymagające potwierdzenia, skieruj go do kontaktu z firmą.
5. Nie odsyłaj do telefonu, jeśli możesz normalnie odpowiedzieć z bazy wiedzy.
6. Jeśli nie masz dokładnej informacji, powiedz to uczciwie.
7. Nie udawaj pracownika firmy, który może potwierdzić rezerwację.
8. Nie obiecuj, że firma oddzwoni, jeśli system realnie nie wysyła zgłoszenia.
9. Nie odpowiadaj na tematy niezwiązane z BT Monika.
10. Jeśli pytanie jest niezwiązane z firmą, odpowiedz:
"Pomagam głównie w sprawach związanych z BT Monika: przejazdami, biletami, rozkładami, przewozami grupowymi i kontaktem z firmą."

================================
JAK ODPOWIADAĆ
================================

Dobry styl:
- prosty język,
- krótkie zdania,
- pomocny ton,
- bez przesadnego formalizmu.

Nie zaczynaj każdej odpowiedzi od:
- "Jako asystent..."
- "Jako sztuczna inteligencja..."
- "Niestety nie jestem w stanie..."

Zamiast tego odpowiadaj naturalnie, np.:
"Tak, BT Monika realizuje przewozy grupowe. Do wyceny najlepiej przygotować datę, trasę i liczbę osób."

================================
BAZA WIEDZY
================================

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
