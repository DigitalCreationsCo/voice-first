// ============================================
// ORDERED AUDIO QUEUE MANAGER
// High-performance chunk ordering system
// ============================================

import { AudioConverter, AudioDebugger, AudioFormat, TTSDebugLogger } from "@/shared/audio/audio-helpers";

interface AudioChunkMetadata {
  chunkIndex: number;
  audioBuffer: AudioBuffer;
  played: boolean;
  timestamp: number;
}

interface RequestQueueState {
  chunks: Map<number, AudioChunkMetadata>; // Use Map for O(1) lookups
  nextExpectedIndex: number;
  messageId: string;
  isComplete: boolean;
  lastActivityTime: number;
}

class OrderedAudioQueueManager {
  private requestQueues: Map<string, RequestQueueState> = new Map();
  private activeRequestId: string | null = null;
  private allowConcurrentRequests: boolean = true;
  private maxQueueSize: number = 100; // Prevent memory bloat
  private queueEvictionTimeMs: number = 300000; // 5 minutes
  private evictionIntervalId: NodeJS.Timeout | null = null;

  constructor(options?: {
    allowConcurrentRequests?: boolean;
    maxQueueSize?: number;
    queueEvictionTimeMs?: number;
  }) {
    this.allowConcurrentRequests = options?.allowConcurrentRequests ?? true;
    this.maxQueueSize = options?.maxQueueSize ?? 100;
    this.queueEvictionTimeMs = options?.queueEvictionTimeMs ?? 300000;
    
    this.startEvictionTimer();
  }

  /**
   * Add audio chunk to ordered queue. 
   * Returns true if chunk is ready to play immediately
   */
  enqueueChunk(
    requestId: string,
    chunkIndex: number,
    audioBuffer: AudioBuffer,
    messageId: string
  ): boolean {
    if (!this.allowConcurrentRequests && this.activeRequestId && this.activeRequestId !== requestId) {
      console.warn(`Rejecting concurrent request ${requestId}. Active: ${this.activeRequestId}`);
      return false;
    }

    let queueState = this.requestQueues.get(requestId);
    if (!queueState) {
      queueState = {
        chunks: new Map(),
        nextExpectedIndex: 0,
        messageId,
        isComplete: false,
        lastActivityTime: Date.now()
      };
      this.requestQueues.set(requestId, queueState);
    }

    queueState.lastActivityTime = Date.now();

    if (queueState.chunks.size >= this.maxQueueSize) {
      console.warn(`Queue size limit reached for ${requestId}. Evicting oldest chunks.`);
      this.evictOldestChunks(requestId, Math.floor(this.maxQueueSize * 0.3));
    }

    queueState.chunks.set(chunkIndex, {
      chunkIndex,
      audioBuffer,
      played: false,
      timestamp: Date.now()
    });

    if (!this.activeRequestId) {
      this.activeRequestId = requestId;
    }

    // Check if this chunk should play immediately
    return chunkIndex === queueState.nextExpectedIndex && this.activeRequestId === requestId;
  }

  /**
   * Get next chunk to play if available
   * Returns null if next chunk is not ready
   */
  getNextChunk(requestId: string): AudioBuffer | null {
    const queueState = this.requestQueues.get(requestId);
    if (!queueState) return null;

    const nextChunk = queueState.chunks.get(queueState.nextExpectedIndex);
    if (!nextChunk || nextChunk.played) return null;

    // Mark as played and increment expected index
    nextChunk.played = true;
    queueState.nextExpectedIndex++;

    return nextChunk.audioBuffer;
  }

  /**
   * Check if there are more chunks ready to play
   */
  hasNextChunk(requestId: string): boolean {
    const queueState = this.requestQueues.get(requestId);
    if (!queueState) return false;

    const nextChunk = queueState.chunks.get(queueState.nextExpectedIndex);
    return nextChunk !== undefined && !nextChunk.played;
  }

  /**
   * Mark request as complete (all chunks received)
   */
  markRequestComplete(requestId: string): void {
    const queueState = this.requestQueues.get(requestId);
    if (queueState) {
      queueState.isComplete = true;
    }
  }

  /**
   * Check if request is complete and all chunks played
   */
  isRequestFinished(requestId: string): boolean {
    const queueState = this.requestQueues.get(requestId);
    if (!queueState || !queueState.isComplete) return false;

    // Check if all chunks have been played
    for (const chunk of queueState.chunks.values()) {
      if (!chunk.played) return false;
    }

    return true;
  }

