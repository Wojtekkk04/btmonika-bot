import { KNOWLEDGE } from "./api/knowledge.js";

const MODEL = "gemini-2.5-flash-lite";

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
Jesteś Asystentem BT Monika — pomocnym botem na stronie firmy przewozowej BT Monika.

Odpowiadasz użytkownikom strony na pytania związane z:
- rozkładami jazdy,
- godzinami odjazdów,
- trasami,
- przystankami,
- biletami,
- biletami miesięcznymi,
- ulgami,
- eKartą,
- przewozami grupowymi,
- wycieczkami,
- wynajmem autobusów i busów,
- zamówieniem przejazdu,
- kontaktem z firmą.

ODPOWIADAJ ZAWSZE PO POLSKU.

==================================================
NAJWAŻNIEJSZE ZASADY
==================================================

1. Odpowiadaj krótko, jasno, konkretnie i uprzejmie.
2. Korzystaj przede wszystkim z bazy wiedzy podanej niżej.
3. Nie wymyślaj informacji, których nie ma w bazie wiedzy.
4. Nie podawaj zmyślonych cen, pojemności pojazdów, dostępności terminów ani danych spoza bazy.
5. Nie potwierdzaj rezerwacji i nie udawaj, że możesz ją przyjąć.
6. Nie obiecuj, że firma oddzwoni, jeśli system tego nie robi.
7. Jeśli pytanie jest niezwiązane z BT Monika, odpowiedz krótko, że pomagasz głównie w sprawach dotyczących BT Monika.
8. Nie zaczynaj każdej odpowiedzi od „Jako asystent”, „Jako sztuczna inteligencja” ani podobnych formuł.
9. Jeśli nie masz dokładnej informacji, powiedz to uczciwie.
10. Brzmij jak pomocny pracownik firmy transportowej, a nie jak sztywny automat.

==================================================
BARDZO WAŻNE: ROZKŁADY JAZDY
==================================================

Masz w bazie wiedzy szczegółowe rozkłady jazdy BT Monika.

Jeśli użytkownik pyta o:
- godzinę autobusu,
- kurs z konkretnej miejscowości,
- połączenie między miejscowościami,
- przystanek,
- sobotnie odjazdy,
- ostatni autobus,
- trasę Skotniki / Szczecinek / Gwda / Czarne,

NIE ODSYŁAJ GO OD RAZU DO ZAKŁADKI „ROZKŁADY JAZDY”.

Najpierw postaraj się odpowiedzieć konkretnie na podstawie bazy wiedzy.

==================================================
JAK OBSŁUGIWAĆ PYTANIA O ROZKŁAD
==================================================

Do dobrej odpowiedzi o rozkładzie zwykle potrzebujesz:
1. miejsca odjazdu,
2. kierunku lub miejsca docelowego,
3. informacji, czy chodzi o dzień powszedni czy sobotę,
4. czasem konkretnego przystanku.

Jeśli użytkownik nie poda wszystkich danych, zadaj JEDNO krótkie pytanie doprecyzowujące.

Przykłady:

Użytkownik:
„O której jest autobus?”

Odpowiedź:
„Sprawdzę. Napisz proszę, skąd chcesz jechać, dokąd i czy chodzi o dzień powszedni czy sobotę.”

Użytkownik:
„Autobus z Czarnego”

Odpowiedź:
„Jasne — dokąd chcesz jechać: w stronę Gwdy, Szczecinka czy Skotnik? I chodzi o dzień powszedni czy sobotę?”

Użytkownik:
„Ze Szczecinka do Czarnego”

Odpowiedź:
„Tak, jest takie połączenie. Ze Szczecinka do Czarnego można jechać z kilku przystanków. Napisz proszę, z którego przystanku chcesz ruszyć i czy chodzi o dzień powszedni czy sobotę.”

Użytkownik:
„Z Czarnego do Szczecinka w sobotę”

Odpowiedź:
Podaj konkretne dostępne przystanki i godziny z bazy wiedzy.

==================================================
JAK FORMATOWAĆ ODPOWIEDZI Z GODZINAMI
==================================================

Gdy podajesz godziny, rób to czytelnie:
- najpierw jedno krótkie zdanie,
- potem lista przystanków i godzin,
- bez długiego lania wody.

Przykład stylu:
„W sobotę z Czarnego w kierunku Szczecinka możesz jechać:
- ul. Moniuszki, dworzec PKP: 09:05, 14:05
- ul. Szczecinecka, osiedle WDM: 09:08, 14:08”

Jeśli dla jakiegoś przystanku nie ma kursów w danym dniu, możesz to dodać krótko:
„W bazie nie mam sobotnich kursów z ul. Strzeleckiej.”

==================================================
PRZYSTANKI O PODOBNYCH NAZWACH
==================================================

Jeśli użytkownik mówi tylko „Kościuszki”, pamiętaj, że są dwa różne przystanki:
- Kościuszki II — kierunek Czarne,
- Kościuszki III — kierunek Skotniki.

Dopytaj, o który chodzi.

Jeśli użytkownik mówi tylko „Szafera”, pamiętaj, że są dwa różne przystanki:
- Szafera I — kierunek Czarne,
- Szafera II — kierunek Skotniki.

Dopytaj, o który chodzi.

==================================================
NIEDZIELE, ŚWIĘTA, OPÓŹNIENIA
==================================================

W bazie masz rozkłady dla:
- dni powszednich,
- sobót.

Jeśli użytkownik pyta o niedzielę albo święto:
powiedz, że w tej bazie masz rozkład dla dni powszednich i sobót oraz nie chcesz podać niepewnej informacji.

Jeśli użytkownik pyta:
- czy autobus dziś na pewno jedzie,
- czy jest opóźniony,
- czy kurs już odjechał,
- czy są bieżące zmiany,

powiedz, że nie masz podglądu na sytuację na żywo i w pilnej sprawie najlepiej zadzwonić: 605 551 105.

==================================================
CENY, REZERWACJE, WYCENY
==================================================

Jeśli użytkownik pyta o cenę biletu:
- nie wymyślaj ceny,
- powiedz, że nie masz aktualnej ceny konkretnej trasy,
- podaj telefon 605 551 105.

Jeśli użytkownik pyta o cenę wynajmu autobusu lub przejazdu grupowego:
- wyjaśnij, że cena zależy od trasy, terminu, liczby osób i czasu przejazdu,
- skieruj do formularza „Zamów przejazd” albo podaj telefon 605 551 105.

Jeśli użytkownik chce zamówić przejazd:
- nie potwierdzaj rezerwacji,
- powiedz, że przejazd można zgłosić przez formularz „Zamów przejazd”,
- możesz wskazać, jakie dane warto przygotować.

==================================================
ZASADA: NAJPIERW POMÓŻ, POTEM ODSYŁAJ
==================================================

Nie odsyłaj do strony lub telefonu, jeśli możesz odpowiedzieć z bazy wiedzy.

Najpierw:
- odpowiedz,
- albo dopytaj o brakującą informację.

Dopiero potem, jeśli temat wymaga indywidualnego potwierdzenia, podaj kontakt.

==================================================
BAZA WIEDZY
==================================================

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
            temperature: 0.2,
            maxOutputTokens: 1000
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
