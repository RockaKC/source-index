# Agent guide

Rules for anyone (or any AI session) working in this repository. Boss, the owner and editor-in-chief of Kingdom Code, sets them. The code is documented in `tools/README.md`; this file holds the rules that must not drift between sessions.

## What this repository is

The Kingdom Code Source Index (https://sources.kingdomcodearchive.com, a static site on GitHub Pages) and the KC Tewahedo Bible Android app. One code base, two products, chosen by `profiles/site.js` and `profiles/app.js`. Kingdom Code rests on Jesus Christ and Holy Scripture, in the heritage of the Ethiopian canon. Everything is free to read; nothing is hidden behind a paywall.

## Source of truth

- The Kingdom Code SQLite database that Boss sends is the source of truth for all text, dates, and essay data. **Never commit the database.** Rebuild `data/site.js` and `bible/` only with `python3 tools/export_site.py <db>`; never edit those outputs by hand.
- Hand-kept content lives in `tools/curated.json` and `tools/library.json`. Everything else is derived.
- Do not invent facts, quotations, dates, or sources. If a text or a provenance is not in the database or supplied by Boss, ask for it. Do not type primary-source texts from memory.

## Content rules

- **Scripture is factual.** State what the text says. Do not soften it, harmonise it, or add commentary to the Bible pages; the Bible stands on its own and essays that cite it appear in one separate "Cited in Kingdom Code essays" section.
- **Spelling and wording follow the stored Septuagint text exactly.** Do not "correct" names or spellings.
- **Noah follows the stored text.** Do not rewrite it from another source.
- **The Sheba sentence stays** as it is.
- **Enoch and Jubilees:** do not describe them with the word "tradition".
- **Ge'ez sources are prioritised.** Cite a Ge'ez source only when it is clear and verifiable. Do not repeat Platt's opinion.
- **Translation transparency:** be open about the source of a translation, and only about that.
- **Never claim "81 books" of text.** Say only what the data contains.
- Early Church overviews and any new prose are drafted for Boss to read before they go live.

## Rights

- `LICENSE` is all rights reserved. Do not change it.
- The repository stays public.
- Do not add an image, text, or translation without confirmed rights. Ask Boss when provenance is uncertain.

## How work flows

- Develop on the branch named for the session. Never push to another branch.
- Open a pull request only when Boss says "Open the pull request". Boss merges PRs himself. After a merge, bring the branch to the new `main`.
- If a PR merged before a later push, merge `main` into the branch with a normal merge. Never rebase or force-push.
- Make a release only when Boss says "Release x.y.z".
- Run `python3 tools/stamp_assets.py` after editing `css/` or `js/`, and run `npm test` before pushing. A red test is never skipped, disabled, or deleted to get green.
- When a change alters what a page shows, update the tests that describe it and say what changed.

## Code conventions

- No build step: plain scripts in one shared global scope. Pick names that do not collide (a past collision between two functions called `go` broke the site).
- Match the surrounding code: comment density, naming, idiom.
- The website uses clean addresses (`/bible/genesis/3/16/`); the app keeps `#/…`. Both go through `js/urls.js`.
- New scripts need a tag in `index.html` and `app.html` in the same place, an entry in `PRECACHE` in `sw.js`, and a fresh stamp.

## Reporting

Report outcomes faithfully. If a test fails, say so with the output; if a step was skipped, say that. Recommend, do not survey: give a verdict and the reason.
