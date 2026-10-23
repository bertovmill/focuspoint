// The Naval principles as plain data, safe to import from client components
// (lib/naval.ts touches the database). Paraphrased from nav.al/rich, not quoted.

export const NAVAL_SOURCE = "https://nav.al/rich";

export type NavalPrinciple = { title: string; meaning: string };

export const NAVAL_PRINCIPLES: NavalPrinciple[] = [
  { title: "Seek wealth, not money or status", meaning: "Wealth is assets that earn while you sleep. Status is a zero-sum game; skip it." },
  { title: "You won't get rich renting out your time", meaning: "Hours have a ceiling. Own a piece of something: equity, a product, IP." },
  { title: "Productize yourself", meaning: "Find what only you can do and package it so it scales without you." },
  { title: "Specific knowledge can't be taught", meaning: "It comes from following your real curiosity. It feels like play to you and work to others." },
  { title: "Take accountability", meaning: "Put your name on things. Risk the failure in public; that's what earns the upside." },
  { title: "Use leverage: code and media", meaning: "Code and content work for you while you sleep and need nobody's permission." },
  { title: "Judgment beats hard work", meaning: "Which direction you go matters more than how fast. Think, then act." },
  { title: "Play long-term games with long-term people", meaning: "Trust, relationships and money all compound. Pick people with integrity, energy and intelligence." },
  { title: "Learn to build and to sell", meaning: "Someone who can do both is unstoppable. Practise the one that comes less naturally." },
  { title: "Read what you love until you love to read", meaning: "Foundations (maths, logic, persuasion, economics) let you learn anything else." },
  { title: "Keep your spending flat", meaning: "Don't let your lifestyle grow with your income. Freedom comes from the gap." },
  { title: "Avoid ruin, then take big swings", meaning: "Never risk going to zero. Above that, take bets with uncapped upside. Wealth arrives in lumps." },
];
