import { createGoogleGenerativeAI, google } from '@ai-sdk/google';

export const geminiProModelLM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-1.5-pro-latest");

export const geminiFlashModelSM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-1.5-flash-latest")


// export const voice = new GeminiLiveVoice({
//   apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
//   model: "gemini-2.6.flash-preview-tts",
//   audioConfig: {}
// });