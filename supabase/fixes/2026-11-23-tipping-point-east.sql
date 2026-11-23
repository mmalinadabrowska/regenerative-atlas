-- Tipping Point East: a summary in the same shape as the rest of the library
-- (one sentence of about twenty-five words, rather than two paragraphs), and
-- the Circular economy tag it was missing.
--
-- The entry came in through the Add page, so it lives only in Supabase. Run
-- this in the Supabase SQL editor (SQL Editor → New query → Run); the hourly
-- "Publish the library" workflow then carries it to the site.

begin;

update sources
set summary = 'A charity and circular construction hub in Newham, set up with the council, demonstrating how building materials can be reused and teaching architects, community groups and artists to do the same.'
where url_key = 'tippingpointeast.com/';

insert into source_tags (source_id, tag_id)
select s.id, t.id
from sources s, tags t
where s.url_key = 'tippingpointeast.com/' and t.slug = 'circular-economy'
on conflict do nothing;

commit;

-- To check: one row, with the new summary and circular-economy among its tags.
select s.title, s.summary, array_agg(t.slug order by t.slug) as tags
from sources s
join source_tags st on st.source_id = s.id
join tags t on t.id = st.tag_id
where s.url_key = 'tippingpointeast.com/'
group by s.id;
