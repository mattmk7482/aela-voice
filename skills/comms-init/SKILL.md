---
name: comms-init
description: Socratic comms onboarding. Walks through every communication service the user uses, opens each in a Chrome tab, explores the UI visually, asks pointed questions about priorities and navigation, and writes everything to the user's comms-sources wiki page as structured per-service prose. Re-run to add a new service later.
---

# comms-init

Configure comms monitoring by walking through each service the user uses, asking pointed questions, and writing the configuration to `comms-sources` in the personal wiki.

## Before starting

1. **Check prerequisites.** `/wiki-init` must have run already — `comms-sources` needs to exist as a page (created empty by `/wiki-init`). If it doesn't exist, tell the user: "I need to run `/wiki-init` first to set up the wiki layer. Want me to do that now?" and invoke `/wiki-init` on yes, or stop on no.
2. **Check for the Claude-in-Chrome extension.** This skill is Chrome-driven. Call `tabs_context_mcp` to see if the extension is reachable. If it errors (the extension isn't connected), print this block verbatim — do not summarise or paraphrase:

   > **The Claude-in-Chrome extension needs to be active before I can continue.**
   >
   > This skill uses your Chrome browser to open the communication services you'll configure (Teams, Slack, email, whatever). It talks to Chrome through a browser extension called **Claude in Chrome**. On first run, the extension needs to be connected to this Claude Code session.
   >
   > Steps to enable it:
   >
   > 1. **Open Chrome.** If Chrome isn't running, start it now.
   > 2. **Find the Claude-in-Chrome extension icon.** Click the puzzle-piece "Extensions" icon in the top-right of Chrome's toolbar. You'll see a list of installed extensions. Look for **Claude in Chrome** (it has the Anthropic logo). If you don't see it in the list, the extension isn't installed — you can install it from the Chrome Web Store by searching for "Claude in Chrome" and clicking **Add to Chrome**.
   > 3. **Pin the extension** (optional but recommended) by clicking the pin icon next to its entry in the Extensions dropdown. This keeps the icon visible in the toolbar so you don't have to dig through the dropdown every time.
   > 4. **Click the Claude-in-Chrome icon** in the toolbar (or from the Extensions dropdown). A small popup will open showing the extension's connection state.
   > 5. **Connect it to this session.** In the popup, there'll be a "Connect" or "Activate" button (exact wording may vary by extension version). Click it. The popup should update to show "Connected" or similar.
   > 6. **Come back here and tell me when you're ready.** I'll re-check and continue from where we left off.

   After printing the block, stop the skill and wait for the user to confirm before retrying the prerequisite check. Do not loop — one check, one print, one wait. When the user confirms, re-run `tabs_context_mcp` once. If it succeeds, continue. If it still errors, re-print the block and stop again.
3. **Re-run detection.** Read `comms-sources` via `wiki_read(wiki: "personal", page: "comms-sources")`. If it already has service sections configured, show the user what's there and ask whether they want to add a new service, update an existing one, or cancel. Re-running should never silently blow away prior configuration.

## The socratic flow

Ask open-ended questions one at a time. Write as you go — don't batch everything into a single wiki_update at the end. Each service's configuration is its own section in `comms-sources`, added incrementally.

### Opening question

> "What communication services do you use for work? It can be anything — corporate chat like Teams or Slack, email, project management tools like Linear or Jira, or anything else I can open in a browser and scan visually. List them all and we'll walk through each one."

Take the list. For each service in turn, do the per-service walk below.

### Per-service walk

For each service the user named:

**Step A — Open it.** Call `tabs_create_mcp` with the service's URL. If the user didn't give a URL, ask ("What URL do you use for <service>?"). Wait for the page to load. If the user needs to log in, tell them: "I'll pause here while you log in — let me know when you're ready."

**Step B — Explore the UI.** Once logged in, take a screenshot to understand the visual layout — sidebar, content area, navigation pattern. Then figure out the cheapest repeatable path: can you navigate to targets via URL patterns or JavaScript rather than clicking through the UI? Test `get_page_text` on a target page to see if it captures the content cleanly. Record the best extraction method and navigation approach in the template — discovery can be expensive, but the recorded process should be lean.

**Step C — Ask what matters.** Pointed questions, one at a time:

- "Which <channels / chats / inboxes / lists> do you actually care about on this service? Walk me through them briefly." — Get the user to name the targets that matter.
- For each target: "Is this one I should always check, or only check when you've got unread messages?" — priority tier.
- "What am I looking for when I scan this one?" — the extraction target. Tasks? Decisions? Pipeline signal? Questions from someone specific?
- "Is there anything about the UI or how this service works that would trip me up if I didn't know about it?" — user hands you the gotchas.
- "Anything here you explicitly don't want me scanning?" — exclusions.

Don't read from a form. Read from the actual page you're looking at. If you see something you don't understand, ask.

**Step D — Write the section.** Once you have enough to write the per-service configuration, Edit the `comms-sources` page via `/wiki-update` to add a new section for this service. The section structure:

```
## <Service Name>

**Opening:** <URL and steps to reach the service — include tab reuse if applicable>

**Navigation:** <minimum steps to reach each target — e.g. "click #channel-name in sidebar", not a description of the sidebar>

**Extraction method:** <cheapest way to get content — get_page_text / read_page / screenshot, per target if they differ>

**Priority tiers:**

- **Always check:** <targets, one-line reason each>
- **Check if unread:** <targets>
- **Skip unless asked:** <excluded targets>

**Extraction targets:** <what to look for — tasks, decisions, specific people's activity>

**Scan tracking:** <per-target timestamps, updated by /check-comms>
```

Use `/wiki-update` to append the new section to the page. Preserve any existing sections from other services — the page grows by accumulation.

**Step E — Move on.** Say "OK, <service> is configured. Moving on to the next one." Proceed to the next service in the list.

## After all services

Once every service the user listed has its own section in `comms-sources`, re-read the page and confirm it parses cleanly (sections have the expected structure, no duplicates). Show the user a terse summary: "Configured: <list of services>. You can run `/check-comms` now and it'll scan each one using what I just learned. Re-run `/comms-init` anytime to add a new service."

## What to return

3-5 lines: list of configured services, any notable gotchas the user flagged, whether the user wants to run `/check-comms` immediately.

Do NOT return screenshots, raw page text, or verbose exploration logs. The visual context stays in your scanning turn — only the distilled configuration makes it to `comms-sources`.

## Adding a new service later

Re-running `/comms-init` on an already-configured install is the expected way to add a new service. The skill detects the existing configuration and asks which service to add, then walks through just that one service without touching the others.
