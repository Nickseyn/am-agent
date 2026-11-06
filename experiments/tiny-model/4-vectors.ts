// Ступенька 4: векторы слов.
// Каждое слово — точка на плоскости (два числа: x и y).
// Правило: у слов есть общие соседи → притягиваем точки; нет и они слишком близко → отталкиваем.
// Запуск: pnpm exec tsx experiments/tiny-model/4-vectors.ts
// Результат: experiments/tiny-model/out/vectors.html — открыть в браузере.

import { saveVectorChart, type Point, type Snapshot } from "./study-tools/vector-chart.ts";

const text = `
я смотрю фильмы .
я смотрю грустные фильмы .
я люблю грустные фильмы .
ты смотришь фильмы .
я люблю фильмы про дружбу .
`;

// Насколько сильно за шаг притягиваем слова с общими соседями.
const PULL_RATE = 0.02;
// Насколько сильно за шаг отталкиваем слова без общих соседей.
const PUSH_RATE = 0.02;
// Ближе этого расстояния похожие слова не сближаем — иначе слипнутся в одну точку и подписи наложатся.
const MIN_SIMILAR_DISTANCE = 0.25;
// Слова без общих соседей расталкиваем, пока они ближе этого расстояния.
const MIN_DIFFERENT_DISTANCE = 1;
// Слова ближе этого расстояния в конце обучения считаем одной группой (для раскраски диаграммы).
const GROUP_DISTANCE = 0.6;
// После каких эпох сохраняем снимок для диаграммы.
const CHECKPOINTS = [0, 50, 500];
// Зерно случайности: с ним стартовые точки при каждом запуске одинаковые,
// чтобы картинку можно было разбирать вместе. Поменяй число — получишь другой старт.
const SEED = 42;

// ---------- Подготовка ----------
const words = text.split(/\s+/).filter((w) => w !== "");
// Точку не рисуем: это знак, а не слово.
const vocab = [...new Set(words)].filter((w) => w !== ".");
// На выходе: vocab = ["я", "смотрю", "фильмы", "грустные", "люблю", "ты", "смотришь", "про", "дружбу"]

// ---------- Соседи ----------
// neighbours["смотрю"] = { "←я", "→фильмы", "→грустные" }
// Стрелка показывает сторону: «←я» — «я» стоит ПЕРЕД словом, «→фильмы» — ПОСЛЕ.
const neighbours: Record<string, Set<string>> = {};
for (let i = 0; i < words.length; i++) {
  const word = words[i];
  if (word === ".") continue;
  const before = i === 0 || words[i - 1] === "." ? "<старт>" : words[i - 1];
  const after = words[i + 1];
  neighbours[word] ??= new Set();
  neighbours[word].add(`←${before}`);
  neighbours[word].add(`→${after}`);
}
// На выходе:
//   neighbours["смотрю"] = { "←я", "→фильмы", "→грустные" }
//   neighbours["люблю"]  = { "←я", "→грустные", "→фильмы" }   ← те же самые!

// Сколько соседей у двух слов общие.
function sharedNeighbours(a: string, b: string): number {
  let count = 0;
  for (const n of neighbours[a]) if (neighbours[b].has(n)) count++;
  return count;
}
// На выходе: sharedNeighbours("смотрю", "люблю") = 3,  sharedNeighbours("смотрю", "про") = 0

// ---------- Случайный старт ----------
// Простой генератор «случайных» чисел из зерна: одно и то же зерно → одни и те же числа. Нужен для одинаковых векторных диаграмм
let seed = SEED;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const vectors: Record<string, Point> = {};
for (const word of vocab) vectors[word] = { x: random() * 2 - 1, y: random() * 2 - 1 };
// На выходе: vectors["я"] = { x: -0.43, y: 0.71 } — случайная точка от −1 до 1

