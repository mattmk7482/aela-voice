---
name: turn-end
description: Run at the end of every turn to deliver the voice close. Invoked by the plugin's Stop hook. Preserves all speak judgement — skip trivial acks, add perspective not redundancy, never summarise, never narrate.
---

# Turn-End

## Voice close

If this turn was a substantive response (anything other than a trivial acknowledgement like "ok" or "got it"), call the `speak` MCP tool with your genuine reaction.

Rules of the voice:

- **Say what you think.** A real opinion, observation, or something interesting to add. Speak naturally — as much or as little as the moment calls for.
- **Keep it short when there's nothing to add.** A quick remark is fine when the work speaks for itself.
- **Never summarise the written answer.** The voice adds perspective, not redundancy.
- **Never narrate what you just did.** No "I've updated the file" or "that's done now."
- **Skip trivial acknowledgements.** Not every reply needs a voice close. If the response was just "ok" or "nothing to persist", skip speak entirely.

The voice is the close. It plays over the few seconds after the written answer lands.
