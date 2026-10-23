// Tony Robbins' energy lesson as plain data, safe to import from client components.
// Paraphrased from a seminar clip (youtube.com/watch?v=N00EDWWiIUA), not quoted.

export const TONY_SOURCE = "https://www.youtube.com/watch?v=N00EDWWiIUA";

export type TonyPrinciple = { title: string; meaning: string };

export const TONY_PRINCIPLES: TonyPrinciple[] = [
  { title: "Energy is everything", meaning: "High energy gets you to follow through. Low energy wastes even a sharp mind and a good heart." },
  { title: "Your baseline has slipped", meaning: "Energy drops so slowly you stop noticing. What feels normal now may be well below where you were." },
  { title: "Energy shapes everything you touch", meaning: "The same two people in love get a magnificent relationship at high energy and a mediocre one when worn down." },
  { title: "Food is a source, not the source", meaning: "Heavy or badly timed meals cost energy to digest. Eat to feel light, not full." },
  { title: "Sleep isn't the whole answer", meaning: "You can sleep eight hours and feel flat, or sleep little and be on fire when something excites you." },
  { title: "The real source is your mind and habits", meaning: "Energy is mostly a habit of state. Low-energy habits run without you noticing, so build high-energy ones on purpose." },
  { title: "Motion creates emotion", meaning: "Change how you move and your energy follows: your body, your face, your voice. Laughing and singing count." },
  { title: "Look for what's right, too", meaning: "There's always something wrong if you look for it, and always something right. Choosing where to look isn't positive thinking, it's intelligence." },
  { title: "Competition means rising together", meaning: "Push the people around you and let them push you. Going easy helps nobody get better." },
];
