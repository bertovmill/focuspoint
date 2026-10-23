// Events, field marketing and community roles at AI companies, pulled from each
// company's own job board and read in full on 2026-10-23. A snapshot, not a live
// feed: postings close, so re-run the research when this gets stale.

export const RESEARCHED_ON = "2026-10-23";

export interface CareerRole {
  company: string;
  title: string;
  url: string;
  location: string;
  comp: string | null;
  yearsExp: string | null;
  track: "events" | "field-marketing" | "community";
  mustHaves: string[];
}

export const ARCHETYPE =
  "These postings want a commercially minded operator, not a party planner. They want someone who can run a 12-person CISO dinner and a 1,000-person booth in the same month. Then they want that person to prove the pipeline with Salesforce data. This person co-owns account lists with AEs and follows up hard. They build repeatable playbooks and can talk with engineers and founders. AI shows up more and more as a work requirement: 'power user of AI tools,' 'built AI into marketing workflows' for account research and event ops, or an AI exercise in the interview.";

export const THEMES: { theme: string; description: string; frequency: number }[] = [
  { theme: "Executive audiences", description: "Programs target C-level, VP and CISO/CIO buyers with white-glove experiences.", frequency: 17 },
  { theme: "Budget and vendor ownership", description: "You own budgets, contracts, agencies, venues and AV end to end.", frequency: 17 },
  { theme: "Measurement and ROI", description: "You track KPIs, attribution and ROI, and drop events that don't pay off.", frequency: 16 },
  { theme: "Pipeline accountability", description: "Events are judged on sourced and influenced pipeline, not on attendance.", frequency: 14 },
  { theme: "Sponsorships and third-party conferences", description: "You decide which conferences to sponsor, negotiate the deals and run the presence.", frequency: 14 },
  { theme: "Sales partnership", description: "You work hands-on with AEs and sales leaders on target accounts and follow-up.", frequency: 13 },
  { theme: "Playbooks and repeatability", description: "You turn one-off events into tiers, playbooks and an operating system that scales.", frequency: 12 },
  { theme: "Building from zero", description: "Many roles are founding roles, or you build the function in ambiguity.", frequency: 11 },
  { theme: "Exec dinners and roundtables", description: "Small, intimate dinners and roundtables are the core format.", frequency: 10 },
  { theme: "AI in your own work", description: "You're expected to use AI tools daily to plan, research and report.", frequency: 7 },
];

export const TOOLS: { tool: string; frequency: number }[] = [
  { tool: "AI tools (required or expected)", frequency: 7 },
  { tool: "Salesforce", frequency: 6 },
  { tool: "HubSpot", frequency: 3 },
  { tool: "Marketo", frequency: 2 },
  { tool: "6sense", frequency: 1 },
  { tool: "Demandbase", frequency: 1 },
  { tool: "Splash", frequency: 1 },
  { tool: "Cvent", frequency: 1 },
  { tool: "Notion", frequency: 1 },
];

export const GAPS: string[] = [
  "You can't show pipeline or revenue numbers from past events, only headcount.",
  "You have no real track record with C-level or VP buyers in the room.",
  "You've never owned a budget, agency contract or sponsorship negotiation.",
  "Your experience is pure logistics with no view on which events to fund or cut.",
  "You can't work CRM data or explain attribution to sales ops.",
  "You can't speak credibly to engineers, founders or security buyers.",
  "You show no daily AI use, which now fails interviews at Glean, Perplexity, Modal and Baseten.",
  "You can't travel 25–50% or work onsite in SF.",
];

