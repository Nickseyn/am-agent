// Учебный инструмент: рисует векторы слов как диаграммы в HTML.
// К самой модели отношения не имеет — нужен только чтобы глазами увидеть,
// как точки двигались при обучении. Логику модели читай в 4-vectors.ts.

import { mkdirSync, writeFileSync } from "node:fs";

export type Point = { x: number; y: number };
export type Snapshot = { epoch: number; points: Record<string, Point> };

type ChartOptions = {
  vocab: string[];
  snapshots: Snapshot[];
  // Куда сохранить HTML.
  outFile: URL;
  // Слова ближе этого расстояния на итоговой карте считаем одной группой (для раскраски).
  groupDistance: number;
  // Текст, на котором училась модель: показываем под графиками, чтобы было видно, откуда взялись соседи.
  trainingText: string;
};

// Тёмно-серая палитра, чтобы белым не слепило.
const PAGE_BG = "#2C2C2A";
const CHART_BG = "#3D3D3A";
const GRID = "#4F4E4A";
const TEXT = "#E8E6DF";
const MUTED = "#B4B2A9";
// Цвет пути «откуда пришло слово»: и пунктир, и наконечник одного цвета.
const PATH_COLOR = "#9C9A92";
// Цвета групп — светлые оттенки, чтобы читались на тёмном фоне.
const COLORS = ["#AFA9EC", "#5DCAA5", "#F0997B", "#ED93B1", "#85B7EB", "#FAC775", "#97C459", "#D3D1C7"];

// Размер одной диаграммы в «внутренних» единицах SVG. На экране она растягивается на ширину колонки.
const SIZE = 360;
const PADDING = 52;
const DOT_RADIUS = 5;
// Зазор между остриём стрелки и краем кружка.
const ARROW_GAP_PX = 4;
// Пути короче этого рисуем без наконечника: он не помещается и превращается в кашу.
const MIN_ARROW_PX = 12;
// Сколько делений подписывать на каждой оси.
const TICKS = 5;

