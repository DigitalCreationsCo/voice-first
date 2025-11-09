// ============================================
// AUDIO DATA TYPES & UTILITIES
// ============================================

/**
 * Audio format at different pipeline stages
 */
export enum AudioFormat {
  BASE64_STRING = 'base64_string',      // From Gemini API
  BUFFER = 'buffer',                     // Node.js Buffer
  UINT8_ARRAY = 'uint8_array',          // Raw bytes (PCM16)
  FLOAT32_ARRAY = 'float32_array',      // Normalized audio data
  AUDIO_BUFFER = 'audio_buffer'         // Web Audio API format
}

/**
 * Audio chunk metadata for tracking
 */
export interface AudioChunkMetadata {
  chunkIndex: number;
  format: AudioFormat;
  byteLength: number;
  sampleRate?: number;
  channels?: number;
  timestamp: number;
}

/**
 * WebSocket audio message types
 */
export interface TTSStreamChunk {
  type: 'tts_stream_chunk';
  content: string; // Base64 encoded PCM16
  chunkIndex: number;
  parentRequestId: string;
  requestId: string;
  finish_reason: null;
}

export interface TTSStreamComplete {
  type: 'tts_stream_complete';
  content: string; // Base64 encoded PCM16
  totalChunks: number;
  parentRequestId: string;
  requestId: string;
  finish_reason: 'stop';
}

/**
 * Audio validation and debugging utilities
 */
export class AudioDebugger {
  private static logs: Array<{
    stage: string;
    format: AudioFormat;
    length: number;
    timestamp: number;
    metadata?: any;
  }> = [];

  static log(stage: string, data: any, format: AudioFormat, metadata?: any) {
    const length = this.getDataLength(data, format);
    
    const logEntry = {
      stage,
      format,
      length,
      timestamp: Date.now(),
      metadata
    };
    
    this.logs.push(logEntry);
    
    console.group(`🎵 Audio Debug: ${stage}`);
    console.log('Format:', format);
    console.log('Length:', length);
    console.log('Data sample:', this.getSample(data, format));
    if (metadata) console.log('Metadata:', metadata);
    console.groupEnd();
    
    return logEntry;
  }

  private static getDataLength(data: any, format: AudioFormat): number {
    switch (format) {
      case AudioFormat.BASE64_STRING:
        return (data as string).length;
      case AudioFormat.BUFFER:
      case AudioFormat.UINT8_ARRAY:
        return (data as Uint8Array).length;
      case AudioFormat.FLOAT32_ARRAY:
        return (data as Float32Array).length;
      case AudioFormat.AUDIO_BUFFER:
        return (data as AudioBuffer).length;
      default:
        return 0;
    }
  }

  private static getSample(data: any, format: AudioFormat): any {
    try {
      switch (format) {
        case AudioFormat.BASE64_STRING:
          return (data as string).substring(0, 50) + '...';
        case AudioFormat.BUFFER:
        case AudioFormat.UINT8_ARRAY:
          return Array.from((data as Uint8Array).slice(0, 10));
        case AudioFormat.FLOAT32_ARRAY:
          return Array.from((data as Float32Array).slice(0, 10));
        case AudioFormat.AUDIO_BUFFER:
          const buffer = data as AudioBuffer;
          return {
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            numberOfChannels: buffer.numberOfChannels,
            length: buffer.length
          };
        default:
          return 'Unknown format';
      }
    } catch (e) {
      return 'Error sampling data';
    }
  }

  static validate(data: any, expectedFormat: AudioFormat): boolean {
    console.log('Validate audio format: ', { data, expectedFormat });
    try {
      switch (expectedFormat) {
        case AudioFormat.BASE64_STRING:
          return typeof data === 'string' && /^[A-Za-z0-9+/=]+$/.test(data);
        
        case AudioFormat.BUFFER:
          return Buffer.isBuffer(data);
        
        case AudioFormat.UINT8_ARRAY:
          return data instanceof Uint8Array && data.length > 0;
        
        case AudioFormat.FLOAT32_ARRAY:
          return data instanceof Float32Array && data.length > 0;
        
        case AudioFormat.AUDIO_BUFFER:
          return data && typeof data.duration === 'number';
        
        default:
          return false;
      }
    } catch (e) {
      console.error('Validation error:', e);
      return false;
    }
  }

  static getLogs() {
    return this.logs;
  }

  static clearLogs() {
    this.logs = [];
  }

