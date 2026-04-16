#!/usr/bin/env node

if (process.env.TURN_END_DISABLED) {
  process.exit(0);
}
console.log('Wiki retrieval (see "Plugin Features § Two wikis" in your orientation context): scan the indexes for topics in this turn, wiki_read relevant pages before responding. Before ending this turn: you MUST run the `/aela-hook` skill.');
process.exit(0);
