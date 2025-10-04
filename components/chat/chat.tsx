"use client";

import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { z } from 'zod';
import { Overview } from "../custom/overview";
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
import { buildUIMessage, decode, generateMessageId, getWebSocketUrl, UIMessage } from "@/lib/utils";
import { SuggestedActions } from "./suggested-actions";
import { VoiceInputButton } from "./voice-input-button";
import { useAudioManager } from "@/hooks/use-audio-manager";
import { PlayIcon, Square, Volume2 } from "lucide-react";
import gemini from "@/lib/gemini";
import { ChatWebSocketClient } from "@/lib/socket";
import { convertInt16ToFloat32 } from "@/lib/speech-recognition-manager";
import { Message } from "./message";

export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<any>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const clientRef = useRef<ChatWebSocketClient | null>(null);

  const {
    isInitialized,
    isListening,
    isPlaying,
    currentlyPlayingMessageId,

    enqueueAudioChunk,
    markRequestComplete,
    playMessageAudio,
    playAudioDirect,
    stopPlayback,
    stopRequest,

    startListening,
    stopListening,
    correctTranscription,
    transcript,
    setTranscript,
    interimTranscript,
    setInterimTranscript,

    playFallbackSpeech,
    getQueueStats,
    setAllowConcurrentRequests,
    setInterimResultDelay,
  } = useAudioManager();

  useEffect(() => {
    console.log('messages ', messages);
  }, [messages]);

  useEffect(() => {
    const wsUrl = getWebSocketUrl()
    const client = new ChatWebSocketClient(wsUrl);
    
    client.setConnectionChangeCallback((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setError('Disconnected from server. Reconnecting...');
      } else {
        setError('');
      }
    });

    client.connect()
      .then(() => {
        console.log('Connected successfully');
        clientRef.current = client;
      })
      .catch((err) => {
        console.error('Connection failed:', err);
        setError('Failed to connect to chat server');
      });

    return () => {
      client.disconnect();
    };
  }, []);

  // Auto-stop playback when voice input
  useEffect(() => {
    if (isPlaying && isListening && interimTranscript) {
      console.info('User input detected. Interrupting audio playback.')
      stopPlayback();
    }
  }, [isPlaying, isListening, interimTranscript])

  // Handle final transcript from voice input
  useEffect(() => {
    if (isListening && transcript && !isLoading) {
      handleSubmitMessage(transcript, true);
    }
  }, [transcript]);

  const stop = useCallback(() => {
    setIsLoading(false);
    stopListening();
    stopPlayback();
    stopRequest(currentlyPlayingMessageId!);
  }, [stopListening, stopPlayback]);

  const handleSubmitMessage = useCallback(async (text: string, isAudio = false) => {
    if (!text.trim() || isLoading || !clientRef.current?.isConnected) return;

    const messageId = generateMessageId();
    const userMessage = buildUIMessage({ id: messageId, role: "user", content: text, isAudio });
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages);

    setInput('');
    setIsLoading(true);
    setAllowConcurrentRequests(true);

    try {
      const chatRequestId = clientRef.current.sendChatMessage(updatedMessages, {
        onStreamStart: (message) => {
          console.log('Chat stream started');
        },

        onChunk: async (requestId, textChunk, chunkIndex) => {
          console.info('Chat chunk: ', textChunk);
          setIsLoading(true);

          setMessages(prev => {
            
            // incomplete messages will not propgogate correctly in UI
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && !msg.isComplete)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, content: assistantMessage.content + textChunk },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [
              ...prev, 
              buildUIMessage({ role: 'assistant', content: textChunk, isComplete: false })];
          });

        },

        onComplete: (fullResponse) => {
          console.log('onComplete full response: ', fullResponse);
          setTranscript('');
          setIsLoading(false);

          clientRef.current?.sendTTSRequest(
            fullResponse, 
            0, 
            chatRequestId
          )

          setMessages(prev => {
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && !msg.isComplete)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, content: fullResponse, isComplete: true },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [...prev];
          });
        },

        onTTSStreamStart(message) {
          console.log('TTS stream started ', message);
        },
        onTTSChunk(requestId, audioChunk, audioChunkIndex) {
          console.debug('TTS onChunk, index: ', audioChunkIndex);

          enqueueAudioChunk(
            requestId, 
            audioChunkIndex,
            decode(audioChunk),
            messageId
          );
        },

        onTTSComplete(requestId, fullAudio, chunkIndex) {
          console.log('TTS complete for request: ', requestId);

          markRequestComplete(requestId);

          setMessages(prev => {
            const assistantMessageIndex = prev.findIndex(msg => msg.role === 'assistant' && !msg.isComplete)
            const assistantMessage = prev[assistantMessageIndex];
            
            if (assistantMessage) {
              return [
                ...prev.slice(0, assistantMessageIndex), 
                { ...assistantMessage, audioData: decode(fullAudio), isComplete: true },
                ...prev.slice(assistantMessageIndex + 1), 
              ];
            }

            return [...prev];
          });
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setIsLoading(false);
          setTranscript('');
        }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setIsLoading(false);
    }
  }, [messages, enqueueAudioChunk, markRequestComplete]);

  const handleStartListening = useCallback(() => {
    try {
      if (isPlaying) {
        toast.info('Please wait for audio to finish');
        return;
      }

      startListening();
    } catch (error) {
      console.error('Failed to start listening:', error);
      toast.error('An error occurred while initializing');
    }
  }, [isInitialized, isPlaying, startListening]);

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
          
          {/* Audiocontext initialized: {String(isInitialized)}
          <br/>
          Transcript(test): {transcript}
          <br/>
          Interim Transcript(test): {interimTranscript} */}

          {messages.map((message) => (
            <>
            <Message 
              key={message.id}
              chatId={id}
              message={message}
              isPlayAudioDisabled={isPlaying && currentlyPlayingMessageId !== message.id}
              onPlayAudio={() => 
                currentlyPlayingMessageId === message.id
                  ? stopPlayback()
                  : playMessageAudio(message.audioData!, message.id)}
              isCurrentlyPlaying={currentlyPlayingMessageId === message.id}
              // toolInvocations={message.toolInvocations}
              // attachments={message.attachments}
            />
            </>
          ))}

          {/* Show interim transcript */}
          {interimTranscript && (
            <div className="w-full max-w-2xl px-4">
              <div className="flex justify-end">
                <div className="max-w-[80%] p-3 rounded-lg bg-blue-400 text-white opacity-70">
                  <p className="">{interimTranscript}</p>
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
            isPlaying={isPlaying}
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
  isPlaying,
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
  isPlaying?: boolean;
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

      {/* <input
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
      )} */}

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
            className="bg-blue-500 rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 text-white"
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
        {/* <Button */}
      </div>
    </div>
  );
};

// Helper function to find the last message where role === "assistant" && !isComplete
function findLastIncompleteAssistantMessageIndex(messages: UIMessage[]) {
  // Iterate from the end of the array backwards to find the last matching message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && !message.isComplete) {
      return i;
    }
  }
  return null; // Return null if no matching message is found
}

