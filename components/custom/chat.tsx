"use client";

import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { z } from 'zod';
import { Overview } from "./overview";
import { streamObject, experimental_generateSpeech } from "ai";
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
import { geminiFlashModelSM, geminiProModelLM } from "@/ai";
import { cn } from "@/lib/utils";
import { SpeechRecognitionManager } from "@/lib/speech";


interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isAudio: boolean;
  audioData?: ArrayBuffer;
};
function buildUIMessage(text: string, role: "user" | "assistant", isAudioInput = false):UIMessage {
  return {
    id: `msg-${Date.now()}-user`,
    role: role,
    content: text.trim(),
    timestamp: Date.now(),
    isAudio: isAudioInput,
  };
}


export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<any>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  
  const [speechManager] = useState(() => new SpeechRecognitionManager());
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    speechManager.stopListening();
    setIsListening(false);
    speechManager.stopAudio();
    setIsPlayingAudio(false);
    setCurrentlyPlayingId(null);
  }, [speechManager]);

  // Initialize audio context on user interaction
  useEffect(() => {
    const initAudio = async () => {
      try {
        await speechManager.initializeAudio();
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
  }, [speechManager]);

  // Text-to-Speech with streaming
  const synthesizeSpeech = useCallback(async (text: string, messageId: string) => {
    try {
      const { audio, warnings, responses, providerMetadata } = await experimental_generateSpeech({
        model: geminiFlashModelSM,
        text: text.trim(),
        voice: "Autonoeackag",
        outputFormat: "mp3",
        instructions: "Speak the given text, condense the message if necessary.",
        speed: 1.1,
        language: "auto",
        // providerOptions: { }
        maxRetries: 2,
        // abortSignal: "",
        // headers: {}
      });

      console.log('providerMetadata ', providerMetadata);
      console.log('responses ', responses);
      console.log('warnings ', warnings);
      console.log('audio ', audio);

      // Update message with audio data
      setMessages(prev => prev.map(msg => 
        msg.id === messageId
          ? { ...msg, audio }
          : msg
      ));

      return audio;
    } catch (error) {
      console.error('TTS Error:', error);
      toast.error('Failed to generate speech');
      return null;
    }
  }, []);

  const generateTextResponse = useCallback(async (userMessage: string) => {
    try {
      setIsLoading(true);
      const { elementStream } = streamObject({
        model: geminiProModelLM,
        output: 'array',
        schema: z.string(),
        prompt: "You are a helpful AI assistant. Respond naturally and conversationally. Keep responses concise but engaging. " + userMessage,
      });
      
      for await (const hero of elementStream) {
        console.log('hero ', hero);
        const assistantMessage = buildUIMessage(hero, "assistant");
        setMessages(prev => [...prev, assistantMessage]);
        // trying to generate speech and append ot message afeter text generation,
        // if it doesn't work, I will move the speech generation before setMessagwes and append audio data
        if (hero.trim()) {
          await synthesizeSpeech(hero, assistantMessage.id);
        }
      }
    } catch (error) {
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
    const userMessage = buildUIMessage(text, "user", isAudioInput);
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setInterimTranscript('');
    setIsLoading(true);

    await generateTextResponse(text.trim());
  }, [isLoading, generateTextResponse]);

  const startListening = useCallback(() => {
    try {
      speechManager.startListening(
        (finalText) => {
          handleSubmitMessage(finalText, true);
          console.log('speechmanager final text ', finalText)
        },
        (interimText) => {
          console.log('speechmanager interimText ', interimText)
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
      await speechManager.playAudio(audioData);
    } catch (error) {
      console.error('Audio playback error:', error);
      toast.error('Failed to play audio');
    } finally {
      setIsPlayingAudio(false);
      setCurrentlyPlayingId(null);
    }
  }, [speechManager]);

  const stopAudio = useCallback(() => {
    speechManager.stopAudio();
    setIsPlayingAudio(false);
    setCurrentlyPlayingId(null);
  }, [speechManager]);

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
              <div className="flex justify-center">
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
  attachments?: Array<any>;
  setAttachments?: Dispatch<SetStateAction<Array<any>>>;
  messages?: any[];
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

      {/* Voice input button */}
      <Button
        className={cn([isListening 
            ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
            : "text-gray-600 dark:text-gray-400",])}
        onClick={toggleVoiceInput}
        variant={isListening ? "default" : "outline"}
        disabled={isLoading || isPlayingAudio}
        type="button"
      >
        <MicIcon size={16} />
      </Button>

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
          placeholder={isListening ? "Type a message or speak" : "Send a message or click mic to speak..."}
          value={input}
          onChange={handleInput}
          className="min-h-[50px] overflow-hidden resize-none rounded-lg text-base bg-muted border-none pr-20"
          rows={3}
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
