import { GoogleGenAI } from '@google/genai';

export const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

const gemini = {
  pro25: "gemini-2.5-pro",
  flash25: "gemini-2.5-flash",
  flash25Lite: "gemini-2.5-flash-lite",
  flash2: "gemini-2.0-flash",
  flash2Lite: "gemini-2.0-flash-lite",
  flash25TTS: "gemini-2.5-flash-preview-tts",
  flash2TTS:"gemini-2.0-flash-live-001"
};

export default gemini;