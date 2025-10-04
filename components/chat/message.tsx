"use client";

import { FileUIPart, UIToolInvocation } from "ai";
import { motion } from "framer-motion";
import { ReactNode } from "react";

import { BotIcon, UserIcon } from "../custom/icons";
import { Markdown } from "../custom/markdown";
import { PreviewAttachment } from "./preview-attachment";
import { PlayIcon, Square } from "lucide-react";
import { Button } from "../ui/button";
import { UIMessage } from "@/lib/utils";
// import { Weather } from "../custom/weather";
// import { AuthorizePayment } from "../flights/authorize-payment";
// import { DisplayBoardingPass } from "../flights/boarding-pass";
// import { CreateReservation } from "../flights/create-reservation";
// import { FlightStatus } from "../flights/flight-status";
// import { ListFlights } from "../flights/list-flights";
// import { SelectSeats } from "../flights/select-seats";
// import { VerifyPayment } from "../flights/verify-payment";

export const Message = ({
  chatId,
  message,
  toolInvocations,
  attachments,
  isPlayAudioDisabled,
  onPlayAudio,
  isCurrentlyPlaying
}: {
  chatId: string;
  message: UIMessage;
  toolInvocations?: Array<any> | undefined;
  attachments?: Array<any>;
  isPlayAudioDisabled: boolean;
  onPlayAudio: () => void;isCurrentlyPlaying: boolean;
}) => {
  return (
    <motion.div className="w-full md:w-[550px] md:px-0 px-4 first-of-type:pt-20" initial={{ y: 5, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}>
      <div
        className={`w-fit max-w-full relative p-3 rounded-lg max-w-2xl leading-relaxed
          ${message.role === 'user'
            ? 'bg-blue-500 text-white ml-auto text-right'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          }`}
      >
        <div className="text-left break-words whitespace-pre-wrap">
          <span
            className={`inline-block align-top w-5 h-5 border-[1.6px] rounded-sm p-0.5 overflow-clip
              ${message.role === 'assistant' ? 'float-left mr-2 text-zinc-500 border-zinc-500' : 'float-right ml-2 order-last text-zinc-300 border-zinc-300'}`}
          >
            {message.role === 'assistant' ? <BotIcon /> : <UserIcon />}
          </span>

          <Markdown>{message.content}</Markdown>
        </div>

        {message.role === 'assistant' && message.audioData && (
          <div className="flex justify-end items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onPlayAudio}
              disabled={isPlayAudioDisabled}
              className="text-xs"
            >
              {isCurrentlyPlaying ? <Square size={12} /> : <PlayIcon size={12} />}
            </Button>
          </div>
        )}

        {attachments && (
          <div className="flex flex-row gap-2 mt-2">
            {attachments.map((attachment) => (
              <PreviewAttachment key={attachment.url} attachment={attachment} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

