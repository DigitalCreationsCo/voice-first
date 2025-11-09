import {
  CoreMessage,
  CoreToolMessage,
  generateId,
} from "ai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Chat } from "@/db/schema";
// import { parsePgArray } from "drizzle-orm/pg-core"; // Not used, can be removed

export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      "An error occurred while fetching the data.",
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== "undefined") {
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
  return [];
};

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function generateMessageId() {
  return generateUUID();
}


function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: any;
  messages: Array<any>;
}): Array<any> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation: any) => {
          const toolResult = toolMessage.content.find(
            (tool: any) => tool.toolCallId === toolInvocation.toolCallId,
          );

          if (toolResult) {
            return {
              ...toolInvocation,
              state: "result",
              result: toolResult.result,
            };
          }

          return toolInvocation;
        }),
      };
    }

    return message;
  });
}

export function convertToUIMessages(
  messages: Array<any>,
): Array<any> {
  return messages.reduce((chatMessages, message) => {
    if (message.role === "tool") {
      return addToolMessageToChat({
        toolMessage: message as CoreToolMessage,
        messages: chatMessages,
      });
    }

    let textContent = "";
    let toolInvocations: Array<any> = [];

    if (typeof message.content === "string") {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === "text") {
          textContent += content.text;
        } else if (content.type === "tool-call") {
          toolInvocations.push({
            state: "call",
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            args: content.args,
          });
        }
      }
    }

    chatMessages.push({
      id: generateId(),
      role: message.role,
      content: textContent,
      toolInvocations,
    });

    return chatMessages;
  }, []);
}


interface CreateUIMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  isAudio?: boolean;
  audioData?: string;
  languageRating?: number;
  translations?: Record<string, string>;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isAudio: boolean;
  audioData?: string;
  languageRating?: number;
  translations?: Record<string, TranslationData>;
};

export function buildUIMessage(props: CreateUIMessage): UIMessage {
  return {
    id: props.id || generateMessageId(),
    role: props.role,
    content: props.content.trim() || '',
    timestamp: Date.now(),
    isAudio: props.isAudio || false,
    audioData: props.audioData,
  };
}

export interface TranslationData {
  word: string;
  language: string;
  translation: string;
  phonetic: string;
  audioUrl?: string;
  addedAt?: number;
  usageCount?: number;
}

export type LanguageName = 'german' | 'french' | 'spanish' | 'italian' | 'portuguese' | 'japanese';
export interface TranslationsByLanguage {
  [language: string]: Record<string, TranslationData>;
}

export function getTitleFromChat(chat: Chat) {
  const messages = convertToUIMessages(chat.messages as Array<CoreMessage>);
  const firstMessage = messages[0];

  if (!firstMessage) {
    return "Untitled";
  }

  return firstMessage.content;
}

export function getSSEUrls(): { chatUrl: string; ttsUrl: string } {
  if (typeof window === 'undefined') {
    return { chatUrl: '', ttsUrl: '' }; // Server-side
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const baseUrl = isDevelopment ? '' : process.env.NEXT_PUBLIC_BACKEND_HOSTPORT || '';

  return {
    chatUrl: `${baseUrl}/api/chat-refactor`,
    ttsUrl: `${baseUrl}/api/tts-refactor`,
  };
}

export function findLastIncompleteAssistantMessageIndex(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant') {
      return i;
    }
  }
  return null;
}