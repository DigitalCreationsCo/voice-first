# Chatter

**Chatter** is a multimodal, voice-first AI language learning assistant that helps users practice speaking and listening in real conversations. Built with Next.js, Node.js, TypeScript, WebSockets, and Google Generative AI APIs, Chatter delivers natural, bilingual dialogues with real-time transcription, translation, and AI-generated voice responses — offering an immersive path to fluency across multiple languages.

---

## Overview

**Chatter** is a **voice-first, multimodal language learning application** that teaches users to communicate naturally in foreign languages through interactive conversations. Built on top of large language models and speech APIs, Chatter delivers an immersive learning experience that blends real-time speech recognition, translation, and spoken responses into a single conversational interface.

It is designed for learners who want to improve fluency, listening comprehension, and pronunciation through realistic, continuous dialogue rather than traditional lesson formats.

---

## Key Features

* **Voice-First Conversation Engine** — Speak directly with an LLM capable of understanding and responding via voice.
* **Multimodal Interface** — Combines speech, text, and visual cues for an immersive learning experience.
* **Real-Time Translation** — Integrated dictionary and translation tools for lexical and grammatical understanding.
* **LLM-Generated Speech** — Uses text-to-speech and chat completion APIs to produce lifelike responses.
* **Language Support** — Learn and converse in **German, Korean, Italian, and French**, with adaptive vocabulary and syntax suggestions.
* **Continuous Interaction** — Real-time audio streaming over WebSockets ensures fluid, uninterrupted dialogue.

---

## Tech Stack

* **Next.js** — Frontend framework for the web interface.
* **React** — Component-based architecture for dynamic UI.
* **Node.js** — Backend runtime for API and real-time communication.
* **WebSocket** — Low-latency voice data streaming between client and server.
* **TypeScript** — Static typing for maintainable, robust code.
* **Google Generative AI APIs** —

  * `chat-completion` for dialogue generation
  * `text-transcription` for real-time speech-to-text
  * `text-to-speech` for natural-sounding LLM voice responses
* **Monorepo** — Structured to support modular development and shared packages.

---

## How It Works

1. **User speaks** into the microphone.
2. **Speech-to-text engine** transcribes the input using Google’s transcription API.
3. The **chat model** processes input and generates context-aware, conversational replies.
4. The **text-to-speech API** converts LLM responses into lifelike spoken output.
5. The **translation/dictionary module** optionally provides vocabulary and grammar guidance in real time.
6. **WebSocket channels** keep voice, text, and visual responses synchronized.

---

## Getting Started (Developer)

1. Clone the repository:

```bash
git clone <repo-url> chatter
cd chatter
```

2. Install dependencies:

```bash
pnpm install
# or npm/yarn install
```

3. Setup environment variables:

```bash
cp .env.example .env
# Configure GOOGLE_GENAI_API_KEY, WS_PORT, NEXT_PUBLIC_SITE_URL, etc.
```

4. Run development server:

```bash
pnpm dev
# visit http://localhost:3000
```

5. Optional: start WebSocket server for audio streaming:

```bash
pnpm run server
```

---

## Deployment

* Deploy frontend to **Vercel** or **Netlify**.
* Deploy backend WebSocket service to **Render**, **Fly.io**, or **Google Cloud Run**.
* Configure environment variables in production for API keys and WebSocket endpoints.

---

## Roadmap & Vision

* Expand language support (Japanese, Spanish, Portuguese).
* Integrate adaptive pronunciation scoring and speech feedback.
* Introduce grammar-focused conversational modes.
* Add session history with personalized learning analytics.
* Build mobile companion app with offline speech processing.

---

## Contributing

* Fork the repository, create a branch, and submit a pull request.
* Contributions welcome for new language modules, UI components, or API integrations.
* Follow project’s linting, formatting, and code review guidelines.

---

## License

MIT License
