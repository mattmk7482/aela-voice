---
name: check-comms
description: Scan Teams and Slack for new tasks, decisions, and knowledge. Extracts action items into the Aela wiki and technical insights into the codebase wiki. Self-improving — learns which channels matter and how to navigate efficiently.
---

# Check Communications

Scan Microsoft Teams and Slack for new messages, extract tasks and knowledge, and update the wikis.

## Before Starting

1. Load the hints page: call `wiki_read(wiki: "aela", page: "comms-sources")` to get navigation hints, channel priorities, and learnings from previous runs.
2. Get current tasks: call `wiki_read(wiki: "aela", page: "tasks-active")` to know what's already tracked — avoid duplicates.

## Process

### 1. Check Teams

Use the Chrome extension tools (`mcp__claude-in-chrome__*`). Teams should already be open — check `tabs_context_mcp` for an existing Teams tab. If not, create one and navigate to `https://teams.microsoft.com/v2/`.

For each high-priority chat listed in `comms-sources`:

1. Click the chat name in the left sidebar
2. Wait briefly for messages to load
3. Screenshot the visible messages
4. Scroll down and screenshot again until you reach messages you've already seen (check timestamps against last run)
5. Extract:
   - **Tasks/action items** — anything assigned to Matt or the team, deadlines, deliverables
   - **Decisions** — technical or business decisions that affect the codebase
   - **Knowledge** — technical analysis, architecture discussions, requirements
   - **People context** — who said what, new team members, role clarifications

For medium-priority chats: scan only if there are unread indicators visible in the sidebar.
Skip low-priority chats unless specifically asked.

### 2. Check Slack

Navigate to Slack tab or create one at `https://app.slack.com`. Check workspaces listed in `comms-sources`.

Same extraction process — focus on channels with unread messages.

### 3. Update Wikis

**Aela wiki:**
- Update `tasks-active` with new tasks. Don't remove completed tasks — mark them done with `[x]`.
- Update `people` if new team members or role info discovered.
- Update `comms-sources` learning notes with:
  - What was found in each channel (task count, relevance)
  - Navigation tips that worked or didn't
  - Any new channels or chats discovered
  - Timestamp of this scan

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

This skill works with `/loop`:
```
/loop 20m /check-comms
```

When running on a loop, be extra concise in the report. Only surface genuinely new items.
