// Ступенька 2: температура.
// Та же модель-счётчик, что в 1-counter.ts, плюс одна ручка — temperature.
// Запуск: pnpm exec tsx experiments/tiny-model/2-temperature.ts

const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
`;

// Самое длинное предложение в тексте — 6 слов, берём запас в 2 раза.
const MAX_WORDS = 12;

// Температуры, которые сравниваем: почти всегда берёт самое вероятное, «как есть», очень смелая.
const TEMPERATURES = [0.1, 1, 5];

// ---------- Обучение (без изменений, см. 1-counter.ts) ----------
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
// На выходе: probabilities("фильмы") = { ".": 0.8, "про": 0.2 }

// ---------- НОВОЕ: температура ----------
// Растягивает или сплющивает разницу между вероятностями ДО броска.
// Как: каждое число возводим в степень 1/temperature и снова делим на сумму,
// чтобы в сумме опять вышло 1.
//   temperature < 1 → степень больше 1 → большие числа растут относительно маленьких
//   temperature = 1 → степень 1 → ничего не меняется
//   temperature > 1 → степень меньше 1 → числа сближаются
function applyTemperature(
  probs: Record<string, number>,
  temperature: number,
): Record<string, number> {
  const powered: Record<string, number> = {};
  for (const [word, p] of Object.entries(probs)) powered[word] = p ** (1 / temperature);
  const total = Object.values(powered).reduce((sum, n) => sum + n, 0);
  const result: Record<string, number> = {};
  for (const [word, n] of Object.entries(powered)) result[word] = n / total;
  return result;
}
// На выходе для { ".": 0.8, "про": 0.2 }:
//   temperature 0.1 → { ".": ~1.00, "про": ~0.00 }
//   temperature 1   → { ".": 0.80,  "про": 0.20 }
//   temperature 5   → { ".": ~0.57, "про": ~0.43 }

// ---------- Выбор слова (без изменений) ----------
function pick(probs: Record<string, number>): string {
  let r = Math.random();
  for (const [word, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return word;
  }
  return Object.keys(probs).at(-1) ?? ".";
}

// ---------- Генерация: теперь с температурой ----------
function generate(start: string, temperature: number): string {
  const result = [start];
  while (result.at(-1) !== "." && result.length < MAX_WORDS) {
    const last = result.at(-1) ?? ".";
    const probs = applyTemperature(probabilities(last), temperature);
    result.push(pick(probs));
  }
  return result.join(" ");
}
// На выходе: generate("я", 0.1) → «про дружбу» почти не выпадает, но фразы всё равно разные:
//   ничьи (после «я», «смотрю», «люблю» — 50 / 50) температура не трогает

// ---------- Сравнение ----------
function format(probs: Record<string, number>): string {
  return Object.entries(probs)
    .map(([word, p]) => `${word} ${Math.round(p * 100)}%`)
    .join(",  ");
}

for (const t of TEMPERATURES) {
  console.log(`\n===== temperature ${t} =====`);
  console.log(`  после "я"      → ${format(applyTemperature(probabilities("я"), t))}`);
  console.log(`  после "фильмы" → ${format(applyTemperature(probabilities("фильмы"), t))}`);
  console.log("  генерация:");
  for (let i = 0; i < 5; i++) console.log(`    ${generate("я", t)}`);
}
