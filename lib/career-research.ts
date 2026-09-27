// GTM roles at AI companies, read and triangulated on 2026-09-27. A snapshot, not
// a live feed: postings close, so re-run the research when this gets stale.

export const RESEARCHED_ON = "2026-09-27";

export interface CareerRole {
  company: string;
  title: string;
  url: string;
  location: string;
  comp: string | null;
  yearsExp: string | null;
  track: "gtm-strategy" | "revops" | "marketing-ops";
  mustHaves: string[];
}

export const ARCHETYPE =
  "A player-coach operator with a consulting mind and a builder's hands: 5–10+ years across consulting, banking or strategic finance, then in-house GTM S&O or RevOps at a hypergrowth SaaS or consumption-priced company. Writes their own SQL, builds auditable planning and forecast models, owns the Salesforce and warehouse data layer, runs the weekly pipeline and forecast cadence, and writes the one-page readout the CRO, CFO or board acts on. The 2026 AI-lab twist is being AI-native: using Claude, Cursor or v0 to automate their own work, prototype internal tools, and turn one-off heroics into durable systems.";

export const THEMES: { theme: string; description: string; frequency: number }[] = [
  { theme: "Hands-on SQL", description: "Pulls their own data and builds their own models, even at director level.", frequency: 14 },
  { theme: "Executive narrative", description: "Turns analysis into C-suite and board readouts and holds the room.", frequency: 13 },
  { theme: "Extreme ownership", description: "Fills gaps regardless of org lines and builds from zero.", frequency: 12 },
  { theme: "AI-native operator", description: "Ships automations, internal tools and agent workflows with Claude, Cursor or v0. Several postings call this core.", frequency: 9 },
  { theme: "Operating cadence", description: "Runs pipeline reviews, forecast calls and QBRs, and owns both the data and the story.", frequency: 9 },
  { theme: "Heroics into systems", description: "Replaces one-off analyses with repeatable mechanisms and fixes root causes.", frequency: 8 },
  { theme: "Planning: territory, quota, comp", description: "Annual and quarterly planning, capacity models and comp design.", frequency: 8 },
  { theme: "Consulting pedigree + in-house ops", description: "Consulting, IB or PE background combined with owning live GTM ops.", frequency: 8 },
  { theme: "Attribution & data hygiene", description: "Multi-touch attribution tied to pipeline, plus routing, enrichment and dedupe.", frequency: 6 },
  { theme: "Consumption-model fluency", description: "Forecasting usage and API pricing, not just seats.", frequency: 5 },
];

export const TOOLS: { tool: string; frequency: number }[] = [
  { tool: "SQL", frequency: 14 },
  { tool: "Salesforce", frequency: 13 },
  { tool: "Excel / Sheets", frequency: 7 },
  { tool: "Snowflake", frequency: 4 },
  { tool: "HubSpot", frequency: 4 },
  { tool: "BigQuery", frequency: 3 },
  { tool: "Claude / Claude Code", frequency: 3 },
  { tool: "Python / R", frequency: 3 },
  { tool: "Looker", frequency: 2 },
  { tool: "Tableau", frequency: 2 },
  { tool: "Marketo", frequency: 2 },
  { tool: "Zapier / n8n / Tray.io", frequency: 2 },
  { tool: "v0 / Cursor", frequency: 2 },
  { tool: "Clay", frequency: 1 },
  { tool: "Clari", frequency: 1 },
];

export const GAPS: string[] = [
  "Can't write SQL independently. That disqualifies you at nearly every lab.",
  "Has analyzed pipeline but never owned a live forecast or pipeline cadence with senior sales leaders.",
  "Decks without outcomes: no evidence a recommendation was implemented and measured.",
  "Seat-based SaaS only, with no consumption or usage forecasting.",
  "Claims AI use but has never shipped an automation, agent workflow or internal tool.",
  "All strategy with no hands-on systems work, or all admin with no executive exposure.",
  "No board or C-suite writing samples.",
  "No territory, quota or comp design, which senior S&O roles expect.",
];

