import { Chat } from "@/components/chat/chat";
import { generateMessageId, UIMessage } from "@/lib/utils";


const initialMessages:UIMessage[] = []
//   {
//     id: '1,',
//     role: 'assistant', 
//     content: "This is an initial message.", 
//     timestamp: 2025, 
//     isAudio: true, 
//     isComplete: true
//   }
// ]


export default async function Page() {
  const id = generateMessageId();
  return <Chat key={id} id={id} initialMessages={initialMessages} />;
}