// Ступенька 6: attention — смотрим не только на последнее слово, а на всё предложение.
// Каждое предыдущее слово даёт своё «мнение» о следующем слове, а доля внимания решает, чьё мнение весит сколько.
// Сравниваем пять способов: без attention / поровну / ближе = больше / по смыслу / смысл + расстояние.
// Запуск: pnpm exec tsx experiments/tiny-model/6-attention.ts

// Первые 5 предложений — старый текст. Остальные 5 — новые, под attention:
//   6–7  «очень» между лицом и глаголом: последнего слова уже не хватает;
//   8–9  ловушка для «ближе = больше»: рядом стоит бесполезное «сегодня», а решает далёкое «ты»/«я»;
//   10   ловушка для «поровну»: в предложении два лица, решает ближнее «я».
//        Не сработала: «знаешь» есть только в этом предложении и запомнило ответ «люблю».
const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
я очень люблю фильмы .
ты очень любишь фильмы .
я сегодня очень люблю фильмы .
ты сегодня очень любишь фильмы .
ты знаешь я очень люблю фильмы .
`;

// Самое длинное предложение — 7 слов, берём запас.
const MAX_WORDS = 14;

// ---------- Подготовка: текст по предложениям ----------
// В ступеньках 1–5 текст был одной лентой слов. Теперь нужны границы предложений:
// мнение слова — это то, что происходило в ЕГО предложениях.
const sentences = text
  .trim()
  .split("\n")
  .map((line) => line.trim().split(/\s+/));
// На выходе: sentences = [["я","смотрю","фильмы","."], ["я","смотрю","грустные","фильмы","."], ...]

// ---------- НОВОЕ: мнение одного слова ----------
// «Что шло после last в тех предложениях, где voter стоял раньше него».
// Если voter и есть last — это обычный счётчик из ступеньки 1: что шло после меня вообще.
function opinion(voter: string, last: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sentences) {
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] !== last) continue;
      const voterWasBefore = voter === last || s.slice(0, i).includes(voter);
      if (!voterWasBefore) continue;
      counts[s[i + 1]] = (counts[s[i + 1]] ?? 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const result: Record<string, number> = {};
  for (const [next, n] of Object.entries(counts)) result[next] = n / total;
  return result;
}
// На выходе:
//   opinion("очень", "очень") = { люблю: 0.6, любишь: 0.4 }   ← после «очень» вообще
//   opinion("сегодня", "очень") = { люблю: 0.5, любишь: 0.5 } ← «сегодня» про лицо ничего не знает
//   opinion("дружбу", "очень")  = {}                          ← вместе не встречались — мнения нет

// ---------- НОВОЕ: доли внимания ----------
// "none"     — без attention: голосует только последнее слово (как ступенька 1).
// "equal"    — все слова фразы поровну.
// "distance" — ближе = больше: последнее слово 1, перед ним 1/2, ещё раньше 1/3 потом 1/4 ...
// "meaning"  — по смыслу: последнее слово задаёт вопрос, у каждого слова есть метка;
//              метка подходит к вопросу → вес MATCH_WEIGHT, не подходит → NO_MATCH_WEIGHT.
// "meaningDistance" — смысл + расстояние: вес по смыслу × вес «ближе = больше».
type Mode = "none" | "equal" | "distance" | "meaning" | "meaningDistance";

// Вопросы и метки заданы РУКАМИ — это костыль.
// В настоящих моделях вопрос (query) и метка (key) — числа, которые модель выучивает сама.
// Вопрос есть только у «очень»: в нашем тексте это единственное место, где лицо стоит далеко от глагола.
// У слов без вопроса все веса по смыслу одинаковые — как «поровну».
const QUESTIONS: Record<string, string> = { очень: "лицо" };
const LABELS: Record<string, string> = {
  я: "лицо",
  ты: "лицо",
  сегодня: "время",
  знаешь: "действие",
  очень: "усиление",
};
const MATCH_WEIGHT = 3;
const NO_MATCH_WEIGHT = 1;

function meaningWeight(voter: string, last: string): number {
  const question = QUESTIONS[last];
  return question !== undefined && LABELS[voter] === question ? MATCH_WEIGHT : NO_MATCH_WEIGHT;
}
// На выходе: meaningWeight("ты", "очень") = 3, meaningWeight("сегодня", "очень") = 1

// Насколько сильно расстояние гасит вес в режиме «смысл + расстояние».
// 1 — как в «ближе = больше»: 1, 1/2, 1/3 ...;  0 — расстояние не влияет, остаётся чистый смысл.
// Опыт: поставь 0.5 — шаг назад будет весить 1 / 1.5 ≈ 0.67 вместо 1/2.
const DISTANCE_STRENGTH = 0.25;

function distanceWeight(stepsBack: number, strength: number): number {
  return 1 / (1 + strength * stepsBack);
}

function weight(mode: Mode, stepsBack: number, voter: string, last: string): number {
  if (mode === "none") return stepsBack === 0 ? 1 : 0;
  if (mode === "equal") return 1;
  if (mode === "distance") return distanceWeight(stepsBack, 1);
  if (mode === "meaning") return meaningWeight(voter, last);
  return meaningWeight(voter, last) * distanceWeight(stepsBack, DISTANCE_STRENGTH);
}
// На выходе для «ты знаешь я очень», режим meaningDistance при DISTANCE_STRENGTH = 1:
//   ты 3 × 1/4 = 0.75,  знаешь 1 × 1/3 = 0.33,  я 3 × 1/2 = 1.5,  очень 1 × 1 = 1
//   «я» и «ты» оба — лицо, но ближнее «я» весит вдвое больше

// ---------- НОВОЕ: голосование ----------
// Каждое слово фразы, которую продолжаем (context), даёт мнение, мнения смешиваются по долям.
// Слова без мнения пропускаем — их доля делится между остальными.
type Vote = { word: string; share: number };

function attend(context: string[], mode: Mode): { probs: Record<string, number>; votes: Vote[] } {
  const last = context[context.length - 1];
  const voters = context
    .map((word, i) => ({ word, w: weight(mode, context.length - 1 - i, word, last), op: opinion(word, last) }))
    .filter((v) => v.w > 0 && Object.keys(v.op).length > 0);
  const totalWeight = voters.reduce((sum, v) => sum + v.w, 0);

  const probs: Record<string, number> = {};
  for (const v of voters) {
    for (const [next, p] of Object.entries(v.op)) probs[next] = (probs[next] ?? 0) + p * (v.w / totalWeight);
  }
  return { probs, votes: voters.map((v) => ({ word: v.word, share: v.w / totalWeight })) };
}
// На выходе, фраза ["ты", "очень"], mode "equal":
//   votes = [ты 50%, очень 50%]
//   probs ≈ люблю 47%, любишь 53%
//   (у «ты» не «любишь 100%», а 67%: в предложении 10 «ты знаешь я очень люблю» после «очень» стоит «люблю»)

// ---------- Генерация (как в 1-counter.ts, но в выбор идёт вся уже написанная фраза, а не последнее слово) ----------
function pick(probs: Record<string, number>): string {
  let r = Math.random();
  for (const [word, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return word;
  }
  return Object.keys(probs).at(-1) ?? ".";
}

function generate(start: string, mode: Mode): string[] {
  const result = [start];
  while (result.at(-1) !== "." && result.length < MAX_WORDS) {
    result.push(pick(attend(result, mode).probs));
  }
  return result;
}

// ---------- НОВОЕ: проверка лица ----------
// Ошибка — глагол не того лица: его форма должна совпадать с БЛИЖАЙШИМ «я» или «ты» перед ним.
const VERB_PERSON: Record<string, string> = { смотрю: "я", люблю: "я", смотришь: "ты", любишь: "ты" };

function hasPersonError(words: string[]): boolean {
  let person: string | undefined;
  for (const word of words) {
    if (word === "я" || word === "ты") person = word;
    const verbPerson = VERB_PERSON[word];
    if (verbPerson !== undefined && verbPerson !== person) return true;
  }
  return false;
}
// На выходе:
//   hasPersonError(["ты","знаешь","я","очень","люблю","фильмы","."])  = false ← ближайшее лицо «я»
//   hasPersonError(["ты","знаешь","я","очень","любишь","фильмы","."]) = true

// ---------- Печать ----------
function format(probs: Record<string, number>): string {
  return Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .map(([w, p]) => `${w} ${Math.round(p * 100)}%`)
    .join(",  ");
}

function formatVotes(votes: Vote[]): string {
  return votes.map((v) => `${v.word} ${Math.round(v.share * 100)}%`).join(", ");
}

const MODES: { mode: Mode; title: string }[] = [
  { mode: "none", title: "без attention" },
  { mode: "equal", title: "поровну      " },
  { mode: "distance", title: "ближе=больше " },
  { mode: "meaning", title: "по смыслу    " },
  { mode: "meaningDistance", title: "смысл+расст. " },
];

// Контексты для сравнения: от простого к ловушкам.
const CASES = [
  ["ты", "очень"],
  ["я", "очень"],
  ["ты", "сегодня", "очень"], // ловушка для «ближе = больше»
  ["я", "сегодня", "очень"],
  ["ты", "знаешь", "я", "очень"], // ловушка для «поровну» (не сработала — см. предложение 10 вверху)
  ["ты", "очень", "любишь"], // голосуют три слова, но все согласны: после «любишь» в тексте только «фильмы»
];

console.log("Что идёт дальше: пять способов");
for (const context of CASES) {
  console.log(`\n  «${context.join(" ")} ___»`);
  for (const { mode, title } of MODES) {
    const { probs, votes } = attend(context, mode);
    console.log(`    ${title}: ${format(probs)}    ← доли: ${formatVotes(votes)}`);
  }
}

// Сколько фраз генерируем на каждый режим и каждое начало. 5 — лотерея, 1000 — уже статистика.
const RUNS = 20000;

console.log(`\nОшибки лица в генерации (по ${RUNS} фраз на каждое начало):`);
console.log("  ошибка = глагол не того лица: форма должна совпадать с БЛИЖАЙШИМ «я» или «ты» перед ним");
console.log("  «ты знаешь я очень люблю» — верно,  «ты знаешь я очень любишь» — ошибка,  «я очень любишь» — ошибка\n");
for (const { mode, title } of MODES) {
  const parts: string[] = [];
  let example = "";
  for (const start of ["я", "ты"]) {
    let errors = 0;
    for (let i = 0; i < RUNS; i++) {
      const words = generate(start, mode);
      if (hasPersonError(words)) {
        errors++;
        example ||= words.join(" ");
      }
    }
    parts.push(`с «${start}» ${((errors / RUNS) * 100).toFixed(1)}%`);
  }
  console.log(`  ${title}: ${parts.join(",  ")}    ${example ? `← например: ${example}` : ""}`);
}
