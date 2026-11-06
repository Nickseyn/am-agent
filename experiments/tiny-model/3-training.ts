// Ступенька 3: обучение.
// Модель НЕ считает пары, а начинает с «ничего не знаю» (все слова поровну)
// и после каждого примера подкручивает числа: правильное слово вверх, остальные вниз.
// Запуск: pnpm exec tsx experiments/tiny-model/3-training.ts

const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
`;

// Самое длинное предложение в тексте — 6 слов, берём запас в 2 раза.
const MAX_WORDS = 12;

// Скорость обучения: на какую долю пути к цели сдвигаем число за один пример.
// 0.1 = «на 10% ближе к правильному ответу». Больше — учится быстрее, но дёргано.
// Опыт: поставь 0.01 — модель придёт точнее («после я» 51/49 вместо 55/45),
// но учится в 10 раз медленнее (после 5 эпох угадывает 18% вместо 50%).
const LEARNING_RATE = 0.1;

// После каких эпох печатаем, как изменилась модель.
const CHECKPOINTS = [0, 1, 5, 50, 500];

// ---------- Подготовка ----------
const words = text.split(/\s+/).filter((w) => w !== "");
// На выходе: words = ["я", "смотрю", "фильмы", ".", "я", ...]

// Словарь: каждое слово по одному разу.
const vocab = [...new Set(words)];
// На выходе: vocab = ["я", "смотрю", "фильмы", ".", "грустные", "люблю", "ты", "смотришь", "про", "дружбу"]

// Обучающие пары «слово → следующее» (после точки пару не берём — там новое предложение).
const pairs: [string, string][] = [];
for (let i = 0; i < words.length - 1; i++) {
  if (words[i] !== ".") pairs.push([words[i], words[i + 1]]);
}
// На выходе: pairs = [["я","смотрю"], ["смотрю","фильмы"], ["фильмы","."], ["я","смотрю"], ...]

// ---------- Модель до обучения: «ничего не знаю» ----------
// model["я"]["смотрю"] = 0.1 — после «я» каждое из 10 слов равновероятно.
const model: Record<string, Record<string, number>> = {};
for (const word of vocab) {
  if (word === ".") continue; // после точки модель ничего не предсказывает
  model[word] = {};
  for (const next of vocab) model[word][next] = 1 / vocab.length;
}
// На выходе: model["я"] = { "я": 0.1, "смотрю": 0.1, "фильмы": 0.1, ... } — 10 слов по 10%

// ---------- Один шаг обучения ----------
// Показали пару «я → смотрю»: правильное слово тянем к 1 (100%), остальные — к 0.
// Сдвигаем на долю LEARNING_RATE от оставшегося пути. Сумма строки остаётся 1.
function trainStep(word: string, correctNext: string): void {
  const row = model[word];
  for (const next of Object.keys(row)) {
    const target = next === correctNext ? 1 : 0;
    row[next] += LEARNING_RATE * (target - row[next]);
  }
}
// На выходе после trainStep("я", "смотрю") из 10% у всех:
//   смотрю: 0.1 + 0.1 * (1 - 0.1) = 0.19   ← выросло
//   люблю:  0.1 + 0.1 * (0 - 0.1) = 0.09   ← упало
//   (и так у всех остальных — по 0.09)

// ---------- Насколько модель угадывает ----------
// Средний процент, который модель даёт ПРАВИЛЬНОМУ следующему слову по всему тексту.
// Растёт — модель учится.
function accuracy(): number {
  const total = pairs.reduce((sum, [word, next]) => sum + model[word][next], 0);
  return total / pairs.length;
}
// На выходе: до обучения ~0.10 (10% — угадывание вслепую из 10 слов)

// ---------- Печать ----------
function format(row: Record<string, number>): string {
  return Object.entries(row)
    .filter(([, p]) => p >= 0.01) // слова меньше 1% не показываем
    .sort((a, b) => b[1] - a[1])
    .map(([w, p]) => `${w} ${Math.round(p * 100)}%`)
    .join(",  ");
}

function report(epoch: number): void {
  console.log(`\n===== после ${epoch} эпох =====`);
  console.log(`  в среднем даёт правильному слову: ${Math.round(accuracy() * 100)}%`);
  console.log(`  после "я"      → ${format(model["я"])}`);
  console.log(`  после "фильмы" → ${format(model["фильмы"])}`);
}

// ---------- Генерация (как в 1-counter.ts) ----------
function pick(probs: Record<string, number>): string {
  let r = Math.random();
  for (const [word, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return word;
  }
  return Object.keys(probs).at(-1) ?? ".";
}

function generate(start: string): string {
  const result = [start];
  while (result.at(-1) !== "." && result.length < MAX_WORDS) {
    const last = result.at(-1) ?? ".";
    result.push(pick(model[last]));
  }
  return result.join(" ");
}

function sample(): void {
  console.log("  генерация:");
  for (let i = 0; i < 3; i++) console.log(`    ${generate("я")}`);
}

// ---------- Обучение ----------
// Эпоха — один проход по всем парам текста.
const lastEpoch = CHECKPOINTS.at(-1) ?? 0;
for (let epoch = 0; epoch <= lastEpoch; epoch++) {
  if (CHECKPOINTS.includes(epoch)) {
    report(epoch);
    sample();
  }
  for (const [word, next] of pairs) trainStep(word, next);
}
