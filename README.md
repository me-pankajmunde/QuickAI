# QuickAI

QuickAI is a cross-platform AI command palette desktop app built with **React + Vite + Tauri**. It provides fast access to AI workflows such as writing, coding, debugging, and general assistance without having to keep a browser tab open.

It supports **OpenAI-compatible APIs**, **Anthropic**, and **Ollama** backends, and is designed to run on **Windows, Linux, and macOS**.

## Quickstart

### Prerequisites

Before you start, make sure you have:

- **Node.js 18+** and `npm`
- **Rust + Cargo**
- **Tauri system dependencies** for your OS
- One LLM option configured:
  - **OpenAI-compatible** via `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`
  - **Anthropic** via `ANTHROPIC_API_KEY`, or
  - **Ollama** running locally (default fallback: `codellama:13b`)

> QuickAI is intended to run on **Windows**, **Linux**, and **macOS**.
>
> - **Windows:** ensure WebView2 is available and install Visual Studio C++ build tools if needed.
> - **macOS:** install Xcode Command Line Tools with `xcode-select --install`.
> - **Linux:** install the required Tauri/WebKitGTK packages for your distro.

### 1. Install dependencies

```bash
npm install
cd agent && npm install && cd ..
```

### 2. Configure the AI provider

Use OpenAI-compatible, Anthropic, or Ollama.

**OpenAI / OpenAI-compatible**

```bash
export OPENAI_API_KEY=your_api_key_here
# optional for compatible providers such as OpenRouter, LM Studio, vLLM, etc.
export OPENAI_BASE_URL=https://api.openai.com/v1
```

**Anthropic**

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

**Ollama fallback**

```bash
export OLLAMA_HOST=http://localhost:11434
ollama pull codellama:13b
```

### 3. Start the local coding agent

In one terminal:

```bash
npm run agent:dev
```

The agent listens on `http://127.0.0.1:3001` by default.

The default app hotkey is `Cmd/Ctrl+Shift+C`.

### 4. Launch the app

In a second terminal:

```bash
npm run tauri dev
```

If you only want to run the web UI during development, use:

```bash
npm run dev
```

## Build

```bash
npm run agent:build
npm run build
npm run tauri build
```

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite web app |
| `npm run tauri dev` | Launch the desktop app in development |
| `npm run build` | Build the frontend |
| `npm run agent:dev` | Start the coding agent with `ts-node` |
| `npm run agent:build` | Compile the coding agent |

## Project structure

- `src/` — React frontend
- `src-tauri/` — Tauri desktop shell
- `agent/` — local coding-agent service