  /**
   * Get message ID for request
   */
  getMessageId(requestId: string): string | null {
    return this.requestQueues.get(requestId)?.messageId ?? null;
  }

  /**
   * Clear specific request queue
   */
  clearRequest(requestId: string): void {
    this.requestQueues.delete(requestId);
    
    if (this.activeRequestId === requestId) {
      this.activeRequestId = null;
      
      // Set next active request if available
      if (this.requestQueues.size > 0) {
        this.activeRequestId = this.requestQueues.keys().next().value || null;
      }
    }
  }

  /**
   * Clear all queues
   */
  clearAll(): void {
    this.requestQueues.clear();
    this.activeRequestId = null;
  }

  /**
   * Get active request ID
   */
  getActiveRequestId(): string | null {
    return this.activeRequestId;
  }

  /**
   * Get queue statistics for monitoring
   */
  getQueueStats(requestId: string): {
    totalChunks: number;
    playedChunks: number;
    nextExpectedIndex: number;
    isComplete: boolean;
  } | null {
    const queueState = this.requestQueues.get(requestId);
    if (!queueState) return null;

    let playedCount = 0;
    for (const chunk of queueState.chunks.values()) {
      if (chunk.played) playedCount++;
    }

    return {
      totalChunks: queueState.chunks.size,
      playedChunks: playedCount,
      nextExpectedIndex: queueState.nextExpectedIndex,
      isComplete: queueState.isComplete
    };
  }

  /**
   * Evict oldest chunks from a specific queue
   */
  private evictOldestChunks(requestId: string, count: number): void {
    const queueState = this.requestQueues.get(requestId);
    if (!queueState) return;

    // Sort chunks by timestamp and remove oldest played chunks
    const sortedChunks = Array.from(queueState.chunks.entries())
      .filter(([_, chunk]) => chunk.played)
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, count);

    for (const [index, _] of sortedChunks) {
      queueState.chunks.delete(index);
    }

