const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-test-'));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
process.env.NO_COLOR = '1';

const cld = require('../main/cld.js');

const config = {
  version: 3,
  apiKey: 'test-key',
  model: 'test/model',
  modelName: 'Test Model',
  contextLength: 8192,
  outputStyle: 'default',
  permissions: {
    allowDestructive: false,
    allowExternalPaths: false,
    autoApproveTools: ['read_file', 'list_files', 'search_content', 'search_file', 'git_diff', 'run_tests'],
  },
};

function approvingReadline(answer = 'y') {
  return { question(_prompt, callback) { callback(answer); } };
}

function captureConsole(run) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return Promise.resolve()
    .then(run)
    .then(result => ({ result, output: lines.join('\n') }))
    .finally(() => { console.log = original; });
}

test('package executable and version work without setup', () => {
  const cli = path.resolve(__dirname, '../main/cld.js');
  assert.equal(fs.existsSync(cli), true);
  assert.equal(fs.statSync(cli).mode & 0o111, 0o111);
  const output = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8', env: { ...process.env, HOME: sandbox } });
  assert.match(output, /^CLD v3\.0\.0/m);
});

test('slash metadata has unique exact names and advertised handlers', () => {
  const names = cld.COMMAND_META.map(command => command.name);
  assert.equal(new Set(names).size, names.length);
  for (const required of ['help', 'clear', 'compact', 'memory', 'session', 'review', 'security', 'spawn', 'skills', 'plugins', 'doctor', 'exit']) {
    assert.equal(names.includes(required), true, `missing /${required}`);
  }
});

test('command parser preserves quoted arguments and rejects unclosed quotes', () => {
  assert.deepEqual(cld.parseCommandLine(`/plugins install demo "node plugin.js"`), ['/plugins', 'install', 'demo', 'node plugin.js']);
  assert.throws(() => cld.parseCommandLine(`/review "broken`), /Unclosed/u);
});

test('slash review injects work and unknown partial names do not dispatch', async () => {
  const messages = [{ role: 'system', content: 'system' }];
  const review = await cld.handleSlashCommand('review', ['/review', 'src'], config, messages, approvingReadline());
  assert.equal(review.inject.role, 'user');
  assert.match(review.inject.content, /Review src/u);
  const spawn = await cld.handleSlashCommand('spawn', ['/spawn', 'fix', 'tests'], config, messages, approvingReadline());
  assert.equal(spawn.spawnTask, 'fix tests');
  const unknown = await captureConsole(() => cld.handleSlashCommand('rev', ['/rev'], config, messages, approvingReadline()));
  assert.equal(unknown.result, undefined);
  assert.match(unknown.output, /Unknown command/u);
});

test('file tools enforce exact edits, ranges, overwrite, and external approval', async () => {
  const project = fs.mkdtempSync(path.join(sandbox, 'project-'));
  const previous = process.cwd();
  process.chdir(project);
  try {
    let result = await cld.executeTool('write_file', { file_path: 'a.txt', content: 'one\ntwo\nthree' }, config, approvingReadline());
    assert.match(result, /Wrote/u);
    result = await cld.executeTool('write_file', { file_path: 'a.txt', content: 'replace' }, config, approvingReadline());
    assert.match(result, /overwrite=true/u);
    result = await cld.executeTool('read_file', { file_path: 'a.txt', offset: 1, limit: 1 }, config, approvingReadline());
    assert.match(result, /two/u);
    assert.doesNotMatch(result, /three/u);
    result = await cld.executeTool('edit_file', { file_path: 'a.txt', old_string: 'two', new_string: 'TWO' }, config, approvingReadline());
    assert.match(result, /Applied one exact edit/u);
    assert.equal(fs.readFileSync('a.txt', 'utf8'), 'one\nTWO\nthree');
    result = await cld.executeTool('read_file', { file_path: path.join(sandbox, 'outside.txt') }, config, approvingReadline('n'));
    assert.match(result, /denied/u);
  } finally {
    process.chdir(previous);
  }
});

test('glob and search tools handle patterns without shell dependencies', async () => {
  const project = fs.mkdtempSync(path.join(sandbox, 'search-'));
  fs.mkdirSync(path.join(project, 'src'));
  fs.writeFileSync(path.join(project, 'src', 'one.js'), 'const alpha = 1;\n');
  fs.writeFileSync(path.join(project, 'src', 'two.txt'), 'alpha\n');
  const previous = process.cwd();
  process.chdir(project);
  try {
    const files = await cld.executeTool('search_file', { pattern: '**/*.js' }, config, approvingReadline());
    assert.match(files, /src\/one\.js/u);
    const content = await cld.executeTool('search_content', { pattern: 'alpha', directory: 'src' }, config, approvingReadline());
    assert.match(content, /one\.js:1/u);
    assert.match(content, /two\.txt:1/u);
  } finally {
    process.chdir(previous);
  }
});

