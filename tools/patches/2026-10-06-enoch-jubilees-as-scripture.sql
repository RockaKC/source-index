-- Editor's decision: 1 Enoch and Jubilees are Scripture. Remove the "tradition" labels from the Names profiles.

-- Enoch: drop the closing "That is tradition" sentence.
UPDATE nodes SET body_md = replace(body_md, ' That is tradition, and the ones below are marked as such.', '')
 WHERE slug = 'enoch' AND type = 'person' AND body_md LIKE '%That is tradition%';

-- Noah: "Two books of the tradition, 1 Enoch and Jubilees, say more" -> "1 Enoch and Jubilees say more", and drop the closing sentence.
UPDATE nodes SET body_md = replace(replace(body_md,
         'Two books of the tradition, 1 Enoch and Jubilees, say more', '1 Enoch and Jubilees say more'),
         ' That is tradition, and the ones below are marked as such.', '')
 WHERE slug = 'noah' AND type = 'person' AND body_md LIKE '%Two books of the tradition%';

-- The group heading on both profiles.
UPDATE profile_groups SET title = '1 Enoch and Jubilees' WHERE title = 'Books of the tradition';