export const ROLES: CareerRole[] = [
  { company: "Anthropic", title: "Head of Community, Enterprise Marketing", url: "https://job-boards.greenhouse.io/anthropic/jobs/5388719008", location: "San Francisco / New York", comp: "$400K", yearsExp: null, track: "community", mustHaves: ["Built a community function that drove retention or expansion", "Led a distributed team of regional leads", "Ties community to metrics in QBRs", "Ran both developer and enterprise-buyer communities"] },
  { company: "Anthropic", title: "Field Marketing Lead, Cybersecurity", url: "https://job-boards.greenhouse.io/anthropic/jobs/5444773008", location: "San Francisco / New York", comp: "$320K–$400K", yearsExp: "8+", track: "field-marketing", mustHaves: ["CISO dinners, roundtables, RSAC/Black Hat presence", "Partners with sales on pipeline and expansion", "Fluent in pipeline attribution", "Leads without authority across regions"] },
  { company: "OpenAI", title: "Global Head of Events", url: "https://jobs.ashbyhq.com/openai/60be7108-c540-4839-87a8-41f19a75c1ce", location: "San Francisco", comp: "$361K–$401K + equity", yearsExp: "14+", track: "events", mustHaves: ["Global events and large-scale production leadership", "Distinctive flagship experiences", "Manages agencies and big budgets", "Uses AI firsthand to improve own work"] },
  { company: "OpenAI", title: "Events Manager, Business", url: "https://jobs.ashbyhq.com/openai/744844e1-f426-463c-b615-91823f0cd867", location: "San Francisco / New York", comp: "$240K–$266K + equity", yearsExp: "7+", track: "events", mustHaves: ["B2B conferences and customer programs", "Venue, AV and vendor negotiation", "Owns registration and guest comms", "Budget tracking and ROI reporting"] },
  { company: "OpenAI", title: "Enterprise Field Marketer", url: "https://jobs.ashbyhq.com/openai/89b0bd3b-52ef-42c1-9a58-08ce4eb7428d", location: "San Francisco / New York", comp: "$227K–$252K + equity", yearsExp: "8+", track: "field-marketing", mustHaves: ["Exec dinners, roundtables, roadshows", "Measurable pipeline from field programs", "Territory planning with enterprise sellers", "Repeatable field playbooks"] },
  { company: "Perplexity", title: "Director of Events and Experiences", url: "https://jobs.ashbyhq.com/perplexity/4d8f7e23-8c80-4bd8-ad27-3f40cf17197b", location: "San Francisco / New York", comp: "$185K–$240K + equity", yearsExp: "12+", track: "events", mustHaves: ["Hosted, speaking and sponsored events", "Negotiates sponsorships", "Built event attribution", "Power user of AI tools"] },
  { company: "Perplexity", title: "Field Marketing Manager", url: "https://jobs.ashbyhq.com/perplexity/d7e05546-4d42-4f1a-8ccd-c95d2519f5f6", location: "San Francisco", comp: "$130K–$165K + equity", yearsExp: "5+", track: "field-marketing", mustHaves: ["Sponsorships plus owned field events", "Exec dinners, roadshows, hackathons", "Reports sourced and influenced pipeline from CRM", "Builds the field operating system"] },
  { company: "Cursor", title: "Startup Events & Community", url: "https://jobs.ashbyhq.com/cursor/8acfb92a-eb71-4159-acef-a988eac40fcb", location: "San Francisco (in-office)", comp: null, yearsExp: "4–7+", track: "community", mustHaves: ["Founder dinners and hackathons", "VC and accelerator partnerships", "Measures activation and usage, not vanity metrics", "Credible with technical founders"] },
  { company: "Cursor", title: "Head of Americas Field Marketing", url: "https://jobs.ashbyhq.com/cursor/d225fc95-a56f-466a-9588-d75a7f38c426", location: "San Francisco", comp: null, yearsExp: "10+", track: "field-marketing", mustHaves: ["Player-coach for a remote field team", "Tracks touchpoint to closed-won", "Executive dashboards and KPIs", "Owns the Americas budget"] },
  { company: "Cognition", title: "Event Marketer", url: "https://jobs.ashbyhq.com/cognition/5fcd7140-e519-4465-b2a4-9902886f3cc8", location: "San Francisco / Austin / NYC", comp: null, yearsExp: "3–5", track: "events", mustHaves: ["End-to-end events for 10 to 1,000+ people", "C-level and VP Eng audiences", "Salesforce and HubSpot", "Travel up to 40%"] },
  { company: "Sierra", title: "Event Marketer", url: "https://jobs.ashbyhq.com/sierra/6c3fb4c1-e6ba-4e47-8d02-93ea89e75619", location: "San Francisco", comp: "$170K–$200K + equity", yearsExp: "5+", track: "events", mustHaves: ["Event programs that drive measurable pipeline", "Designs roundtables and fireside chats", "Directs agencies and producers", "Builds targeting and follow-up with sales"] },
  { company: "ElevenLabs", title: "Global Events Lead", url: "https://jobs.ashbyhq.com/elevenlabs/e815e2a8-e3bd-4e41-bbc3-ebe57277927b", location: "Remote (US; NYC/SF preferred)", comp: null, yearsExp: "8+", track: "events", mustHaves: ["Flagship summits and marquee sponsorships", "3+ years tech/enterprise flagship events", "Premium agency partners", "Pipeline with GTM teams"] },
  { company: "Decagon", title: "Field Marketing Manager", url: "https://jobs.ashbyhq.com/decagon/a39c6519-3347-4562-8c5c-533cee4224e4", location: "San Francisco (in-office)", comp: "$160K–$210K + equity", yearsExp: "3–5 events; 1–2+ field", track: "field-marketing", mustHaves: ["Sponsored events and tradeshows", "Exec dinners and webinars", "Owns lead follow-up and ROI", "Travel up to 40%"] },
  { company: "Netic", title: "Founding Field & Event Marketer", url: "https://jobs.ashbyhq.com/netic/47034e2d-279a-41f7-ae4d-43c4c5da3787", location: "San Francisco", comp: "$100K–$225K", yearsExp: null, track: "field-marketing", mustHaves: ["Builds field and events from scratch", "Tradeshows and regional meetups", "AE playbooks by territory", "Post-event retros and ROI"] },
  { company: "Notion", title: "Field Marketer", url: "https://jobs.ashbyhq.com/notion/42279d85-cf60-4c3c-bf82-92b9e215f3c7", location: "San Francisco / New York", comp: "$135K–$160K", yearsExp: "4–5+", track: "field-marketing", mustHaves: ["Hosted and third-party field events", "Pipeline-obsessed", "Bias for testing", "Adopts AI tools to work smarter"] },
  { company: "Vercel", title: "Community Manager, Experiential Marketing", url: "https://job-boards.greenhouse.io/vercel/jobs/6231540004", location: "San Francisco (hybrid)", comp: "$118K–$163K", yearsExp: "3+", track: "community", mustHaves: ["Developer meetups and hackathons", "Zero-to-one community programs", "Event budgets, logistics, reporting", "DevRel or community background"] },
  { company: "Scale AI", title: "Field Marketing & Events Manager, Frontier Data", url: "https://job-boards.greenhouse.io/scaleai/jobs/4741462005", location: "San Francisco / New York", comp: "$128K–$160K", yearsExp: "5+", track: "events", mustHaves: ["Exec gatherings to 1,000+ conferences", "Booth logistics and vendors", "White-glove service", "Travel up to 50%"] },
  { company: "Glean", title: "Senior Field Marketing Manager, West", url: "https://job-boards.greenhouse.io/gleanwork/jobs/4727092005", location: "SF / Mountain View / Remote West US", comp: "$163K–$187K", yearsExp: "7+", track: "field-marketing", mustHaves: ["White-glove exec programs for named accounts", "Accelerates $500K+ ACV deals", "Salesforce, Marketo, 6sense/Demandbase, Splash/Cvent", "AI exercise in the interview"] },
  { company: "Modal", title: "Field Marketing Manager", url: "https://jobs.ashbyhq.com/modal/ebce1f95-fcb3-4cfc-9bcd-34da7a1461bf", location: "San Francisco", comp: "$150K–$200K", yearsExp: null, track: "field-marketing", mustHaves: ["Field programs at a technical company", "Shares a number with AEs", "CRM, attribution, ABM, intent data", "Has built AI into marketing workflows"] },
  { company: "Baseten", title: "Field Marketing Manager (SF)", url: "https://jobs.ashbyhq.com/baseten/2c7a4042-6c6b-4059-bfdb-7fa987326edb", location: "San Francisco", comp: "$150K–$175K + equity", yearsExp: "5–7", track: "field-marketing", mustHaves: ["Demand gen that hits pipeline goals", "Salesforce and HubSpot", "Uses AI tools for own productivity", "Travel up to 25%"] },
];

