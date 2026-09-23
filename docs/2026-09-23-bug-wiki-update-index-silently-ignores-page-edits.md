# Bug: `wiki_update_index` accepts page-edit arguments it does not support, and reports success

**Date found:** 2026-09-23
**Severity:** High, because data is lost silently. Every wiki page edit made this way disappeared, the
tool reported success each time, and the assistant told the user the edits were done.
**Component:** `plugin/mcp-servers/wiki/server.js`, tool `wiki_update_index`, plus how an assistant is
steered towards editing existing pages.
**Plugin version in use:** `aela-voice` 2.1.1 (installed from the `matts-place` cache). Source examined:
`C:/devworkspace/aela-voice/plugin` at `385ccab`.

## Summary

During a long session in `matt-head-test`, the assistant (Claude, running as Aela) edited existing
project-wiki pages by calling `wiki_update_index` with arguments the tool does not have. The tool declares
exactly one parameter, `wiki`. The assistant passed `page` and an invented `operations` array of
find/replace and append edits. Nothing rejected the extra arguments. The handler regenerated the index and
returned `Updated project wiki index (70 pages, 3 categories).`. The assistant read that as confirmation
of its edit.

Across roughly six hours it made **8 such calls carrying 14 edit operations on 2 pages**, and none of them
changed a page. The loss surfaced only when a later `wiki_read` returned a page still in its original
state.

## What happened

The calls all had this shape (content abbreviated):

```json
{
  "wiki": "project",
  "page": "parent-transport-notifications",
  "operations": [
    { "op": "replace", "find": "**STILL UNPROVEN:** a real driver action ...", "replace": "**PROVEN END-TO-END ON A REAL DEVICE ..." },
    { "op": "append", "content": "\n## Two QA fixture facts that cost time ..." }
  ]
}
```

Every call returned a single line:

```
Updated project wiki index (70 pages, 3 categories).
```

(71 in later calls.)

| # | Page | Operations | What was meant to land |
|---|---|---|---|
| 1 | `parent-transport-notifications` | 1 replace | Device end-to-end results; two new defects |
| 2 | `parent-transport-notifications` | 2 replace | Correct a false exclusivity claim; mark a product decision resolved |
| 3 | `parent-transport-notifications` | 1 replace | Mark a finding refuted, with the mechanism |
| 4 | `parent-transport-notifications` | 1 replace | Narrow a claim to the half that still held |
| 5 | `parent-transport-notifications` | 1 replace, 1 append | Record live confirmation; add a fixture-facts section |
| 6 | `parent-transport-notifications` | 2 replace | Record the user's ruling and the mechanism behind it |
| 7 | `educe-android-notification-delivery` | 3 replace | Rewrite three sections to the measured behaviour |
| 8 | `educe-android-notification-delivery` | 1 replace | Correct a platform claim a device dump disproved |

The first `wiki_read` of `parent-transport-notifications` after these calls returned the original
2026-09-22 text, with `updated: 2026-09-22` and none of the 14 edits. A `grep` of both page files on disk
confirmed it: every string the edits should have introduced had zero matches. Both pages have since been
rewritten to their current state the correct way (edit the file, bump `updated:`, then
`wiki_update_index`) and read back.

A personal-wiki edit made earlier the same day (a line added to `tasks-active`) was made correctly before
a context compaction, and it did persist. The failure is limited to the post-compaction project-wiki
edits.

## Impact

- **About six hours of durable knowledge was silently absent** from pages that later sessions load or
  read on demand. That included two corrections of claims that had turned out to be *false*, so the wiki
  kept asserting things the session had disproved.
- **The assistant told the user, in writing and by voice, that "the wiki is current" and "the wiki and
  handover are corrected".** Those statements were untrue, with nothing to show for it.
- **Nothing surfaced it.** No error was returned, no warning appeared, and no page was reported as
  unchanged. It was caught only by chance, when the assistant read a page to extend it.

## Root cause

### Primary: the assistant used the wrong tool, with invented parameters

