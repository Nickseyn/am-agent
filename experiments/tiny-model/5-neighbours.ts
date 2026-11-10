// Ступенька 5: генерация с подмешиванием соседей по карте.
// Модель-счётчик (как в 1-counter.ts) + карта слов из 4-vectors.ts.
// Угадывая слово после X, смешиваем опыт самого X с опытом слов, которые на карте ближе MAX_NEIGHBOUR_DISTANCE.
// Запуск: сначала pnpm exec tsx experiments/tiny-model/4-vectors.ts (он сохраняет карту),
//         потом pnpm exec tsx experiments/tiny-model/5-neighbours.ts

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
`;

// Самое длинное предложение в тексте — 6 слов, берём запас в 2 раза.
const MAX_WORDS = 12;
// Какую долю веса оставляем СВОЕМУ опыту слова. Остальное делим между соседями по близости.
const OWN_WEIGHT = 0.5;
// Соседом считается только слово ближе этого расстояния на карте (тот же порог, что у групп в 4-vectors.ts).
// Без порога соседями становятся и далёкие слова, просто потому что ближе никого нет.
const MAX_NEIGHBOUR_DISTANCE = 0.6;

// ---------- Карта из ступеньки 4 ----------
// Файл пришёл снаружи программы — проверяем форму, а не верим на слово (так же src/llm.ts проверяет ответ Ollama).
const MapSchema = z.object({
  points: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
});
const mapFile = new URL("./out/vectors.json", import.meta.url);
if (!existsSync(mapFile)) {
  console.log("Нет карты слов. Сначала запусти: pnpm exec tsx experiments/tiny-model/4-vectors.ts");
  process.exit(1);
}
const map = MapSchema.parse(JSON.parse(readFileSync(mapFile, "utf8"))).points;
// На выходе: map = { "я": { x: 0.02, y: 1.48 }, "смотрю": { x: 0.32, y: -0.50 }, ... }

// ---------- Модель-счётчик (как в 1-counter.ts) ----------
const words = text.split(/\s+/).filter((w) => w !== "");
const counts: Record<string, Record<string, number>> = {};
for (let i = 0; i < words.length - 1; i++) {
  const current = words[i];
  const next = words[i + 1];
  if (current === ".") continue;
  counts[current] ??= {};
  counts[current][next] = (counts[current][next] ?? 0) + 1;
}

function probabilities(word: string): Record<string, number> {
  const row = counts[word] ?? {};
  const total = Object.values(row).reduce((sum, n) => sum + n, 0);
  const result: Record<string, number> = {};
  for (const [next, n] of Object.entries(row)) result[next] = n / total;
  return result;
}
// На выходе: probabilities("смотришь") = { "фильмы": 1 }

// ---------- НОВОЕ: соседи по карте ----------
// Только слова ближе MAX_NEIGHBOUR_DISTANCE. Близость: 1 у точки вплотную, 0 на краю радиуса.
type Neighbour = { word: string; closeness: number };
function neighbours(word: string): Neighbour[] {
  const me = map[word];
  return Object.keys(map)
    .filter((other) => other !== word && counts[other]) // соседу нужен свой опыт — строка в таблице
    .map((other) => {
      const distance = Math.hypot(map[other].x - me.x, map[other].y - me.y);
      return { word: other, closeness: 1 - distance / MAX_NEIGHBOUR_DISTANCE };
    })
    .filter((n) => n.closeness > 0)
    .sort((a, b) => b.closeness - a.closeness);
}
// На выходе, например:
//   neighbours("смотришь") = [люблю ~1.00, смотрю ~0.97, грустные ~0.44]   ← соседей может быть сколько угодно
//   neighbours("я")        = [ты ~0.78]                                    ← «дружбу» больше не сосед

// ---------- НОВОЕ: смешивание ----------
// Своя строка с весом OWN_WEIGHT + строки соседей: остаток (1 - OWN_WEIGHT) делится пропорционально близости.
// Нет близких соседей — слово пользуется только своим опытом, на 100%.
function mixed(word: string): Record<string, number> {
  const near = neighbours(word);
  if (near.length === 0) return probabilities(word);

  const result: Record<string, number> = {};
  const add = (row: Record<string, number>, weight: number) => {
    for (const [next, p] of Object.entries(row)) result[next] = (result[next] ?? 0) + p * weight;
  };
  add(probabilities(word), OWN_WEIGHT);
  const totalCloseness = near.reduce((sum, n) => sum + n.closeness, 0);
  for (const n of near) add(probabilities(n.word), (1 - OWN_WEIGHT) * (n.closeness / totalCloseness));
  return result;
}
// На выходе:
//   mixed("смотришь") ≈ { "фильмы": 0.80, "грустные": 0.20 }
//     (с двумя соседями «люблю» и «смотрю» было бы 75 / 25, но в радиус попал третий — «грустные»,
//      а после него всегда «фильмы»)
//   mixed("я")        = { "смотрю": 0.25, "люблю": 0.25, "смотришь": 0.5 }   ← «я смотришь» стало ЧАЩЕ

// ---------- Генерация (как в 1-counter.ts, но с выбором, откуда брать проценты) ----------
function pick(probs: Record<string, number>): string {
  let r = Math.random();
  for (const [word, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return word;
  }
  return Object.keys(probs).at(-1) ?? ".";
}

function generate(start: string, useNeighbours: boolean): string {
  const result = [start];
  while (result.at(-1) !== "." && result.length < MAX_WORDS) {
    const last = result.at(-1) ?? ".";
    result.push(pick(useNeighbours ? mixed(last) : probabilities(last)));
  }
  return result.join(" ");
}

// ---------- Сравнение ----------
function format(probs: Record<string, number>): string {
  return Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .map(([w, p]) => `${w} ${Math.round(p * 100)}%`)
    .join(",  ");
}

console.log("Таблица: без соседей → с соседями");
for (const word of Object.keys(counts)) {
  console.log(`\n  после "${word}"`);
  console.log(`    без:        ${format(probabilities(word))}`);
  const near = neighbours(word);
  const nearText = near.length > 0 ? near.map((n) => `${n.word} (близость ${n.closeness.toFixed(2)})`).join(", ") : "нет близких";
  console.log(`    с соседями: ${format(mixed(word))}    ← соседи: ${nearText}`);
}

for (const start of ["я", "ты"]) {
  console.log(`\nГенерация с «${start}»:`);
  console.log("  без соседей:");
  for (let i = 0; i < 5; i++) console.log(`    ${generate(start, false)}`);
  console.log("  с соседями:");
  for (let i = 0; i < 5; i++) console.log(`    ${generate(start, true)}`);
}