export const ROLES: CareerRole[] = [
  { company: "Anthropic", title: "GTM Strategy & Operations, Frontier", url: "https://job-boards.greenhouse.io/anthropic/jobs/5390952008", location: "San Francisco", comp: "$190K–$270K", yearsExp: null, track: "gtm-strategy", mustHaves: ["Product ops, PMM ops, consulting or GTM S&O background", "Has turned one-off heroics into a repeatable method", "Writes for and presents to senior execs", "Designs the metrics that make a program legible"] },
  { company: "Anthropic", title: "GTM Strategy & Operations – AMER Enterprise Tech", url: "https://job-boards.greenhouse.io/anthropic/jobs/5390956008", location: "SF / NYC", comp: null, yearsExp: "10+ preferred", track: "gtm-strategy", mustHaves: ["Sales strategy, RevOps or consulting background", "Writes SQL or R independently", "Salesforce plus Looker or Tableau", "Uses Claude to the fullest"] },
  { company: "Anthropic", title: "Strategy & Operations, Office of the CCO", url: "https://job-boards.greenhouse.io/anthropic/jobs/5432995008", location: "SF / NYC", comp: "$190K–$270K", yearsExp: "4+", track: "gtm-strategy", mustHaves: ["Consulting, S&O or chief-of-staff background", "Gets to a number and verifies it", "Brief, clear executive writing", "AI tools as core to how they work"] },
  { company: "Vercel", title: "Marketing Operations Manager", url: "https://vercel.com/careers/marketing-operations-manager-6144467004", location: "SF/Austin hybrid or US remote", comp: null, yearsExp: "5+", track: "marketing-ops", mustHaves: ["Marketing ops in SaaS or high-growth", "Customer.io/Marketo + Salesforce", "Tray.io, RudderStack, Segment", "Hands-on with v0, Cursor, Claude Code; reads code, basic SQL"] },
  { company: "OpenAI", title: "GTM Strategy & Operations, Professional Services", url: "https://jobs.ashbyhq.com/openai/08e8d03a-df94-46af-8664-cd9aab1af445", location: "San Francisco", comp: "$293K–$325K + equity", yearsExp: null, track: "gtm-strategy", mustHaves: ["Auditable demand, staffing and revenue models", "Commercial judgment on pricing and forecasting", "Turns ambiguity into repeatable mechanisms", "Has led cross-functional programs"] },
  { company: "OpenAI", title: "Pricing Strategist, GTM", url: "https://jobs.ashbyhq.com/openai/5ce0931f-aba7-4c7d-9fca-1e278bf75473", location: "San Francisco", comp: "$234K–$260K + equity", yearsExp: null, track: "gtm-strategy", mustHaves: ["First-principles root-cause analysis", "Understands how sales orgs operate", "Consulting, S&O or pricing background"] },
  { company: "Perplexity", title: "GTM Strategy & Operations Lead", url: "https://jobs.ashbyhq.com/perplexity/b75db90b-ca13-4a2f-aac4-c7764b631540", location: "San Francisco", comp: "$210K–$240K + equity", yearsExp: null, track: "gtm-strategy", mustHaves: ["Has fixed what breaks at scale", "Strong SQL; builds own models", "Salesforce + Snowflake", "Owns forecasting and the operating cadence"] },
  { company: "Perplexity", title: "Revenue Operations Analyst", url: "https://jobs.ashbyhq.com/perplexity/03f8f956-1cb3-4945-81d1-73b7ff048d4e", location: "San Francisco", comp: "$160K–$200K + equity", yearsExp: null, track: "revops", mustHaves: ["Lead, account and opportunity routing and territories", "Attribution across inbound, outbound, PLG and events", "Salesforce flows and dashboards", "Uses AI to kill manual work"] },
  { company: "Cursor", title: "Full Stack Analyst, GTM", url: "https://jobs.ashbyhq.com/cursor/7bc441a4-9bb6-45cb-a9e0-5ae1b9c7ac5b", location: "San Francisco", comp: null, yearsExp: null, track: "revops", mustHaves: ["Builds GTM data models and pipelines", "Measures GTM health down to the segment", "Pushes back on senior leaders", "Durable systems over one-off decks"] },
  { company: "Cursor", title: "GTM Strategy & Ops Lead – APJ", url: "https://jobs.ashbyhq.com/cursor/7e1d8e07-c87b-4388-892a-6b138bebf665", location: "Singapore", comp: null, yearsExp: "15+", track: "gtm-strategy", mustHaves: ["Deep RevOps or GTM strategy", "Built ops infrastructure from zero", "Territories, comp and quotas", "Salesforce"] },
  { company: "Harvey", title: "Head of GTM Strategy & Operations, AMER", url: "https://jobs.ashbyhq.com/harvey/b85907be-9937-4bf1-91a0-4474c35e4402", location: "NY / SF", comp: "$212K–$290K + equity", yearsExp: "10+", track: "gtm-strategy", mustHaves: ["RevOps or sales S&O", "3+ years managing people", "Influences without authority", "Annual and quarterly GTM planning"] },
  { company: "Harvey", title: "Head of Marketing Operations & Analytics", url: "https://jobs.ashbyhq.com/harvey/139f48db-e090-4716-9939-c48e5a04eaa2", location: "NY / SF", comp: "$207K–$310K + equity", yearsExp: "10+", track: "marketing-ops", mustHaves: ["Modern B2B martech stack", "SQL and marketing data pipelines", "Has shipped production AI and agent workflows", "Attribution tied to revenue"] },
  { company: "ElevenLabs", title: "Marketing Operations", url: "https://jobs.ashbyhq.com/elevenlabs/1c1f4cc9-08f7-4fbb-867f-7e87e7fa19d9", location: "US remote", comp: null, yearsExp: null, track: "marketing-ops", mustHaves: ["MQL/PQL and funnel stages", "HubSpot + Salesforce", "Clay, Zapier, n8n", "Vibe-codes internal tools; AI-first"] },
  { company: "ElevenLabs", title: "Revenue Strategy & Operations – NA", url: "https://jobs.ashbyhq.com/elevenlabs/b28719ff-833d-49b4-8286-f59082732186", location: "United States", comp: null, yearsExp: "4+", track: "revops", mustHaves: ["RevOps at high-growth tech", "SQL + Sigma", "End-to-end, data to execution"] },
  { company: "Sierra", title: "Marketing Operations & Analytics Lead", url: "https://jobs.ashbyhq.com/sierra/8a906ec6-5ec5-4619-82de-7a3c665998f5", location: "San Francisco", comp: "$215K–$265K + equity", yearsExp: null, track: "marketing-ops", mustHaves: ["Multi-touch attribution across long enterprise cycles", "Marketo/HubSpot + Salesforce", "SQL on Snowflake/BigQuery", "C-suite narratives"] },
  { company: "Sierra", title: "GTM Strategy & Operations, Industry Lead", url: "https://jobs.ashbyhq.com/sierra/6b5027e7-6498-45d6-8548-371eda8e5a81", location: "San Francisco", comp: "$210K–$255K + equity", yearsExp: null, track: "gtm-strategy", mustHaves: ["Industry and account prioritization", "Territory carving", "Pipeline and forecasting"] },
  { company: "Scale AI", title: "Head of GTM Strategy & Operations, Enterprise", url: "https://job-boards.greenhouse.io/scaleai/jobs/4662232005", location: "SF / NY", comp: null, yearsExp: "8–12+", track: "gtm-strategy", mustHaves: ["Consulting background plus in-house S&O", "Sizing, unit economics, capacity and quota models", "Owns forecasting and comp", "Holds up in front of a board"] },
  { company: "Scale AI", title: "Growth Strategy & Operations Lead", url: "https://job-boards.greenhouse.io/scaleai/jobs/4701543005", location: "SF / NY", comp: null, yearsExp: "5+", track: "gtm-strategy", mustHaves: ["Growth, product, ops or engineering background", "SQL or Python", "Has shipped something with AI tools"] },
  { company: "Databricks", title: "Manager, Strategy & Operations (Field Eng)", url: "https://databricks.com/company/careers/open-positions/job?gh_jid=8482368002", location: "India", comp: null, yearsExp: "7+", track: "gtm-strategy", mustHaves: ["Annual, headcount and capacity planning", "Board and QBR materials", "SQL, Excel, dashboards"] },
  { company: "Cohere", title: "Senior Sales Operations Specialist", url: "https://jobs.ashbyhq.com/cohere/e49063ea-b829-4718-be74-02f36fa3d983", location: "New York", comp: "$135K–$250K", yearsExp: "8+", track: "revops", mustHaves: ["Sales ops in AI or SaaS", "Salesforce and process optimization", "Board-level decks"] },
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
  { company: "Vercel", role: "Marketing Operations Manager", url: "https://vercel.com/careers/marketing-operations-manager-6144467004", contact_name: "Renee Ke***y", contact_title: "Sr. Director, Head of Sales Strategy & Operations", tier: "B · lead with Venice" },
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
