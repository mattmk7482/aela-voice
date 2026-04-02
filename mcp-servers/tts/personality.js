import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Parse the personality YAML. Handles our simple two-field format:
 *   companionName: <value>
 *   personality: |
 *     <indented multiline>
 */
export function readPersonality(pluginRoot) {
  const yamlPath = join(pluginRoot, 'personality', 'default.yaml');
  const content = readFileSync(yamlPath, 'utf-8');

  const nameMatch = content.match(/^companionName:\s*(.+)$/m);
  const companionName = nameMatch?.[1]?.trim() ?? 'Aela';

  const personalityMatch = content.match(/^personality:\s*\|\n([\s\S]*)$/m);
  const personality = personalityMatch?.[1]?.replace(/^  /gm, '') ?? '';

  return { companionName, personality };
}

/**
 * Write personality YAML back to disk. Preserves placeholder syntax.
 */
export function writePersonality(pluginRoot, { companionName, personality }) {
  const yamlPath = join(pluginRoot, 'personality', 'default.yaml');
  const indented = personality.replace(/^/gm, '  ');
  const content = `companionName: ${companionName}\npersonality: |\n${indented}\n`;
  writeFileSync(yamlPath, content, 'utf-8');
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
