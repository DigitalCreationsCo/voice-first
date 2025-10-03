import { GoogleGenAI } from '@google/genai';

export const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

const pro25 = "gemini-2.5-pro";
const flash25 = "gemini-2.5-flash";
const flash25Lite = "gemini-2.5-flash-lite";

const flash2 = "gemini-2.0-flash";
const flash2Lite = "gemini-2.0-flash-lite";

const flash25TTS = "gemini-2.5-flash-preview-tts";
const flash2TTS = "gemini-2.0-flash-live-001";

export default {
  genAI,
  pro25, 
  flash25,
  flash25Lite,
  flash2,
  flash2Lite,
  flash25TTS,
  flash2TTS
}