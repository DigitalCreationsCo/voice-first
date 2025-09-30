import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleGenAI } from '@google/genai';


export const ttsClient = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
})

const genAIClient = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
})

const pro25 = genAIClient.languageModel("gemini-2.5-pro");
const flash25 = genAIClient.languageModel("gemini-2.5-flash");
const flash25Lite = genAIClient.languageModel("gemini-2.5-flash-lite");

const flash2 = genAIClient.languageModel("gemini-2.0-flash");
const flash2Lite = genAIClient.languageModel("gemini-2.0-flash-lite");

const flash25TTS = genAIClient.languageModel("gemini-2.5-flash-preview-tts");
const flash2TTS = genAIClient.languageModel("gemini-2.0-flash-live-001");

export default { 
  pro25, 
  flash25,
  flash25Lite,
  flash2,
  flash2Lite,
  flash25TTS,
  flash2TTS
}