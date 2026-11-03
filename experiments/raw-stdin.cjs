// Опыт: читаем stdin БЕЗ readline и смотрим, что реально приходит от ОС.
// Запуск: node experiments/raw-stdin.cjs
// Выход: Ctrl+Z, затем Enter (Windows) — это EOF, «данных больше не будет».

let n = 0;

// Каждый раз, когда ОС отдаёт процессу порцию байтов, срабатывает "data".
process.stdin.on("data", (chunk) => {
  n++;
  // chunk — Buffer (сырые байты). JSON.stringify показывает \n явно.
  console.log(`кусок #${n}:`, chunk, "→", JSON.stringify(chunk.toString()));
});

// "end" — поток закрыт (EOF). После него "data" больше не придёт.
process.stdin.on("end", () => console.log("EOF: поток закрыт"));
