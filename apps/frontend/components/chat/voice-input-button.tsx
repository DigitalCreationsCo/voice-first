import { MicIcon } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export const VoiceInputButton = ({ disabled, isListening, toggleVoiceInput, ...props }: any) => (
    <Button
    className={cn([isListening 
        ? "bg-red-400 hover:bg-red-500 text-white animate-pulse" 
        : "text-gray-600 dark:text-gray-400",
        "gap-2"
      ])}
    onClick={toggleVoiceInput}
    variant={isListening ? "default" : "outline"}
    disabled={disabled}
    type="button"
    { ...props }
  >
    {isListening ? (
      <div className="flex items-center gap-2 p-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        {"Listening..."}
      </div>
    ) : (
    <>
      <MicIcon size={16} />{' '}Press to Speak
    </>
    )}
  </Button>
);