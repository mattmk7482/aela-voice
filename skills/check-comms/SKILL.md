---
name: check-comms
description: Scan the user's configured communication services for new tasks, decisions, and knowledge. Extracts findings into the personal and project wikis. Shape-only — all service-specific configuration (which services, which channels, navigation hints) lives in the user's comms-sources wiki page, populated by /comms-init.
---

# Check Communications

Scan each communication service the user has configured for new messages since the last check, extract tasks and knowledge, and route findings to the right wiki pages.

Read all configuration from the user's `comms-sources` wiki page. To add a new service, re-run `/comms-init`.

## Before starting

1. **Load the configuration** — call `wiki_read(wiki: "personal", page: "comms-sources")`. This page contains:
   - The list of services the user has configured
   - For each service: opening instructions, sidebar/list navigation pattern, priority rules (always-check vs if-unread vs skip), extraction targets, scan-tracking timestamps from the last run, and any learnings from previous runs
   - If the page does not exist, stop. Report: "No comms configured — run /comms-init to set up communication services for scanning." Do not continue.
2. **Load the user's work queue** — call `wiki_read(wiki: "personal", page: "tasks-active")`. You need this to avoid duplicating items the user has already committed to.
3. **Load team state** — call `wiki_read(wiki: "personal", page: "team-state")`. You need this to avoid duplicating team members' activity you already know about.
4. **Load user profile** — call `wiki_read(wiki: "personal", page: "user-profile")`. You need this to correctly route "learned something about the user" findings.

Every piece of service-specific knowledge needed for scanning is in `comms-sources`. If you find yourself wanting to hardcode a URL, a sidebar pattern, a chat-name convention, or a priority rule in this skill — stop. That knowledge belongs in `comms-sources` instead, and `/comms-init` is how it gets there.

## Token efficiency

Every scan costs tokens. Use the cheapest extraction method that works:

1. **`get_page_text`** first — plain text is small and usually sufficient for chat/email content.
2. **`read_page`** if you need structure (sidebars, unread indicators, navigation elements).
3. **Screenshots** only when visual layout is essential and text extraction misses it.

Minimise navigation steps. Reuse open tabs. If `comms-sources` records a refined navigation path, use it instead of re-discovering the route.

## The shape of a scan

For each service configured in `comms-sources`:

1. **Open the service** — check for an existing tab via `tabs_context_mcp`, create one if absent, navigate to the URL in `comms-sources`.
2. **Respect the priority tiers.** Process always-check targets first (do not rely on unread indicators — the user may have already read them). For check-if-unread targets, skip unless unread indicators are visible.
3. **Navigate and extract** — follow the navigation steps in `comms-sources` for each target. Use the extraction method recorded for the service. Compare message timestamps against scan-tracking — only process messages newer than the last scan.
4. **Extract findings:**
   - **Tasks / action items** — anything the user committed to, was asked to do, or mentioned
   - **Decisions** — technical or business decisions
   - **Knowledge** — architecture, requirements, domain insight
   - **People** — communication style, priorities, role changes, relationship dynamics
5. **Update scan-tracking** in `comms-sources` after each target via `/wiki-update`.

## Routing findings

After extracting, route each finding to the right wiki page. Use `/wiki-update` for existing pages and `wiki_create` for new ones.

| Finding type | Destination |
|---|---|
| User committed to do it | `tasks-active` (Now or Next section) |
| User mentioned it, not committed | `tasks-active` (Watch section) with `Captured: <date>` |
| User is waiting on someone | `tasks-active` (Blocked section) |
| Someone else's current activity | `team-state` (that person's section) |
| Multi-person thread with no single owner | `team-state` (Active multi-person threads) |
| Something you learned about the user as a person | `user-profile` or `working-preferences`, depending on whether it's structural or an interaction preference |
| Technical decision about the current project | A page in the project wiki (create via `wiki_create` if no existing page fits) |
| Something you learned about a person — communication style, priorities, how they respond to the user, what they care about | `people` page (create entry if absent, refine existing entry if present) |
| Service-specific learning (navigation quirks, priority updates) | `comms-sources` |

If a finding doesn't fit any of these, default to `tasks-active` (Watch) or leave it out of the wiki if it's ephemeral noise.

## What to return

After scanning every configured service, return a **brief text summary**: 3 to 5 lines max. Include:

- Total new items found, split by destination page
- Any urgent flags (the user is waiting on something, a deadline is close, a decision is contested)
- Any surprises or things worth the user's attention

**Do NOT include** screenshots, raw message logs, extraction tables, or verbose reasoning in the summary. Those stay in your scanning context and do not propagate to the parent conversation.

If nothing new: say so in one line and stop.

## Healing a broken target

If a recorded navigation path or extraction method fails (element not found, URL 404s, page structure changed), don't skip the target silently:

1. Take a screenshot to reorient — understand what the page looks like now.
2. Find the new path to the same content.
3. Update the service's entry in `comms-sources` with the corrected steps via `/wiki-update`.
4. Continue the scan using the new path.

If you can't recover after two attempts, skip the target and flag it in the return summary.

## Process refinement

After each scan, evaluate whether the navigation or extraction steps can be simplified. If you found a shorter path to a target, a more efficient extraction method, or a step that was unnecessary — update that service's entry in `comms-sources` via `/wiki-update`. Replace the old steps, don't append a log. Each scan should be cheaper than the last.