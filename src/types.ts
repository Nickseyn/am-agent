// Одна запись диалога. Этот же формат понимает API модели.
export type Message = {
  role: "user" | "assistant";
  content: string;
};
