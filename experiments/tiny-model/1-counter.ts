// Ступенька 1: модель-счётчик.
// Учится на тексте, считая, какое слово шло после какого.
// Запуск: pnpm exec tsx experiments/tiny-model/1-counter.ts

// Весь «интернет», на котором учится модель.
const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
`;

// Защита от бесконечной генерации: самое длинное предложение в тексте — 6 слов,
// берём запас в 2 раза. Если модель так и не дошла до точки — обрываем.
const MAX_WORDS = 12;

// ---------- Текст → массив слов ----------
const words = text.split(/\s+/).filter((w) => w !== "");
// На выходе:
// words = ["я", "смотрю", "фильмы", ".", "я", "смотрю", "грустные", "фильмы", ".", ...]

// ---------- Обучение: считаем пары «слово → следующее» ----------
const counts: Record<string, Record<string, number>> = {};

for (let i = 0; i < words.length - 1; i++) {
  const current = words[i];
  const next = words[i + 1];
  if (current === ".") continue; // после точки начинается новое предложение
  counts[current] ??= {};
  counts[current][next] = (counts[current][next] ?? 0) + 1;
}
// На выходе:
// counts = {
//   "я":      { "смотрю": 2, "люблю": 2 },
//   "смотрю": { "фильмы": 1, "грустные": 1 },
//   "фильмы": { ".": 4, "про": 1 },
//   ...
// }

// ---------- Счётчики → вероятности ----------
function probabilities(word: string): Record<string, number> {
  const row = counts[word] ?? {};
  const total = Object.values(row).reduce((sum, n) => sum + n, 0);
  const result: Record<string, number> = {};
  for (const [next, n] of Object.entries(row)) result[next] = n / total;
  return result;
}
// На выходе, например:
// probabilities("фильмы") = { ".": 0.8, "про": 0.2 }   // 4 из 5 и 1 из 5
// probabilities("я")      = { "смотрю": 0.5, "люблю": 0.5 }

// ---------- Печать модели ----------
console.log("Модель (таблица параметров):");
for (const word of Object.keys(counts)) {
  const row = Object.entries(probabilities(word))
    .map(([next, p]) => `${next} ${Math.round(p * 100)}%`)
    .join(",  ");
  console.log(`  после "${word}" → ${row}`);
}
// На выходе в консоли:
//   после "я" → смотрю 50%,  люблю 50%
//   после "фильмы" → . 80%,  про 20%
//   ...

// ---------- Случайный выбор с учётом вероятностей ----------
// Линейка от 0 до 1, у каждого слова отрезок своей длины; Math.random() — точка на ней.
function pick(probs: Record<string, number>): string {
  let r = Math.random();
  for (const [word, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return word;
  }
  // Страховка: из-за неточности дробей (0.7 + 0.2 + 0.1 = 0.9999999999999999)
  // цикл может закончиться, ничего не выбрав.
  return Object.keys(probs).at(-1) ?? ".";
}
// На выходе, например:
// pick({ ".": 0.8, "про": 0.2 }) → "." примерно в 8 запусках из 10, "про" — в 2

// ---------- Генерация: один шаг — одно слово ----------
function generate(start: string): string {
  const result = [start];
  while (result.at(-1) !== "." && result.length < MAX_WORDS) {
    const last = result.at(-1) ?? ".";
    result.push(pick(probabilities(last)));
  }
  return result.join(" ");
}
// На выходе, например:
// generate("я") → "я люблю грустные фильмы ."
// по шагам: ["я"] → ["я","люблю"] → ["я","люблю","грустные"] → [... "фильмы"] → [... "."]

console.log("\nГенерация (5 попыток, начиная с «я»):");
for (let i = 0; i < 5; i++) console.log(`  ${generate("я")}`);
