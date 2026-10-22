-- New Names entry: Ezekiel, as a DRAFT for Boss to read, with his Scripture, two figure connections and seven essay connections, all proposed.
--
-- Apply to a NEW copy:   python3 tools/patch_db.py tools/patches/2026-10-22-add-ezekiel.sql kc_v37.db kc_v38.db
-- Read the entry (preview: tools/KNOWLEDGE.md), then publish it and confirm the connections with 2026-10-22-publish-ezekiel.sql.
-- Every statement of Ezekiel's text below was read in the stored Septuagint text (spelling as stored: Jezekiel, Noe, Chobar, Joakim, Tyrus).
-- Essays are connected from what each essay says about him, not from how often it names him; each note says where.
-- The Queen of Sheba essay (1346) also reads Ezekiel 27:22, but it has no live link yet, so it is left out until it does.

INSERT INTO nodes (type, title, slug, summary, body_md, status, origin) VALUES
    ('person', 'Ezekiel', 'ezekiel',
     'Priest and prophet by the river of Chobar, made a watchman to the house of Israel.',
     'Ezekiel is the priest, the son of Buzi, to whom the word of the Lord came in the land of the Chaldeans, by the river of Chobar, in the fifth year of the captivity of king Joakim. The Septuagint spells his name Jezekiel. The Lord calls him Son of man, sends him to the house of Israel and makes him a watchman to them, and he eats a volume that is in his mouth as sweet honey. He is told to prophesy against the shepherds of Israel and against Gog, sees a plain full of dry bones and is told to prophesy to them, and is told to join two rods into one stick. In the twenty-fifth year of the captivity a vision of God brings him to a very high mountain, where he sees the frame of a city, and later water coming out from under the porch of the house. His book names Noe, Daniel and Job together as men who would be delivered by their righteousness, and asks the prince of Tyrus whether he is wiser than Daniel.',
     'draft', 'ai');

INSERT INTO person_profiles (node_id, position) VALUES ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 7);

INSERT INTO profile_groups (node_id, position, title, note) VALUES
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 1, 'The call',
     'The word of the Lord comes to Jezekiel the priest, the son of Buzi, by the river of Chobar. A voice calls him Son of man, sends him to the house of Israel, and has him eat a volume, which is in his mouth as sweet honey.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 2, 'The watchman',
     'The Lord makes him a watchman to the house of Israel. If he warns the wicked and the wicked man does not turn, he delivers his own soul.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 3, 'Shepherds and sheep',
     'The Lord tells him to prophesy against the shepherds of Israel, and says he will seek out his sheep and bring them back from every place where they were scattered.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 4, 'A new heart',
     'The Lord promises to take away the heart of stone, give a heart of flesh, and put his Spirit in them.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 5, 'The dry bones and the one stick',
     'He is set in the midst of a plain full of human bones. The Lord says the bones are the whole house of Israel, and that he will open their tombs and put his Spirit in them. He is then told to join two rods, one for Juda and one for Joseph, into one stick.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 6, 'Gog',
     'The Lord tells him to set his face against Gog, and the land of Magog.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 7, 'The city and the water',
     'In the twenty-fifth year of the captivity a vision of God brings him to a very high mountain, with the frame of a city on it. Later water comes out from under the porch of the house.'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 8, 'Noe, Daniel and Job',
     'The Lord names the three as men who would be delivered by their righteousness, and the prince of Tyrus is asked whether he is wiser than Daniel.');

INSERT INTO profile_refs (group_id, position, book_id, chapter, verse_start, verse_end) VALUES
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 1), 1, 37, 1, 1, 3),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 1), 2, 37, 2, 1, 3),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 1), 3, 37, 3, 1, 3),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 2), 1, 37, 3, 16, 19),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 3), 1, 37, 34, 1, 2),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 3), 2, 37, 34, 11, 12),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 4), 1, 37, 36, 26, 27),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 5), 1, 37, 37, 1, 6),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 5), 2, 37, 37, 11, 14),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 5), 3, 37, 37, 15, 17),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 6), 1, 37, 38, 1, 3),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 7), 1, 37, 40, 1, 2),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 7), 2, 37, 47, 1, 2),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 8), 1, 37, 14, 14, 14),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 8), 2, 37, 14, 20, 20),
    ((SELECT id FROM profile_groups WHERE node_id = (SELECT id FROM nodes WHERE slug = 'ezekiel') AND position = 8), 3, 37, 28, 2, 3);

INSERT INTO node_aliases (node_id, alias, note) VALUES
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 'Ezekiel', NULL),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), 'Jezekiel', 'the Septuagint spelling');

INSERT INTO links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence) VALUES
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), (SELECT id FROM nodes WHERE slug = 'noah'), 'associated_with',
     'Ezekiel names Noah, Daniel and Job together as the three who alone would be delivered by their righteousness.',
     'ai', 0, 'scripture', 'Ezekiel 14:14; Ezekiel 14:20'),
    ((SELECT id FROM nodes WHERE slug = 'ezekiel'), (SELECT id FROM nodes WHERE slug = 'daniel'), 'associated_with',
     'Ezekiel names Daniel with Noah and Job, and asks the prince of Tyrus whether he is wiser than Daniel.',
     'ai', 0, 'scripture', 'Ezekiel 14:14; Ezekiel 14:20; Ezekiel 28:2-3');

INSERT INTO links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence) VALUES
    (119, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Opens with Ezekiel in the valley of dry bones: "will these bones live?"', 'ai', 0, 'editorial', 'Ezekiel 37:1-4, as the essay quotes it'),
    (78, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Asks why Ezekiel says Sodom''s sin was pride, excess of food and prosperous ease.', 'ai', 0, 'editorial', 'Ezekiel 16, as the essay discusses it'),
    (14, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Reads Ezekiel''s charges against Sodom as an indictment.', 'ai', 0, 'editorial', 'Ezekiel 16:49-50, as the essay quotes it'),
    (37, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Turns to Ezekiel''s vision of the glory leaving the Temple, and to the northern armies of chapters 38 and 39.', 'ai', 0, 'editorial', 'Ezekiel 10-11 and 38-39, as the essay discusses them'),
    (142, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Follows the glory lifting off the temple in Ezekiel 10, and what Ezekiel watched depart and return.', 'ai', 0, 'editorial', 'Ezekiel 10, as the essay discusses it'),
    (229, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Reads Ezekiel''s indictment of Tyre aloud.', 'ai', 0, 'editorial', 'Ezekiel against Tyre, as the essay discusses it'),
    (139, (SELECT id FROM nodes WHERE slug = 'ezekiel'), 'about', 'Discusses how Ezekiel 18:20 is read in the argument over original sin.', 'ai', 0, 'editorial', 'Ezekiel 18:20, as the essay discusses it');
