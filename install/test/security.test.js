const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-security-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.NO_COLOR = '1';
const cld = require('../main/cld.js');

const config = {
  apiKey: 'x', model: 'x', modelName: 'x', contextLength: 8192, outputStyle: 'default',
  permissions: { allowDestructive: false, allowExternalPaths: false, autoApproveTools: [] },
};

function denyCounter(counter) {
  return { question(_prompt, callback) { counter.count++; callback('n'); } };
}

test('a custom test command cannot bypass shell approval', async () => {
  const project = fs.mkdtempSync(path.join(home, 'tests-'));
  const previous = process.cwd();
  process.chdir(project);
  const counter = { count: 0 };
  try {
    const result = await cld.executeTool('run_tests', { test_command: 'printf custom' }, config, denyCounter(counter));
    assert.match(result, /denied/u);
    assert.equal(counter.count, 1);
  } finally {
    process.chdir(previous);
  }
});

test('a workspace symlink cannot bypass external-path approval', async () => {
  const project = fs.mkdtempSync(path.join(home, 'project-'));
  const outside = fs.mkdtempSync(path.join(home, 'outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.symlinkSync(outside, path.join(project, 'link'), 'dir');
  const previous = process.cwd();
  process.chdir(project);
  const counter = { count: 0 };
  try {
    const result = await cld.executeTool('read_file', { file_path: 'link/secret.txt' }, config, denyCounter(counter));
    assert.match(result, /denied/u);
    assert.equal(counter.count, 1);
  } finally {
    process.chdir(previous);
  }
});
