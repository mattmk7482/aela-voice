import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

/**
 * Parse the personality YAML.
 */
export function readPersonality(pluginRoot) {
  const yamlPath = join(pluginRoot, 'personality', 'default.yaml');
  const doc = YAML.parse(readFileSync(yamlPath, 'utf-8'));
  return {
    companionName: doc?.companionName ?? 'Aela',
    personality: doc?.personality ?? '',
  };
}

/**
 * Write personality YAML back to disk. Preserves placeholder syntax.
 */
export function writePersonality(pluginRoot, { companionName, personality }) {
  const yamlPath = join(pluginRoot, 'personality', 'default.yaml');
  writeFileSync(yamlPath, YAML.stringify({ companionName, personality }), 'utf-8');
}

/**
 * Build the final personality text with placeholders resolved.
 */
export function buildPersonality(pluginRoot, userName) {
  const { companionName, personality } = readPersonality(pluginRoot);
  return personality
    .replace(/\{\{companionName\}\}/g, companionName)
    .replace(/\{\{userName\}\}/g, userName);
}
