"use client";

import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { z } from 'zod';
import { Overview } from "../custom/overview";
import { streamObject } from "ai";
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
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "../custom/icons";
import { PreviewAttachment } from "./preview-attachment";
import useWindowSize from "../../hooks/use-window-size";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { geminiFlashModel15SM } from "@/lib/google";
import { buildUIMessage, generateMessageId, UIMessage } from "@/lib/utils";
import { SuggestedActions } from "./suggested-actions";
import { VoiceInputButton } from "./voice-input-button";
import { Message } from "./message";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { PlayIcon, Square, Volume2 } from "lucide-react";


export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<any>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  
  const {
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    // synthesizeSpeech,
    synthesizeSpeechStream,
    playMessageAudio,
    stopPlayback,
    playFallbackSpeech,
    isPlayingAudio,
    currentlyPlayingId,
    isInitialized,
  } = useAudioManager();

  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-stop playback when voice input
  useEffect(() => {
    if (isPlayingAudio && interimTranscript) {
      console.info('User input detected. Interrupting audio playback.')
      stopPlayback();
    }
  }, [isPlayingAudio, interimTranscript])

  // Handle final transcript from voice input
  useEffect(() => {
    if (transcript && !isLoading) {
      handleSubmitMessage(transcript, true);
    }
  }, [transcript]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    stopListening();
    stopPlayback();
  }, [stopListening, stopPlayback]);

  const generateTextResponse = useCallback(async (userMessage: string) => {
    try {
      setIsLoading(true);
      
      const CHUNK_CHAR_THRESHOLD = 120; // adjust to taste: smaller => lower latency, more API calls
      const CHUNK_END_PUNCT_RE = /[.?!]\s*$/;

      const { elementStream } = streamObject({
        maxOutputTokens: 1000,
        model: geminiFlashModel15SM,
        output: 'array',
        schema: z.string(),
        prompt: "You are a helpful AI assistant. Respond naturally and conversationally. Keep responses concise but engaging. " + userMessage,
      });
      
      let fullResponse = '';
      let ttsBuffer = '';
      let messageId = generateMessageId();
      let pendingTTSCalls = 0; // Track outstanding TTS calls
      let fullAudioBytes = new Uint8Array(0);

      for await (const textChunk of elementStream) {
        fullResponse += textChunk;
        ttsBuffer += textChunk;

        // Update UI with streaming text
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.isComplete) {
            return [...prev.slice(0, -1), { ...last, content: fullResponse }];
          }
          return [
            ...prev, 
            buildUIMessage({ id: messageId, role: 'assistant', content: fullResponse, isComplete: false })];
        });

        if (ttsBuffer.length >= CHUNK_CHAR_THRESHOLD || CHUNK_END_PUNCT_RE.test(ttsBuffer)) {
          const segment = ttsBuffer;
          ttsBuffer = '';
          pendingTTSCalls++;

          synthesizeSpeechStream(segment, messageId, (msgId, audioData) => {
            // merge audio chunks
            const merged = new Uint8Array(fullAudioBytes.length + audioData.length);
            merged.set(fullAudioBytes);
            merged.set(audioData, fullAudioBytes.length);
            fullAudioBytes = merged;

            pendingTTSCalls--;

            // Only update message when all TTS calls complete
            if (pendingTTSCalls === 0) {
              const finalMessage = buildUIMessage({ 
                id: messageId,
                role: "assistant", 
                content: fullResponse, 
                audioData: fullAudioBytes,
                isComplete: true 
              });
              
              setMessages(prev => {
                const withoutIncomplete = prev.filter(m => m.id !== messageId);
                return [...withoutIncomplete, finalMessage];
              });
            }
          });
        }
      }

      if (ttsBuffer.trim()) {
        const segment = ttsBuffer;
        pendingTTSCalls++;
  
        synthesizeSpeechStream(segment, messageId, (msgId, partialAudioData) => {
          const merged = new Uint8Array(fullAudioBytes.length + partialAudioData.length);
          merged.set(fullAudioBytes);
          merged.set(partialAudioData, fullAudioBytes.length);
          fullAudioBytes = merged;

          pendingTTSCalls--;

          if (pendingTTSCalls === 0) {
            const finalMessage = buildUIMessage({ 
              id: messageId,
              role: "assistant", 
              content: fullResponse, 
              audioData: fullAudioBytes,
              isComplete: true 
            });
            
            setMessages(prev => {
              const withoutIncomplete = prev.filter(m => m.role !== 'assistant' || m.isComplete !== false);
              return [...withoutIncomplete, finalMessage];
            });
          }
        });
      }

      return fullResponse;
    } catch (error) {
      console.error('LLM Error:', error);
      toast.error('Failed to generate response');
      return '';
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [synthesizeSpeechStream]);

  // Handle message submission
  const handleSubmitMessage = useCallback(async (text: string, isAudio = false) => {
    if (!text.trim() || isLoading) return;

    const userMessage = buildUIMessage({ content: text, role: "user", isAudio });

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    await generateTextResponse(text.trim());
  }, [isLoading, generateTextResponse]);

  const handleStartListening = useCallback(() => {
    try {
      if (isPlayingAudio) {
        toast.info('Please wait for audio to finish');
        return;
      }

      startListening();
    } catch (error) {
      console.error('Failed to start listening:', error);
      toast.error('An error occurred while initializing');
    }
  }, [isInitialized, isPlayingAudio, startListening]);

  const handleStopListening = useCallback(() => {
    stopListening();
  }, [stopListening]);

  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="flex flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {messages.length === 0 && <Overview />}

          Transcript(test): {transcript}
          <br/>
          Interim Transcript(test): {interimTranscript}

          {messages.map((message) => (
            // <Message 
            //   key={message.id}
            //   chatId={id}
            //   role={message.role}
            //   content={message.content}
            //   // toolInvocations={message.toolInvocations}
            //   // attachments={message.attachments}
            // />
            <div key={message.id} className="w-full max-w-2xl px-4">
              <div className={`flex flex-row ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && (
                    <div className="flex justify-end items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => 
                          currentlyPlayingId === message.id
                            ? stopPlayback()
                            : playMessageAudio(message.audioData!, message.id)
                        }
                        disabled={isPlayingAudio && currentlyPlayingId !== message.id}
                        className="text-xs"
                      >
                        {currentlyPlayingId === message.id ? (
                          <>
                            <Square size={12} />
                          </>
                        ) : (
                          <>
                            <PlayIcon size={12} />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {/* {message.isAudio && (
                    <div className="text-xs opacity-70 mt-1">
                      < size={12} />
                    </div>
                  )} */}
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
            handleStartListening={handleStartListening}
            handleStopListening={handleStopListening}
            interimTranscript={interimTranscript}
            isPlayingAudio={isPlayingAudio}
          />
        </form>
      </div>
    </div>
  );
}

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
  handleStartListening,
  handleStopListening,
  interimTranscript,
  isPlayingAudio,
}: {
  input?: string;
  setInput?: (value: string) => void;
  isLoading?: boolean;
  stop?: () => void;
  attachments?: Array<any>;
  setAttachments?: Dispatch<SetStateAction<Array<any>>>;
  messages: any[];
  handleSubmitMessage?: (text: string, isAudio?: boolean) => void;
  isListening?: boolean;
  handleStartListening: () => void;
  handleStopListening: () => void;
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
      handleStopListening();
    } else {
      handleStartListening();
    }
  }, [isListening, handleStartListening, handleStopListening]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages?.length === 0 &&
        attachments?.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions handleSubmitMessage={handleSubmitMessage} />
        )}

      <VoiceInputButton
      isListening={isListening}
      toggleVoiceInput={toggleVoiceInput}
      />

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
};
