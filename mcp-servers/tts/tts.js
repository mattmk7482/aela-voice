import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { playAndDelete } from './playback.js';
import { getTtsUrl, getVoice } from './config.js';

// ── Sentence splitting ──────────────────────────────────────────────────────

export function splitSentences(text) {
  const sentences = [];
  const re = /[^.!?]*[.!?]+(?:\s|$)/g;
  let match;
  let last = 0;

  while ((match = re.exec(text)) !== null) {
    sentences.push(match[0].trim());
    last = match.index + match[0].length;
  }

  const remainder = text.slice(last).trim();
  if (remainder.length > 0) sentences.push(remainder);

  return sentences.filter(s => s.length > 0);
}

// ── TTS fetch ───────────────────────────────────────────────────────────────

export async function fetchTTS(text, voice, retries = 2) {
  const ttsBase = getTtsUrl();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${ttsBase}/tts_to_audio/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'close',
        },
        body: JSON.stringify({
          text,
          speaker_wav: `${voice}.wav`,
          language: 'en',
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`TTS request failed (${response.status}): ${body}`);
      }

      const buffer = await response.arrayBuffer();
      const tmpPath = join(tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
      writeFileSync(tmpPath, Buffer.from(buffer));
      return tmpPath;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Speak ───────────────────────────────────────────────────────────────────

export async function speak({ text, voice, pluginRoot }) {
  const activeVoice = voice ?? getVoice(pluginRoot);
  const sentences = splitSentences(text);
  if (sentences.length === 0) return;

  const fetchPromises = [];
  let fetchChain = Promise.resolve(null);

  for (const sentence of sentences) {
    fetchChain = fetchChain.then(() => fetchTTS(sentence, activeVoice));
    fetchPromises.push(fetchChain);
  }

  for (const fetchPromise of fetchPromises) {
    const filePath = await fetchPromise;
    playAndDelete(filePath);
  }
}