  static printSummary() {
    console.group('🎵 Audio Pipeline Summary');
    console.table(this.logs.map(log => ({
      stage: log.stage,
      format: log.format,
      length: log.length,
      time: new Date(log.timestamp).toISOString()
    })));
    console.groupEnd();
  }
}

export class TTSDebugLogger {
  private static sessions = new Map<string, {
    chatRequestId: string;
    ttsRequestId?: string;
    assistantMessageId: string;
    startTime: number;
    textChunksReceived: number;
    audioChunksReceived: number;
    audioChunksSent: number;
    errors: string[];
    stages: Array<{ stage: string; timestamp: number; data?: any }>;
  }>();

  static startSession(chatRequestId: string, assistantMessageId: string) {
    console.log(`
╔════════════════════════════════════════╗
║   NEW TTS SESSION STARTED              ║
╠════════════════════════════════════════╣
║ Chat Request ID: ${chatRequestId.padEnd(20)} ║
║ Assistant Msg ID: ${assistantMessageId.padEnd(19)} ║
╚════════════════════════════════════════╝
    `);

    this.sessions.set(chatRequestId, {
      chatRequestId,
      assistantMessageId,
      startTime: Date.now(),
      textChunksReceived: 0,
      audioChunksReceived: 0,
      audioChunksSent: 0,
      errors: [],
      stages: []
    });
  }

