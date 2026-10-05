import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  Newsreader,
  Geist_Mono,
} from "next/font/google";
import "./globals.css";
import { NO_FLASH_SCRIPT } from "@/lib/theme";

/**
 * Atkinson Hyperlegible was drawn by the Braille Institute to make similar
 * letterforms unmistakable — I / l / 1, O / 0, rn / m. For a product used by
 * language teachers and their learners that is a functional choice, not a
 * stylistic one, and it holds up at the 12–13px an interface actually uses.
 */
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

/** One touch of personality, spent only on the workspace name. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "500"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge",
  description: "A quiet workspace for teaching.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint. Without it the page
            renders in the system theme and then snaps — the flash every theme
            toggle gets judged by. */}
        <script>{NO_FLASH_SCRIPT}</script>
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
