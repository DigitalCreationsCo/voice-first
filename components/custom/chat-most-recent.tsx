"use client";

import { Message as PreviewMessage } from "@/components/custom/message";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";

import { Overview } from "./overview";

import { Attachment, ChatRequestOptions, CreateMessage, Message } from "ai";
import { motion } from "framer-motion";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
  ChangeEvent,
} from "react";
import { toast } from "sonner";

import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import useWindowSize from "./use-window-size";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { MicIcon, Square, Volume2 } from "lucide-react";
import { throwIfDisallowedDynamic } from "next/dist/server/app-render/dynamic-rendering";

// Performance-optimized audio management
class AudioManager {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;

  async initialize() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async playAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext) await this.initialize();
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
class SpeechRecognitionManager {
  private recognition: any = null;
  private isListening: boolean = false;
  private onResult: ((text: string) => void) | null = null;
  private onInterimResult: ((text: string) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  initialize() {
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
        this.onResult(finalTranscript);
      }
      if (interimTranscript && this.onInterimResult) {
        this.onInterimResult(interimTranscript);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (this.onError) {
        this.onError(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };
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
    
    this.isListening = false;
  }

  getIsListening() {
    return this.isListening;
  }
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isAudio?: boolean;
  audioData?: ArrayBuffer;
}

export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<any>;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<any>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  
  // Audio and speech state
  const [audioManager] = useState(() => new AudioManager());
  const [speechManager] = useState(() => new SpeechRecognitionManager());
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);

