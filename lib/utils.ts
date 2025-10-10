import {
  CoreMessage,
  CoreToolMessage,
  generateId,
} from "ai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Chat } from "@/db/schema";
import { parsePgArray } from "drizzle-orm/pg-core";

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
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isAudio: boolean;
  audioData?: string;
  languageRating?: number;
};

export function buildUIMessage(props: CreateUIMessage):UIMessage {
  return {
    id: props.id || generateMessageId(),
    role: props.role,
    content: props.content.trim() || '',
    timestamp: Date.now(),
    isAudio: props.isAudio || false,
    audioData: props.audioData
  };
};

export function getTitleFromChat(chat: Chat) {
  const messages = convertToUIMessages(chat.messages as Array<CoreMessage>);
  const firstMessage = messages[0];

  if (!firstMessage) {
    return "Untitled";
  }

  return firstMessage.content;
};

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return ''; // Server-side
  }

  if (!process.env.NEXT_PUBLIC_BACKEND_HOSTPORT) {
    throw new Error("Backend host is not defined")
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3001';
    return `ws://${window.location.hostname}:${wsPort}/api/chat/websocket`;
  } else {
    const hostPort = process.env.NEXT_PUBLIC_BACKEND_HOSTPORT!;
    const protocol = hostPort.includes('https:') ? 'wss:' : 'ws:';
    const wsUrl = hostPort.replace(/^https?:/, protocol);
    return `${wsUrl}/api/chat/websocket`;
  }
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

export type ParserConfig = {
  keys: string[];
  streamKeys: string[];
  optionalKeys?: string[];
  delimiter?: string;
  terminator?: string;
  timeout?: number;
};

export type ParsedData = Record<string, string | number | undefined>;

export type StreamUpdate =
  | { type: "meta"; data: ParsedData }
  | { type: "stream"; key: string; delta: string }
  | { type: "complete"; data: ParsedData }
  | { type: "skip"; key: string };

type ParserState = "seeking_key" | "reading_static" | "streaming";

export interface StreamParser {
  buffer: string;
  state: ParserState;
  currentKeyIndex: number;
  parsed: ParsedData;
  config: ParserConfig;
  metaEmitted: boolean;
  keyStartTime: number;
  skippedKeys: Set<string>;
  completeEmitted?: boolean;
  lastStreamEmitted: Record<string, number>; // Track last emitted position per stream key
}

/** Create a new parser instance */
export function createParser(config: ParserConfig): StreamParser {
  const lastStreamEmitted: Record<string, number> = {};
  (config.streamKeys || []).forEach(k => {
    lastStreamEmitted[k] = 0;
  });

  return {
    buffer: "",
    state: "seeking_key",
    currentKeyIndex: 0,
    parsed: {},
    config: {
      delimiter: ":",
      terminator: ";",
      optionalKeys: [],
      ...config,
    },
    metaEmitted: false,
    keyStartTime: Date.now(),
    skippedKeys: new Set(),
    completeEmitted: false,
    lastStreamEmitted,
  };
}

function isOptionalKey(key: string, config: ParserConfig) {
  return config.optionalKeys?.includes(key) ?? false;
}

function shouldSkipOptionalKey(parser: StreamParser): boolean {
  const currentKey = parser.config.keys[parser.currentKeyIndex];
  if (!isOptionalKey(currentKey, parser.config)) return false;
  if (!parser.config.timeout) return false;
  return Date.now() - parser.keyStartTime > parser.config.timeout;
}

function nextKeyAppearsFirst(parser: StreamParser): boolean {
  const currentKey = parser.config.keys[parser.currentKeyIndex];
  const nextKey = parser.config.keys[parser.currentKeyIndex + 1];
  if (!nextKey || !isOptionalKey(currentKey, parser.config)) return false;
  const currentKeyIdx = parser.buffer.indexOf(currentKey + parser.config.delimiter!);
  const nextKeyIdx = parser.buffer.indexOf(nextKey + parser.config.delimiter!);
  return nextKeyIdx !== -1 && (currentKeyIdx === -1 || nextKeyIdx < currentKeyIdx);
}

function skipOptionalKey(parser: StreamParser): StreamUpdate[] {
  const currentKey = parser.config.keys[parser.currentKeyIndex];
  parser.skippedKeys.add(currentKey);
  parser.parsed[currentKey] = undefined;
  parser.currentKeyIndex++;
  parser.keyStartTime = Date.now();
  return [{ type: "skip", key: currentKey }];
}

/**
 * Parses all keys from the buffer and emits correct deltas and metadata.
 * Streaming keys emit the value after the delimiter (and optional whitespace) as delta,
 * only emitting the new data since the last parseChunk call.
 * Static keys parse fully between delimiter and terminator and emit to meta.
 */
