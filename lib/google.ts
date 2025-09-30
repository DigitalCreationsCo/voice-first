import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleGenAI, Modality } from '@google/genai';


export const ttsClient = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
});

const genAIClient = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
})

export const geminiProModel25LM = genAIClient.languageModel("gemini-2.5-pro");
export const geminiFlashModel25SM = genAIClient.languageModel("gemini-2.5-flash");

export const geminiProModel15LM = genAIClient.languageModel("gemini-2.5-pro");
export const geminiFlashModel15SM = genAIClient.languageModel("gemini-2.5-flash");