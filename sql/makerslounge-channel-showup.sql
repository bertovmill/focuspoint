-- MakersLounge: which channels bring members who actually show up?
-- Source: Luma registrations mirrored into Postgres (luma_guests).
-- Show-up rate = checked in / approved, by self-reported "How did you hear" channel.
with heard as (
  select
    g.api_id,
    g.approval_status,
    g.checked_in_at,
    lower(trim(q->>'answer')) as raw
  from luma_guests g
  cross join lateral jsonb_array_elements(g.registration_answers::jsonb) q
  where q->>'label' = 'How did you hear about the event?'
),
channel as (
  select *,
    case
      when raw ~ '(berto|robert)'                      then 'Robert directly'
      when raw ~ '(friend|word of mouth|colleague)'    then 'Friend / word of mouth'
      when raw ~ 'luma'                                then 'Luma discovery'
      when raw ~ '(linkedin)'                          then 'LinkedIn'
      when raw ~ '(instagram|\big\b|twitter|\bx\b)'    then 'Instagram / X'
      when raw ~ '(ttw|tech week)'                     then 'Toronto Tech Week'
      when raw ~ '(email|newsletter|substack)'         then 'Email / newsletter'
      when raw ~ '(invite)'                            then 'Invited'
      when raw = ''                                    then '(blank)'
      else 'Other'
    end as channel
  from heard
)
select
  channel,
  count(*)                                                          as registered,
  count(*) filter (where approval_status = 'approved')              as approved,
  count(*) filter (where checked_in_at is not null)                 as showed_up,
  round(100.0 * count(*) filter (where checked_in_at is not null)
        / nullif(count(*) filter (where approval_status = 'approved'), 0), 0) as show_up_pct
from channel
group by channel
order by registered desc;