// ---------- Одна эпоха обучения ----------
// Перебираем все пары слов и двигаем их точки.
// Сложность O(n²) по числу слов: каждой паре нужно своё решение (притянуть / оттолкнуть / ничего),
// поэтому пропустить пары нельзя. Для 9 слов это 36 пар — мгновенно.
// Настоящие модели так не делают: притягивают только пары, реально стоявшие рядом в тексте,
// а отталкивают несколько СЛУЧАЙНЫХ слов (negative sampling, как в word2vec) — это O(длина текста).
function trainEpoch(): void {
  for (let i = 0; i < vocab.length; i++) {
    for (let j = i + 1; j < vocab.length; j++) {
      const a = vectors[vocab[i]];
      const b = vectors[vocab[j]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const shared = sharedNeighbours(vocab[i], vocab[j]);

      if (shared > 0 && distance > MIN_SIMILAR_DISTANCE) {
        // Похожие: каждый делает шаг навстречу другому. Чем больше общих соседей — тем сильнее.
        const step = PULL_RATE * shared;
        a.x += step * dx;
        a.y += step * dy;
        b.x -= step * dx;
        b.y -= step * dy;
      } else if (shared === 0 && distance < MIN_DIFFERENT_DISTANCE) {
        // Непохожие и слишком близко: каждый делает шаг прочь от другого.
        a.x -= PUSH_RATE * dx;
        a.y -= PUSH_RATE * dy;
        b.x += PUSH_RATE * dx;
        b.y += PUSH_RATE * dy;
      }
    }
  }
}

// ---------- Обучение со снимками ----------
const snapshots: Snapshot[] = [];
const lastEpoch = CHECKPOINTS.at(-1) ?? 0;
for (let epoch = 0; epoch <= lastEpoch; epoch++) {
  if (CHECKPOINTS.includes(epoch)) {
    // Копия, а не ссылка: иначе все снимки покажут одно и то же финальное состояние.
    const points: Record<string, Point> = {};
    for (const word of vocab) points[word] = { ...vectors[word] };
    snapshots.push({ epoch, points });
  }
  trainEpoch();
}
// На выходе: snapshots = [{ epoch: 0, points: {...} }, { epoch: 50, ... }, { epoch: 500, ... }]

// ---------- Консоль ----------
// Печатаем как схему: «кто стоит перед ← СЛОВО → кто стоит после».
console.log("Соседи слов (слева — кто стоит перед словом, справа — после):");
const rows = vocab.map((word) => {
  const all = [...neighbours[word]];
  const before = all.filter((n) => n.startsWith("←")).map((n) => n.slice(1)).join(", ");
  const after = all.filter((n) => n.startsWith("→")).map((n) => n.slice(1)).join(", ");
  return { word, before, after };
});
// Выравниваем по ширине самого длинного списка слева, чтобы слова стояли в одну колонку.
const beforeWidth = Math.max(...rows.map((r) => r.before.length));
const wordWidth = Math.max(...rows.map((r) => r.word.length));
for (const r of rows) {
  console.log(`  ${r.before.padStart(beforeWidth)} ← ${r.word.padEnd(wordWidth)} → ${r.after}`);
}
// На выходе:
//                             <старт> ← я        → смотрю, люблю
//                                   я ← смотрю   → фильмы, грустные
//   смотрю, грустные, смотришь, люблю ← фильмы   → ., про

// ---------- Диаграммы ----------
// Учебный инструмент из study-tools/: рисует снимки точек в HTML, чтобы глазами увидеть,
// как слова съезжались при обучении. На саму модель не влияет.
const outFile = new URL("./out/vectors.html", import.meta.url);
const groups = saveVectorChart({ vocab, snapshots, outFile, groupDistance: GROUP_DISTANCE, trainingText: text });
// На выходе: groups = [["я", "ты"], ["смотрю", "люблю", ...], ...] и файл out/vectors.html

console.log("\nГруппы после обучения:");
groups.forEach((group, i) => console.log(`  группа ${i + 1}: ${group.join(", ")}`));
console.log(`\nДиаграммы: ${outFile.pathname.replace(/^\/([A-Z]:)/, "$1")}`);
