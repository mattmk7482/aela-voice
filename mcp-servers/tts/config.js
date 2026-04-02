import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_VOICE = 'aela-default';

/**
 * Read plugin config from Claude Code's settings.json.
 * Searches pluginConfigs for any key matching "aela-voice@*".
 */
export function loadPluginConfig() {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const configs = settings.pluginConfigs ?? {};
    const key = Object.keys(configs).find(k => k.startsWith('aela-voice@'));
    return key ? (configs[key].options ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * Get TTS server URL from plugin config, falling back to env var.
 */
export function getTtsUrl() {
  const config = loadPluginConfig();
  return config.ttsServerUrl
    ?? process.env.AELA_TTS_URL
    ?? 'http://localhost:8020';
}

/**
 * Get the user's name from plugin config.
 */
export function getUserName() {
  const config = loadPluginConfig();
  return config.userName ?? 'friend';
}

/**
 * Get the active voice from personality/voice.txt.
 */
export function getVoice(pluginRoot) {
  try {
    return readFileSync(join(pluginRoot, 'personality', 'voice.txt'), 'utf-8').trim() || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/**
 * Set the active voice to personality/voice.txt.
 */
export function setVoice(pluginRoot, voice) {
  writeFileSync(join(pluginRoot, 'personality', 'voice.txt'), voice, 'utf-8');
}
