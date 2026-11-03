import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import type { Message } from "./types.ts";
import { chat } from "./llm.ts";

// Вся переписка. Каждый запрос отправляет модели её целиком.
const history: Message[] = [];

const rl = readline.createInterface({ input, output });

// Ввод может закончиться (EOF), пока мы ждём модель: тогда readline закроется сам,
// и печатать приглашение в закрытый интерфейс нельзя.
let closed = false;
rl.on("close", () => {
  closed = true;
});

function showPrompt() {
  if (!closed) rl.prompt();
}

console.log("AM: I think, therefore I am. (/exit — выход)\n");
rl.setPrompt("> ");
showPrompt();

// REPL: Read → Eval → Print → Loop.
// rl — поток строк: каждая итерация ждёт, пока пользователь нажмёт Enter.
for await (const line of rl) {
  const userText = line.trim();

  if (userText === "/exit") break;

  if (userText !== "") {
    history.push({ role: "user", content: userText });

    // «Мозг» агента: отдаём модели всю историю и ждём ответ.
    let reply: string;
    try {
      reply = await chat(history);
    } catch (error) {
      console.log(`[ошибка] ${(error as Error).message}\n`);
      history.pop(); // убираем вопрос без ответа, чтобы не было двух user подряд
      showPrompt();
      continue;
    }

    // В историю — чистые данные, префикс "AM:" только для экрана.
    history.push({ role: "assistant", content: reply });
    console.log(`AM: ${reply}  [сообщений в истории: ${history.length}]\n`);
  }

  showPrompt();
}

rl.close();
