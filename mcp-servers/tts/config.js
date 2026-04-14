import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_VOICE = 'aela-default';
const USER_STATE_DIR = join(homedir(), '.claude', 'aela-plugin');
const USER_SETTINGS_PATH = join(USER_STATE_DIR, 'settings.json');
const USER_PERSONALITY_PATH = join(USER_STATE_DIR, 'personality.yaml');

/**
 * Read the user's settings.json from the user state dir.
 * Returns an empty object if the file doesn't exist.
 */
function readSettings() {
  if (!existsSync(USER_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Write settings.json to the user state dir. Creates the dir if absent.
 */
function writeSettings(settings) {
  mkdirSync(USER_STATE_DIR, { recursive: true });
  writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Read plugin config from Claude Code's settings.json for legacy fallback.
 * Searches pluginConfigs for any key matching "aela-voice@*".
 */
function loadLegacyPluginConfig() {
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
 * Get TTS server URL.
 * Priority: user settings.json → env var → legacy pluginConfig → default.
 */
export function getTtsUrl() {
  const userSettings = readSettings();
  if (userSettings.ttsServerUrl) return userSettings.ttsServerUrl;
  if (process.env.AELA_TTS_URL) return process.env.AELA_TTS_URL;
  const legacy = loadLegacyPluginConfig();
  return legacy.ttsServerUrl ?? 'http://localhost:8020';
}

/**
 * Get the user's name.
 * Priority: personality.yaml user_name → legacy pluginConfig → 'friend'.
 */
export function getUserName() {
  if (existsSync(USER_PERSONALITY_PATH)) {
    try {
      const content = readFileSync(USER_PERSONALITY_PATH, 'utf-8');
      const match = content.match(/^user_name:\s*["']?([^"'\n]*?)["']?\s*$/m);
      if (match && match[1]) return match[1];
    } catch { /* fall through */ }
  }
  const legacy = loadLegacyPluginConfig();
  return legacy.userName ?? 'friend';
}

/**
 * Get the active voice.
 * Priority: user settings.json → legacy plugin/personality/voice.txt → default.
 */
export function getVoice(pluginRoot) {
  const userSettings = readSettings();
  if (userSettings.voice) return userSettings.voice;
  try {
    return readFileSync(join(pluginRoot, 'personality', 'voice.txt'), 'utf-8').trim() || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/**
 * Set the active voice in user settings.json.
 */
export function setVoice(pluginRoot, voice) {
  const settings = readSettings();
  settings.voice = voice;
  writeSettings(settings);
}
