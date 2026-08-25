// Backend adapter. Two TTS servers, two dialects: the XTTS-compatible surface
// (/speakers, /tts_to_audio/, /sample/*, /upload_sample) and Chatterbox
// (/get_reference_files, /get_predefined_voices, /tts). This module probes the
// server once per base URL and translates, so switching is only the URL.

import { dbToGain } from './gain.js';

// Chatterbox renders ~11 dB below the XTTS server on identical text, with
// ~10 dB of peak headroom. See gain.js for why this is fixed, not per-clip.
const OUTPUT_GAIN_DB = {
  xtts: 0,
  chatterbox: 8,
};

const cache = new Map();

async function probe(base) {
  try {
    const res = await fetch(`${base}/speakers`);
    if (res.ok) return 'xtts';
  } catch { /* fall through */ }
  const res = await fetch(`${base}/get_reference_files`);
  if (res.ok) return 'chatterbox';
  throw new Error(`Unrecognised TTS server at ${base}`);
}

export async function backendOf(base) {
  if (!cache.has(base)) cache.set(base, await probe(base));
  return cache.get(base);
}

export async function outputGain(base) {
  return dbToGain(OUTPUT_GAIN_DB[await backendOf(base)] ?? 0);
}

const stripWav = f => f.replace(/\.wav$/i, '');

async function json(base, path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

// Chatterbox keeps cloned references and built-in voices in separate stores;
// which one a name lives in decides the voice_mode at synth time.
async function chatterboxVoices(base) {
  const [refs, predefined] = await Promise.all([
    json(base, '/get_reference_files'),
    json(base, '/get_predefined_voices'),
  ]);
  return {
    clone: refs.map(stripWav),
    predefined: predefined.map(v => stripWav(v.filename)),
  };
}

export async function listSpeakers(base) {
  if (await backendOf(base) === 'xtts') return json(base, '/speakers');
  const { clone, predefined } = await chatterboxVoices(base);
  // A name can exist in both stores. synthesize() resolves clone-first, so the
  // predefined twin is unreachable — list each name once rather than offering
  // a choice that doesn't exist.
  const seen = new Set();
  return [...clone, ...predefined]
    .filter(name => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .map(name => ({ name }));
}

export async function sampleExists(base, filename) {
  if (await backendOf(base) === 'xtts') {
    const res = await fetch(`${base}/sample/${filename}`, { method: 'HEAD' });
    if (res.ok) return true;
    // The XTTS box answers HEAD /sample/<f> with not-found for samples it does
    // hold, so a miss here is not proof. The speaker list is what synthesis
    // actually resolves against — treat it as authoritative before re-uploading.
    const speakers = await json(base, '/speakers');
    return speakers.some(s => s.name?.toLowerCase() === stripWav(filename).toLowerCase());
  }
  const refs = await json(base, '/get_reference_files');
  return refs.some(f => f.toLowerCase() === filename.toLowerCase());
}

export async function uploadSample(base, filename, bytes) {
  const formData = new FormData();
  if (await backendOf(base) === 'xtts') {
    formData.append('wavFile', new Blob([bytes]), filename);
    return fetch(`${base}/upload_sample`, { method: 'POST', body: formData });
  }
  formData.append('files', new Blob([bytes]), filename);
  return fetch(`${base}/upload_reference`, { method: 'POST', body: formData });
}

export async function synthesize(base, { text, voice, language = 'en' }) {
  if (await backendOf(base) === 'xtts') {
    return fetch(`${base}/tts_to_audio/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ text, speaker_wav: `${voice}.wav`, language }),
    });
  }

  const { clone } = await chatterboxVoices(base);
  const isClone = clone.some(v => v.toLowerCase() === voice.toLowerCase());
  const body = isClone
    ? { voice_mode: 'clone', reference_audio_filename: `${voice}.wav` }
    : { voice_mode: 'predefined', predefined_voice_id: `${voice}.wav` };

  return fetch(`${base}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    // Sentences arrive pre-split from splitSentences(), so let the server
    // chunk anything long rather than returning a truncated clip.
    body: JSON.stringify({ text, output_format: 'wav', split_text: true, language, ...body }),
  });
}

export async function getSettings(base) {
  if (await backendOf(base) === 'xtts') return json(base, '/get_tts_settings');
  const data = await json(base, '/api/ui/initial-data');
  return { ...data.config.generation_defaults, device: data.config.tts_engine.device };
}

export async function setSettings(base, settings) {
  const path = await backendOf(base) === 'xtts' ? '/set_tts_settings' : '/save_settings';
  const body = await backendOf(base) === 'xtts'
    ? settings
    : { generation_defaults: settings };
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