    console.log(`Evicted ${sortedChunks.length} old chunks from ${requestId}`);
  }

  /**
   * Automatic eviction of stale queues
   */
  private startEvictionTimer(): void {
    if (this.evictionIntervalId) return;

    this.evictionIntervalId = setInterval(() => {
      const now = Date.now();
      const staleRequests: string[] = [];

      for (const [requestId, queueState] of this.requestQueues.entries()) {
        if (now - queueState.lastActivityTime > this.queueEvictionTimeMs) {
          staleRequests.push(requestId);
        }
      }

      for (const requestId of staleRequests) {
        console.log(`Evicting stale queue: ${requestId}`);
        this.clearRequest(requestId);
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop eviction timer
   */
  stopEvictionTimer(): void {
    if (this.evictionIntervalId) {
      clearInterval(this.evictionIntervalId);
      this.evictionIntervalId = null;
    }
  }

  /**
   * Update concurrent request policy
   */
  setAllowConcurrentRequests(allow: boolean): void {
    this.allowConcurrentRequests = allow;
  }

  destroy(): void {
    this.stopEvictionTimer();
    this.clearAll();
  }
}

// ============================================
// AUDIO MANAGER
// All playback uses OrderedAudioQueueManager
// ============================================

class AudioManager {
  protected audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  protected isPlaying: boolean = false;
  private fallbackUtter: SpeechSynthesisUtterance | null = null;
  private nextPlayTime: number = 0;

  private outputGainNode: GainNode | null = null;
  protected inputGainNode: GainNode | null = null;
  protected ORIGINAL_GAIN_VALUE = 0.8;
  protected REDUCED_GAIN_VALUE = 0.2;

  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  protected currentlyPlayingMessageId: string | null = null; // Renamed for clarity

  // Ordered audio queue system
  protected orderedQueueManager: OrderedAudioQueueManager;
  private currentPlayingRequestId: string | null = null;
  private playbackStateCallback: ((isPlaying: boolean, messageId: string | null) => void) | null = null;

  // Counter for auto-generated request IDs
  private requestIdCounter: number = 0;

  constructor(options?: {
    allowConcurrentRequests?: boolean;
    maxQueueSize?: number;
    queueEvictionTimeMs?: number;
  }) {
    this.orderedQueueManager = new OrderedAudioQueueManager(options);
  }

  protected async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
      console.log('Audio Manager initialized new audio context');
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('Audio Manager resumed audio context');
    }

    if (!this.outputGainNode) {
      this.outputGainNode = this.audioContext.createGain();
      this.outputGainNode.gain.value = 1;
    }

    if (!this.destinationNode) {
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.outputGainNode.connect(this.destinationNode);
    }

    this.outputGainNode.connect(this.audioContext.destination);
    this.nextPlayTime = this.audioContext.currentTime;
    return this.destinationNode.stream;
  }

  /**
   * Play next ordered chunk from queue with input gain reduction
   */
  private playNextOrderedChunk() {
    if (!this.currentPlayingRequestId) return;

    const nextBuffer = this.orderedQueueManager.getNextChunk(this.currentPlayingRequestId);
    
    if (!nextBuffer) {
      if (this.orderedQueueManager.isRequestFinished(this.currentPlayingRequestId)) {
        console.log(`Request ${this.currentPlayingRequestId} finished`);
        this.orderedQueueManager.clearRequest(this.currentPlayingRequestId);
        this.currentPlayingRequestId = null;
        this.isPlaying = false;
        this.currentlyPlayingMessageId = null;
        this.reduceInputGain(false);
        this.playbackStateCallback?.(false, null);
      }
      return;
    }

    // Play the buffer
    const source = this.audioContext!.createBufferSource();
    source.buffer = nextBuffer;
    source.connect(this.outputGainNode!);
    
    const currentTime = this.audioContext!.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    
    source.start(this.nextPlayTime);
    this.nextPlayTime += nextBuffer.duration;
    this.currentSource = source;

    source.onended = () => {
      this.currentSource = null;
      this.playNextOrderedChunk();
    };

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.currentlyPlayingMessageId = this.orderedQueueManager.getMessageId(this.currentPlayingRequestId);
      this.reduceInputGain(true);
      this.playbackStateCallback?.(true, this.currentlyPlayingMessageId);
    }
  }

  /**
     * Reduce input gain (for echo cancellation during playback)
     */
  private reduceInputGain(active: boolean): void {
    if (!this.inputGainNode || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    this.inputGainNode.gain.cancelScheduledValues(now);
    this.inputGainNode.gain.setTargetAtTime(
      active ? this.REDUCED_GAIN_VALUE : this.ORIGINAL_GAIN_VALUE,
      now,
      0.05
    );
  }

  /**
   * Core method: Enqueue ordered audio chunk
   * All audio playback flows through this method
   */
  async enqueueOrderedAudioChunk(
    requestId: string,
    chunkIndex: number,
    base64Audio: string,
    messageId: string,
    onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void
  ): Promise<void> {
    if (!this.audioContext) await this.initializeAudioContext();
    if (this.audioContext!.state === 'suspended') await this.audioContext!.resume();

    console.group(`🎵 Enqueue Audio Chunk ${chunkIndex}`);
    try {
      if (!AudioDebugger.validate(base64Audio, AudioFormat.BASE64_STRING)) {
        throw new Error('Invalid base64 audio data');
      }
      
      console.log('Input:', {
        requestId,
        chunkIndex,
        base64Length: base64Audio.length,
        messageId
      });
            
      const uint8Array = AudioConverter.base64ToUint8Array(base64Audio);

      TTSDebugLogger.logStage(requestId, `Converted chunk ${chunkIndex} to Uint8Array`, {
        byteLength: uint8Array.length
      });
      
      const float32Data = AudioConverter.int16ToFloat32(uint8Array);
      
      if (float32Data.length === 0) {
        console.warn('Empty audio data after conversion');
        console.groupEnd();
        return;
      }
  
      const SAMPLE_RATE = 24000;
      const CHANNELS = 1;
      
      const audioBuffer = AudioConverter.createAudioBuffer(
        this.audioContext!,
        float32Data,
        SAMPLE_RATE,
        CHANNELS
      );

      // Store callback
      if (onPlaybackStateChange) {
        this.playbackStateCallback = onPlaybackStateChange;
      }

      // Enqueue chunk
      const shouldPlayImmediately = this.orderedQueueManager.enqueueChunk(
        requestId,
        chunkIndex,
        audioBuffer,
        messageId
      );

      console.log('Enqueued:', {
        shouldPlayImmediately,
        isPlaying: this.isPlaying,
        currentRequest: this.currentPlayingRequestId
      });

      // Start playback if this is the first chunk
      if (shouldPlayImmediately && !this.isPlaying) {
        this.currentPlayingRequestId = requestId;
        this.playNextOrderedChunk();
      } else if (this.isPlaying && this.currentPlayingRequestId === requestId) {
        // Try to continue playback if source ended between chunks
        if (!this.currentSource && this.orderedQueueManager.hasNextChunk(requestId)) {
          this.playNextOrderedChunk();
        }
      }

      console.groupEnd();
    } catch (error: any) {
      console.error('Enqueue error:', error);
      console.groupEnd();
      AudioDebugger.printSummary();
      onPlaybackStateChange?.(false, null);
      throw error;
    }
  }

  /**
   * Play audio buffer directly
   * Uses OrderedAudioQueueManager with auto-generated requestId
   */
  async playAudioBufferDirect(
    buffer: string,
    onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void
  ) {
    if (!buffer || buffer.length === 0) return;

    const requestId = `direct_${++this.requestIdCounter}_${Date.now()}`;
    const messageId = this.currentlyPlayingMessageId || requestId;

    await this.enqueueOrderedAudioChunk(
      requestId,
      0, 
      buffer,
      messageId,
      onPlaybackStateChange
    );

    this.orderedQueueManager.markRequestComplete(requestId);
  }

  /**
   * Play full message audio
   */
  async playMessageAudio(
    audioData: string,
    messageId: string,
    onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void
  ) {
    this.clearCurrentlyPlayingAudio(onPlaybackStateChange);
    
    // Use messageId as requestId for simplicity
    const requestId = `message_${messageId}`;
    
    await this.enqueueOrderedAudioChunk(
      requestId,
      0, // Single chunk
      audioData,
      messageId,
      onPlaybackStateChange
    );

    // Mark as complete
    this.orderedQueueManager.markRequestComplete(requestId);
  }

  /**
   * Mark request as complete (all chunks received)
   */
  markRequestComplete(requestId: string): void {
    this.orderedQueueManager.markRequestComplete(requestId);
    
    // Try to finish playback if we were waiting
    if (this.currentPlayingRequestId === requestId && !this.isPlaying) {
      this.playNextOrderedChunk();
    }
  }

  playFallbackSpeech(text: string): void {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
      this.fallbackUtter = u;
    } catch {}
  }

  stopAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }
    
    // Clear all queues
    this.orderedQueueManager.clearAll();
    this.currentPlayingRequestId = null;
    
    this.isPlaying = false;
    this.currentlyPlayingMessageId = null;
    
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
    
    this.reduceInputGain(false);
  }

  stopRequest(requestId: string): void {
    this.orderedQueueManager.clearRequest(requestId);
    
    if (this.currentPlayingRequestId === requestId) {
      if (this.currentSource) {
        try {
          this.currentSource.stop();
        } catch {}
        this.currentSource = null;
      }
      
      this.currentPlayingRequestId = null;
      this.isPlaying = false;
      this.currentlyPlayingMessageId = null;
      this.reduceInputGain(false);
      this.playbackStateCallback?.(false, null);
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentlyPlayingMessageId(): string | null {
    return this.currentlyPlayingMessageId;
  }

  getPlaybackStream(): MediaStream | null {
    return this.destinationNode?.stream || null;
  }

  clearCurrentlyPlayingAudio(onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void) {
    this.stopAudio();
    onPlaybackStateChange(false, null);
  }

  setAllowConcurrentRequests(allow: boolean): void {
    this.orderedQueueManager.setAllowConcurrentRequests(allow);
  }

  getQueueStats(requestId: string) {
    return this.orderedQueueManager.getQueueStats(requestId);
  }

  async destroy(): Promise<void> {
    this.stopAudio();
    this.orderedQueueManager.destroy();
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export function convertInt16ToFloat32(int16Array: Uint8Array): Float32Array {
  console.info('convertInt16ToFloat32 input: ', int16Array);
  
  const int16 = new Int16Array(int16Array.buffer, int16Array.byteOffset, int16Array.length / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export { AudioManager, OrderedAudioQueueManager };