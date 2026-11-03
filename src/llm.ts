import type { Message } from "./types.ts";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:14b";

// Один вызов модели: отдаём всю историю, получаем текст ответа.
export async function chat(history: Message[]): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: history,
      stream: false, // целиком одним куском; стриминг — шаг 2
      think: false, // у qwen3 есть режим «рассуждений вслух», пока выключаем
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama ответила ${response.status}: ${await response.text()}`);
  }

  // json() не знает, что придёт с сервера, поэтому форму ответа указываем сами.
  const data = (await response.json()) as { message: Message };
  return data.message.content;
}
