// test-genai.ts
import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import { beforeAll, expect, test } from 'vitest';

config({
  path: ".env.local",
});

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

if (!apiKey) {
  throw new Error('Generative AI Api Key is not defined')
}

const genAI = new GoogleGenAI({
  apiKey,
});

let result: GenerateContentResponse;
beforeAll(async () => {
  result = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: "Say exactly 'Hello World!'" }] }],
  });
})

test('Gen AI Response', async () => {
  expect(result.text).toBe("Hello World!\n");
})