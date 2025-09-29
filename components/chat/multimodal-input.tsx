"use client";
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

import { ArrowUpIcon, PaperclipIcon, StopIcon } from "../custom/icons";
import { PreviewAttachment } from "../preview-attachment";
import useWindowSize from "../../hooks/use-window-size";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { MicIcon } from "lucide-react";

import { PipecatClient, RTVIEvent, RTVIMessage } from "@pipecat-ai/client-js";
import { GeminiLiveWebsocketTransport, GeminiLLMServiceOptions } from '@pipecat-ai/gemini-live-websocket-transport';

const llmServiceOptions: GeminiLLMServiceOptions = {
  api_key: process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'AIzaSyDwPluan48-7Hrm5xqfMAW5Zets4kezEYE', // Move to env variable
  // temperature: 0.7,
  // maxOutput_tokens: 1000
};

const suggestedActions = [
  {
    title: "Help me book a flight",
    label: "from San Francisco to London",
    action: "Help me book a flight from San Francisco to London",
  },
  {
    title: "What is the status",
    label: "of flight BA142 flying tmrw?",
    action: "What is the status of flight BA142 flying tmrw?",
  },
];

export function MultimodalInput({
}) {

  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  
  // Pipecat state management
  const [client, setClient] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const initializeClient = useCallback(() => {
    try {
      const client = {
        connect: () => {},
        disconnect: () => {},
        appendToContext: () => {}
      };
      setClient(client);
      return client;
    } catch (error) {
      console.error("Failed to initialize voice client:", error);
      setConnectionError("Failed to initialize voice client");
      toast.error("Failed to initialize voice client");
      return null;
    }
  }, []);

  const connectToVoiceChat = useCallback(async () => {
    if (!client) return;
    
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      await client.connect();
      // Add initial context message
      client.appendToContext({ 
        role: "user", 
        content: 'Hello! I\'m ready to have a voice conversation with you.' 
      });
    } catch (error) {
      console.error("Failed to connect to voice chat:", error);
      setConnectionError("Failed to connect to voice service");
      setIsConnecting(false);
      toast.error("Failed to connect to voice service");
    }
  }, [client]);

  // Disconnect from Pipecat
  const disconnectFromVoiceChat = useCallback(async () => {
    if (!client || !isConnected) return;
    
    try {
      await client.disconnect();
      setIsConnected(false);
      setIsMicActive(false);
      toast.success("Disconnected from voice assistant");
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toast.error("Failed to disconnect properly");
    }
  }, [client, isConnected]);

  useEffect(() => {
    const client = initializeClient();
    
    return () => {
      if (client && client.disconnect) {
        client.disconnect().catch(console.error);
      }
    };
  }, [initializeClient]);

  const toggleVoiceChat = useCallback(async () => {
    if (isConnected) {
      await disconnectFromVoiceChat();
    } else {
      await connectToVoiceChat();
    }
  }, [isConnected, connectToVoiceChat, disconnectFromVoiceChat]);
  
  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 0}px`;
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (setInput) {
      setInput(event.target.value);
    }
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const submitForm = useCallback(() => {
    // if (sendMessage) {
    //   sendMessage(undefined, {
    //     experimental_attachments: attachments,
    //   });
    // }

    // setAttachments([]);

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [attachments, setAttachments, width, 
    // sendMessage
  ]);

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

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
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
                    // if (sendMessage) {
                    //   sendMessage({
                    //     role: "user",
                    //     content: suggestedAction.action,
                    //   });
                    // }
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

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-row gap-2 overflow-x-scroll">
          {attachments.map((attachment) => (
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

      {/* Voice Chat Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {isConnected ? (
              isMicActive ? "🎤 Voice chat active - speak now!" : "Connected, waiting for bot..."
            ) : isConnecting ? "Connecting to voice assistant..." : "Voice chat disconnected"}
          </p>
          {connectionError && (
            <p className="text-sm text-red-500">{connectionError}</p>
          )}
        </div>
        
        <Button 
          onClick={toggleVoiceChat}
          disabled={isConnecting}
          variant={isConnected ? "destructive" : "default"}
          className="flex items-center gap-2"
        >
          <MicIcon size={20} />
          {isConnecting ? "Connecting..." : isConnected ? "Stop Voice Chat" : "Start Voice Chat"}
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className="min-h-[24px] overflow-hidden resize-none rounded-lg text-base bg-muted border-none"
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

      {isLoading ? (
        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-2 m-0.5 text-white"
          onClick={(event) => {
            event.preventDefault();
            stop();
          }}
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
          disabled={input.length === 0 || uploadQueue.length > 0}
        >
          <ArrowUpIcon size={14} />
        </Button>
      )}

      <Button
        className="rounded-full p-1.5 h-fit absolute bottom-2 right-10 m-0.5 dark:border-zinc-700"
        onClick={(event) => {
          event.preventDefault();
          fileInputRef.current?.click();
        }}
        variant="outline"
        disabled={isLoading}
      >
        <PaperclipIcon size={14} />
      </Button>
    </div>
  );
}
