// Performance-optimized audio management
class AudioManager {
    private audioContext: AudioContext | null = null;
    private currentSource: AudioBufferSourceNode | null = null;
    private isPlaying: boolean = false;
  
    async initializeAudio() {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    }
  
    async playAudio(audioData: ArrayBuffer): Promise<void> {
      if (!this.audioContext) await this.initializeAudio();
      if (!this.audioContext) throw new Error('Failed to initialize audio context');
  
      this.stopAudio();
  
      const audioBuffer = await this.audioContext.decodeAudioData(audioData);
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);
      
      this.isPlaying = true;
      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
      };
  
      this.currentSource.start();
    }
  
    stopAudio() {
      if (this.currentSource) {
        this.currentSource.stop();
        this.currentSource = null;
      }
      this.isPlaying = false;
    }
  
    getIsPlaying() {
      return this.isPlaying;
    }
  }
  
  // Performance-optimized speech recognition
  export class SpeechRecognitionManager extends AudioManager {
    constructor () {
        super();
    }
    private recognition: any = null;
    private isListening: boolean = false;
    private onResult: ((text: string) => void) | null = null;
    private onInterimResult: ((text: string) => void) | null = null;
    private onError: ((error: string) => void) | null = null;
    private interimDebounceTimer: NodeJS.Timeout | null = null;
    private interimDebounceDelay: number = 500; // Default 500ms delay

    async initialize() {
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
          // Clear any pending interim result since we have a final result
          if (this.interimDebounceTimer) {
            clearTimeout(this.interimDebounceTimer);
            this.interimDebounceTimer = null;
          }
          this.onResult(finalTranscript);
        }
        
        if (interimTranscript && this.onInterimResult) {
          // Debounce interim results
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
        // Clear any pending interim results when recognition ends
        if (this.interimDebounceTimer) {
          clearTimeout(this.interimDebounceTimer);
          this.interimDebounceTimer = null;
        }
      };
    }

    setInterimResultDelay(delayMs: number) {
      this.interimDebounceDelay = delayMs;
    }

    startListening(
      onResult: (text: string) => void,
      onInterimResult: (text: string) => void,
      onError: (error: string) => void
    ) {
      if (!this.recognition) this.initialize();
      
      this.onResult = onResult;
      this.onInterimResult = onInterimResult;
      this.onError = onError;
      
      this.recognition.start();
      this.isListening = true;
    }

    stopListening() {
      if (this.recognition) {
        this.recognition.stop();
      }
      // Clear any pending interim results when stopping
      if (this.interimDebounceTimer) {
        clearTimeout(this.interimDebounceTimer);
        this.interimDebounceTimer = null;
      }
      this.isListening = false;
    }

    getIsListening() {
      return this.isListening;
    }
  }