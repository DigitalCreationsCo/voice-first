import { createGoogleGenerativeAI } from '@ai-sdk/google';


export const geminiProModel = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-pro");

export const geminiFlashModel = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-1.5-flash-002");
