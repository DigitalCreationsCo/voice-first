import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const geminiProModel25LM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-pro");

export const geminiFlashModel25SM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-flash");

export const geminiProModel15LM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-pro");

export const geminiFlashModel15SM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-flash");