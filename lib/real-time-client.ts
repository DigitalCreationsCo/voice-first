"use client"
import { PipecatClient, RTVIEvent, RTVIMessage } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { GeminiLiveWebsocketTransport, GeminiLLMServiceOptions } from '@pipecat-ai/gemini-live-websocket-transport';

const llmServiceOptions: GeminiLLMServiceOptions = {
  api_key: 'AIzaSyDwPluan48-7Hrm5xqfMAW5Zets4kezEYE',
  // temperature: 0.7,
  // maxOutput_tokens: 1000
};

const pcClient = new PipecatClient({
  transport: new GeminiLiveWebsocketTransport(llmServiceOptions),
  enableMic: true,
  enableCam: false,
  callbacks: {
    onConnected: () => {
      console.log("[CALLBACK] User connected");
    },
    onDisconnected: () => {
      console.log("[CALLBACK] User disconnected");
    },
    onTransportStateChanged: (state: string) => {
      console.log("[CALLBACK] State change:", state);
    },
    onBotConnected: () => {
      console.log("[CALLBACK] Bot connected");
    },
    onBotDisconnected: () => {
      console.log("[CALLBACK] Bot disconnected");
    },
    onBotReady: () => {
      console.log("[CALLBACK] Bot ready to chat!");
    },
  },
});

await pcClient.connect()
pcClient.appendToContext({ role: "user", content: 'Hello Gemini!' });

// Events
pcClient.on(RTVIEvent.TransportStateChanged, (state) => {
  console.log("[EVENT] Transport state change:", state);
});
pcClient.on(RTVIEvent.BotReady, () => {
  console.log("[EVENT] Bot is ready");
});
pcClient.on(RTVIEvent.Connected, () => {
  console.log("[EVENT] User connected");
});
pcClient.on(RTVIEvent.Disconnected, () => {
  console.log("[EVENT] User disconnected");
});

export { pcClient }