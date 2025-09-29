import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const geminiProModelLM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-pro");

export const geminiFlashModelSM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-flash");