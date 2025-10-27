export function createParser(config) {
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
function isOptionalKey(key, config) {
    return config.optionalKeys?.includes(key) ?? false;
}
function isJsonKey(key, config) {
    return config.jsonKeys?.includes(key) ?? false;
}
/**
 * Parse a chunk of incoming text.
 * Emits meta update once, after all static keys are parsed/skipped.
 */
export function parseChunk(parser, chunk) {
    parser.buffer += chunk;
    const updates = [];
    const { keys, streamKeys, delimiter, terminator } = parser.config;
    const d = delimiter || ":";
    const t = terminator || ";";
    // Helper functions
    function findKeyPatternInBuffer(key, buf) {
        return buf.indexOf(key + d);
    }
    function hasPartialPrefixAtEnd(pattern, buf) {
        const maxLen = Math.min(pattern.length - 1, buf.length);
        for (let len = 1; len <= maxLen; len++) {
            if (pattern.startsWith(buf.slice(-len))) {
                return true;
            }
        }
        return false;
    }
    function maybeSkipCurrentOptional() {
        // Only skip if:
        // - the key is optional and not jsonKey
        // - the full pattern is not in the buffer
        // - we see a next present key
        // - buffer doesn't end with a partial prefix (wait for more data)
        while (parser.currentKeyIndex < keys.length &&
            isOptionalKey(keys[parser.currentKeyIndex], parser.config) &&
            !isJsonKey(keys[parser.currentKeyIndex], parser.config)) {
            const key = keys[parser.currentKeyIndex];
            const pattern = key + d;
            if (findKeyPatternInBuffer(key, parser.buffer) !== -1)
                break;
            if (hasPartialPrefixAtEnd(pattern, parser.buffer))
                break;
            // Look for next present key pattern
            let foundNext = false;
            for (let i = parser.currentKeyIndex + 1; i < keys.length; ++i) {
                const k = keys[i];
                if (findKeyPatternInBuffer(k, parser.buffer) !== -1) {
                    foundNext = true;
                    break;
                }
            }
            if (!foundNext)
                break;
            // Skip this optional key
            parser.skippedKeys.add(key);
            parser.parsed[key] = undefined;
            updates.push({ type: "skip", key });
            parser.currentKeyIndex += 1;
            parser.state = "seeking_key";
            parser.keyStartTime = Date.now();
        }
    }
    function maybeEmitMeta() {
        if (!parser.metaEmitted) {
            let allStaticDone = true;
            for (const key of keys) {
                if (!streamKeys.includes(key)) {
                    if (!Object.prototype.hasOwnProperty.call(parser.parsed, key) &&
                        !parser.skippedKeys.has(key)) {
                        allStaticDone = false;
                        break;
                    }
                }
            }
            if (allStaticDone) {
                const metaData = {};
                for (const key of keys) {
                    if (!streamKeys.includes(key)) {
                        if (Object.prototype.hasOwnProperty.call(parser.parsed, key) ||
                            parser.skippedKeys.has(key)) {
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
        // Only skip for non-jsonKey optionals
        if (!(isOptionalKey(keys[parser.currentKeyIndex], parser.config) && isJsonKey(keys[parser.currentKeyIndex], parser.config))) {
            maybeSkipCurrentOptional();
        }
        if (parser.currentKeyIndex >= keys.length)
            break mainloop;
        const key = keys[parser.currentKeyIndex];
        const keyPattern = key + d;
        const isStreaming = streamKeys.includes(key);
        const isKeyJson = isJsonKey(key, parser.config);
        const isKeyOptional = isOptionalKey(key, parser.config);
        // SEEKING KEY
        if (parser.state === "seeking_key") {
            const kIdx = findKeyPatternInBuffer(key, parser.buffer);
            // Found key
            if (kIdx !== -1) {
                parser.buffer = parser.buffer.slice(kIdx + keyPattern.length);
                parser.buffer = parser.buffer.replace(/^\s+/, "");
                parser.state = isStreaming ? "streaming" : "reading_static";
                parser.keyStartTime = Date.now();
            }
            else {
                // For JSON keys, only skip if a later key is present, no hint of this key, and no partial prefix at end
                if (isKeyJson && isKeyOptional) {
                    const pattern = keyPattern;
                    if (hasPartialPrefixAtEnd(pattern, parser.buffer))
                        break mainloop;
                    let hasLater = false;
                    for (let i = parser.currentKeyIndex + 1; i < keys.length; ++i) {
                        const k2 = keys[i];
                        if (findKeyPatternInBuffer(k2, parser.buffer) !== -1) {
                            hasLater = true;
                            break;
                        }
                    }
                    if (hasLater) {
                        parser.skippedKeys.add(key);
                        parser.parsed[key] = undefined;
                        updates.push({ type: "skip", key });
                        parser.currentKeyIndex++;
                        parser.state = "seeking_key";
                        parser.keyStartTime = Date.now();
                        continue mainloop;
                    }
                    else {
                        break mainloop;
                    }
                }
                break mainloop;
            }
        }
        // READING STATIC (not stream key)
        if (parser.state === "reading_static") {
            if (isKeyJson) {
                const terminatorIdx = parser.buffer.indexOf(t);
                if (terminatorIdx === -1) {
                    break mainloop;
                }
                const rawValue = parser.buffer.slice(0, terminatorIdx).trim();
                let parsedJsonValue = undefined;
                let isPureJsonValue = false;
                try {
                    parsedJsonValue = JSON.parse(rawValue);
                    isPureJsonValue = true;
                }
                catch (e) {
                    // Value may be literal 'null', or invalid JSON, don't parse as JSON, keep fallback logic.
                    isPureJsonValue = false;
                    parsedJsonValue = undefined;
                }
                if (isPureJsonValue && parsedJsonValue !== undefined) {
                    // If parsedJsonValue is an array or object, keep it as is; else handle string/number/null
                    parser.parsed[key] = parsedJsonValue;
                }
                else {
                    // fallback: if the raw value is number, number, else as string (including null as string)
                    const numValue = Number(rawValue);
                    if (!isNaN(numValue) && rawValue.trim() !== "") {
                        parser.parsed[key] = numValue;
                    }
                    else {
                        parser.parsed[key] = rawValue;
                    }
                }
                parser.buffer = parser.buffer.slice(terminatorIdx + 1); // skip terminator
                parser.currentKeyIndex++;
                parser.state = "seeking_key";
                parser.keyStartTime = Date.now();
                continue mainloop;
            }
            else {
                // Non-json key: value is up to the next terminator *or* the next key found earliest
                const termIdx = parser.buffer.indexOf(t);
                // Look for next present key pattern
                let nextPresentKeyPatternIdx = -1;
                for (let i = parser.currentKeyIndex + 1; i < keys.length; ++i) {
                    const k = keys[i];
                    const idx = parser.buffer.indexOf(k + d);
                    if (idx !== -1) {
                        if (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx) {
                            nextPresentKeyPatternIdx = idx;
                        }
                    }
                }
                let valueEndIdx = -1;
                if (nextPresentKeyPatternIdx !== -1 &&
                    (termIdx === -1 || nextPresentKeyPatternIdx < termIdx)) {
                    valueEndIdx = nextPresentKeyPatternIdx;
                }
                else {
                    valueEndIdx = termIdx;
                }
                if (valueEndIdx === -1) {
                    break mainloop;
                }
                const rawValue = parser.buffer.slice(0, valueEndIdx).replace(/;$/, "").trim();
                const numValue = Number(rawValue);
                parser.parsed[key] = isNaN(numValue) ? rawValue : numValue;
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
        // STREAMING
        if (parser.state === "streaming") {
            let streamEndIdx = parser.buffer.indexOf(t);
            let nextPresentKeyPatternIdx = -1;
            for (let i = parser.currentKeyIndex + 1; i < keys.length; ++i) {
                const k = keys[i];
                const idx = parser.buffer.indexOf(k + d);
                if (idx !== -1 && (nextPresentKeyPatternIdx === -1 || idx < nextPresentKeyPatternIdx)) {
                    nextPresentKeyPatternIdx = idx;
                }
            }
            if (nextPresentKeyPatternIdx !== -1 &&
                (streamEndIdx === -1 || nextPresentKeyPatternIdx < streamEndIdx)) {
                streamEndIdx = nextPresentKeyPatternIdx;
            }
            if (streamEndIdx === -1 && parser.buffer.length === 0) {
                break mainloop;
            }
            else if (streamEndIdx === -1) {
                if (parser.buffer.length > 0) {
                    updates.push({ type: "stream", key, delta: parser.buffer });
                    parser.parsed[key] = (parser.parsed[key] || "") + parser.buffer;
                    parser.buffer = "";
                }
                break mainloop;
            }
            else {
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
    maybeEmitMeta();
    if (parser.currentKeyIndex >= keys.length &&
        !updates.some((u) => u.type === "complete")) {
        updates.push({ type: "complete", data: parser.parsed });
    }
    return { parser, updates };
}
/**
 * Utility: Check if parsing is complete
 */
export function isParsingComplete(parser) {
    return parser.currentKeyIndex >= parser.config.keys.length;
}
/**
 * Utility: Get current parsed data
 */
export function getParsedData(parser) {
    return { ...parser.parsed };
}
/**
 * Utility: Reset parser to initial state
 */
export function resetParser(parser) {
    return createParser(parser.config);
}
//# sourceMappingURL=parser.js.map