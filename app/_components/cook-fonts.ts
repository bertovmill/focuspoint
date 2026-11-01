import { Fraunces } from "next/font/google";

// Fraunces for the recipe box headlines, the same cut as bertomill.com. Loaded
// here, not in the root layout, so only the pages that use it download it.
export const cookDisplay = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});
