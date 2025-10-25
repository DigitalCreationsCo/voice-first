import { Metadata } from "next";
import { Toaster } from "sonner";
import Navbar from "@/components/custom/navbar";
import { ThemeProvider } from "@/components/custom/theme-provider";

import "./globals.css";
import { SessionProvider } from "next-auth/react";
// import { setupGlobalLogger } from "@/lib/logger";

export const metadata: Metadata = {
  metadataBase: new URL("https://gemini.vercel.ai"),
  title: "Chatter",
  description: "Chatter is voice-first chat app designed for effortless, hands-free interaction or traditional typing. Press the microphone button to speak — Chatter hears your voice, transcribes it in real time, and responds for a fluid, natural conversation experience.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // setupGlobalLogger();
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            >
            <Toaster position="top-center" />
            <Navbar />
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