test('skills use SKILL.md, are directly invocable, and expand arguments', async () => {
  const skill = cld.createSkill('Review Code', 'Review $ARGUMENTS carefully.');
  assert.equal(skill.command, 'review-code');
  const loaded = cld.loadSkills().find(item => item.command === 'review-code');
  assert.ok(loaded);
  const messages = [{ role: 'system', content: 'system' }];
  const invocation = await cld.handleSlashCommand('review-code', ['/review-code', 'src/app.js'], config, messages, approvingReadline());
  assert.match(invocation.inject.content, /Review src\/app\.js carefully/u);
  assert.equal(cld.deleteSkill('review-code'), true);
});

test('plugins register real tools and exchange JSON over stdin/stdout', async () => {
  const pluginFile = path.join(sandbox, 'echo-plugin.js');
  fs.writeFileSync(pluginFile, `let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const value=JSON.parse(input);process.stdout.write(JSON.stringify({content:'echo:'+value.value}))});`);
  cld.installPlugin('echo', `${process.execPath} ${pluginFile}`);
  assert.equal(cld.TOOLS.some(tool => tool.function.name === 'plugin_echo'), true);
  const result = await cld.executeTool('plugin_echo', { value: 'ok' }, config, approvingReadline());
  assert.match(result, /echo:ok/u);
  assert.equal(cld.setPluginEnabled('echo', false), true);
  assert.equal(cld.TOOLS.some(tool => tool.function.name === 'plugin_echo'), false);
  assert.equal(cld.removePlugin('echo'), true);
});

test('history repair drops orphan tool messages', () => {
  const repaired = cld.repairHistory([
    { role: 'tool', tool_call_id: 'missing', content: 'orphan' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'valid', type: 'function', function: { name: 'x', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'valid', content: 'kept' },
  ]);
  assert.equal(repaired.length, 2);
  assert.equal(repaired.at(-1).content, 'kept');
});

test('agent loop assembles streamed tool calls, executes them, and continues', async () => {
  const project = fs.mkdtempSync(path.join(sandbox, 'agent-'));
  fs.writeFileSync(path.join(project, 'note.txt'), 'hello');
  const previous = process.cwd();
  process.chdir(project);
  const responses = [
    [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_', arguments: '{"file_' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: 'path":"note.txt"}' } }] } }] },
      { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ],
    [
      { choices: [{ delta: { content: 'Finished.' } }] },
      { choices: [{ delta: {} }], usage: { prompt_tokens: 20, completion_tokens: 3 } },
    ],
  ];
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const events = responses.shift();
    const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'read note' }];
    const result = await cld.runAgentLoop(messages, config, approvingReadline(), { print: false });
    assert.equal(result.text, 'Finished.');
    assert.equal(result.tokensIn, 30);
    assert.equal(result.tokensOut, 8);
    assert.equal(messages.some(message => message.role === 'tool' && /hello/u.test(message.content)), true);
  } finally {
    global.fetch = originalFetch;
    process.chdir(previous);
  }
});

test('installer uses lowercase paths, preserves prompt, and creates a runnable symlink', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-install-'));
  const installRoot = path.resolve(__dirname, '..');
  const result = spawnSync('bash', [path.join(installRoot, 'install.sh'), '--no-modify-path'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLD_RAW_BASE: `file://${installRoot}` },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(home, '.cld', 'cld.js')), true);
  assert.equal(fs.existsSync(path.join(home, '.cld', 'system', 'systemprompt.md')), true);
  assert.equal(fs.existsSync(path.join(home, '.cld', 'System')), false);
  const promptFile = path.join(home, '.cld', 'system', 'systemprompt.md');
  fs.writeFileSync(promptFile, 'custom prompt\n');
  const reinstall = spawnSync('bash', [path.join(installRoot, 'install.sh'), '--no-modify-path'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLD_RAW_BASE: `file://${installRoot}` },
  });
  assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
  assert.equal(fs.readFileSync(promptFile, 'utf8'), 'custom prompt\n');
  const output = execFileSync(path.join(home, '.local', 'bin', 'cld'), ['--version'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.match(output, /CLD v3\.0\.0/u);
});
