"use client";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
  ChangeEvent,
  memo,
  useMemo,
} from "react";
import { toast } from "sonner";

import { ArrowUpIcon, PaperclipIcon, StopIcon } from "../custom/icons";
import { PreviewAttachment } from "./preview-attachment";
import useWindowSize from "../../hooks/use-window-size";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { SuggestedActions } from "./suggested-actions";
import { VoiceInputButton } from "./voice-input-button";

// Pure memoized component for VoiceInput and Submit button area
const PureMemoizedControls = memo(function PureMemoizedControls({
  textareaRef,
  isListening,
  interimTranscript,
  toggleVoiceInput,
  input,
  handleInput,
  isLoading,
  stop,
  submitForm,
  uploadQueue,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  isListening?: boolean;
  interimTranscript?: string;
  toggleVoiceInput: () => void;
  input?: string;
  handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading?: boolean;
  stop?: () => void;
  submitForm: () => void;
  uploadQueue: Array<string>;
}) {
  return (
    <>
      <VoiceInputButton
        isListening={isListening || interimTranscript}
        toggleVoiceInput={toggleVoiceInput}
      />
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder={
            isListening
              ? "Type a message or Speak to send"
              : "Type a message or Press the microphone button to speak."
          }
          value={input}
          onChange={handleInput}
          className="min-h-[50px] overflow-hidden resize-none rounded-lg text-base bg-muted border-none pr-20"
          rows={3}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitForm();
            }
          }}
        />
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
            disabled={
              (!input || input.length === 0) ||
              uploadQueue.length > 0 ||
              isListening
            }
            type="button"
          >
            <ArrowUpIcon size={14} />
          </Button>
        )}
      </div>
    </>
  );
});

type MultimodalInputProps = {
  input?: string;
  setInput?: (value: string) => void;
  isLoading?: boolean;
  stop?: () => void;
  attachments?: Array<any>;
  setAttachments?: any;
  messages: any[];
  handleSubmitMessage?: (text: string, isAudio?: boolean) => void;
  isListening?: boolean;
  handleStartListening: () => void;
  handleStopListening: () => void;
  interimTranscript?: string;
  isPlaying?: boolean;
};

const MultimodalInputComponent = ({
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
}: MultimodalInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (setInput) {
      setInput(event.target.value);
    }
    adjustHeight();
  }, [setInput, adjustHeight]);

  const submitForm = useCallback(() => {
    if (handleSubmitMessage && input?.trim()) {
      handleSubmitMessage(input.trim());
    }
    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [handleSubmitMessage, input, width]);

  const uploadFile = useCallback(async (file: File) => {
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
    } catch (error: any) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        if (setAttachments) {
          setAttachments((currentAttachments: any) => [
            ...currentAttachments,
            ...successfullyUploadedAttachments,
          ]);
        }
      } catch (error: any) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      handleStopListening();
    } else {
      handleStartListening();
    }
  }, [isListening, handleStartListening, handleStopListening]);

  // Memoize the props for controls, for greater memoization efficiency
  const pureControlsProps = useMemo(
    () => ({
      textareaRef,
      isListening,
      interimTranscript,
      toggleVoiceInput,
      input,
      handleInput,
      isLoading,
      stop,
      submitForm,
      uploadQueue,
    }),
    [
      textareaRef,
      isListening,
      interimTranscript,
      toggleVoiceInput,
      input,
      handleInput,
      isLoading,
      stop,
      submitForm,
      uploadQueue,
    ]
  );

  // Only rerender suggested actions if the minimum conditions are met
  const renderSuggestedActions = useMemo(() => (
    messages?.length === 0 &&
    attachments?.length === 0 &&
    uploadQueue.length === 0 ? (
      <SuggestedActions handleSubmitMessage={handleSubmitMessage} />
    ) : null
  ),
    [messages?.length, attachments?.length, uploadQueue.length, handleSubmitMessage]
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {renderSuggestedActions}

      <PureMemoizedControls {...pureControlsProps} />

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
    </div>
  );
};

// Use React.memo for best possible render performance, with a custom comparison function
export const MultimodalInput = memo(
  MultimodalInputComponent,
  (prevProps, nextProps) => {
    // Check all relevant props shallow equality (if objects, could use deep)
    return (
      prevProps.input === nextProps.input &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.stop === nextProps.stop &&
      prevProps.attachments === nextProps.attachments &&
      prevProps.setAttachments === nextProps.setAttachments &&
      prevProps.messages === nextProps.messages &&
      prevProps.handleSubmitMessage === nextProps.handleSubmitMessage &&
      prevProps.isListening === nextProps.isListening &&
      prevProps.handleStartListening === nextProps.handleStartListening &&
      prevProps.handleStopListening === nextProps.handleStopListening &&
      prevProps.interimTranscript === nextProps.interimTranscript &&
      prevProps.isPlaying === nextProps.isPlaying
    );
  }
);

