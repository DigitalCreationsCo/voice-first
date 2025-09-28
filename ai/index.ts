import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { GeminiLiveVoice } from '@mastra/voice-google-gemini-live';

export const geminiProModelLM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).languageModel("gemini-2.5-pro");

export const geminiFlashModelSM = createGoogleGenerativeAI({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
}).speechModel("gemini-2.5-flash-preview-tts");


const voice = new GeminiLiveVoice({
  apiKey: 'your-api-key', // Optional, can use GOOGLE_API_KEY env var
  model: "gemini-2.5-flash-preview-tts",
  speaker: "'Puck', // Default voice"
});

// OR initialize with Vertex AI (recommended for production)
const voice = new GeminiLiveVoice({
  vertexAI: true,
  project: 'your-project-id',
  model: 'gemini-2.0-flash-live-001',
  speaker: 'Puck',
});

// Connect to the Live API
await voice.connect();

// Listen for responses
voice.on('speaking', ({ audioData }) => {
  // Handle audio response as Int16Array
  playAudio(audioData);
});

// Or subscribe to a concatenated audio stream per response
voice.on('speaker', audioStream => {
  audioStream.pipe(playbackDevice);
});

voice.on('writing', ({ text, role }) => {
  // Handle transcribed text
  console.log(`${role}: ${text}`);
});

// Send text to speech
await voice.speak('Hello from Mastra!');

// Send audio stream
const microphoneStream = getMicrophoneStream();
await voice.send(microphoneStream);

// When done, disconnect
voice.disconnect();