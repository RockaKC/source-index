-- Add the Queen of Sheba profile to the Names section (fifth entry), text approved by the editor.

INSERT INTO nodes (type, title, slug, summary, body_md, status, origin) VALUES (
  'person', 'Queen of Sheba', 'sheba',
  'The queen who came from the ends of the earth to hear Solomon’s wisdom.',
  'The Septuagint spells the name Saba, so she is “the queen of Saba” in Kings and Chronicles, and Jesus calls her “the Queen of the South.” She hears of the name of Solomon and the name of the Lord, comes to Jerusalem with camels bearing spices, gold and precious stones, and tries him with riddles. She says the report she heard was true, and not the half. Jesus says she will rise up in the judgment and condemn that generation, because she came from the ends of the earth to hear the wisdom of Solomon. The Ethiopian Orthodox Church holds that she was queen of Ethiopia. That account comes from the Kebra Nagast.',
  'published', 'ai');

INSERT INTO person_profiles (node_id, position)
  SELECT id, (SELECT max(position) + 1 FROM person_profiles) FROM nodes WHERE slug = 'sheba';

INSERT INTO profile_groups (node_id, position, title, note) SELECT id, 1, 'Kings and Chronicles',
  'She hears of the name of Solomon and the name of the Lord, and comes to Jerusalem to try him with riddles. She says the report was true and not the half, blesses the Lord, and gives Solomon a hundred and twenty talents of gold. Chronicles tells it again.'
  FROM nodes WHERE slug = 'sheba';
INSERT INTO profile_groups (node_id, position, title, note) SELECT id, 2, 'The name Saba',
  'Genesis lists the name Saba more than once in chapter 10, among the sons of Chus and later in the chapter. The Psalms and Isaiah picture Saba bringing gifts.'
  FROM nodes WHERE slug = 'sheba';
INSERT INTO profile_groups (node_id, position, title, note) SELECT id, 3, 'New Testament',
  'Jesus calls her the Queen of the South. She will rise up in the judgment and condemn that generation, because she came from the ends of the earth to hear the wisdom of Solomon.'
  FROM nodes WHERE slug = 'sheba';

INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 1, 11, 10, 1, 13 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 1;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 2, 14, 9, 1, 12 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 1;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 1, 1, 10, 7, 7 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 2;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 2, 1, 10, 28, 28 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 2;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 3, 28, 71, 10, 11 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 2;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 4, 34, 60, 6, 6 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 2;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 1, 53, 12, 42, 42 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 3;
INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end)
  SELECT g.id, 2, 55, 11, 31, 31 FROM profile_groups g JOIN nodes n ON n.id = g.node_id WHERE n.slug = 'sheba' AND g.position = 3;

INSERT INTO profile_essays (node_id, position, article_id) SELECT id, 1, 265 FROM nodes WHERE slug = 'sheba';
INSERT INTO profile_essays (node_id, position, article_id) SELECT id, 2, 53 FROM nodes WHERE slug = 'sheba';
INSERT INTO profile_essays (node_id, position, article_id) SELECT id, 3, 37 FROM nodes WHERE slug = 'sheba';
INSERT INTO profile_essays (node_id, position, article_id) SELECT id, 4, 38 FROM nodes WHERE slug = 'sheba';