  static logStage(chatRequestId: string, stage: string, data?: any) {
    const session = this.sessions.get(chatRequestId);
    if (!session) {
      console.warn(`⚠️ Session not found for request ${chatRequestId}`);
      return;
    }

    const timestamp = Date.now();
    const elapsed = timestamp - session.startTime;
    
    session.stages.push({ stage, timestamp, data });

    console.log(`[+${elapsed}ms] 📍 ${stage}`);
    if (data) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }
  }

  static logError(chatRequestId: string, error: string, context?: any) {
    const session = this.sessions.get(chatRequestId);
    if (!session) {
      console.error(`❌ Error in unknown session ${chatRequestId}:`, error);
      return;
    }

    session.errors.push(error);
    const elapsed = Date.now() - session.startTime;

    console.error(`
╔════════════════════════════════════════╗
║   ERROR OCCURRED                       ║
╠════════════════════════════════════════╣
║ Time: +${elapsed}ms
║ Chat Request: ${chatRequestId}
║ Error: ${error}
${context ? `║ Context: ${JSON.stringify(context)}` : ''}
╚════════════════════════════════════════╝
    `);
  }

  static printSummary(chatRequestId: string) {
    const session = this.sessions.get(chatRequestId);
    if (!session) {
      console.warn(`No session found for ${chatRequestId}`);
      return;
    }

    const totalTime = Date.now() - session.startTime;
    
    console.log(`
╔════════════════════════════════════════╗
║   TTS SESSION SUMMARY                  ║
╠════════════════════════════════════════╣
║ Chat Request ID: ${session.chatRequestId}
║ TTS Request ID: ${session.ttsRequestId || 'N/A'}
║ Assistant Msg ID: ${session.assistantMessageId}
║ Total Time: ${totalTime}ms
║ Text Chunks Received: ${session.textChunksReceived}
║ Audio Chunks Sent (Server): ${session.audioChunksSent}
║ Audio Chunks Received (Client): ${session.audioChunksReceived}
║ Errors: ${session.errors.length}
╠════════════════════════════════════════╣
║ STAGE TIMELINE:
${session.stages.map((s, i) => `║ ${i + 1}. [+${s.timestamp - session.startTime}ms] ${s.stage}`).join('\n')}
${session.errors.length > 0 ? `╠════════════════════════════════════════╣\n║ ERRORS:\n${session.errors.map((e, i) => `║ ${i + 1}. ${e}`).join('\n')}` : ''}
╚════════════════════════════════════════╝
    `);
  }

  static updateSession(chatRequestId: string, updates: Partial<{
    ttsRequestId: string;
    textChunksReceived: number;
    audioChunksReceived: number;
    audioChunksSent: number;
  }>) {
    const session = this.sessions.get(chatRequestId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  static clearSession(chatRequestId: string) {
    this.sessions.delete(chatRequestId);
  }
}

/**
 * Type-safe audio conversion utilities
 */
export class AudioConverter {
  /**
   * Decode base64 string to Uint8Array (PCM16 format)
   */
  static base64ToUint8Array(base64: string): Uint8Array {
    AudioDebugger.log('Input', base64, AudioFormat.BASE64_STRING);
    
    if (!AudioDebugger.validate(base64, AudioFormat.BASE64_STRING)) {
      throw new Error('Invalid base64 string');
    }

    try {
      // Browser environment
      if (typeof atob !== 'undefined') {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        AudioDebugger.log('Decoded to Uint8Array', bytes, AudioFormat.UINT8_ARRAY);
        return bytes;
      }
      
      // Node.js environment
      const buffer = Buffer.from(base64, 'base64');
      const uint8Array = new Uint8Array(buffer);
      
      AudioDebugger.log('Decoded to Uint8Array', uint8Array, AudioFormat.UINT8_ARRAY);
      return uint8Array;
    } catch (error) {
      console.error('Base64 decode error:', error);
      throw new Error(`Failed to decode base64: ${error}`);
    }
  }

  /**
   * Convert PCM16 (Int16) to Float32 normalized audio
   */
  static int16ToFloat32(int16Array: Uint8Array): Float32Array {
    AudioDebugger.log('Input PCM16', int16Array, AudioFormat.UINT8_ARRAY, {
      expectedSamples: int16Array.length / 2
    });

    if (!AudioDebugger.validate(int16Array, AudioFormat.UINT8_ARRAY)) {
      throw new Error('Invalid Uint8Array for PCM16 conversion');
    }

    if (int16Array.length % 2 !== 0) {
      console.warn('Audio data length is odd, truncating last byte');
      int16Array = int16Array.slice(0, int16Array.length - 1);
    }

    try {
      // Create Int16Array view of the data
      const int16 = new Int16Array(
        int16Array.buffer,
        int16Array.byteOffset,
        int16Array.length / 2
      );

      // Convert to normalized Float32Array [-1.0, 1.0]
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0; // Max value of Int16
      }

      AudioDebugger.log('Converted to Float32', float32, AudioFormat.FLOAT32_ARRAY, {
        samples: float32.length,
        min: Math.min(...Array.from(float32.slice(0, 1000))),
        max: Math.max(...Array.from(float32.slice(0, 1000))),
        rms: Math.sqrt(
          Array.from(float32.slice(0, 1000))
            .reduce((sum, val) => sum + val * val, 0) / 1000
        )
      });

      return float32;
    } catch (error) {
      console.error('PCM16 to Float32 conversion error:', error);
      throw new Error(`Failed to convert PCM16 to Float32: ${error}`);
    }
  }

  /**
   * Create Web Audio API AudioBuffer from Float32Array
   */
  static createAudioBuffer(
    audioContext: AudioContext,
    float32Data: Float32Array,
    sampleRate: number = 24000,
    numberOfChannels: number = 1
  ): AudioBuffer {
    AudioDebugger.log('Input Float32', float32Data, AudioFormat.FLOAT32_ARRAY, {
      sampleRate,
      numberOfChannels
    });

    if (!AudioDebugger.validate(float32Data, AudioFormat.FLOAT32_ARRAY)) {
      throw new Error('Invalid Float32Array for AudioBuffer creation');
    }

    if (float32Data.length === 0) {
      throw new Error('Cannot create AudioBuffer from empty Float32Array');
    }

    try {
      const audioBuffer = audioContext.createBuffer(
        numberOfChannels,
        float32Data.length,
        sampleRate
      );

      audioBuffer.getChannelData(0).set(float32Data);

      AudioDebugger.log('Created AudioBuffer', audioBuffer, AudioFormat.AUDIO_BUFFER, {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      });

      return audioBuffer;
    } catch (error) {
      console.error('AudioBuffer creation error:', error);
      throw new Error(`Failed to create AudioBuffer: ${error}`);
    }
  }

  /**
   * Full pipeline: Base64 → AudioBuffer
   */
  static async base64ToAudioBuffer(
    base64: string,
    audioContext: AudioContext,
    sampleRate: number = 24000,
    numberOfChannels: number = 1
  ): Promise<AudioBuffer> {
    console.group('🎵 Full Audio Conversion Pipeline');
    
    try {
      // Step 1: Base64 → Uint8Array
      const uint8Array = this.base64ToUint8Array(base64);
      
      // Step 2: Uint8Array (PCM16) → Float32Array
      const float32Array = this.int16ToFloat32(uint8Array);
      
      // Step 3: Float32Array → AudioBuffer
      const audioBuffer = this.createAudioBuffer(
        audioContext,
        float32Array,
        sampleRate,
        numberOfChannels
      );
      
      console.groupEnd();
      return audioBuffer;
    } catch (error) {
      console.groupEnd();
      AudioDebugger.printSummary();
      throw error;
    }
  }
}

export default AudioDebugger;