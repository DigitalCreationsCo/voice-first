import { Chat } from "@/components/chat/chat";
import { MessageIcon } from "@/components/custom/icons";
import { generateMessageId, UIMessage } from "@/lib/utils";

const initialMessages:UIMessage[] = []
//   {
//     "id": "e83c21d5-de49-410a-b8a9-93f0a413fb51",
//     "role": "user",
//     "content": "hello there",
//     "timestamp": 1759561151930,
//     "isAudio": false,
//     "isComplete": false
//   },
//   {
//     "id": "49dece18-9b65-4b7b-ad95-35fef1339c35",
//     "role": "assistant",
//     "content": "Hello! How can I help you today?\n",
//     "timestamp": 1759561152626,
//     "isAudio": false,
//     "isComplete": true
//   },
//   {
//     "id": "eb27097a-c05e-4de1-94ad-b28824008b37",
//     "role": "user",
//     "content": "I'm testing UI Message component",
//     "timestamp": 1759561162100,
//     "isAudio": false,
//     "isComplete": false
//   },
//   {
//     "id": "9b7436db-7da6-4437-9ab1-057c3193f064",
//     "role": "assistant",
//     "content": "Okay! I understand. Is there anything specific you'd like to test regarding the UI Message component?  To give you the best possible assistance, tell me:\n\n*   **What kind of UI Message component is it?** (e.g., web-based, part of a specific framework like React/Angular/Vue, native mobile app, etc.)\n*   **What functionality are you trying to test?** (e.g., displaying different message types like success, error, warning, info; handling user interactions like closing the message; formatting of the message; accessibility)\n*   **What testing tools are you using (if any)?** (e.g., Jest, Cypress, Selenium, manual testing)\n*   **What are you trying to achieve?** (e.g., verify the correct message is displayed for a specific scenario, ensure the message is dismissable, test the visual appearance of the message)\n*   **Are there any known",
//     "timestamp": 1759561162788,
//     "isAudio": false,
//     "isComplete": true
//   },
//   {
//     "id": "eb27097a-c05e-4de1-94ad-b28824008b26",
//     "role": "user",
//     "content": "testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting",
//     "timestamp": 1759561162102,
//     "isAudio": false,
//     "isComplete": false
//   },
// ];

export default async function Page() {
  const id = generateMessageId();
  return (
    <>
    <Chat key={id} id={id} initialMessages={initialMessages} />
    </>
  )
}