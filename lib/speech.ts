// Enhanced Audio Manager with Echo Cancellation
class AudioManager {
  protected audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  protected isPlaying: boolean = false;
  protected audioQueue: AudioBuffer[] = [];
  private fallbackUtter: SpeechSynthesisUtterance | null = null;
  private nextPlayTime: number = 0;

  private outputGainNode: GainNode | null = null;
  protected inputGainNode: GainNode | null = null;
  protected ORIGINAL_GAIN_VALUE = 0.8;
  protected REDUCED_GAIN_VALUE = 0.2;

  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  protected currentlyPlayingId: string | null = null;

  protected async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
    }
    
    console.log('this.audioContext.state 1', this.audioContext.state);

    if (this.audioContext.state === 'suspended') {
      console.log('audio state, 2', this.audioContext.state)
      await this.audioContext.resume();
    }

    // Create gain node for volume control
    if (!this.outputGainNode) {
      this.outputGainNode = this.audioContext.createGain();
      this.outputGainNode.gain.value = 1;
    }

    // Create destination node for capturing playback audio (echo cancellation reference)
    if (!this.destinationNode) {
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.outputGainNode.connect(this.destinationNode);
    }

    // Also connect to speakers
    this.outputGainNode.connect(this.audioContext.destination);
    
    this.nextPlayTime = this.audioContext.currentTime;
    
    return this.destinationNode.stream;
  }

  private playNextBuffer(onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void) {
    const buffer = this.audioQueue.shift();
    if (!buffer) {
      this.isPlaying = false;
      this.currentlyPlayingId = null;
      onPlaybackStateChange?.(false, this.currentlyPlayingId);
      return;
    }

    const source = this.audioContext!.createBufferSource();
    source.buffer = buffer;

    // Connect through gain node for consistent volume
    source.connect(this.outputGainNode!);
    
    const currentTime = this.audioContext!.currentTime;

    // Schedule seamlessly to avoid gaps
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.currentSource = source;

    source.onended = () => {
      this.currentSource = null;
      this.playNextBuffer(onPlaybackStateChange); // Recursively play next
    };

    if (!this.isPlaying) {
      this.isPlaying = true;
      onPlaybackStateChange?.(true, this.currentlyPlayingId);
    }
  };

  protected playQueuedAudioWithReduceInputGain(
    onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void
  ): void {
    const reduceInputGain = (active: boolean) => {
      if(!this.inputGainNode || !this.audioContext) 
        return;

      const now = this.audioContext.currentTime;
      this.inputGainNode.gain.cancelScheduledValues(now);
      this.inputGainNode.gain.setTargetAtTime(
        active ? this.REDUCED_GAIN_VALUE : this.ORIGINAL_GAIN_VALUE,
        now,
        0.05
      );
    };

    const wrappedCallback = (isPlaying: boolean, messageId: string | null) => {
      reduceInputGain(isPlaying);
      if (onPlaybackStateChange) {
        onPlaybackStateChange(isPlaying, messageId);
      }
    };

    this.playNextBuffer(wrappedCallback);
  }
  
  playMessageAudio(audioData: Uint8Array, messageId: string, onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void): void {
    if (!this.audioContext) {
      console.error('Audio context not initialized');
      return;
    }

    this.clearCurrentlyPlayingAudio(onPlaybackStateChange);
    
    try {
      const float32Data = convertInt16ToFloat32(audioData);
      if (float32Data.length > 0) {
        const SAMPLE_RATE = 24000;
        const CHANNELS = 1;
        
        const audioBuffer = this.audioContext.createBuffer(
          CHANNELS, 
          float32Data.length, 
          SAMPLE_RATE
        );
        audioBuffer.getChannelData(0).set(float32Data);
        
        this.currentlyPlayingId = messageId;
        this.audioQueue.push(audioBuffer);
        
        if (!this.isPlaying) {
          this.playQueuedAudioWithReduceInputGain(onPlaybackStateChange);
        }
      }
    } catch (error) {
      console.error('Error in playMessageAudio:', error);
      if (onPlaybackStateChange) {
        onPlaybackStateChange(false, null);
      }
    }
  }

  /**
   * Convenience: small fast fallback via Web Speech API for perceptual latency.
   * Use only for the very first few words; cancel when high-quality audio arrives.
   */
  playFallbackSpeech(text: string) {
    try {
      if (!('speechSynthesis' in window)) return;
      // cancel any existing fallback
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // small volume and rate adjustments can improve perceived velocity
      u.rate = 1.05;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
      this.fallbackUtter = u;
    } catch (e) {
      // ignore
    }
  }

  stopAudio() {
    // Clear the queue
    this.audioQueue = [];
    
    // Stop current source
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        console.error('AudioManager.stopAudio: currentSource audio already stopped')
      }
      this.currentSource = null;
    }
    
    this.isPlaying = false;
    this.currentlyPlayingId = null;
    
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getCurrentlyPlayingId() {
    return this.currentlyPlayingId;
  }

  getPlaybackStream(): MediaStream | null {
    return this.destinationNode?.stream || null;
  }

  /**
   * Clear currently playing audio and stop all playback
   */
  clearCurrentlyPlayingAudio(onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void) {
    this.stopAudio();

    console.log('Stopping all audio playback');
    onPlaybackStateChange(false, null);
  }

  async destroy() {
    this.stopAudio();
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Utility function to convert Int16 to Float32
export function convertInt16ToFloat32(int16Array: Uint8Array): Float32Array {
  const int16 = new Int16Array(int16Array.buffer, int16Array.byteOffset, int16Array.length / 2);
  const float32 = new Float32Array(int16.length);
  
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  
  return float32;
}

export class SpeechRecognitionManager extends AudioManager {
  private recognition: any = null;
  private isListening: boolean = false;
  private onResult: ((text: string) => void) | null = null;
  private onInterimResult: ((text: string) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean, messageId: string | null) => void) | null = null;
  private interimDebounceTimer: NodeJS.Timeout | null = null;
  private interimDebounceDelay: number = 4000;
  private ttsSequenceMap = new Map<string, number>(); // messageId -> next expected sequence

  private mediaStream: MediaStream | null = null;
  private audioTracks: MediaStreamTrack[] = [];

  async initialize() {
    // Initialize audio context first
    await this.initializeAudioContext();

    // Initialize speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = async (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript && this.onResult) {
        if (this.interimDebounceTimer) {
          clearTimeout(this.interimDebounceTimer);
          this.interimDebounceTimer = null;
        }

        this.onResult(finalTranscript);
      }
      
      if (interimTranscript && this.onInterimResult) {
        if (this.interimDebounceTimer) {
          clearTimeout(this.interimDebounceTimer);
        }
        
        this.interimDebounceTimer = setTimeout(() => {
          if (this.onInterimResult) {
            this.onInterimResult(interimTranscript);
          }
          this.interimDebounceTimer = null;
        }, this.interimDebounceDelay);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (this.onError) {
        this.onError(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.interimDebounceTimer) {
        clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = null;
      }
    };
  }

  /**
   * Start listening with echo cancellation
   */
  async startListening(
    onResult: (text: string) => void,
    onInterimResult: (text: string) => void,
    onError: (error: string) => void
  ) {
    if (!this.recognition) await this.initialize();
    
    this.onResult = onResult;
    this.onInterimResult = onInterimResult;
    this.onError = onError;

    try {
      // Get microphone with echo cancellation enabled
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioTracks = this.mediaStream.getAudioTracks();

      // Setup input gain node
      const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
      this.inputGainNode = this.audioContext!.createGain();
      this.inputGainNode.gain.value = this.ORIGINAL_GAIN_VALUE;
      source.connect(this.inputGainNode);

      // Log the actual applied constraints
      this.audioTracks.forEach(track => {
        console.log('Audio Track ', track);
        const settings = track.getSettings();
        console.log('Microphone settings:', settings);
        console.log('Echo cancellation:', settings.echoCancellation);
        console.log('\n');
      });

      // Start recognition
      this.recognition.start();
      this.isListening = true;

    } catch (error) {
      console.error('Error starting listening with echo cancellation:', error);
      if (this.onError) {
        this.onError('Failed to access microphone');
      }
    }
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
    }
    
    if (this.interimDebounceTimer) {
      clearTimeout(this.interimDebounceTimer);
      this.interimDebounceTimer = null;
    }

    // Stop all audio tracks
    this.audioTracks.forEach(track => track.stop());
    this.audioTracks = [];
    this.mediaStream = null;
    
    this.isListening = false;
  }

  /**
   * Deprecated - do not use
   * Synthesize speech from text and stream audio playback
   */
  async synthesizeSpeech(
    text: string, 
    messageId: string,
    onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void
  ): Promise<Uint8Array> {
    try {
      if (!this.audioContext) {
        await this.initializeAudioContext();
      }

      // Ensure audio context is running
      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }

      // Store callback for playback state changes
      this.onPlaybackStateChange = onPlaybackStateChange || null;
      this.currentlyPlayingId = messageId;

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`TTS API error: ${response.status} ${response.statusText} - ${errorData}`);
      }

      if (!response.body) {
        throw new Error("Response body is empty.");
      }

      const reader = response.body.getReader();
      let totalBytesReceived = 0;
      const SAMPLE_RATE = 24000;
      const CHANNELS = 1;
      let remainingBytes = new Uint8Array(0);
      const allAudioChunks: Uint8Array[] = []; // Collect all audio chunks

      while (true) {
        const { done, value } = await reader.read();

        if (value && value.byteLength > 0) {
          totalBytesReceived += value.byteLength;
          
          // Store the raw audio chunk
          allAudioChunks.push(value);
          
          // Combine with any remaining bytes from previous chunk
          const combinedBytes = new Uint8Array(remainingBytes.length + value.length);
          combinedBytes.set(remainingBytes);
          combinedBytes.set(value, remainingBytes.length);
          
          // Calculate how many complete 16-bit samples we have
          const completeBytes = combinedBytes.length - (combinedBytes.length % 2);
          
          if (completeBytes >= 2) {
            const audioData = combinedBytes.subarray(0, completeBytes);
            const float32Data = convertInt16ToFloat32(audioData);
            
            if (float32Data.length > 0) {
              try {
                const audioBuffer = this.audioContext!.createBuffer(
                  CHANNELS, 
                  float32Data.length, 
                  SAMPLE_RATE
                );
                audioBuffer.getChannelData(0).set(float32Data);
                this.audioQueue.push(audioBuffer);
              } catch (bufferError) {
                console.error('Error creating audio buffer:', bufferError);
                continue;
              }
            }
            
            remainingBytes = combinedBytes.subarray(completeBytes);
          } else {
            remainingBytes = combinedBytes;
          }

          // Start playing with minimal latency
          const MIN_CHUNKS_TO_START_PLAYBACK = 1;
          if (!this.isPlaying && this.audioQueue.length >= MIN_CHUNKS_TO_START_PLAYBACK) {
            this.playQueuedAudioWithReduceInputGain(this.onPlaybackStateChange || undefined);
          }
        }

        if (done) {
          console.log(`Audio stream finished. Total bytes: ${totalBytesReceived}`);
          
          // Process any remaining bytes
          if (remainingBytes.length >= 2) {
            const float32Data = convertInt16ToFloat32(remainingBytes);
            if (float32Data.length > 0) {
              try {
                const audioBuffer = this.audioContext!.createBuffer(
                  CHANNELS, 
                  float32Data.length, 
                  SAMPLE_RATE
                );
                audioBuffer.getChannelData(0).set(float32Data);
                this.audioQueue.push(audioBuffer);
              } catch (bufferError) {
                console.error('Error creating final audio buffer:', bufferError);
              }
            }
          }
          
          // Ensure any remaining queued audio is played
          if (!this.isPlaying && this.audioQueue.length > 0) {
            this.playQueuedAudioWithReduceInputGain(this.onPlaybackStateChange || undefined);
          }
          break;
        }
      }

      // Combine all audio chunks into a single Uint8Array
      const totalLength = allAudioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const completeAudioData = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of allAudioChunks) {
        completeAudioData.set(chunk, offset);
        offset += chunk.length;
      }

      return completeAudioData;
    } catch (error) {
      console.error('Error in synthesizeSpeech:', error);
      this.isPlaying = false;
      this.currentlyPlayingId = null;
      if (this.onPlaybackStateChange) {
        this.onPlaybackStateChange(false, null);
      }
      throw error;
    }
  };

  /**
   * Fire-and-forget streaming TTS for partial segments.
   * Streams binary PCM16 from /api/tts?partial=true and enqueues into audioQueue.
   */
  synthesizeSpeechStream(
    textSegment: string, 
    messageId: string, 
    sequenceNumber: number,
    onPlaybackStateChange: (isPlaying: boolean, messageId: string | null) => void,
    onCompleteAudio?: (messageId: string, audioData: Uint8Array) => void
) {
    if (!textSegment || !textSegment.trim()) return;

    // run in background — don't await in caller
    (async () => {
      try {
        if (!this.audioContext) await this.initializeAudioContext();
        if (this.audioContext!.state === 'suspended') await this.audioContext!.resume();

        this.currentlyPlayingId = messageId;

        const res = await fetch('/api/tts?partial=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textSegment }),
        });

        if (!res.ok || !res.body) {
          console.warn('Partial TTS failed', res.status);
          return;
        }

        const reader = res.body.getReader();
        const SAMPLE_RATE = 24000;
        const CHANNELS = 1;

        let allBytes = new Uint8Array(0);
        let remainingBytes = new Uint8Array(0);
        const buffers: AudioBuffer[] = []; // Collect all buffers for this segment

        while (true) {
          const { done, value } = await reader.read();
          
          if (value && value.byteLength > 0) {
            const mergedAll = new Uint8Array(allBytes.length + value.length);
            mergedAll.set(allBytes);
            mergedAll.set(value, allBytes.length);
            allBytes = mergedAll;
            
            const combined = new Uint8Array(remainingBytes.length + value.length);
            combined.set(remainingBytes);
            combined.set(value, remainingBytes.length);

            const completeBytes = combined.length - (combined.length % 2);

            if (completeBytes >= 2) {
              const audioData = combined.subarray(0, completeBytes);
              const float32Data = convertInt16ToFloat32(audioData);

              if (float32Data.length > 0) {
                const audioBuffer = this.audioContext!.createBuffer(
                  CHANNELS,
                  float32Data.length,
                  SAMPLE_RATE
                );
                audioBuffer.getChannelData(0).set(float32Data);
                buffers.push(audioBuffer);
              }

              remainingBytes = combined.subarray(completeBytes);
            } else {
              remainingBytes = combined;
            }
          }

          if (done) {
            if (remainingBytes.length >= 2) {
              const float32Data = convertInt16ToFloat32(remainingBytes);
              if (float32Data.length > 0) {
                const audioBuffer = this.audioContext!.createBuffer(
                  CHANNELS,
                  float32Data.length,
                  SAMPLE_RATE
                );
                audioBuffer.getChannelData(0).set(float32Data);
                buffers.push(audioBuffer);
              }
            }

            // Add buffers to queue IN ORDER
            for (const buffer of buffers) {
              this.audioQueue.push(buffer);
            }
            
            if (!this.isPlaying && this.audioQueue.length > 0) {
              this.playQueuedAudioWithReduceInputGain(onPlaybackStateChange);
            }

            if (onCompleteAudio) {
              onCompleteAudio(messageId, allBytes);
            }
            break;
          }
        }
      } catch (err) {
        console.error('synthesizeSpeechStream error', err);
      }
    })();
  };

  async correctTranscription(
    rawTranscript: string,
    messages: string[] = []
  ): Promise<{ corrected: string; confidence: number; changes: string[] }> {
    try {
      const response = await fetch('/api/correct-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript: rawTranscript,
          messages: messages.slice(-5, -1),
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Speech correction failed:', error);
      return { 
        corrected: rawTranscript, 
        confidence: 0.5,
        changes: []
      };
    }
  }
  
  protected setInterimResultDelay(delayMs: number) {
    this.interimDebounceDelay = delayMs;
  }

  protected getIsListening() {
    return this.isListening;
  }
}
