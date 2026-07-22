const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cld-edge-'));
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
  permissions: { allowDestructive: false, allowExternalPaths: false, autoApproveTools: [] },
};

function readlineWith(answer, counter) {
  return { question(_prompt, callback) { if (counter) counter.count++; callback(answer); } };
}

function captureConsole(run) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return Promise.resolve().then(run).then(result => ({ result, output: lines.join('\n') })).finally(() => { console.log = original; });
}

test('every advertised command is backed by the exact registry used by help', async () => {
  const messages = [{ role: 'system', content: 'system' }];
  const help = await captureConsole(() => cld.handleSlashCommand('help', ['/help'], config, messages, readlineWith('n')));
  for (const command of cld.COMMAND_META) assert.match(help.output, new RegExp(command.usage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('named sessions and memory persist through slash handlers', async () => {
  const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'remember this turn' }];
  await cld.handleSlashCommand('session', ['/session', 'save', 'demo'], config, messages, readlineWith('n'));
  messages.splice(1);
  const loaded = await cld.handleSlashCommand('session', ['/session', 'load', 'demo'], config, messages, readlineWith('n'));
  assert.equal(loaded, 'messages_modified');
  assert.equal(messages.some(message => /remember this turn/u.test(message.content || '')), true);
  await cld.handleSlashCommand('memory', ['/memory', 'add', 'language', 'JavaScript'], config, messages, readlineWith('n'));
  assert.match(cld.buildSystemPrompt(config), /language: JavaScript/u);
  await cld.handleSlashCommand('memory', ['/memory', 'del', 'language'], config, messages, readlineWith('n'));
  assert.doesNotMatch(cld.buildSystemPrompt(config), /language: JavaScript/u);
});

test('unsafe shell commands ask and safe read-only commands do not', async () => {
  const project = fs.mkdtempSync(path.join(sandbox, 'shell-'));
  const previous = process.cwd();
  process.chdir(project);
  try {
    const deniedCounter = { count: 0 };
    const denied = await cld.executeTool('execute_command', { command: 'printf unsafe' }, config, readlineWith('n', deniedCounter));
    assert.match(denied, /denied/u);
    assert.equal(deniedCounter.count, 1);
    const compoundCounter = { count: 0 };
    const compound = await cld.executeTool('execute_command', { command: 'git status; printf bypass' }, config, readlineWith('n', compoundCounter));
    assert.match(compound, /denied/u);
    assert.equal(compoundCounter.count, 1);
    const safeCounter = { count: 0 };
    const safe = await cld.executeTool('execute_command', { command: 'pwd' }, config, readlineWith('n', safeCounter));
    assert.match(safe, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(safeCounter.count, 0);
  } finally {
    process.chdir(previous);
  }
});

test('invalid plugin files are visible as diagnostics and never become tools', () => {
  const pluginDir = path.join(sandbox, '.cld', 'plugins');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'bad.json'), JSON.stringify({ name: 'bad' }));
  cld.refreshPluginTools();
  const plugin = cld.loadPlugins().find(item => item.name === 'bad');
  assert.ok(plugin.invalid);
  assert.equal(cld.TOOLS.some(tool => tool.function.name === 'plugin_bad'), false);
});

test('plugin process cannot inherit the OpenRouter key', async () => {
  process.env.OPENROUTER_API_KEY = 'secret-value';
  const pluginFile = path.join(sandbox, 'env-plugin.js');
  fs.writeFileSync(pluginFile, `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(String(process.env.OPENROUTER_API_KEY)))`);
  cld.installPlugin('envcheck', `${process.execPath} ${pluginFile}`);
  const result = await cld.executePluginTool('plugin_envcheck', {});
  assert.equal(result, 'undefined');
  cld.removePlugin('envcheck');
  delete process.env.OPENROUTER_API_KEY;
});

test('search result parser decodes DuckDuckGo redirect URLs without shell tools', () => {
  const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example &amp; Docs</a>`;
  assert.deepEqual(cld.parseSearchResults(html), [{ title: 'Example & Docs', url: 'https://example.com/docs' }]);
});

test('OpenRouter streaming retries an initial transient HTTP failure', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) return new Response('busy', { status: 503 });
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });
  };
  try {
    let text = '';
    for await (const chunk of cld.streamChat('test/model', [{ role: 'user', content: 'x' }], 'key', [])) {
      text += chunk.choices?.[0]?.delta?.content || '';
    }
    assert.equal(text, 'ok');
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('invalid tool-call JSON becomes an explicit tool result instead of empty arguments', async () => {
  const originalFetch = global.fetch;
  const responses = [
    [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', function: { name: 'read_file', arguments: '{bad' } }] } }] }],
    [{ choices: [{ delta: { content: 'handled' } }] }],
  ];
  global.fetch = async () => {
    const events = responses.shift();
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200 });
  };
  try {
    const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'x' }];
    await cld.runAgentLoop(messages, config, readlineWith('n'), { print: false });
    assert.equal(messages.some(message => message.role === 'tool' && /Invalid JSON arguments/u.test(message.content)), true);
  } finally {
    global.fetch = originalFetch;
  }
});