// Сохраняет HTML с диаграммой на каждый снимок и возвращает найденные группы слов.
export function saveVectorChart({ vocab, snapshots, outFile, groupDistance, trainingText }: ChartOptions): string[][] {
  const groupOf = findGroups(vocab, snapshots.at(-1)?.points ?? {}, groupDistance);

  const charts = snapshots.map((snapshot, i) => chart(vocab, snapshots, groupOf, snapshot, snapshots[i - 1]));

  // Сноска «номер — слово»: на диаграммах только номера, чтобы подписи не наезжали друг на друга.
  // Номер — цветной кружок цвета группы, слово рядом.
  const legend = vocab
    .map((w, i) => {
      const color = COLORS[groupOf[w] % COLORS.length];
      return `<li><span class="badge" style="background:${color}">${i + 1}</span>${w}</li>`;
    })
    .join("");

  // Обучающий текст: каждое слово в цвете своей группы и с маленьким номером из сноски.
  // Строки переносятся сами (flex-wrap), поэтому текст любой длины влезает на любой ширине экрана.
  const sentences = trainingText
    .trim()
    .split("\n")
    .map((line) => {
      const words = line
        .trim()
        .split(/\s+/)
        .map((w) => {
          const index = vocab.indexOf(w);
          if (index === -1) return `<span class="word" style="color:${MUTED}">${w}</span>`;
          const color = COLORS[groupOf[w] % COLORS.length];
          return `<span class="word" style="color:${color}">${w}<sup>${index + 1}</sup></span>`;
        })
        .join(" ");
      return `<li>${words}</li>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Векторы слов</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 32px; color: ${TEXT}; background: ${PAGE_BG}; }
  h1 { font-size: 44px; font-weight: 500; text-align: center; margin: 0 0 16px; }
  p { font-size: 24px; color: ${MUTED}; text-align: center; margin: 0 0 32px; line-height: 1.5; }
  .row { display: grid; grid-template-columns: auto repeat(${snapshots.length}, minmax(0, 1fr)); gap: 24px; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: 22px; font-style: italic; color: ${MUTED}; margin-top: 10px; }
  svg { width: 100%; height: auto; display: block; }
  ol { list-style: none; margin: 0; padding: 20px 24px; background: ${CHART_BG}; border-radius: 12px; font-size: 26px; line-height: 2.1; }
  .badge { display: inline-block; width: 1.6em; height: 1.6em; line-height: 1.6em; margin-right: 12px; border-radius: 50%;
           text-align: center; font-weight: 600; font-size: 0.8em; color: ${PAGE_BG}; vertical-align: middle; }
  .training { margin-top: 32px; padding: 20px 28px; background: ${CHART_BG}; border-radius: 12px; }
  .training h2 { font-size: 26px; font-weight: 500; margin: 0 0 12px; }
  .training ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 48px; font-size: 26px; line-height: 1.8; }
  .word sup { font-size: 0.55em; margin-left: 2px; opacity: 0.8; }
</style></head><body>
<h1>Векторы слов: как точки съезжаются в группы</h1>
<p>Оси одинаковые на всех диаграммах — двигаются только точки. Цвет — группа по итоговой карте (одинаковый на всех диаграммах, чтобы было видно, откуда пришло каждое слово). Точки, стоящие вплотную, подписаны общим списком номеров.</p>
<div class="row"><ol>${legend}</ol>${charts.join("")}</div>
<section class="training"><h2>Текст, на котором училась модель</h2><ul>${sentences}</ul></section>
</body></html>`;

  mkdirSync(new URL("./", outFile), { recursive: true });
  writeFileSync(outFile, html);

  const groups: string[][] = [];
  for (const word of vocab) (groups[groupOf[word]] ??= []).push(word);
  return groups;
}

// Слово попадает в группу, если оно ближе groupDistance хотя бы к одному слову группы.
function findGroups(vocab: string[], points: Record<string, Point>, groupDistance: number): Record<string, number> {
  const groupOf: Record<string, number> = {};
  let groupCount = 0;
  for (const word of vocab) {
    if (groupOf[word] !== undefined) continue;
    const queue = [word];
    groupOf[word] = groupCount;
    while (queue.length > 0) {
      const current = queue.pop() ?? word;
      for (const other of vocab) {
        if (groupOf[other] !== undefined) continue;
        const d = Math.hypot(points[current].x - points[other].x, points[current].y - points[other].y);
        if (d < groupDistance) {
          groupOf[other] = groupCount;
          queue.push(other);
        }
      }
    }
    groupCount++;
  }
  return groupOf;
}

function chart(
  vocab: string[],
  snapshots: Snapshot[],
  groupOf: Record<string, number>,
  snapshot: Snapshot,
  previous?: Snapshot,
): string {
  // Масштаб общий для всех диаграмм, чтобы движение было честным.
  const all = snapshots.flatMap((s) => Object.values(s.points));
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const sx = (x: number) => PADDING + ((x - minX) / (maxX - minX || 1)) * (SIZE - 2 * PADDING);
  const sy = (y: number) => SIZE - PADDING - ((y - minY) / (maxY - minY || 1)) * (SIZE - 2 * PADDING);

  // Оси: сетка и подписи значений. Одинаковые на всех диаграммах, потому что масштаб общий.
  // Без «-0.0»: числа вроде -0.04 при округлении до десятых дают минус перед нулём.
  const tick = (v: number) => (Math.abs(v) < 0.05 ? "0.0" : v.toFixed(1));
  const axes: string[] = [];
  for (let k = 0; k < TICKS; k++) {
    const vx = minX + ((maxX - minX) * k) / (TICKS - 1);
    const vy = minY + ((maxY - minY) * k) / (TICKS - 1);
    axes.push(
      `<line x1="${sx(vx)}" y1="${PADDING}" x2="${sx(vx)}" y2="${SIZE - PADDING}" stroke="${GRID}" stroke-width="1"/>`,
      `<line x1="${PADDING}" y1="${sy(vy)}" x2="${SIZE - PADDING}" y2="${sy(vy)}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${sx(vx)}" y="${SIZE - PADDING + 22}" fill="${MUTED}" font-size="16.5" text-anchor="middle">${tick(vx)}</text>`,
      `<text x="${PADDING - 8}" y="${sy(vy) + 6}" fill="${MUTED}" font-size="16.5" text-anchor="end">${tick(vy)}</text>`,
    );
  }
  axes.push(
    `<text x="${SIZE - PADDING}" y="${SIZE - 6}" fill="${MUTED}" font-size="18" text-anchor="end">x</text>`,
    `<text x="12" y="${PADDING - 18}" fill="${MUTED}" font-size="18">y</text>`,
  );

  // Пунктир идёт до центра кружка, а наконечник рисуем отдельно — чуть ДО края кружка,
  // иначе кружок его закрывает. Короткие пути без наконечника: он туда не помещается.
  const arrows = previous
    ? vocab
        .map((w) => {
          const x1 = sx(previous.points[w].x);
          const y1 = sy(previous.points[w].y);
          const x2 = sx(snapshot.points[w].x);
          const y2 = sy(snapshot.points[w].y);
          const path = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${PATH_COLOR}" stroke-width="1.5" stroke-dasharray="4 3"/>`;

          const length = Math.hypot(x2 - x1, y2 - y1);
          if (length < MIN_ARROW_PX) return path;
          // Единичный вектор направления движения: куда «смотрит» стрелка.
          const ux = (x2 - x1) / length;
          const uy = (y2 - y1) / length;
          // Остриё — на расстоянии «радиус + зазор» от центра кружка.
          const tipX = x2 - ux * (DOT_RADIUS + ARROW_GAP_PX);
          const tipY = y2 - uy * (DOT_RADIUS + ARROW_GAP_PX);
          // Невидимый отрезок длиной 1px: нужен только чтобы повесить на его конец наконечник.
          const head = `<line x1="${tipX - ux}" y1="${tipY - uy}" x2="${tipX}" y2="${tipY}" stroke="none" marker-end="url(#arrow)"/>`;
          return path + head;
        })
        .join("")
    : "";

  const dots = vocab
    .map((w) => {
      const p = snapshot.points[w];
      const color = COLORS[groupOf[w] % COLORS.length];
      return `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${DOT_RADIUS}" fill="${color}"/>`;
    })
    .join("");

  // ---------- Подписи номерами ----------
  // 1) Точки ближе LABEL_MERGE_PX друг к другу (цепочкой) получают одну общую подпись «2, 5, 7».
  //    Каждый номер хранит СВОЙ цвет: в одну подпись могут слипнуться слова из разных групп.
  // 2) Подпись старается стоять СПРАВА (как у всех точек): прямо справа, чуть выше-справа, чуть ниже-справа.
  //    Только если справа всё занято — сверху, снизу и в последнюю очередь слева.
  //    Занимает первое место, где не задевает чужие точки и уже поставленные подписи.
  const LABEL_MERGE_PX = 30;
  const LABEL_FONT = 19.5;
  // Ширина символов в долях размера шрифта — чтобы прикинуть прямоугольник подписи.
  // Цифра широкая, запятая и пробел узкие: «3, 7» ≈ 0.56 + 0.3 + 0.28 + 0.56.
  const charWidth = (ch: string) => LABEL_FONT * (ch === "," ? 0.3 : ch === " " ? 0.28 : 0.56);
  const LABEL_GAP = 5;

  type Dot = { x: number; y: number; number: number; color: string };
  type Box = { left: number; top: number; right: number; bottom: number };

  const allDots: Dot[] = vocab.map((w, i) => ({
    x: sx(snapshot.points[w].x),
    y: sy(snapshot.points[w].y),
    number: i + 1,
    color: COLORS[groupOf[w] % COLORS.length],
  }));

  // Кучки: точка попадает в кучку, если она ближе порога хотя бы к одной точке кучки.
  const clusters: Dot[][] = [];
  const taken = new Set<number>();
  for (const dot of allDots) {
    if (taken.has(dot.number)) continue;
    const cluster = [dot];
    taken.add(dot.number);
    for (let k = 0; k < cluster.length; k++) {
      for (const other of allDots) {
        if (taken.has(other.number)) continue;
        if (Math.hypot(other.x - cluster[k].x, other.y - cluster[k].y) < LABEL_MERGE_PX) {
          cluster.push(other);
          taken.add(other.number);
        }
      }
    }
    clusters.push(cluster.sort((a, b) => a.number - b.number));
  }
  // На выходе, например: clusters = [[точка 1, точка 6], [точка 2, точка 5, точка 7], [точка 3], ...]

  const placedBoxes: Box[] = [];
  const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const hitsSomething = (box: Box, own: Dot[]) =>
    placedBoxes.some((b) => intersects(box, b)) ||
    allDots.some((d) => {
      if (own.includes(d)) return false;
      const r = DOT_RADIUS + 2;
      return intersects(box, { left: d.x - r, top: d.y - r, right: d.x + r, bottom: d.y + r });
    });

  const labelTexts = clusters
    .map((cluster) => {
      const text = cluster.map((d) => d.number).join(", ");
      const width = [...text].reduce((sum, ch) => sum + charWidth(ch), 0);
      const minX = Math.min(...cluster.map((d) => d.x)) - DOT_RADIUS;
      const maxX = Math.max(...cluster.map((d) => d.x)) + DOT_RADIUS;
      const minY = Math.min(...cluster.map((d) => d.y)) - DOT_RADIUS;
      const maxY = Math.max(...cluster.map((d) => d.y)) + DOT_RADIUS;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      // x — левый край текста, y — линия, на которой стоят цифры.
      const candidates = [
        { x: maxX + LABEL_GAP, y: midY + LABEL_FONT * 0.35 }, // справа
        { x: maxX + LABEL_GAP, y: minY - 2 }, // выше-справа
        { x: maxX + LABEL_GAP, y: maxY + LABEL_FONT * 0.75 }, // ниже-справа
        { x: midX - width / 2, y: minY - LABEL_GAP }, // сверху
        { x: midX - width / 2, y: maxY + LABEL_GAP + LABEL_FONT * 0.75 }, // снизу
        { x: minX - LABEL_GAP - width, y: midY + LABEL_FONT * 0.35 }, // слева — крайний случай
      ];
      const boxOf = (c: { x: number; y: number }): Box => ({
        left: c.x,
        right: c.x + width,
        top: c.y - LABEL_FONT * 0.8,
        bottom: c.y + LABEL_FONT * 0.25,
      });
      const spot = candidates.find((c) => !hitsSomething(boxOf(c), cluster)) ?? candidates[0];
      placedBoxes.push(boxOf(spot));

      const parts = cluster.map((d) => `<tspan fill="${d.color}">${d.number}</tspan>`).join(", ");
      return `<text x="${spot.x}" y="${spot.y}" fill="${MUTED}" font-size="${LABEL_FONT}" font-weight="600">${parts}</text>`;
    })
    .join("");

  return `<figure>
    <svg viewBox="0 0 ${SIZE} ${SIZE}">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M2 1L8 5L2 9" fill="none" stroke="${PATH_COLOR}" stroke-width="1.5"/></marker></defs>
      <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="8" fill="${CHART_BG}"/>
      ${axes.join("")}${arrows}${dots}${labelTexts}
    </svg>
    <figcaption>после ${snapshot.epoch} эпох (проходов по тексту)${previous ? ` · пунктир — путь от эпохи ${previous.epoch}` : " · случайный старт"}</figcaption>
  </figure>`;
}
