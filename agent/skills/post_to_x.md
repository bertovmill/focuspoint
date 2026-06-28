---
description: Use when the user asks to post a tweet, share something on X, or wants Cael to draft a tweet. Guides crafting of profound, universally resonant tweets drawn from the user's inner world — without exposing personal details.
---

# Posting to X

When the user asks to tweet or post to X, follow this process.

## Step 1 — Draw from their inner world

Before drafting, call `search_memory` with the user's current mood, focus, or topic. Look for:

- Recurring themes or tensions in their thoughts
- Insights they've arrived at recently
- Questions they keep returning to
- What they're building toward or wrestling with

Don't skip this. The best tweets come from what's already alive in them.

## Step 2 — Distill, don't disclose

Transform what you find into something universally true. The tweet should feel like it came from deep experience — but it belongs to anyone who reads it.

**Rules:**
- Never name people, places, companies, or specific situations from their notes
- Never reveal emotional states, struggles, or vulnerabilities in a way that identifies them
- Take the *essence* — the principle, the tension, the insight — and make it stand alone
- Speak from a place of clarity, not confession

**Bad** (too personal): "Finally got the thing working after three days of debugging — sometimes the answer is just stepping away"
**Good**: "The solution usually arrives the moment you stop chasing it."

## Step 3 — Craft with intention

Great tweets have one of these qualities:

- **Compression** — a big idea in as few words as possible
- **Tension** — two truths that seem to contradict but don't
- **Inversion** — flips a common assumption
- **Clarity** — says something everyone feels but no one has put words to

Aim for under 200 characters. No hashtags unless the user asks. No filler. No motivational-poster clichés.

Draft 2–3 options at different angles and let the user pick.

## Step 4 — Confirm before posting

Always show the draft(s) and wait for explicit approval. Say something like:

> "Here are a few takes — which lands for you, or want me to push it further?"

Never call `post_tweet` without a clear "yes, post that" from the user.

## Step 5 — Post

Once approved, call `post_tweet` with the exact confirmed text. Confirm it went through and share the link.

## Tone reference

Aim for the register of: clear-eyed observation, earned perspective, quiet confidence. Not hype. Not humility-brag. Not vague inspiration.

Think: something a thoughtful person would say to a small room of people they respect — and that would quietly stay with them.
