#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { speak } from './tts.js';
import { play } from './playback.js';
import { getTtsUrl, getVoice, setVoice } from './config.js';
import { readPersonality, writePersonality } from './personality.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');

// ── State ───────────────────────────────────────────────────────────────────

let muted = false;

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'speak',
    description: 'Convert text to speech and play it aloud. Splits text into sentences and pipelines TTS fetch with playback so the first sentence starts playing immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to speak' },
        voice: { type: 'string', description: 'Voice name. Use list_voices to see options.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'play_audio',
    description: 'Play a local WAV audio file.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the WAV file' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'list_voices',
    description: 'List available voices on the TTS server.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_voice',
    description: 'Change the active TTS voice. Persists across sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        voice: { type: 'string', description: 'Voice name from list_voices' },
      },
      required: ['voice'],
    },
  },
  {
    name: 'upload_voice_sample',
    description: 'Upload a WAV file to the TTS server for voice cloning.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the WAV sample' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'get_tts_settings',
    description: 'Get current TTS engine settings (speed, temperature, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_tts_settings',
    description: 'Adjust TTS engine settings.',
    inputSchema: {
      type: 'object',
      properties: {
        stream_chunk_size: { type: 'integer' },
        temperature: { type: 'number' },
        speed: { type: 'number' },
        length_penalty: { type: 'number' },
        repetition_penalty: { type: 'number' },
        top_p: { type: 'number' },
        top_k: { type: 'integer' },
        enable_text_splitting: { type: 'boolean' },
      },
    },
  },
  {
    name: 'mute',
    description: 'Mute voice output. speak calls will silently return until unmuted.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'unmute',
    description: 'Resume voice output.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_personality',
    description: 'Get the raw personality YAML with placeholders intact.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_personality',
    description: 'Update personality fields. Changes take effect next session.',
    inputSchema: {
      type: 'object',
      properties: {
        companionName: { type: 'string', description: 'The companion character name' },
        personality: { type: 'string', description: 'The full personality markdown template. Use {{userName}} and {{companionName}} as placeholders.' },
      },
    },
  },
];

// ── Tool handlers ───────────────────────────────────────────────────────────

async function handleTool(name, args) {
  const ttsBase = getTtsUrl();

  switch (name) {
    case 'speak': {
      if (muted) return { content: [] };
      await speak({ text: args.text, voice: args.voice, pluginRoot: PLUGIN_ROOT });
      return { content: [] };
    }

    case 'play_audio': {
      play(args.file_path);
      return text(`Played: ${args.file_path}`);
    }

    case 'list_voices': {
      const res = await fetch(`${ttsBase}/speakers`);
      if (!res.ok) throw new Error(`Failed to fetch speakers (${res.status})`);
      const speakers = await res.json();
      const current = getVoice(PLUGIN_ROOT);
      const list = speakers.map(s => s.name === current ? `${s.name} (active)` : s.name).sort();
      return text(list.join('\n'));
    }

    case 'set_voice': {
      setVoice(PLUGIN_ROOT, args.voice);
      return text(`Voice set to: ${args.voice}`);
    }

    case 'upload_voice_sample': {
      const fileData = readFileSync(args.file_path);
      const formData = new FormData();
      formData.append('wavFile', new Blob([fileData]), args.file_path.split(/[/\\]/).pop());
      const res = await fetch(`${ttsBase}/upload_sample`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
      return text(`Uploaded: ${args.file_path}`);
    }

    case 'get_tts_settings': {
      const res = await fetch(`${ttsBase}/get_tts_settings`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return text(JSON.stringify(await res.json(), null, 2));
    }

    case 'set_tts_settings': {
      const res = await fetch(`${ttsBase}/set_tts_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Failed (${res.status}): ${await res.text()}`);
      return text('TTS settings updated.');
    }

    case 'mute': {
      muted = true;
      return text('Voice muted.');
    }

    case 'unmute': {
      muted = false;
      return text('Voice unmuted.');
    }

    case 'get_personality': {
      const { companionName, personality } = readPersonality(PLUGIN_ROOT);
      const indented = personality.replace(/^/gm, '  ');
      return text(`companionName: ${companionName}\npersonality: |\n${indented}`);
    }

    case 'update_personality': {
      const current = readPersonality(PLUGIN_ROOT);
      writePersonality(PLUGIN_ROOT, {
        companionName: args.companionName ?? current.companionName,
        personality: args.personality ?? current.personality,
      });
      return text('Personality updated. Changes take effect next session.');
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function text(str) {
  return { content: [{ type: 'text', text: str }] };
}

// ── Server setup ────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'aela-voice', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleTool(name, args);
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
