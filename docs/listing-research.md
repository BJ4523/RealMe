# Research a listing before importing it

Use [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
in Claude Code to find a public property page and check its details before adding
it to RealMe. The free anonymous endpoint provides web search in Fast mode and
page fetching without a Parallel account or API key, with rate limits for light use.

This is an optional research step outside the app. RealMe's URL importer still
uses Firecrawl when configured, then its HTML fallback. Parallel does not populate
the listing form or supply a photo set automatically.

## Connect Claude Code

Install and sign in to [Claude Code](https://code.claude.com/docs/en/quickstart)
first. In your RealMe checkout, run:

```bash
claude mcp add --transport http --scope local parallel-search \
  https://search.parallel.ai/mcp \
  --header 'User-Agent: RealMe/0.1 (listing-research)'
claude mcp get parallel-search
```

`--scope local` keeps this opt-in configuration private to you in this project.
If you already use the name `parallel-search`, inspect that configuration first
and choose another name rather than replacing it. No RealMe environment variable
or project dependency is needed for this research step.

Start a new Claude Code session in the same directory and run `/mcp`. Confirm that
`parallel-search` is connected. It exposes `web_search` and `web_fetch`.
The [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) explains scopes
and connection management.

## Find and verify the source

Replace the bracketed address in this prompt with the property you are listing:

```text
Use Parallel's web_search to find the public listing page for
[street address including unit, city, state, ZIP]. Match the full address;
exclude nearby properties and unrelated units. Use web_fetch on the matching
page to check its details.

Return the listing URL and a table of address, asking price, beds, baths,
square footage, year built, and stated property features. For each value,
include the source URL and a short supporting quote. Note any listing update
date shown on the page and any conflicting values. Mark missing facts as
unknown. Do not infer amenities or write the video narration yet.
```

Open the returned page yourself to confirm the property and current listing
status. Search results and extracted excerpts can be stale or incomplete; use
your verified listing records to resolve conflicts. Keep the source table with
your research notes so you can check the narration against it later.

If the page cannot be fetched or the service reports a rate limit, use the
source page and your own listing records directly, or retry after the indicated
wait. An unreadable page is not evidence for a missing property feature.

## Add the listing to RealMe

After signing in to RealMe, open `/listings/new`:

1. Choose **Import from URL**, paste the verified property-page URL, and click
   **Import listing**. Review the imported fields and selected photos before
   **Save listing**; the research table is a reference, not an import payload.
2. If the URL cannot be imported, choose **Manual entry**. Copy the verified
   address, price, beds, baths, square footage, year built, property type,
   description, and features into their matching fields. Leave unknown optional
   values blank. Upload your listing photos or paste their URLs in the Photos
   field, then save.
3. Review the generated narration against those facts before generating a video.
   Web search cannot confirm facts that neither the source nor your records state.

See [the listing onboarding guide](./fast-onboarding-setup.md) for Firecrawl
configuration and the existing photo-upload workflow.

To remove the optional research connection, run from the same directory:

```bash
claude mcp remove parallel-search --scope local
```