// GTM / RevOps leaders at target companies, from an Apollo people search on
// 2026-09-27. Apollo masks surnames in search results, so these are enough to
// find each person on LinkedIn, not to email them. Tier A fits today, B is a stretch.
export interface CareerTarget {
  company: string;
  role: string | null;
  url: string | null;
  contact_name: string | null;
  contact_title: string | null;
  tier: string;
}

export const TARGETS: CareerTarget[] = [
  { company: "Perplexity", role: "Revenue Operations Analyst", url: "https://jobs.ashbyhq.com/perplexity/03f8f956-1cb3-4945-81d1-73b7ff048d4e", contact_name: null, contact_title: null, tier: "A · fits now" },
  { company: "ElevenLabs", role: "Marketing Operations", url: "https://jobs.ashbyhq.com/elevenlabs/1c1f4cc9-08f7-4fbb-867f-7e87e7fa19d9", contact_name: null, contact_title: null, tier: "A · fits now" },
  { company: "Cursor", role: "Full Stack Analyst, GTM", url: "https://jobs.ashbyhq.com/cursor/7bc441a4-9bb6-45cb-a9e0-5ae1b9c7ac5b", contact_name: "Chelane O'***n", contact_title: "Sales Strategy & Operations Manager", tier: "A · fits now" },
  { company: "Cohere", role: null, url: null, contact_name: "Mei Hu***g", contact_title: "Head of Marketing Operations and Strategy", tier: "A · Toronto HQ, no visa" },
  { company: "Anthropic", role: "Strategy & Operations, Office of the CCO", url: "https://job-boards.greenhouse.io/anthropic/jobs/5432995008", contact_name: "Thomas Ma***z", contact_title: "Head of Revenue Operations & Sales Development", tier: "B · stretch, needs referral" },
  { company: "Vercel", role: "Marketing Operations Manager", url: "https://vercel.com/careers/marketing-operations-manager-6144467004", contact_name: "Renee Ke***y", contact_title: "Sr. Director, Head of Sales Strategy & Operations", tier: "B · lead with MakersLounge + Cael" },
  { company: "OpenAI", role: null, url: null, contact_name: "Luke Sl***e", contact_title: "Revenue Strategy & Ops Manager", tier: "B · stretch" },
  { company: "Harvey", role: null, url: null, contact_name: "Vivian Ye", contact_title: "GTM Strategy and Analytics Manager", tier: "B" },
  { company: "Sierra", role: null, url: null, contact_name: "Haley Ma***l", contact_title: "Head of Revenue Operations", tier: "B" },
  { company: "Scale AI", role: null, url: null, contact_name: "Nadine Uy", contact_title: "Head of Revenue Operations", tier: "B" },
  { company: "Glean", role: null, url: null, contact_name: "Dylan No***s", contact_title: "Senior Revenue Operations Manager", tier: "B" },
  { company: "Notion", role: null, url: null, contact_name: "Amy Wa***g", contact_title: "Sales Strategy and Ops Manager", tier: "B" },
  { company: "Retool", role: null, url: null, contact_name: "Raj Kh***a", contact_title: "Global Head of Revenue Strategy & Operations", tier: "B" },
  { company: "Replit", role: null, url: null, contact_name: "Mark Ma***i", contact_title: "Director of Revenue Operations", tier: "B" },
  { company: "WRITER", role: null, url: null, contact_name: "Luke Ba***n", contact_title: "Senior Manager, Revenue Operations and Strategy", tier: "B" },
  { company: "Hebbia", role: null, url: null, contact_name: "Jillian Liu", contact_title: "Senior Director, Global Revenue Operations", tier: "B" },
  { company: "Mistral", role: null, url: null, contact_name: "Alice Liu", contact_title: "RevOps Manager", tier: "B" },
  { company: "Lovable", role: null, url: null, contact_name: "Morgan Ja***n", contact_title: "Head of GTM Strategy & Enablement", tier: "B" },
  { company: "Databricks", role: null, url: null, contact_name: "Cheryl Fr***a", contact_title: "Director, Revenue Operations", tier: "C" },
];
