const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../main/cld.js');

function configuredHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-e2e-'));
  const dir = path.join(home, '.cld');
  fs.mkdirSync(path.join(dir, 'system'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'system', 'systemprompt.md'), 'You are CLD.');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    version: 3,
    apiKey: 'fake-key',
    model: 'fake/model',
    modelName: 'Fake',
    contextLength: 8192,
    outputStyle: 'default',
    permissions: { allowDestructive: false, allowExternalPaths: false, autoApproveTools: [] },
  }));
  return home;
}

test('non-interactive CLI runs a mocked full response and exits successfully', () => {
  const home = configuredHome();
  const mock = path.join(home, 'mock-fetch.cjs');
  fs.writeFileSync(mock, `global.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"mocked answer"}}]}\\n\\ndata: [DONE]\\n\\n',{status:200});`);
  const result = spawnSync(process.execPath, ['--require', mock, cli, '-p', 'hello'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /mocked answer/u);
});

test('--spawn uses the same mocked recursive agent path', () => {
  const home = configuredHome();
  const mock = path.join(home, 'mock-fetch.cjs');
  fs.writeFileSync(mock, `global.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"subagent done"}}]}\\n\\ndata: [DONE]\\n\\n',{status:200});`);
  const result = spawnSync(process.execPath, ['--require', mock, cli, '--spawn', 'inspect project'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /subagent done/u);
});

test('CLI rejects a missing non-interactive prompt with a nonzero exit', () => {
  const home = configuredHome();
  const result = spawnSync(process.execPath, [cli, '-p'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a prompt/u);
});