export function parseChunk(
  parser: StreamParser,
  chunk: string
): { parser: StreamParser; updates: StreamUpdate[] } {
  parser.buffer += chunk;
  const updates: StreamUpdate[] = [];
  const metaData: ParsedData = {};

  let buffer = parser.buffer;

  while (parser.currentKeyIndex < parser.config.keys.length) {
    const currentKey = parser.config.keys[parser.currentKeyIndex];
    const isOptional = isOptionalKey(currentKey, parser.config);
    const isStreamKey = parser.config.streamKeys.includes(currentKey);

    // Optional key skipping logic
    if (isOptional) {
      if (nextKeyAppearsFirst(parser) || shouldSkipOptionalKey(parser)) {
        updates.push(...skipOptionalKey(parser));
        // buffer may have changed after skipping; reflect latest state
        buffer = parser.buffer;
        continue;
      }
    }

    // Find the key pattern (key + delimiter)
    const delimiter = parser.config.delimiter!;
    const keyPattern = currentKey + delimiter;
    const keyIdx = buffer.indexOf(keyPattern);

    if (keyIdx === -1) break;

    // Skip to the value: after the delimiter and any whitespace
    let valueStart = keyIdx + keyPattern.length;
    while (buffer[valueStart] === " " || buffer[valueStart] === "\t" || buffer[valueStart] === "\r" || buffer[valueStart] === "\n") {
      valueStart++;
    }

    // For static keys, read up to terminator
    if (!isStreamKey) {
      const termIdx = buffer.indexOf(parser.config.terminator!, valueStart);
      if (termIdx === -1) break; // Wait for complete
      let value = buffer.slice(valueStart, termIdx).trim();

      // Only the value - don't include key/label
      parser.parsed[currentKey] = isNaN(Number(value)) ? value : Number(value);
      metaData[currentKey] = parser.parsed[currentKey];

      // Advance the buffer past this value (and delimiter/terminator)
      buffer = buffer.slice(termIdx + 1).trimStart();
      parser.buffer = buffer;
      parser.currentKeyIndex++;
      parser.keyStartTime = Date.now();
      continue;
    }

    // STREAMING KEY (the "tricky" case)
    // Find the end of the value (either next key's pattern or terminator, whichever comes first)
    let nextKeyStart = -1;
    let foundNextKeyName = null;
    for (let k = parser.currentKeyIndex + 1; k < parser.config.keys.length; ++k) {
      const searchKey = parser.config.keys[k] + delimiter;
      const idx = buffer.indexOf(searchKey, valueStart);
      if (idx !== -1 && (nextKeyStart === -1 || idx < nextKeyStart)) {
        nextKeyStart = idx;
        foundNextKeyName = parser.config.keys[k];
      }
    }
    const terminatorIdx = buffer.indexOf(parser.config.terminator!, valueStart);
    let valueEnd: number | undefined;
    if (terminatorIdx !== -1 && (nextKeyStart === -1 || terminatorIdx < nextKeyStart)) {
      valueEnd = terminatorIdx;
    } else if (nextKeyStart !== -1) {
      valueEnd = nextKeyStart;
    } else {
      valueEnd = buffer.length;
    }

    // Track how much we've already emitted for THIS key
    let alreadyEmitted = parser.lastStreamEmitted[currentKey] || 0;

    let chunkValue = buffer.slice(valueStart, valueEnd); // This is the full value for this key so far

    // Determine the portion to emit as "delta"
    // - if the buffer is appended and we've already parsed/streamed part, only emit the new content
    let delta = chunkValue.slice(alreadyEmitted);

    if (delta.length > 0) {
      updates.push({ type: "stream", key: currentKey, delta });
      parser.parsed[currentKey] = (parser.parsed[currentKey] || "") + delta;
      parser.lastStreamEmitted[currentKey] = alreadyEmitted + delta.length;
    }

    // Decide whether to advance to next key, based on terminator or new key label appearing
    let mustAdvance =
      (terminatorIdx !== -1 && valueEnd === terminatorIdx) ||
      (nextKeyStart !== -1 && valueEnd === nextKeyStart);

    if (mustAdvance) {
      // Move buffer past this key (and any delimiter/terminator)
      let nextSlice = valueEnd;
      if (valueEnd === terminatorIdx) {
        // Past just after the terminator
        buffer = buffer.slice(terminatorIdx + 1).trimStart();
      } else {
        // At the beginning of next key's pattern
        buffer = buffer.slice(nextKeyStart).trimStart();
      }
      parser.buffer = buffer;
      parser.currentKeyIndex++;
      parser.keyStartTime = Date.now();
      parser.lastStreamEmitted[currentKey] = 0;
      continue;
    } else {
      // Partial value, wait for more buffer to appear in future chunks.
      break;
    }
  }

  // Emit meta if we have static (non-stream) keys info for this chunk
  if (!parser.metaEmitted && Object.keys(metaData).length > 0) {
    updates.push({ type: "meta", data: metaData });
    parser.metaEmitted = true;
  }

  // Only emit a single complete when all keys are parsed, and only once ever
  if (
    parser.currentKeyIndex >= parser.config.keys.length &&
    !parser.completeEmitted
  ) {
    updates.push({ type: "complete", data: parser.parsed });
    parser.completeEmitted = true;
  }

  return { parser, updates };
}
