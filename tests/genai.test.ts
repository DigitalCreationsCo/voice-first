// test-genai.ts
import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';

config({
  path: ".env.local",
});

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
console.log('apiKey: ', apiKey);

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function main() {
  const result = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: "Say hello world" }] }],
  });
  console.log(result);
}

main().catch(console.error);
