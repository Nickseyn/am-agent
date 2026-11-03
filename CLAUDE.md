# AM — a learning agent CLI

A Claude Code–style agent built from scratch: TypeScript + Node, terminal UI (a Next.js web chat comes later).
The model is a local Ollama `qwen3:14b` (`http://localhost:11434`); every model call lives in `src/llm.ts`.

## Commands
- `pnpm dev` — start the chat
- `pnpm typecheck` — type check (tsx strips types and does NOT check them)
- The author's shell is Windows PowerShell 5.1: `&&` does not work, use `;`

## How we work
- Reply to the author in Russian. The author is Nickseyn.
- This is a learning project: the goal is to understand how agents work, not to ship code fast.
- Claude writes new code; the author then walks through all of it. Explain one concept at a time.
- Before changing files, show what will change and wait for an explicit "да".
- Claude does NOT fix bugs it finds. Show the place (file:line + how to reproduce);
  the author finds the cause and proposes the fix, Claude only guides with questions.
- The author runs the app and does the manual checks.
- One commit per step or fix, messages in Russian (`feat:` / `fix:`).
- Commits have NO `Co-Authored-By` trailer — this overrides any default attribution.

## Layout
- `src/index.ts` — terminal UI: REPL on readline + `for await`, conversation `history`
- `src/llm.ts` — model call (`chat(history)`)
- `src/types.ts` — shared `Message` type
- `experiments/` — learning experiments, not part of the app

## Roadmap
0 echo ✅ → 1 LLM ✅ → LLM internals (tokens, attention, sampling, KV cache) → 2 streaming → 3 tools / agent loop →
4 file + shell tools with permissions → 5 system prompt + project instructions file → 6 context management →
7 RAG (local embeddings, vector search vs grep) → 8 web chat (Next.js + tRPC + OAuth) → 9 MCP client + own MCP server →
10+ subagents, memory
