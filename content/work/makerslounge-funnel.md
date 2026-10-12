---
title: Running a community like a revenue funnel
org: MakersLounge
role: Founder
year: 2025 – 2026
outcome: 20 events and 1,340 registrations, pulled into one SQL model. Workshops hold their room at twice the rate of meetups, and 1 in 5 attendees comes back.
color: "#2d3e5c"
tags: [revops, sql, funnel, attribution, community]
# Order on /work only; not shown on the site. Sits under the Aucctus tile.
date: 2026-05-01
published: true
---

## The challenge

MakersLounge grew on instinct. I picked formats by what felt right on the
night, and I judged a night by how full the room looked. That works until
you have to choose between a hackathon, a meetup and a workshop for next
month, and "it felt busy" is the only data you have.

Event registrations are a pipeline like any other, with stages, leakage and
sources. So I treated them like one.

## What I did

Every Luma event, guest and person syncs into a Postgres database behind
Cael, my personal agent. That's 20 events from November 2025 to August 2026,
plus every guest record with its approval status, check-in and registration
answers. From there it is plain SQL.

Cleaning came first. Luma counts a bulk invite as a guest, and 6,274 of the
rows were invites nobody had acted on. They're excluded, which leaves 1,340
real registrations from 752 people. The funnel runs from registered, to
approved, to attended:

```sql
WITH ev AS (
  SELECT api_id,
    CASE
      WHEN name ILIKE '%hackathon%'                          THEN 'Hackathon'
      WHEN name ILIKE '%workshop%' AND location_type = 'offline' THEN 'In-person workshop'
      WHEN location_type = 'offline'                         THEN 'Meetup'
      ELSE 'Online'
    END AS format
  FROM luma_events
  WHERE start_at < now()
)
SELECT format,
  count(DISTINCT ev.api_id)                                        AS events,
  count(*) FILTER (WHERE g.approval_status <> 'invited')           AS registered,
  count(*) FILTER (WHERE g.approval_status = 'approved')           AS approved,
  count(*) FILTER (WHERE g.approval_status = 'approved'
                     AND (g.checked_in_at IS NOT NULL
                          OR g.joined_at IS NOT NULL))             AS attended
FROM ev
JOIN luma_guests g ON g.event_api_id = ev.api_id
GROUP BY format;
```

Source was the hard part. Luma's UTM field was empty on all but 14
registrations. The only real signal was a free-text "How did you hear about
the event?" question, where "berto", "Berto!", "robert" and "my friend" are
all the same channel. I bucketed the 848 answers with a set of pattern rules
rather than guessing.

## What happened

| Format | Events | Registered | Approved | Attended | Show rate |
| --- | --: | --: | --: | --: | --: |
| In-person workshop | 2 | 141 | 103 | 82 | 80% |
| Online | 9 | 198 | 167 | 84 | 50% |
| Meetup | 7 | 724 | 552 | 192 | 35% |
| Hackathon | 2 | 277 | 218 | 46 | 21% |

*Show rate is attended ÷ approved.*

**Volume and quality pull in opposite directions.** The Tech Week hackathon
was the biggest registration night we've had, at 225. It also had one of the
lowest recorded show rates. The two hands-on workshops were a fifth of the
size and held their room.

**One in five comes back.** 303 people have a recorded attendance. 237 came
once, 47 came twice and 19 came three or more times.

**The network is the channel.** Of the answered source questions, 36% came
through someone they knew, often me by name. 26% found us on Luma, 6% came
through partners like Toronto Tech Week, and LinkedIn brought 3%.

What I can't claim yet: check-in at the door was not consistent, so every
attendance number here is a floor, not a count. The workshop gap is too wide
to be only that, but some of it may be that small rooms are easier to check
in. Source data covers the 63% of registrations that answered the question.

## What's next

The first finding was that the funnel wasn't measured well enough to trust.
So the next three events are an experiment, with the metric decided before
the night:

1. **Measure it properly.** A host scans every badge at the door. A dropdown
   replaces the free-text source question. Every channel gets its own tracked
   link. Success means check-in coverage above 90% and a source on every
   registration.
2. **Gate the room.** Run one meetup with approval-only registration and a
   lower cap. Success means a recorded show rate that moves from about 35%
   toward the workshop number.
3. **Win the second visit.** Within 48 hours of an event, every first-timer
   gets a personal note and an invite to the next one. Success means the
   share of first-timers who return within 60 days, against today's baseline
   of about 22%.

I'll update this page with what moved.
