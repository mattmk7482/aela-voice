import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_VOICE = 'aela-default';
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const PLUGIN_KEY_PREFIX = 'aela-voice@';

function readPluginConfig() {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    const configs = settings.pluginConfigs ?? {};
    const key = Object.keys(configs).find(k => k.startsWith(PLUGIN_KEY_PREFIX));
    return key ? (configs[key].options ?? {}) : {};
  } catch {
    return {};
  }
}

function writePluginConfig(options) {
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch { /* start fresh */ }
  const configs = settings.pluginConfigs ?? {};
  const key = Object.keys(configs).find(k => k.startsWith(PLUGIN_KEY_PREFIX));
  const configKey = key ?? 'aela-voice@local';
  const existing = configs[configKey]?.options ?? {};
  configs[configKey] = { options: { ...existing, ...options } };
  settings.pluginConfigs = configs;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getTtsUrl() {
  const config = readPluginConfig();
  return config.ttsServerUrl ?? 'http://localhost:8020';
}

export function getVoice() {
  const config = readPluginConfig();
  return config.voice ?? DEFAULT_VOICE;
}

export function setVoice(voice) {
  writePluginConfig({ voice });
}

export function setTtsUrl(url) {
  writePluginConfig({ ttsServerUrl: url });
}
