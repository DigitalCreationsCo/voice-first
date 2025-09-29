import { motion } from "framer-motion";

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
  
export const SuggestedActions = ({ handleSubmitMessage }: { 
    handleSubmitMessage?: (text: string, isAudio?: boolean) => void;
}) => {
    return (
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
    );
}