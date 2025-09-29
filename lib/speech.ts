// Enhanced Audio Manager with Echo Cancellation
class AudioManager {
  protected audioContext: AudioContext | null = null;
  protected currentSource: AudioBufferSourceNode | null = null;
  protected isPlaying: boolean = false;
  protected audioQueue: AudioBuffer[] = [];
  protected nextPlayTime: number = 0;
  protected gainNode: GainNode | null = null;
  protected destinationNode: MediaStreamAudioDestinationNode | null = null;
  protected currentlyPlayingId: string | null = null;

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create gain node for volume control
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.8;
    }

    // Create destination node for capturing playback audio (echo cancellation reference)
    if (!this.destinationNode) {
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.gainNode.connect(this.destinationNode);
    }

    // Also connect to speakers
    this.gainNode.connect(this.audioContext.destination);
    
    this.nextPlayTime = this.audioContext.currentTime;
    
    return this.destinationNode.stream;
  }

  protected playQueuedAudio(onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void) {
    if (!this.audioContext || this.audioQueue.length === 0 || this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    if (onPlaybackStateChange) {
      onPlaybackStateChange(true, this.currentlyPlayingId);
    }

    const playNext = () => {
      const buffer = this.audioQueue.shift();
      if (!buffer) {
        this.isPlaying = false;
        const playingId = this.currentlyPlayingId;
        this.currentlyPlayingId = null;
        if (onPlaybackStateChange) {
          onPlaybackStateChange(false, null);
        }
        return;
      }

      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode!);

      const currentTime = this.audioContext!.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
      this.currentSource = source;

      source.onended = () => {
        playNext();
      };
      
      source.onerror = (error) => {
        console.error('Audio source error:', error);
        this.isPlaying = false;
        this.currentlyPlayingId = null;
        if (onPlaybackStateChange) {
          onPlaybackStateChange(false, null);
        }
      };
    };

    playNext();
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
  private interimDebounceDelay: number = 500;
  
  // For echo cancellation
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

    this.recognition.onresult = (event: any) => {
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
    
    // Don't start listening if audio is playing
    if (this.isPlaying) {
      console.log('Cannot start listening while audio is playing');
      onError('Cannot start listening while audio is playing');
      return;
    }

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

      // Log the actual applied constraints
      this.audioTracks.forEach(track => {
        const settings = track.getSettings();
        console.log('Microphone settings:', settings);
        console.log('Echo cancellation:', settings.echoCancellation);
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
   * Synthesize speech from text and stream audio playback
   */
  async synthesizeSpeech(
    text: string, 
    messageId: string,
    onPlaybackStateChange?: (isPlaying: boolean, messageId: string | null) => void
  ): Promise<void> {
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

      // Auto-stop listening when starting playback
      if (this.isListening) {
        console.log('Stopping listening due to playback starting');
        this.stopListening();
      }

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

      while (true) {
        const { done, value } = await reader.read();

        if (value && value.byteLength > 0) {
          totalBytesReceived += value.byteLength;
          
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
            this.playQueuedAudio(this.onPlaybackStateChange || undefined);
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
            this.playQueuedAudio(this.onPlaybackStateChange || undefined);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error in synthesizeSpeech:', error);
      this.isPlaying = false;
      this.currentlyPlayingId = null;
      if (this.onPlaybackStateChange) {
        this.onPlaybackStateChange(false, null);
      }
      throw error;
    }
  }

  setInterimResultDelay(delayMs: number) {
    this.interimDebounceDelay = delayMs;
  }

  getIsListening() {
    return this.isListening;
  }
}
