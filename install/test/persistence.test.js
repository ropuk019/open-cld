const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-persist-'));
const legacy = path.join(home, '.cld');
fs.mkdirSync(path.join(legacy, 'System'), { recursive: true });
fs.mkdirSync(path.join(legacy, 'Skills'), { recursive: true });
fs.writeFileSync(path.join(legacy, 'System', 'systemprompt.md'), 'legacy prompt');
fs.writeFileSync(path.join(legacy, 'Skills', 'legacy.json'), JSON.stringify({ name: 'Legacy', prompt: 'legacy instructions' }));
fs.writeFileSync(path.join(legacy, 'config.json'), JSON.stringify({ apiKey: 'stored', model: 'x', modelName: 'X', contextLength: 8192, permissions: {} }));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.NO_COLOR = '1';

const cld = require('../main/cld.js');

test('legacy uppercase layout is backed up and copied to canonical lowercase paths once', () => {
  assert.equal(fs.readFileSync(path.join(legacy, 'system', 'systemprompt.md'), 'utf8'), 'legacy prompt');
  assert.equal(fs.existsSync(path.join(legacy, 'skills', 'legacy.json')), true);
  assert.equal(fs.existsSync(path.join(legacy, '.migrated-v3')), true);
  assert.equal(fs.readdirSync(legacy).some(name => name.startsWith('backup-v2-')), true);
});

test('environment API key is used at runtime but never persisted by saveConfig', () => {
  process.env.OPENROUTER_API_KEY = 'environment-secret';
  const config = cld.loadConfig();
  assert.equal(config.apiKey, 'environment-secret');
  cld.saveConfig(config);
  const persisted = JSON.parse(fs.readFileSync(path.join(legacy, 'config.json'), 'utf8'));
  assert.equal(persisted.apiKey, '');
  delete process.env.OPENROUTER_API_KEY;
});

test('corrupt JSON is surfaced and preserved as a timestamped backup', () => {
  const configFile = path.join(legacy, 'config.json');
  fs.writeFileSync(configFile, '{broken');
  assert.throws(() => cld.loadConfig(), /Invalid JSON/u);
  assert.equal(fs.readdirSync(legacy).some(name => name.startsWith('config.json.corrupt-')), true);
});
