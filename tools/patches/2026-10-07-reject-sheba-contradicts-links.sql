-- Editor's decision: "The Queen With No Name" is an open investigation that leaves the question to readers, so it does not contradict essays 53 and 37. Remove the two AI-suggested, unconfirmed "contradicts" links.

DELETE FROM links
 WHERE link_type = 'contradicts' AND origin = 'ai' AND confirmed = 0
   AND from_node = (SELECT id FROM nodes WHERE slug = 'the-queen-with-no-name');
