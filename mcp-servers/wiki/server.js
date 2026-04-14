#!/usr/bin/env node
/**
 * aela-voice wiki MCP server.
 *
 * Exposes seven wiki tools against two wikis:
 *   personal — ~/.claude/aela-plugin/wiki/
 *   project  — <cwd>/.aela/wiki/project/
 *
 * Updates to existing pages are deliberately NOT an MCP tool — they
 * happen via the wiki-update skill using Edit directly, which gives us
 * optimistic concurrency for free.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  wikiRead,
  wikiList,
  wikiSearch,
  wikiLog,
  wikiCreate,
  wikiDelete,
  wikiUpdateIndex,
} from './store.js';

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'wiki_search',
    description: 'Search wiki pages by keyword across BOTH personal and project wikis in one call. Returns matching pages with snippets, ranked by relevance. Results are tagged with which wiki each hit came from.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — keywords to find in page titles, descriptions, and content.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'wiki_read',
    description: 'Read a specific wiki page. For standard wikis, supply wiki ("personal" or "project") and page. For external collaborator wikis, supply wiki: "external", page, and path (absolute path to the directory containing the external wiki pages).',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: {
          type: 'string',
          description: 'Which wiki: "personal", "project", or "external" (requires path param).',
        },
        page: { type: 'string', description: 'Page name (e.g. "tasks-active"). No .md extension needed.' },
        path: { type: 'string', description: 'For external wikis only: absolute path to the directory containing the page file.' },
      },
      required: ['wiki', 'page'],
    },
  },
  {
    name: 'wiki_create',
    description: 'Create a new wiki page. Errors if the page already exists — use the wiki-update skill to modify existing pages. All of title, category, description, and body are required. description must be a genuine one-line summary of what the page contains (not a restatement of the title) — it appears in the index and is how future sessions decide whether to drill in. created and updated are set to today automatically. The index regenerates after every create.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        page: { type: 'string', description: 'Page name slug (e.g. "tasks-active"). No .md extension needed. Use lowercase-hyphenated.' },
        title: { type: 'string', description: 'Human-readable page title.' },
        category: { type: 'string', description: 'Page category (e.g. "context", "project", "reference", "person", "preference").' },
        description: { type: 'string', description: 'One-line summary of page contents. Must describe what is IN the page, not restate the title. This is the text shown in the wiki index — write it so a future reader can decide whether to drill in without opening the page.' },
        body: { type: 'string', description: 'Page body in Markdown (everything after the frontmatter block).' },
        log_entry: { type: 'string', description: 'Optional custom log entry. Defaults to "create | page-name".' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags list. Defaults to empty.' },
      },
      required: ['wiki', 'page', 'title', 'category', 'description', 'body'],
    },
  },
  {
    name: 'wiki_delete',
    description: 'Delete a wiki page by name, remove it from the index, and append a delete entry to the log. No-op if the page does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        page: { type: 'string', description: 'Page name to delete. No .md extension needed.' },
      },
      required: ['wiki', 'page'],
    },
  },
  {
    name: 'wiki_list',
    description: 'List all pages in a wiki. Returns the index.md content — a categorised catalog of every page.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
      },
      required: ['wiki'],
    },
  },
  {
    name: 'wiki_update_index',
    description: 'Regenerate the wiki index.md from page frontmatter. Call after every wiki-update skill invocation. Also available for repair.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
      },
      required: ['wiki'],
    },
  },
  {
    name: 'wiki_log',
    description: 'Read recent log entries for a wiki. Shows chronological record of creates, deletes, and updates.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        limit: { type: 'number', description: 'Max entries to return (default 20).' },
      },
      required: ['wiki'],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

function handleWikiSearch({ query }) {
  return wikiSearch(query);
}

function handleWikiRead({ wiki, page, path }) {
  return wikiRead(wiki, page, path);
}

function handleWikiCreate({ wiki, page, title, category, description, body, log_entry, tags }) {
  return wikiCreate(wiki, page, { title, category, description, body, logEntry: log_entry, tags });
}

function handleWikiDelete({ wiki, page }) {
  return wikiDelete(wiki, page);
}

function handleWikiList({ wiki }) {
  return wikiList(wiki);
}

function handleWikiUpdateIndex({ wiki }) {
  return wikiUpdateIndex(wiki);
}

function handleWikiLog({ wiki, limit }) {
  return wikiLog(wiki, limit);
}

// ── Server wiring ───────────────────────────────────────────────────────────

const server = new Server(
  { name: 'aela-voice-wiki', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case 'wiki_search':       result = handleWikiSearch(args); break;
      case 'wiki_read':         result = handleWikiRead(args); break;
      case 'wiki_create':       result = handleWikiCreate(args); break;
      case 'wiki_delete':       result = handleWikiDelete(args); break;
      case 'wiki_list':         result = handleWikiList(args); break;
      case 'wiki_update_index': result = handleWikiUpdateIndex(args); break;
      case 'wiki_log':          result = handleWikiLog(args); break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
