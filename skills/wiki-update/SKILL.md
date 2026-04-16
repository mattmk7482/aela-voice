---
name: wiki-update
description: Update an existing wiki page using targeted edits. Preserves all frontmatter by only touching what changes. Calls wiki_update_index after every edit.
---

# wiki-update — Edit-Based Wiki Page Updates

Use this skill when updating an **existing** wiki page. For new pages, use the `wiki_create` MCP tool instead.

## The file paths

Wiki pages live at different filesystem roots depending on which wiki:

- **Personal wiki** — `~/.claude/aela-plugin/wiki/pages/<page>.md` (resolves via `$HOME` or `os.homedir()`). Shared across every project.
- **Project wiki** — `<project-root>/.aela/wiki/project/pages/<page>.md` where `<project-root>` is the user's current working directory. Per-project.

Always pass the Edit tool an absolute path. Personal wiki paths will never be relative-valid to the user's project cwd.

## The flow

1. **Identify the targeted change** — what old text becomes what new text?
2. **Edit the body** — `Edit(file_path, old_string, new_string)` with the absolute path.
3. **Assess the description** — does this change introduce important keyword material that would help a future session decide whether to drill into this page? If yes, also `Edit` the `description:` frontmatter line. If no (minor update, scan-tracking timestamp, small correction), leave it alone.
4. **Update the `updated:` frontmatter field** — set it to today's date on every edit.
5. **Call `wiki_update_index(wiki)`** — always, after every update. The index is regenerated from frontmatter on disk.

## Description judgment

The description is the index signal. Ask: "would adding this content help a future session decide whether to read this page?" If yes — new people, new domains, new capabilities, new gotchas — update it. If no — a scan-tracking timestamp, a minor status update, a small correction — leave it.

## Example 1: body update to a personal wiki page

Page: `tasks-active` in the personal wiki. Adding a new item to the Now section.

```
Edit(
  file_path = "~/.claude/aela-plugin/wiki/pages/tasks-active.md",
  old_string = "## Now\n\n",
  new_string = "## Now\n\n- **Ship Phase 3a** — four maintenance skills under plugin/skills/\n\n"
)
Edit(
  file_path = "~/.claude/aela-plugin/wiki/pages/tasks-active.md",
  old_string = "updated: 2026-04-14",
  new_string = "updated: 2026-04-15"
)
```

Resolve `~` to an absolute home directory path before passing. Then: `wiki_update_index(wiki: "personal")`.

No description change — adding one task item doesn't shift what the page is about.

## Example 2: update with description change on a project wiki page

Page: `auth-flow` in the project wiki. Adding a significant new insight that changes what the page covers.

```
Edit(
  file_path = "<project-root>/.aela/wiki/project/pages/auth-flow.md",
  old_string = "description: Authentication flow across the backend and mobile clients",
  new_string = "description: Authentication flow across the backend and mobile clients, with token refresh and session rotation semantics"
)
```

Then edit the body to add the new content. Then: `wiki_update_index(wiki: "project")`.

Both the description and the body changed. The `updated:` line gets bumped to today's date in the same frontmatter edit block.