  // Performance optimizations
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    speechManager.stopListening();
    setIsListening(false);
    audioManager.stopAudio();
    setIsPlayingAudio(false);
    setCurrentlyPlayingId(null);
  }, [audioManager, speechManager]);

  // Initialize audio context on user interaction
  useEffect(() => {
    const initAudio = async () => {
      try {
        await audioManager.initialize();
      } catch (error) {
        console.error('Failed to initialize audio:', error);
      }
    };
    
    const handleUserInteraction = () => {
      initAudio();
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [audioManager]);

  // Text-to-Speech with streaming
  const synthesizeSpeech = useCallback(async (text: string, messageId: string) => {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'alloy', speed: 1.0 }),
      });

      if (!response.ok) {
        throw new Error('TTS API error');
      }

      const audioData = await response.arrayBuffer();
      
      // Update message with audio data
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, audioData }
          : msg
      ));

      return audioData;
    } catch (error) {
      console.error('TTS Error:', error);
      toast.error('Failed to generate speech');
      return null;
    }
  }, []);

  // LLM Text Generation with streaming
  // WebSocket implementation for /api/stream-chat
  const generateTextResponse = useCallback(async (userMessage: string) => {
    let ws: WebSocket | null = null;
    let isClosed = false;
    let closeTimeout: NodeJS.Timeout | null = null;

    try {
      // Compose the payload to send to the server
      const payload = {
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage }
        ],
        stream: true,
      };

      // Create the assistant message immediately for streaming updates
      const assistantMessage: ConversationMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      let fullResponse = '';

      // Use ws:// or wss:// depending on the current protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://${window.location.host}/api/stream-chat`;
      ws = new WebSocket(wsUrl);

      // For aborting
      abortControllerRef.current = {
        abort: () => {
          isClosed = true;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        }
      } as any;

      ws.onopen = () => {
        ws?.send(JSON.stringify(payload));
      };

      ws.onmessage = async (event) => {
        if (isClosed) return;
        const data = event.data;

        if (data === '[DONE]') {
          // Generate TTS for the complete response
          if (fullResponse.trim()) {
            await synthesizeSpeech(fullResponse, assistantMessage.id);
          }
          // Close after a short delay to allow TTS to finish
          closeTimeout = setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
          }, 500);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessage.id
                ? { ...msg, content: fullResponse }
                : msg
            ));
          }
        } catch (e) {
          console.warn('Failed to parse WS data:', e, data);
        }
      };

      ws.onerror = (event) => {
        if (!isClosed) {
          toast.error('WebSocket error: failed to generate response');
          setIsLoading(false);
        }
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      };

      ws.onclose = () => {
        isClosed = true;
        setIsLoading(false);
        abortControllerRef.current = null;
        if (closeTimeout) clearTimeout(closeTimeout);
      };

      // Wait for the WebSocket to close before returning
      await new Promise((resolve) => {
        const checkClosed = () => {
          if (isClosed) resolve(null);
          else setTimeout(checkClosed, 50);
        };
        checkClosed();
      });

      return fullResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted');
        return '';
      }
      console.error('LLM Error:', error);
      toast.error('Failed to generate response');
      return '';
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, synthesizeSpeech]);

  // Handle message submission
  const handleSubmitMessage = useCallback(async (text: string, isAudioInput = false) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      isAudio: isAudioInput,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setInterimTranscript('');
    setIsLoading(true);

    await generateTextResponse(text.trim());
  }, [isLoading, generateTextResponse]);

  // Speech recognition handlers
  const startListening = useCallback(() => {
    try {
      speechManager.startListening(
        (finalText) => {
          handleSubmitMessage(finalText, true);
          setIsListening(false);
        },
        (interimText) => {
          setInterimTranscript(interimText);
        },
        (error) => {
          console.error('Speech recognition error:', error);
          toast.error('Speech recognition failed');
          setIsListening(false);
          setInterimTranscript('');
        }
      );
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start listening:', error);
      toast.error('Speech recognition not available');
    }
  }, [speechManager, handleSubmitMessage]);

  const stopListening = useCallback(() => {
    speechManager.stopListening();
    setIsListening(false);
    setInterimTranscript('');
  }, [speechManager]);

  // Audio playback
  const playAudio = useCallback(async (messageId: string, audioData: ArrayBuffer) => {
    try {
      setCurrentlyPlayingId(messageId);
      setIsPlayingAudio(true);
      await audioManager.playAudio(audioData);
    } catch (error) {
      console.error('Audio playback error:', error);
      toast.error('Failed to play audio');
    } finally {
      setIsPlayingAudio(false);
      setCurrentlyPlayingId(null);
    }
  }, [audioManager]);

  const stopAudio = useCallback(() => {
    audioManager.stopAudio();
    setIsPlayingAudio(false);
    setCurrentlyPlayingId(null);
  }, [audioManager]);

  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="flex flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {messages.length === 0 && <Overview />}

          {messages.map((message) => (
            <div key={message.id} className="w-full max-w-2xl px-4">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && message.audioData && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => 
                          currentlyPlayingId === message.id 
                            ? stopAudio() 
                            : playAudio(message.id, message.audioData!)
                        }
                        disabled={isPlayingAudio && currentlyPlayingId !== message.id}
                        className="text-xs"
                      >
                        {currentlyPlayingId === message.id ? (
                          <>
                            <Square size={12} className="mr-1" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Volume2 size={12} className="mr-1" />
                            Play
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {message.isAudio && (
                    <div className="text-xs opacity-70 mt-1">
                      🎤 Voice input
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Show interim transcript */}
          {interimTranscript && (
            <div className="w-full max-w-2xl px-4">
              <div className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded-lg bg-blue-400 text-white opacity-70">
                  <p className="whitespace-pre-wrap">{interimTranscript}</p>
                  <div className="text-xs mt-1">Speaking...</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="w-full max-w-2xl px-4">
              <div className="flex justify-start">
                <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            ref={messagesEndRef}
            className="shrink-0 min-w-[24px] min-h-[24px]"
          />
        </div>

        <form className="flex flex-row gap-2 relative items-end w-full md:max-w-[500px] max-w-[calc(100dvw-32px)] px-4 md:px-0">
          <MultimodalInput  
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            handleSubmitMessage={handleSubmitMessage}
            isListening={isListening}
            startListening={startListening}
            stopListening={stopListening}
            interimTranscript={interimTranscript}
            isPlayingAudio={isPlayingAudio}
          />
        </form>
      </div>
    </div>
  );
}

const suggestedActions = [
  {
    title: "Ask me anything",
    label: "I can help with various topics",
    action: "Hello! What can you help me with today?",
  },
  {
    title: "Start voice conversation",
    label: "Click the mic to talk",
    action: "Let's have a voice conversation!",
  },
];

export function MultimodalInput({
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  handleSubmitMessage,
  isListening,
  startListening,
  stopListening,
  interimTranscript,
  isPlayingAudio,
}: {
  input?: string;
  setInput?: (value: string) => void;
  isLoading?: boolean;
  stop?: () => void;
  attachments?: Array<Attachment>;
  setAttachments?: Dispatch<SetStateAction<Array<Attachment>>>;
  messages?: Array<ConversationMessage>;
  handleSubmitMessage?: (text: string, isAudio?: boolean) => void;
  isListening?: boolean;
  startListening?: () => void;
  stopListening?: () => void;
  interimTranscript?: string;
  isPlayingAudio?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (setInput) {
      setInput(event.target.value);
    }
    adjustHeight();
  };

  const submitForm = useCallback(() => {
    if (handleSubmitMessage && input?.trim()) {
      handleSubmitMessage(input.trim());
    }

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [handleSubmitMessage, input, width]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/files/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType: contentType,
        };
      } else {
        const { error } = await response.json();
        toast.error(error);
      }
    } catch (error) {
      toast.error("Failed to upload file, please try again!");
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        );

        if (setAttachments) {
          setAttachments((currentAttachments) => [
            ...currentAttachments,
            ...successfullyUploadedAttachments,
          ]);
        }
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopListening?.();
    } else {
      startListening?.();
    }
  }, [isListening, startListening, stopListening]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages?.length === 0 &&
        attachments?.length === 0 &&
        uploadQueue.length === 0 && (
          <div className="grid sm:grid-cols-2 gap-4 w-full md:px-0 mx-auto md:max-w-[500px]">
            {suggestedActions.map((suggestedAction, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ delay: 0.05 * index }}
                key={index}
                className={index > 1 ? "hidden sm:block" : "block"}
              >
                <button
                  onClick={async () => {
                    if (handleSubmitMessage) {
                      handleSubmitMessage(suggestedAction.action);
                    }
                  }}
                  className="border-none bg-muted/50 w-full text-left border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 rounded-lg p-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex flex-col"
                >
                  <span className="font-medium">{suggestedAction.title}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {suggestedAction.label}
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments && attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-row gap-2 overflow-x-scroll">
          {attachments?.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: "",
                name: filename,
                contentType: "",
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      {/* Voice input status */}
      {(isListening || interimTranscript) && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {isListening ? "Listening..." : "Processing..."}
            </span>
          </div>
        </div>
      )}

      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder={isListening ? "Listening for speech..." : "Send a message or click mic to speak..."}
          value={input}
          onChange={handleInput}
          className="min-h-[50px] overflow-hidden resize-none rounded-lg text-base bg-muted border-none pr-20"
          rows={3}
          disabled={isListening}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();

              if (isLoading) {
                toast.error("Please wait for the model to finish its response!");
              } else {
                submitForm();
              }
            }
          }}
        />

        {/* Voice input button */}
        <Button
          className={`rounded-full p-1.5 h-fit absolute bottom-2 right-16 m-0.5 ${
            isListening 
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
              : "text-gray-600 dark:text-gray-400"
          }`}
          onClick={toggleVoiceInput}
          variant={isListening ? "default" : "outline"}
          disabled={isLoading || isPlayingAudio}
          type="button"
        >
          <MicIcon size={14} />
        </Button>

        {/* Submit button */}
        {isLoading ? (
          <Button
            className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 text-white"
            onClick={(event) => {
              event.preventDefault();
              stop?.();
            }}
            type="button"
          >
            <StopIcon size={14} />
          </Button>
        ) : (
          <Button
            className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 text-white"
            onClick={(event) => {
              event.preventDefault();
              submitForm();
            }}
            disabled={(!input || input.length === 0) || uploadQueue.length > 0 || isListening}
            type="button"
          >
            <ArrowUpIcon size={14} />
          </Button>
        )}

        {/* File upload button */}
        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-30 m-0.5 dark:border-zinc-700"
          onClick={(event) => {
            event.preventDefault();
            fileInputRef.current?.click();
          }}
          variant="outline"
          disabled={isLoading || isListening}
          type="button"
        >
          <PaperclipIcon size={14} />
        </Button>
      </div>
    </div>
  );
}
