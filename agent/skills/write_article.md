---
description: Use when drafting, rewriting or finishing an article for bertomill.com/writing (save_post), or when Berto asks for a cover photo. Covers his voice, making the post easy to find on Google and when shared, and generating the cover image.
---

# Writing an article for bertomill.com

Every article has two jobs: say something useful in Berto's voice, and help people
find **Robert Mill** online (search, link previews, AI answers). Do both on every draft.

## 1. Voice

First person, plain, concrete, short paragraphs, `##` section headings, no H1.
Use his real experiences; if you don't have one, ask rather than invent.

## 2. Make it findable

Set these on `save_post` every time, not just the body:

- **Title** (≤ 60 characters): the phrase someone would actually type into Google,
  e.g. "Where should AI agent context live?" beats "Thoughts on context". Keep it honest, no clickbait.
- **Slug**: short and descriptive, 3–6 words from the title (`ai-agent-context-team-memory`), never `untitled`.
- **Summary** (140–160 characters): it's the Google snippet and the link-preview text.
  Name the topic plainly and say what the reader gets.
- **Tags** (3–6): the search terms the post should rank for — topic words people use
  (`AI agents`, `Claude`, `GTM engineering`), not internal jargon.
- **First paragraph**: says what the post is about in plain words, using the main phrase once.
- **`##` headings**: phrased the way people ask questions ("How do you share context across a team?").
- **Links**: where it fits, link one or two of his other posts or pages (bertomill.com/about,
  /capabilities, an earlier article) so readers and search engines find more of his work.
- **Never keyword-stuff.** One natural use of a phrase beats five forced ones.

## 3. Cover photo — always

Once a draft has a title and body, generate a cover without being asked:
`generate_post_image` with `kind: "cover"` (it attaches automatically). Skip this only
if the post already has a cover or Berto uploaded a photo he wants (use its URL as `cover_url`).

- **Prompt**: a concrete scene for the post's idea — subject, composition, style, mood,
  colour. Not the title, no text in the image. Editorial and calm suits the site:
  e.g. "two desks sharing one glowing notebook, soft morning light, minimal editorial illustration, muted greens".
- **Alt**: a plain description of what's in the picture (it's also read by search engines).
- If it fails, say so in one line with the error and offer to retry; don't claim it worked.

## 4. Hand-off

After saving, reply in a few lines: the preview link, the title + summary you chose
(so he can veto them), and that the cover is on. Never publish without his explicit "publish".
