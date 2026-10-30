import type { ReactNode } from "react";
import { Fraunces, Newsreader } from "next/font/google";
import { cn } from "@/lib/utils";

// Fraunces for headlines, Newsreader for reading. Loaded here rather than in the
// root layout so the rest of the site and the app don't download them.
const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const serif = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

/**
 * The paper every Writing page sits on (`.writing-paper` in globals.css). It
 * runs up under the header, the way the concrete wall does on the other pages.
 */
export default function WritingLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className={cn("writing-paper -mt-[4.5rem] pt-[4.5rem]", display.variable, serif.variable)}>
      {children}
    </div>
  );
}
