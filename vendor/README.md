# vendor/

Third-party code the website loads from its own address, never from a CDN.

- `supabase.js`: **@supabase/supabase-js 2.118.0** (UMD build, `dist/umd/supabase.js` from the npm package), MIT licence (`supabase.LICENSE`).
  sha256 `ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3`.
  Loaded by `js/account.js` only when a reader opens an account page or already has a session; every other page never fetches it.
  To update: `npm pack @supabase/supabase-js@<version>`, copy `dist/umd/supabase.js` over this file, update the version and checksum here and the
  `?v=` in `js/account.js`, then run `npm test`.
