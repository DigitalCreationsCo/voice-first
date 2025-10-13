export type ParserConfig = {
  keys: string[];
  streamKeys: string[];
  optionalKeys?: string[];
  jsonKeys?: string[];
  delimiter?: string;
  terminator?: string;
  timeout?: number;
};

export type ParsedData = Record<string, string | number | Record<string, any> | undefined>;

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
      jsonKeys: [],
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

function isJsonKey(key: string, config: ParserConfig) {
    return config.jsonKeys?.includes(key) ?? false;
  }

/**
 * Parse a chunk of incoming text.
 * Emits meta update once, after all static keys are parsed/skipped.
 */
export function parseChunk(
  parser: StreamParser,
  chunk: string
): { parser: StreamParser; updates: StreamUpdate[] } {
  parser.buffer += chunk;
  const updates: StreamUpdate[] = [];

  const { keys, streamKeys, delimiter, terminator } = parser.config;

  // Helper: skip the current optional key only when we have strong evidence it's absent
  // Criteria to skip:
  //  - The full key pattern (key + delimiter) is NOT in the buffer, AND
  //  - A subsequent key's full pattern IS present in the buffer (proves progression), AND
  //  - The buffer does NOT end with a partial prefix of the current key pattern (chunk-boundary guard)
  function maybeSkipCurrentOptional() {
    while (
      parser.currentKeyIndex < keys.length &&
      isOptionalKey(keys[parser.currentKeyIndex], parser.config)
    ) {
      const key = keys[parser.currentKeyIndex];
      const pattern = key + delimiter!;

      // If the current key pattern is present, do not skip
      if (parser.buffer.indexOf(pattern) !== -1) {
        break;
      }

      // If the buffer ends with a partial prefix of the key pattern, do not skip (likely split across chunks)
      let hasPartialPrefixAtEnd = false;
      if (parser.buffer.length > 0) {
        const maxCheckLen = Math.min(pattern.length - 1, parser.buffer.length);
        for (let len = 1; len <= maxCheckLen; len++) {
          const suffix = parser.buffer.slice(-len);
          if (pattern.startsWith(suffix)) {
            hasPartialPrefixAtEnd = true;
            break;
          }
        }
      }
      if (hasPartialPrefixAtEnd) {
        break;
      }

      // Look ahead for any subsequent key that is present in the buffer
      let nextPresentKeyPatternIdx = -1;
      for (let i = parser.currentKeyIndex + 1; i < keys.length; ++i) {
        const k = keys[i];
        const idx = parser.buffer.indexOf(k + delimiter!);
        if (idx !== -1) {
          nextPresentKeyPatternIdx = idx;
          break;
        }
      }

      // Only skip if a later key appears in the buffer; otherwise, wait for more data
      if (nextPresentKeyPatternIdx === -1) {
        break;
      }

      // Skip this optional key
      parser.skippedKeys.add(key);
      parser.parsed[key] = undefined;
      updates.push({ type: "skip", key });
      parser.currentKeyIndex += 1;
      parser.state = "seeking_key";
      parser.keyStartTime = Date.now();
    }
  }

  // Helper: emit meta update once all static keys are processed/skipped and not yet emitted
  function maybeEmitMeta() {
    if (!parser.metaEmitted) {
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
    // Try to skip only the current optional key if not present in the buffer
    maybeSkipCurrentOptional();

    if (parser.currentKeyIndex >= keys.length) break mainloop;

    const key = keys[parser.currentKeyIndex];
    const isOptional = isOptionalKey(key, parser.config);
    const isStreaming = streamKeys.includes(key);

    const keyPattern = key + delimiter!;
    const keyIdx = parser.buffer.indexOf(keyPattern);

    if (parser.state === "seeking_key") {
      if (keyIdx !== -1) {
        // Found key: move past keyPattern and any whitespace after the delimiter
        parser.buffer = parser.buffer.slice(keyIdx + keyPattern.length);
        parser.buffer = parser.buffer.replace(/^\s+/, "");
        parser.state = isStreaming ? "streaming" : "reading_static";
        parser.keyStartTime = Date.now();
      } else {
        // Not found; skipping of optional key is already handled in maybeSkipCurrentOptional
        break mainloop;
      }
    }

    if (parser.state === "reading_static") {
      // Find position of terminator or (if any) the next present key pattern (even if optional)
      let valueEndIdx = parser.buffer.indexOf(terminator!);

      let nextPresentKeyPatternIdx = -1;
      let nextPresentKey = "";

      // Scan subsequent keys looking for ones present in the buffer
      for (
        let i = parser.currentKeyIndex + 1;
        i < keys.length;
        ++i
      ) {
        const k = keys[i];
        const idx = parser.buffer.indexOf(k + delimiter!);
        if (idx !== -1 && (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx)) {
          nextPresentKeyPatternIdx = idx;
          nextPresentKey = k;
          break;
        }
      }

      // whichever comes first: next present key or terminator
      if (
        nextPresentKeyPatternIdx !== -1 &&
        (valueEndIdx === -1 || nextPresentKeyPatternIdx < valueEndIdx)
      ) {
        valueEndIdx = nextPresentKeyPatternIdx;
      }

      if (valueEndIdx === -1) {
        // Not enough data
        break mainloop;
      } else {
        const rawSlice = parser.buffer.slice(0, valueEndIdx);
        const rawValue = rawSlice.replace(/;$/, "").trim();
        // Support JSON keys (e.g., translations)
        if (isJsonKey(key, parser.config)) {
          try {
            const parsedJson = JSON.parse(rawValue);
            if (key === "translations" && Array.isArray(parsedJson)) {
              const currentLanguage = String(parser.parsed["language"] ?? "");
              const translationsObj: Record<string, any> = {};
              parsedJson.forEach((item: any) => {
                if (!item || typeof item !== "object") return;
                const word = String(item.word ?? "");
                if (!word) return;
                translationsObj[word.toLowerCase()] = {
                  word: item.word,
                  language: currentLanguage,
                  english: item.translation,
                  phonetic: item.phonetic,
                  audioUrl: item.audio || ""
                };
              });
              parser.parsed[key] = translationsObj;
            } else {
              // Generic jsonKey: store parsed JSON as-is
              parser.parsed[key] = parsedJson;
            }
          } catch (e) {
            // Fallback to numeric or string
            const numValue = Number(rawValue);
            parser.parsed[key] = isNaN(numValue) ? rawValue : numValue;
          }
        } else {
          const numValue = Number(rawValue);
          parser.parsed[key] = isNaN(numValue) ? rawValue : numValue;
        }
        parser.buffer =
          valueEndIdx === nextPresentKeyPatternIdx
            ? parser.buffer.slice(valueEndIdx)
            : parser.buffer.slice(valueEndIdx + 1);

        parser.currentKeyIndex++;
        parser.state = "seeking_key";
        parser.keyStartTime = Date.now();
        continue mainloop;
      }
    }

    if (parser.state === "streaming") {
      let streamEndIdx = parser.buffer.indexOf(terminator!);
      let nextPresentKeyPatternIdx = -1;
      let nextPresentKey = "";

      for (
        let i = parser.currentKeyIndex + 1;
        i < keys.length;
        ++i
      ) {
        const k = keys[i];
        const idx = parser.buffer.indexOf(k + delimiter!);
        if (idx !== -1 && (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx)) {
          nextPresentKeyPatternIdx = idx;
          nextPresentKey = k;
          break;
        }
      }

      if (
        nextPresentKeyPatternIdx !== -1 &&
        (streamEndIdx === -1 || nextPresentKeyPatternIdx < streamEndIdx)
      ) {
        streamEndIdx = nextPresentKeyPatternIdx;
      }

      if (streamEndIdx === -1 && parser.buffer.length === 0) {
        // Nothing to emit
        break mainloop;
      } else if (streamEndIdx === -1) {
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

        parser.currentKeyIndex++;
        parser.state = "seeking_key";
        parser.keyStartTime = Date.now();
        continue mainloop;
      }
    }
  }

  // Emit meta after all static keys handled (or at completion)
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