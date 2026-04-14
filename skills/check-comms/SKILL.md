---
name: check-comms
description: Scan the user's configured communication services for new tasks, decisions, and knowledge. Extracts findings into the personal and project wikis. Shape-only — all service-specific configuration (which services, which channels, navigation hints) lives in the user's comms-sources wiki page, populated by /comms-init.
---

# Check Communications

Scan each communication service the user has configured for new messages since the last check, extract tasks and knowledge, and route findings to the right wiki pages.

This skill is **shape-only**. It does not know about any specific service. It reads its configuration from the user's `comms-sources` wiki page, which was populated by the `/comms-init` skill during onboarding. If you want to add a new service, re-run `/comms-init`.

## Before starting

1. **Load the configuration** — call `wiki_read(wiki: "personal", page: "comms-sources")`. This page contains:
   - The list of services the user has configured
   - For each service: opening instructions, sidebar/list navigation pattern, priority rules (always-check vs if-unread vs skip), extraction targets, scan-tracking timestamps from the last run, and any learnings from previous runs
   - If the page does not exist, stop. Report: "No comms configured — run /comms-init to set up communication services for scanning." Do not continue.
2. **Load the user's work queue** — call `wiki_read(wiki: "personal", page: "tasks-active")`. You need this to avoid duplicating items the user has already committed to.
3. **Load team state** — call `wiki_read(wiki: "personal", page: "team-state")`. You need this to avoid duplicating team members' activity you already know about.
4. **Load user profile** — call `wiki_read(wiki: "personal", page: "user-profile")`. You need this to correctly route "learned something about the user" findings.

Every piece of service-specific knowledge needed for scanning is in `comms-sources`. If you find yourself wanting to hardcode a URL, a sidebar pattern, a chat-name convention, or a priority rule in this skill — stop. That knowledge belongs in `comms-sources` instead, and `/comms-init` is how it gets there.

## The shape of a scan

For each service configured in `comms-sources`:

1. **Open the service** using the instructions written in `comms-sources` for that service. This might involve checking for an existing tab via `mcp__claude-in-chrome__tabs_context_mcp`, creating one if absent, and navigating to the URL the user's configuration specifies.
2. **Respect the priority rules.** `comms-sources` groups channels or conversations into tiers (typically some variant of always-check, check-if-unread, and skip-unless-asked). Process tiers in order. For always-check sources, do not rely on unread indicators — the user may have read the messages themselves. For if-unread sources, skip unless visible unread indicators are present.
3. **For each target being checked**, use the per-service navigation hints in `comms-sources` to reach it. Take a screenshot if that helps you extract structured content. Compare message timestamps against the scan-tracking timestamps stored in `comms-sources` for that target — only process messages newer than the last scan.
4. **Extract findings.** Each message or thread may contain:
   - **Tasks / action items** — anything the user committed to do, was asked to do, or mentioned they'd do
   - **Decisions** — technical or business decisions
   - **Knowledge** — architecture, requirements, domain insight
   - **People context** — new team members, role changes, relationship shifts
5. **Update scan-tracking in `comms-sources`** after processing a target, so the next run knows where to resume. This is an Edit to the `comms-sources` page — use the `/wiki-update` skill.

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
| New person entering the user's orbit | `people` page (create if absent) |
| Service-specific learning (navigation quirks, priority updates) | `comms-sources` — this is how the skill gets smarter over time |

If a finding doesn't fit any of these, default to `tasks-active` (Watch) or leave it out of the wiki if it's ephemeral noise.

## What to return

After scanning every configured service, return a **brief text summary**: 3 to 5 lines max. Include:

- Total new items found, split by destination page
- Any urgent flags (the user is waiting on something, a deadline is close, a decision is contested)
- Any surprises or things worth the user's attention

**Do NOT include** screenshots, raw message logs, extraction tables, or verbose reasoning in the summary. Those stay in your scanning context and do not propagate to the parent conversation.

If nothing new: say so in one line and stop.

## Self-improvement

When you discover something useful about how to scan a particular service — a better navigation path, a sidebar quirk, a priority insight the user hasn't captured — append it as a note to that service's entry in `comms-sources` via `/wiki-update`. Future runs read those notes and benefit. This is how the skill adapts to real workspaces over time without requiring plugin updates.
