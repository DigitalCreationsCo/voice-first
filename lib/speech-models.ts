import { GeminiLiveVoice } from '@mastra/voice-google-gemini-live';

export const voice = new GeminiLiveVoice({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
    model: "gemini-2.6.flash-preview-tts",
});
