import { z } from "zod";
import type { Message } from "./types.ts";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:14b";

// Форма ответа Ollama, которую мы ожидаем. Проверяется в рантайме,
// а TypeScript сам выводит из неё тип.
const ChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

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

  // Данные пришли снаружи — проверяем форму, а не верим на слово.
  const result = ChatResponseSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error(`Ollama вернула ответ неожиданной формы: ${result.error.message}`);
  }
  return result.data.message.content;
}
