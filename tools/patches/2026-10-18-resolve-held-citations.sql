-- Editor's decision: publish the four citations held for review after checking them against the house text. Nehemiah 4:16-18 and Psalm 26:14 (given in Septuagint numbering by the essay) are already the house numbers; Zechariah 2:11 and 2:10-11 are English numbers and map to Septuagint 2:15 and 2:14-15 (English chapter 2 runs four verses behind). Applied to a copy of kc_v34.db.

UPDATE citations SET resolution = 'assumed_same'
 WHERE resolution = 'review' AND raw = 'Nehemiah 4:16-18'
   AND node_id = (SELECT id FROM nodes WHERE title = 'The Christian Code Inside Your Phone');

UPDATE citations SET resolution = 'assumed_same'
 WHERE resolution = 'review' AND raw = 'Psalm 26:14'
   AND node_id = (SELECT id FROM nodes WHERE title LIKE 'Act Like Men:%');

UPDATE citations SET house_start = 49002015, house_end = 49002015, resolution = 'mapped', in_text = 1
 WHERE resolution = 'review' AND raw = 'Zechariah 2:11'
   AND node_id = (SELECT id FROM nodes WHERE title LIKE 'The Seven Laws of Noah%');

UPDATE citations SET house_start = 49002014, house_end = 49002015, resolution = 'mapped', in_text = 1
 WHERE resolution = 'review' AND raw = 'Zechariah 2:10–11'
   AND node_id = (SELECT id FROM nodes WHERE title LIKE 'The Seven Laws of Noah%');
