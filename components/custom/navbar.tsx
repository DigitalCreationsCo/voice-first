import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth"
import { History } from "@/components/chat/history";
import { BotIcon, MessageIcon, SlashIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";


export default async function Navbar() {
  const session = await auth()
  return (
    <>
      <div className="bg-background absolute top-0 left-0 w-dvw py-2 px-3 justify-between flex flex-row items-center z-30">
        <div className="flex flex-row gap-3 items-center">
          <History user={session?.user} />
          <div className="flex flex-row gap-4 items-center text-lg ml-3">
            <p className="flex flex-row justify-center gap-2 items-center text-lg border-zinc-500 text-zinc-500 dark:text-zinc-400 dark:border-zinc-400">
              {/* <span className="w-5 h-5 border-[1.6px] rounded-sm p-0.5 overflow-clip border-zinc-500 text-zinc-500 dark:text-zinc-400 dark:border-zinc-400">
                <BotIcon />
              </span> */}
              <MessageIcon size={20} />
            </p>
            <h1 className="text-zinc-500 dark:text-zinc-400 text-lg">Chatter</h1>
          </div>
        </div>

        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="py-1.5 px-2 h-fit font-normal"
                variant="secondary"
              >
                {session.user?.email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <ThemeToggle />
              </DropdownMenuItem>
              <DropdownMenuItem className="p-1 z-50">
                <form
                  className="w-full"
                  action={async () => {
                    "use server";

                    await signOut({
                      redirectTo: "/",
                      redirect: true
                    });
                  }}
                >
                  <button
                    type="submit"
                    className="w-full text-left px-1 py-0.5 text-red-500"
                  >
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button className="py-1.5 px-2 h-fit font-normal text-white" asChild>
            <Link href="/login">Login</Link>
          </Button>
        )}
      </div>
    </>
  );
};
