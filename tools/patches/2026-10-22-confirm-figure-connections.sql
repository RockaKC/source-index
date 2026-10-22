-- Confirm the five figure connections proposed by 2026-10-22-figure-connections.sql, after reading them.
--
-- Read them first:   select l.id, a.title, l.link_type, b.title, l.note, l.basis, l.evidence from links l join nodes a on a.id = l.from_node join nodes b on b.id = l.to_node where l.origin = 'ai' and l.confirmed = 0 and l.link_type in ('ancestor_of', 'associated_with', 'about');
-- Apply to a NEW copy:   python3 tools/patch_db.py tools/patches/2026-10-22-confirm-figure-connections.sql kc_v36.db kc_v37.db
-- To confirm only some, copy this file and keep only the ids you accept.

UPDATE links SET confirmed = 1
WHERE origin = 'ai' AND confirmed = 0
  AND ((link_type IN ('ancestor_of', 'associated_with'))
       OR (link_type = 'about' AND from_node = 1349));
