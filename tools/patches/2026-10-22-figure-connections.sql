-- Figure connections: how figures relate to each other (with a basis and evidence), the names to link inside essays, and essay-to-figure links, all proposed until Boss confirms.
--
-- Apply to a NEW copy of the database:   python3 tools/patch_db.py tools/patches/2026-10-22-figure-connections.sql kc_v35.db kc_v36.db
-- Then read the five proposed rows (select * from links where origin = 'ai' and confirmed = 0), and confirm them with
-- tools/patches/2026-10-22-confirm-figure-connections.sql. Nothing is shown on the website as fact until confirmed.
--
-- How to use it afterwards (see tools/KNOWLEDGE.md):
--   a name to link inside essays   insert into node_aliases (node_id, alias) values (<figure id>, 'Name as the essays write it');
--   an essay discusses a figure    insert into links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence) values (<essay id>, <figure id>, 'about', ...);
--   two figures are connected      insert into links (...) values (<figure id>, <figure id>, 'ancestor_of' | 'associated_with' | ..., 'why', 'ai', 0, 'scripture', 'Genesis 5:21; 5:25');
-- A relationship that is confirmed must carry a basis and its evidence; the database refuses it otherwise.

ALTER TABLE links ADD COLUMN basis TEXT CHECK (basis IS NULL OR basis IN ('scripture', 'church_tradition', 'ancient_source', 'scholarly_inference', 'editorial'));

ALTER TABLE links ADD COLUMN evidence TEXT;

CREATE TABLE node_aliases (
    node_id INTEGER NOT NULL REFERENCES nodes(id),
    alias   TEXT    NOT NULL COLLATE NOCASE CHECK (length(alias) >= 3),
    note    TEXT,
    UNIQUE (alias)
);

CREATE TRIGGER trg_links_relation_evidence_insert BEFORE INSERT ON links
WHEN NEW.confirmed = 1 AND NEW.link_type IN ('associated_with', 'contemporary_of', 'teacher_of', 'ancestor_of', 'attested_by', 'related_manuscript')
     AND (NEW.basis IS NULL OR NEW.evidence IS NULL OR trim(NEW.evidence) = '')
BEGIN
    SELECT RAISE(ABORT, 'a confirmed relationship needs a basis and its evidence');
END;

CREATE TRIGGER trg_links_relation_evidence_update BEFORE UPDATE ON links
WHEN NEW.confirmed = 1 AND NEW.link_type IN ('associated_with', 'contemporary_of', 'teacher_of', 'ancestor_of', 'attested_by', 'related_manuscript')
     AND (NEW.basis IS NULL OR NEW.evidence IS NULL OR trim(NEW.evidence) = '')
BEGIN
    SELECT RAISE(ABORT, 'a confirmed relationship needs a basis and its evidence');
END;

INSERT INTO link_types (name, inverse_name, description) VALUES
    ('associated_with', 'associated_with', 'Two figures joined for a reason the link states. Needs a basis and evidence when confirmed.'),
    ('contemporary_of', 'contemporary_of', 'Two figures who lived at the same time, as the evidence states. Needs a basis and evidence when confirmed.'),
    ('teacher_of', 'student_of', 'One figure taught or discipled another, as the evidence states. Needs a basis and evidence when confirmed.'),
    ('ancestor_of', 'descendant_of', 'A family line the evidence states (for Scripture, the begetting verses). Needs a basis and evidence when confirmed.'),
    ('attested_by', 'attests', 'A figure or event an ancient writer or text reports; the evidence names the work and place. Needs a basis and evidence when confirmed.'),
    ('related_manuscript', 'related_manuscript', 'Two manuscripts or texts that share a line of transmission, as the evidence states. Needs a basis and evidence when confirmed.');

UPDATE link_types SET description = 'Concerns a theme or person. From an essay to a figure: the essay discusses the figure, so the figure''s name is linked in the essay''s text and the essay is listed on the figure''s page. Proposed (confirmed = 0) until Boss confirms.' WHERE name = 'about';

UPDATE node_types SET description = 'A figure: Church Father, author, biblical person, scholar. Linked from essays by node_aliases (the names an essay uses), by about links from essays, and to other figures by relationship links (ancestor_of, associated_with, ...), each with a basis and evidence.' WHERE name = 'person';

INSERT INTO node_aliases (node_id, alias, note) VALUES
    ((SELECT id FROM nodes WHERE slug = 'enoch'), 'Enoch', 'the person, and the books that bear his name'),
    ((SELECT id FROM nodes WHERE slug = 'noah'), 'Noah', NULL),
    ((SELECT id FROM nodes WHERE slug = 'noah'), 'Noe', 'the Septuagint spelling'),
    ((SELECT id FROM nodes WHERE slug = 'elijah'), 'Elijah', NULL),
    ((SELECT id FROM nodes WHERE slug = 'elijah'), 'Elias', 'the Septuagint spelling in Malachi and Sirach'),
    ((SELECT id FROM nodes WHERE slug = 'elijah'), 'Eliu', 'the Septuagint spelling in the books of Kings'),
    ((SELECT id FROM nodes WHERE slug = 'jeremiah'), 'Jeremiah', NULL),
    ((SELECT id FROM nodes WHERE slug = 'jeremiah'), 'Jeremias', 'the Septuagint spelling'),
    ((SELECT id FROM nodes WHERE slug = 'sheba'), 'Queen of Sheba', NULL),
    ((SELECT id FROM nodes WHERE slug = 'sheba'), 'Queen of the South', 'Matthew 12:42'),
    ((SELECT id FROM nodes WHERE slug = 'daniel'), 'Daniel', NULL);

INSERT INTO links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence) VALUES
    ((SELECT id FROM nodes WHERE slug = 'enoch'), (SELECT id FROM nodes WHERE slug = 'noah'), 'ancestor_of',
     'Enoch fathers Mathusala, Mathusala fathers Lamech, and Lamech fathers Noah, so Noah is Enoch’s great-grandson.',
     'ai', 0, 'scripture', 'Genesis 5:21; Genesis 5:25; Genesis 5:28-29'),
    ((SELECT id FROM nodes WHERE slug = 'enoch'), (SELECT id FROM nodes WHERE slug = 'elijah'), 'associated_with',
     'Genesis ends Enoch’s story with God translating him, and 2 Kings has Elijah taken up in a whirlwind. Neither is recorded as dying.',
     'ai', 0, 'scripture', 'Genesis 5:24; 2 Kings 2:11'),
    ((SELECT id FROM nodes WHERE slug = 'noah'), (SELECT id FROM nodes WHERE slug = 'daniel'), 'associated_with',
     'Ezekiel names Noah, Daniel and Job together as the three who alone would be delivered by their righteousness.',
     'ai', 0, 'scripture', 'Ezekiel 14:14; Ezekiel 14:20');

INSERT INTO links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence) VALUES
    (1349, (SELECT id FROM nodes WHERE slug = 'enoch'), 'about',
     'The essay turns to Enoch’s prophecy in Jude and the book that bears his name.', 'ai', 0, 'editorial', 'Section 5, "What Enoch Adds"'),
    (1349, (SELECT id FROM nodes WHERE slug = 'noah'), 'about',
     'The essay reads Noah as the remnant after the verdict.', 'ai', 0, 'editorial', 'Section 3, "The Remnant"');

INSERT INTO schema_migrations (version, name, applied_at) VALUES (21, 'figure_connections', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
