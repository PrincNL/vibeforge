import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeForge",
  description: "Open-source coding cockpit met OpenAI OAuth + BYOK",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        {children}
      </body>
    </html>
  );
}
