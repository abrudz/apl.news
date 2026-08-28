# Source checker

`check-sources.mjs` looks for articles published by our **known sources** that are
not yet listed in [`../index.html`](../index.html), so we stop relying solely on
noticing new posts by hand.

Every hit is a **candidate**, not a decision: it only means a known source
published something we haven't listed. A human still has to confirm the article
is (1) in English and (2) actually about APL before adding it — the same bar we
apply manually. Brand-new sources we've never seen still have to be discovered by
hand; this only watches sources we already know.

## Running it

Requires Node 20+ (uses the built-in `fetch`; no dependencies).

```sh
node scripts/check-sources.mjs             # human-readable report
node scripts/check-sources.mjs --out FILE  # also write a Markdown report to FILE
node scripts/check-sources.mjs --json      # machine-readable JSON on stdout
```

It reads `sources.json`, fetches each source, extracts article links, and prints
the ones whose URL is not already in `index.html` (comparison ignores scheme,
`www.`, query, fragment and trailing slash).

## Automation

[`.github/workflows/check-sources.yml`](../.github/workflows/check-sources.yml)
runs it every Monday (and on demand via *workflow_dispatch*). When there are
candidates it opens — or updates — a single issue labelled `source-candidates`
containing a checklist grouped by source.

## Configuring sources — `sources.json`

`sources` is an array; each entry is one of:

- **feed** — an RSS or Atom feed:
  ```json
  { "name": "Dyalog blog", "type": "feed", "url": "https://www.dyalog.com/blog/feed/" }
  ```
- **scrape** — an HTML listing page whose article links match `pattern` (a
  regex tested against each `href`, resolved against the page's origin):
  ```json
  { "name": "Tool of Thought", "type": "scrape",
    "url": "https://www.toolofthought.com/", "pattern": "/posts/[a-z0-9][a-z0-9-]*" }
  ```

Optional keys on any source:

- `exclude` — regex; drop links whose `href` matches (e.g. tag/category pages).
- `filter` — regex; **keep only** items whose URL or title matches. Use it to
  narrow multi-topic blogs to APL (e.g. `"apl"`). Both `filter` and `exclude`
  are matched case-insensitively.

### Tips

- **Prefer an APL-tag endpoint** when a source offers one — it removes noise at
  the source. Examples in use: `jcarroll.com.au/tags/apl/index.xml`,
  `sacrideo.us/tag/apl/feed/`, `mathspp.com/blog/tag:apl`,
  `iczelia.net/blog/tag/apl/`. Blogger blogs expose per-label Atom feeds at
  `…/feeds/posts/default/-/<LABEL>` (URL-encode the label).
- For a general-interest blog with no tag endpoint, use the plain feed plus
  `"filter": "apl"`.
- `manual` lists known sources with **no** reliable automated endpoint (e.g. the
  annual APL Journal PDF, one-off GitHub READMEs). Check those by hand.

To add a source: append an entry to `sources.json` and run the script locally to
confirm it returns sensible candidates.
