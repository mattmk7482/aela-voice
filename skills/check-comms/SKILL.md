---
name: check-comms
description: Scan Teams and Slack for new tasks, decisions, and knowledge. Extracts action items into the Aela wiki and technical insights into the codebase wiki. Self-improving — learns which channels matter and how to navigate efficiently.
---

# Check Communications

Scan Microsoft Teams and Slack for new messages, extract tasks and knowledge, and update the wikis.

## Before Starting

1. Load the hints page: call `wiki_read(wiki: "aela", page: "comms-sources")` to get navigation hints, channel priorities, and learnings from previous runs.
2. Load the work queue: call `wiki_read(wiki: "aela", page: "tasks-active")` to know what's already committed for the user — avoid duplicating their own tasks.
3. Load team state: call `wiki_read(wiki: "aela", page: "team-state")` to know what other people are already tracked as doing — avoid duplicate team-state entries.

## Process

### 1. Check Teams

Use the Chrome extension tools (`mcp__claude-in-chrome__*`). Teams should already be open — check `tabs_context_mcp` for an existing Teams tab. If not, create one and navigate to `https://teams.microsoft.com/v2/`.

For each "Always Check" chat listed in `comms-sources` — check every run regardless of unread status. The user reads their own Teams, so don't rely on unread indicators for priority chats.

For each "Check If Unread" chat — only scan if unread indicators are visible in the sidebar.
Skip "Skip Unless Asked" chats.

For each chat being checked:

1. Click the chat name in the left sidebar
2. Wait briefly for messages to load
3. Screenshot the visible messages
4. Compare message timestamps against the "Scan Tracking" timestamps in `comms-sources` — only process messages newer than the last scan
5. Scroll down and screenshot again if needed, until you reach already-seen timestamps
6. Extract:
   - **Tasks/action items** — anything assigned to the user or the team, deadlines, deliverables
   - **Decisions** — technical or business decisions that affect the codebase
   - **Knowledge** — technical analysis, architecture discussions, requirements
   - **People context** — who said what, new team members, role clarifications
7. Update the "Scan Tracking" timestamp in `comms-sources` after processing

#### Call & Meeting Transcripts

When you see a call/meeting indicator in a Teams chat (e.g. "Call ended", meeting summary card, or a transcript attachment):

1. Click the meeting/call entry to open details
2. Look for a "Transcript" tab or download link — Teams auto-generates `.vtt` transcripts for recorded calls
3. If a transcript is available:
   - Download the `.vtt` file to `temp/transcripts/`
   - Read and extract: tasks, decisions, technical knowledge, people context
   - Update relevant wiki pages (same as message extraction)
   - Note the call topic and participants in the scan report
4. If no transcript is available (short call, recording disabled), note that a call happened and what you can infer from surrounding messages

This replaces the previous manual process where Matt had to tell us about transcripts. The comms skill should catch them automatically.

### 2. Check Slack

Navigate to Slack tab or create one at `https://app.slack.com`. Check workspaces listed in `comms-sources`.

Same extraction process — focus on channels with unread messages.

### 3. Update Wikis — routing rules

Use these classification rules to decide which wiki page each piece of new information goes to. When in doubt, be conservative and place items in the user's `tasks-active` Watch section rather than auto-routing to the wrong page.

| Finding | Destination page | Section |
|---|---|---|
| User explicitly committed to do something | `tasks-active` | Now (if immediate) or Next |
| Something was discussed that the user might want to do but didn't commit | `tasks-active` | Watch (with **Captured:** YYYY-MM-DD) |
| The user is waiting on someone to unblock them | `tasks-active` | Blocked (note what + who) |
| The user finished something | `tasks-active` | Done (recent) — mark with `[x]` |
| Someone else is doing something the user should be aware of | `team-state` | that person's section |
| An ongoing multi-person thread changed state | `team-state` | Active multi-person threads |
| A new person or role was discovered | `people` | appropriate team grouping |
| A strategic opportunity, deal, or pipeline update | `opportunities` | Deals / Product Bets / Experiments |
| A technical decision about a codebase was discussed | relevant codebase wiki page | domain page |
| A new scan-tracking timestamp | `comms-sources` | Scan Tracking |
| A learning about navigation / channel quirks | `comms-sources` | Learning Notes |

**Rules:**
- Never remove completed tasks from `tasks-active` — mark them `[x]` and leave them in Done (recent). Items older than 2 weeks get archived during periodic cleanup.
- Watch-section items MUST have a `Captured:` date so the 14-day stale-review rule is enforceable.
- If a team-state item becomes a thing the user needs to do, create a corresponding `tasks-active` Watch entry with a note back to team-state for context. Don't duplicate — link.
- If uncertain which section an item belongs in, default to `tasks-active` Watch (it has the forcing function to clean itself up later).
- If the user has a wiki without `team-state` or `opportunities` (some setups won't), fall back to `tasks-active` for everything and the user can split later.

**Codebase wiki:**
- Update domain pages with new technical requirements or decisions
- Create new feature/decision pages if significant architecture discussions found

### 4. Report

Give Matt a brief summary: how many new tasks found, any urgent items, anything surprising. Keep it short — 3-5 lines max.

## Optimisation Notes

- Screenshots are the reliable way to read Teams messages — the accessibility tree and JS extraction don't work well with Teams' SPA
- Scroll 5 ticks at a time, screenshot each position
- Check message timestamps — stop scrolling when you reach messages older than the last scan
- If a chat has no unread indicator and was checked recently, skip it
- The `comms-sources` learning notes compound over time — read them carefully before each run to avoid repeating mistakes

## Running on a Loop

**Important: do not invoke this skill directly from a loop in the main conversation.** The Teams/Slack screenshots fill the main context with image data every tick.

Instead, schedule a cron (via `CronCreate`) whose prompt dispatches a **general-purpose subagent** via the `Agent` tool. The subagent invokes `/check-comms` via the `Skill` tool, performs the scan inside its own isolated context, updates the wikis, and returns only a brief text summary (3-5 lines max) to the main conversation. No screenshots cross the boundary.

Example cron prompt:
> "Dispatch a general-purpose subagent via the Agent tool to run the /check-comms skill. Subagent returns only a brief text summary of new items — no screenshots, no verbose logs."

When running this way, be extra concise in the report. Only surface genuinely new items.
