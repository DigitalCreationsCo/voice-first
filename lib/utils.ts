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
  translations?: TranslationData;
};

export function buildUIMessage(props: CreateUIMessage):UIMessage {
  return {
    id: props.id || generateMessageId(),
    role: props.role,
    content: props.content.trim() || '',
    timestamp: Date.now(),
    isAudio: props.isAudio || false,
    audioData: props.audioData,
  };
};

export interface TranslationData {
  word: string;
  language: string;
  english: string;
  phonetic: string;
  audioUrl?: string;
  addedAt?: number;
  usageCount?: number;
};

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
}

export function createParser(config: ParserConfig): StreamParser {
  return {
    buffer: "",
    state: "seeking_key",
    currentKeyIndex: 0,
    parsed: {},
    config: {
      delimiter: ":",
      terminator: ";",
      optionalKeys: [],
      ...config
    },
    metaEmitted: false,
    keyStartTime: Date.now(),
    skippedKeys: new Set()
  };
}

function isOptionalKey(key: string, config: ParserConfig) {
  return config.optionalKeys?.includes(key) ?? false;
}

/**
 * Parse a chunk of incoming text.
 * Emits meta update only once, after all static keys are parsed/skipped.
 */
export function parseChunk(
  parser: StreamParser,
  chunk: string
): { parser: StreamParser; updates: StreamUpdate[] } {
  parser.buffer += chunk;
  const updates: StreamUpdate[] = [];

  const { keys, streamKeys, delimiter, terminator } = parser.config;

  // Helper: skip all missing contiguous optional keys that do not appear in the buffer at all
  function maybeSkipMissingOptionals() {
    while (
      parser.currentKeyIndex < keys.length &&
      isOptionalKey(keys[parser.currentKeyIndex], parser.config)
    ) {
      // Only skip if this optional key does NOT appear *now* in the buffer,
      // i.e. no keyPattern at any position in buffer.
      const key = keys[parser.currentKeyIndex];
      const pattern = key + delimiter!;
      if (parser.buffer.indexOf(pattern) !== -1) {
        break;
      }
      parser.skippedKeys.add(key);
      parser.parsed[key] = undefined;
      updates.push({ type: "skip", key });
      parser.currentKeyIndex++;
      parser.state = "seeking_key";
      parser.keyStartTime = Date.now();
    }
  }

  // Helper: emits meta update once all static keys (non-stream) are available/skipped and hasn't been emitted
  function maybeEmitMeta() {
    if (!parser.metaEmitted) {
      // Only emit after all static keys are processed (either parsed or skipped)
      // That is, for all keys that are not streamKeys (static), the parsed/skip is present
      let allStaticDone = true;
      for (const key of keys) {
        if (!streamKeys.includes(key)) {
          if (
            !Object.prototype.hasOwnProperty.call(parser.parsed, key) &&
            !parser.skippedKeys.has(key)
          ) {
            allStaticDone = false;
            break;
          }
        }
      }
      if (allStaticDone) {
        // emit all non-stream keys
        const metaData: ParsedData = {};
        for (const key of keys) {
          if (!streamKeys.includes(key)) {
            if (
              Object.prototype.hasOwnProperty.call(parser.parsed, key) ||
              parser.skippedKeys.has(key)
            ) {
              metaData[key] = parser.parsed[key];
            }
          }
        }
        if (Object.keys(metaData).length > 0) {
          updates.push({ type: "meta", data: metaData });
        }
        parser.metaEmitted = true;
      }
    }
  }

  mainloop: while (parser.currentKeyIndex < keys.length) {
    // Try to skip missing optional keys before looking for keys in buffer
    maybeSkipMissingOptionals();

    if (parser.currentKeyIndex >= keys.length) {
      break mainloop;
    }

    const key = keys[parser.currentKeyIndex];
    const isOptional = isOptionalKey(key, parser.config);
    const isStreaming = streamKeys.includes(key);

    // Always look for this key in buffer
    const keyPattern = key + delimiter!;
    const keyIdx = parser.buffer.indexOf(keyPattern);

    if (parser.state === "seeking_key") {
      if (keyIdx !== -1) {
        // Found key: eat until after keyPattern
        // --- TRIM the whitespace between the delimiter and the value! ---
        parser.buffer = parser.buffer.slice(keyIdx + keyPattern.length);
        // Remove leading whitespace after delimiter
        parser.buffer = parser.buffer.replace(/^\s+/, "");
        parser.state = isStreaming ? "streaming" : "reading_static";
        parser.keyStartTime = Date.now();
      } else {
        // Key not present in buffer
        if (isOptional) {
          let nextKeyIndex = parser.currentKeyIndex + 1;
          // skip all directly following optionals if their keyPattern is not present
          while (
            nextKeyIndex < keys.length &&
            isOptionalKey(keys[nextKeyIndex], parser.config) &&
            parser.buffer.indexOf(keys[nextKeyIndex] + delimiter!) === -1
          ) {
            parser.skippedKeys.add(keys[nextKeyIndex]);
            parser.parsed[keys[nextKeyIndex]] = undefined;
            updates.push({ type: "skip", key: keys[nextKeyIndex] });
            parser.state = "seeking_key";
            parser.keyStartTime = Date.now();
            nextKeyIndex++;
            parser.currentKeyIndex = nextKeyIndex - 1;
          }
          // Now at first optional not found in buffer, check if next key appears
          if (
            parser.currentKeyIndex + 1 < keys.length &&
            parser.buffer.indexOf(keys[parser.currentKeyIndex + 1] + delimiter!) !== -1
          ) {
            parser.skippedKeys.add(key);
            parser.parsed[key] = undefined;
            updates.push({ type: "skip", key });
            parser.currentKeyIndex++;
            parser.state = "seeking_key";
            parser.keyStartTime = Date.now();
            continue mainloop;
          }
        }
        // Can't make further progress for now!
        break mainloop;
      }
    }

    if (parser.state === "reading_static") {
      // Value ends at earliest of (terminator) or (next key pattern)
      let valueEndIdx = parser.buffer.indexOf(terminator!);

      // Search for possible patterns for any subsequent keys (necessary for missing optional keys between)
      let foundKeyAfterCurrent = false;
      let optionalToSkip = [];
      let nextPresentKeyPatternIdx = -1;
      let nextPresentKey = "";

      for (
        let i = parser.currentKeyIndex + 1;
        i < keys.length;
        ++i
      ) {
        const k = keys[i];
        const idx = parser.buffer.indexOf(k + delimiter!);
        if (idx !== -1) {
          if (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx) {
            nextPresentKeyPatternIdx = idx;
            nextPresentKey = k;
          }
          foundKeyAfterCurrent = true;
          break;
        } else if (isOptionalKey(k, parser.config)) {
          optionalToSkip.push(k);
          // keep looking for next present key
        } else {
          break;
        }
      }
      // Now choose whichever comes first, terminator or next key pattern
      if (
        nextPresentKeyPatternIdx !== -1 &&
        (valueEndIdx === -1 || nextPresentKeyPatternIdx < valueEndIdx)
      ) {
        valueEndIdx = nextPresentKeyPatternIdx;
      }

      if (valueEndIdx === -1) {
        // Not enough data, wait for more
        break mainloop;
      } else {
        // Parse the value
        const rawSlice = parser.buffer.slice(0, valueEndIdx);
        const rawValue = rawSlice.replace(/;$/, "").trim();
        const numValue = Number(rawValue);
        parser.parsed[key] = isNaN(numValue) ? rawValue : numValue;

        parser.buffer =
          valueEndIdx === nextPresentKeyPatternIdx
            ? parser.buffer.slice(valueEndIdx)
            : parser.buffer.slice(valueEndIdx + 1);

        if (optionalToSkip.length > 0) {
          for (const skipped of optionalToSkip) {
            parser.skippedKeys.add(skipped);
            parser.parsed[skipped] = undefined;
            updates.push({ type: "skip", key: skipped });
          }
          parser.currentKeyIndex += optionalToSkip.length;
        }

        parser.currentKeyIndex++;
        parser.state = "seeking_key";
        parser.keyStartTime = Date.now();

        // Defer meta emission until all static keys handled!
        continue mainloop;
      }
    }

    if (parser.state === "streaming") {
      // In stream mode, emit everything up to next key/terminator
      let streamEndIdx = parser.buffer.indexOf(terminator!);

      let foundKeyAfterCurrent = false;
      let optionalToSkip = [];
      let nextPresentKeyPatternIdx = -1;
      let nextPresentKey = "";

      for (
        let i = parser.currentKeyIndex + 1;
        i < keys.length;
        ++i
      ) {
        const k = keys[i];
        const idx = parser.buffer.indexOf(k + delimiter!);
        if (idx !== -1) {
          if (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx) {
            nextPresentKeyPatternIdx = idx;
            nextPresentKey = k;
          }
          foundKeyAfterCurrent = true;
          break;
        } else if (isOptionalKey(k, parser.config)) {
          optionalToSkip.push(k);
        } else {
          break;
        }
      }

      if (
        nextPresentKeyPatternIdx !== -1 &&
        (streamEndIdx === -1 || nextPresentKeyPatternIdx < streamEndIdx)
      ) {
        streamEndIdx = nextPresentKeyPatternIdx;
      }

      if (
        streamEndIdx === -1 &&
        parser.buffer.length === 0
      ) {
        break mainloop;
      } else if (
        streamEndIdx === -1
      ) {
        if (parser.buffer.length > 0) {
          updates.push({ type: "stream", key, delta: parser.buffer });
          parser.parsed[key] = (parser.parsed[key] || "") + parser.buffer;
          parser.buffer = "";
        }
        break mainloop;
      } else {
        const delta = parser.buffer.slice(0, streamEndIdx).trimEnd();
        if (delta.length > 0) {
          updates.push({ type: "stream", key, delta });
          parser.parsed[key] = (parser.parsed[key] || "") + delta;
        }
        parser.buffer =
          streamEndIdx === nextPresentKeyPatternIdx
            ? parser.buffer.slice(streamEndIdx)
            : parser.buffer.slice(streamEndIdx + 1);

        if (optionalToSkip.length > 0) {
          for (const skipped of optionalToSkip) {
            parser.skippedKeys.add(skipped);
            parser.parsed[skipped] = undefined;
            updates.push({ type: "skip", key: skipped });
          }
          parser.currentKeyIndex += optionalToSkip.length;
        }

        parser.currentKeyIndex++;
        parser.state = "seeking_key";
        parser.keyStartTime = Date.now();
        continue mainloop;
      }
    }
  }

  // Only emit meta now, after all static keys handled (or at completion)
  maybeEmitMeta();

  // If completed, emit complete update (only on new complete)
  if (
    parser.currentKeyIndex >= keys.length &&
    !updates.some((u) => u.type === "complete")
  ) {
    updates.push({ type: "complete", data: parser.parsed });
  }

  return { parser, updates };
}

/**
 * Utility: Check if parsing is complete
 */
export function isParsingComplete(parser: StreamParser): boolean {
  return parser.currentKeyIndex >= parser.config.keys.length;
}

/**
 * Utility: Get current parsed data
 */
export function getParsedData(parser: StreamParser): ParsedData {
  return { ...parser.parsed };
}

/**
 * Utility: Reset parser to initial state
 */
export function resetParser(parser: StreamParser): StreamParser {
  return createParser(parser.config);
}