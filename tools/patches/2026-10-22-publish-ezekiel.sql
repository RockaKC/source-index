-- Publish the Ezekiel entry and confirm its nine connections, after reading them.
--
-- Read first:   select title, status, body_md from nodes where slug = 'ezekiel';
--               select l.id, a.title, l.link_type, b.title, l.note, l.evidence from links l join nodes a on a.id = l.from_node join nodes b on b.id = l.to_node
--                 where l.confirmed = 0 and 'ezekiel' in (a.slug, b.slug);
-- Apply to a NEW copy:   python3 tools/patch_db.py tools/patches/2026-10-22-publish-ezekiel.sql kc_v38.db kc_v39.db
-- To publish with only some connections, copy this file and narrow the second statement (for example: and from_node in (119, 78, 37)).

UPDATE nodes SET status = 'published' WHERE slug = 'ezekiel' AND status = 'draft';

UPDATE links SET confirmed = 1
WHERE confirmed = 0 AND origin = 'ai'
  AND (from_node = (SELECT id FROM nodes WHERE slug = 'ezekiel') OR to_node = (SELECT id FROM nodes WHERE slug = 'ezekiel'));
