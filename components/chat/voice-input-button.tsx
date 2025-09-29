import { MicIcon } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export const VoiceInputButton = ({ disabled, isListening, toggleVoiceInput, ...props }: any) => (
    <Button
    className={cn([isListening 
        ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
        : "text-gray-600 dark:text-gray-400",])}
    onClick={toggleVoiceInput}
    variant={isListening ? "default" : "outline"}
    disabled={disabled}
    type="button"
    { ...props }
  >
    <MicIcon size={16} />
  </Button>
);