The orientation is correct and was ignored. `PLUGIN-FEATURES` says existing pages are edited through the
`/wiki-update` skill ("Edit-based, preserves frontmatter"). It describes `wiki_update_index` as "regenerate
a wiki's index.md from page frontmatter. Called automatically by `/wiki-update` and `wiki_create`;
available for manual repair." After a context compaction, the assistant invented an interface
(`page`, `operations`) for a tool whose name contains "update", without loading or checking the declared
schema. It then trusted a success line that described a different action from the one it intended.

### Contributing: why nothing caught the mistake

1. **Unknown arguments are silently accepted.** The `inputSchema` for `wiki_update_index` (`server.js`
   around line 103) declares `properties: { wiki }` and `required: ['wiki']`, with no
   `additionalProperties: false`. The handler destructures only what it uses:

   ```js
   function handleWikiUpdateIndex({ wiki }) {
     return wikiUpdateIndex(wiki);
   }
   ```

   So `page` and `operations` were dropped without a word, and the call succeeded. Neither the MCP client
   nor the server rejected them. The other handlers (`handleWikiRead`, `handleWikiCreate`,
   `handleWikiDelete`, `handleWikiList`, `handleWikiLog`) use the same destructure-and-ignore pattern, so any
   of them would behave the same way given extra keys.

2. **The success message cannot tell "I did what you asked" apart from "I did something else".**
   `Updated project wiki index (N pages, M categories).` is true on every call. It says nothing about page
   content, so a caller expecting an edit reads it as success.

3. **No MCP tool edits an existing page, and the only one with "update" in its name is
   `wiki_update_index`.** The supported way to edit a page is a skill that uses the host's file-edit tool.
   A model reaching for a tool to update a page finds one near-miss name and no real match, next to a skill
   literally called `wiki-update`.

4. **Nothing verifies writes.** The documented flow never reads the page back, and no tool response reports
   whether any page on disk changed.

## Reproduction

1. Pick any existing page, for example `project/pages/some-page.md`, and note a line of its text.
2. Call the tool with arguments it does not declare:

   ```json
   { "wiki": "project", "page": "some-page",
     "operations": [ { "op": "replace", "find": "<that line>", "replace": "CHANGED" } ] }
   ```

3. Observe: `Updated project wiki index (N pages, M categories).`, with no error.
4. `wiki_read` the page, or open the file: it is unchanged.

## Suggested fixes, in priority order

1. **Reject unknown arguments, and say where to go instead.** Add `additionalProperties: false` to every
   tool's `inputSchema`, and validate in `server.js` as well: before dispatching, compare `Object.keys(args)`
   with the schema's properties and throw on anything extra. That keeps the check in place even if a client
   ignores the schema. For this tool, the message should name the right path, for example:

   > `wiki_update_index` does not edit pages — it only regenerates index.md. Unknown arguments: page,
   > operations. To change an existing page, edit its file (the /wiki-update skill), then call this.

   On its own, this would have failed the first of the eight calls.

2. **Make the success line say what did not happen.** For example: `Regenerated project index.md from
   frontmatter: 71 pages, 3 categories. No page content was changed.` Better still, report which pages
   changed since the last index regeneration, by frontmatter `updated:` or file modification time:
   `0 pages modified since the last index`. A caller who meant to edit a page would see that nothing
   happened.

3. **Close the gap that invites the mistake.** Two options: add a real page-edit tool (for example
   `wiki_edit { wiki, page, old_string, new_string }` that bumps `updated:`, reindexes, and errors if
   `old_string` is missing or appears more than once), or rename `wiki_update_index` to something without
   "update", such as `wiki_reindex`, so it can't be mistaken for the `/wiki-update` skill. An edit tool also
   gives the plugin one place to enforce the frontmatter rules the skill currently leaves to the assistant.

4. **Read back after writing, in the documented flow.** Add a final step to `/wiki-update`: re-read the
   edited region and confirm the new text is present before reporting the update. It costs one read, and it
   is the check that would have caught this in minutes rather than hours.

## Assistant-side lessons (recorded in the user's memory, not a plugin change)

- A tool's name is not its interface. Before calling a tool with an argument shape inferred from its name,
  load the declared schema, and especially so after a context compaction, when earlier certainty about a
  tool is gone.
- A success message is evidence only for the action it names. "Updated index" says nothing about a page.
- Every durable write gets a read-back before it is reported to the user as done.
