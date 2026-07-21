#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  CLD v2.0 — Recursive Agent Loop CLI
//  Surpasses every other CLI. Zero deps. Self-correcting. Beautiful.
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────
// TUI ENGINE — Lightweight Terminal UI Component System
// ─────────────────────────────────────────────────────────────────
const tui = {
  width: () => process.stdout.columns || 80,
  height: () => process.stdout.rows || 24,

  colors: {
    reset: '\x1b[0m',
    bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m', underline: '\x1b[4m',
    black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
    bgBlack: '\x1b[40m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m', bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m', bgWhite: '\x1b[47m',
    brightRed: '\x1b[91m', brightGreen: '\x1b[92m', brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m', brightMagenta: '\x1b[95m', brightCyan: '\x1b[96m',
  },

  // Strip ANSI for length calculation
  strip(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); },

  // Pad a string to exact visual width
  pad(s, w, align = 'left') {
    const stripped = this.strip(s);
    const diff = w - stripped.length;
    if (diff <= 0) return s;
    if (align === 'right') return ' '.repeat(diff) + s;
    if (align === 'center') return ' '.repeat(Math.floor(diff/2)) + s + ' '.repeat(Math.ceil(diff/2));
    return s + ' '.repeat(diff);
  },

  // Truncate to visual width
  trunc(s, w) {
    const stripped = this.strip(s);
    if (stripped.length <= w) return s;
    let out = '', count = 0, inEscape = false;
    for (let i = 0; i < s.length && count < w - 3; i++) {
      if (s[i] === '\x1b') inEscape = true;
      if (!inEscape) { out += s[i]; count++; }
      else { out += s[i]; }
      if (inEscape && s[i] === 'm') inEscape = false;
    }
    return out + '...';
  },

  // Draw a horizontal line
  hLine(y, x, w, char = '─', color = '') {
    return `${this.cursorTo(x, y)}${color}${char.repeat(w)}${this.colors.reset}`;
  },

  // Move cursor
  cursorTo(x, y) { return `\x1b[${y};${x}H`; },
  cursorUp(n) { return `\x1b[${n}A`; },
  cursorDown(n) { return `\x1b[${n}B`; },
  clearScreen() { return '\x1b[2J\x1b[H'; },
  clearLine() { return '\x1b[2K'; },
  hideCursor() { return '\x1b[?25l'; },
  showCursor() { return '\x1b[?25h'; },
};

const c = tui.colors;
function strip(s) { return tui.strip(s); }

// ─────────────────────────────────────────────────────────────────
// CONFIGURATION PATHS
// ─────────────────────────────────────────────────────────────────
const CONFIG_DIR      = path.join(os.homedir(), '.cld');
const CONFIG_FILE     = path.join(CONFIG_DIR, 'config.json');
const HISTORY_FILE    = path.join(CONFIG_DIR, 'history.json');
const MEMORY_FILE     = path.join(CONFIG_DIR, 'memory.json');
const SKILLS_DIR      = path.join(CONFIG_DIR, 'skills');
const PLUGINS_DIR     = path.join(CONFIG_DIR, 'plugins');
const WORKSPACES_FILE = path.join(CONFIG_DIR, 'workspaces.json');
const TOKEN_LOG_FILE  = path.join(CONFIG_DIR, 'token_usage.json');
const EXPORTS_DIR     = path.join(CONFIG_DIR, 'exports');
const SYSTEM_DIR      = path.join(CONFIG_DIR, 'system');
const SYSTEM_PROMPT   = path.join(SYSTEM_DIR, 'systemprompt.md');
const BENCHMARKS_DIR  = path.join(CONFIG_DIR, 'benchmarks');

[CONFIG_DIR, SKILLS_DIR, PLUGINS_DIR, EXPORTS_DIR, SYSTEM_DIR, BENCHMARKS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
});

// ─────────────────────────────────────────────────────────────────
// JSON HELPERS
// ─────────────────────────────────────────────────────────────────
function loadJSON(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ─────────────────────────────────────────────────────────────────
// CONFIG / MEMORY / HISTORY
// ─────────────────────────────────────────────────────────────────
function loadConfig() { return loadJSON(CONFIG_FILE); }
function saveConfig(cfg) { saveJSON(CONFIG_FILE, cfg); }
function loadHistory() { return loadJSON(HISTORY_FILE, []); }
function saveHistory(h) { saveJSON(HISTORY_FILE, h); }
function loadMemory() { return loadJSON(MEMORY_FILE, {}); }
function saveMemory(m) { saveJSON(MEMORY_FILE, m); }
function loadWorkspaces() { return loadJSON(WORKSPACES_FILE, {}); }
function saveWorkspaces(w) { saveJSON(WORKSPACES_FILE, w); }
function loadTokenLog() {
  return loadJSON(TOKEN_LOG_FILE, { sessions: [], totalIn: 0, totalOut: 0 });
}
function saveTokenLog(tl) { saveJSON(TOKEN_LOG_FILE, tl); }

// ─────────────────────────────────────────────────────────────────
// OPENROUTER API
// ─────────────────────────────────────────────────────────────────
const OR_BASE = 'https://openrouter.ai/api/v1';

async function fetchOR(endpoint, apiKey, body = null, method = 'GET') {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/open-cld',
      'X-Title': 'CLD',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${OR_BASE}${endpoint}`, opts);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OR ${res.status}: ${errText.slice(0, 400)}`);
  }
  return res.json();
}

async function fetchAllModels(apiKey) {
  const data = await fetchOR('/models', apiKey);
  return data.data
    .filter(m => m.id.includes(':free'))
    .map(m => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length || 8192,
      pricing: m.pricing,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────
// STREAMING CHAT
// ─────────────────────────────────────────────────────────────────
async function* streamChat(model, messages, apiKey, tools, maxTokens = 8192) {
  const body = {
    model,
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = 'auto'; }

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/open-cld',
      'X-Title': 'CLD',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OR ${res.status}: ${errText.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file with line numbers. Always use this before editing any file.',
      parameters: {
        type: 'object',
        properties: { file_path: { type: 'string', description: 'Path to file' } },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace EXACT old_string with new_string in file. Must match including whitespace. Only first occurrence replaced.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          old_string: { type: 'string', description: 'EXACT text to replace' },
          new_string: { type: 'string' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Run a shell command. Set requires_approval:true for destructive ops.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          requires_approval: { type: 'boolean' },
        },
        required: ['command', 'requires_approval'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List directory contents with file/dir indicators.',
      parameters: {
        type: 'object',
        properties: { dir_path: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_content',
      description: 'Search for regex pattern recursively in files. Skips node_modules and hidden dirs.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          directory: { type: 'string', description: 'Default: current dir' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_file',
      description: 'Find files matching glob pattern (** for recursive, * for wildcard).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern like **/*.test.js' },
          directory: { type: 'string', description: 'Default: current dir' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the project test suite and return results. Detects test framework automatically.',
      parameters: {
        type: 'object',
        properties: {
          test_command: { type: 'string', description: 'Optional custom test command' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use for docs, errors, best practices.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git diff of current changes.',
      parameters: {
        type: 'object',
        properties: {
          staged_only: { type: 'boolean', description: 'Show only staged changes' },
        },
        required: [],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// TOOL EXECUTION ENGINE
// ─────────────────────────────────────────────────────────────────
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf/, /git\s+push\s+--force/, /git\s+reset\s+--hard/,
  /DROP\s+/, /DELETE\s+FROM/, /TRUNCATE\s+/, /:(){ :|:& };:/,
  />\s*\/dev\/sd/, /mkfs\./, /dd\s+if=/,
];

function isDestructive(cmd) {
  return DESTRUCTIVE_PATTERNS.some(p => p.test(cmd));
}

async function executeTool(name, args, config, rl) {
  switch (name) {
    // ── Read File ──────────────────────────────────────────
    case 'read_file': {
      const fp = args.file_path;
      if (!fs.existsSync(fp)) return `Error: File not found: ${fp}`;
      try {
        const content = fs.readFileSync(fp, 'utf8');
        const lines = content.split('\n');
        return `File: ${fp} (${lines.length} lines)\n${lines.map((l, i) => `${String(i+1).padStart(4)}│ ${l}`).join('\n')}`;
      } catch (e) { return `Error reading ${fp}: ${e.message}`; }
    }

    // ── Write File ─────────────────────────────────────────
    case 'write_file': {
      const fp = args.file_path;
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      try {
        fs.writeFileSync(fp, args.content, 'utf8');
        const lineCount = args.content.split('\n').length;
        return `Wrote ${lineCount} lines to ${fp}.`;
      } catch (e) { return `Error writing ${fp}: ${e.message}`; }
    }

    // ── Edit File ──────────────────────────────────────────
    case 'edit_file': {
      const fp = args.file_path;
      if (!fs.existsSync(fp)) return `Error: File not found: ${fp}`;
      try {
        let content = fs.readFileSync(fp, 'utf8');
        if (!content.includes(args.old_string)) {
          return `Error: old_string not found in ${fp}. Read the file first to get the exact string.`;
        }
        content = content.replace(args.old_string, args.new_string);
        fs.writeFileSync(fp, content, 'utf8');
        return `Applied edit to ${fp}. Replaced ${args.old_string.length} chars with ${args.new_string.length} chars.`;
      } catch (e) { return `Error editing ${fp}: ${e.message}`; }
    }

    // ── Execute Command ────────────────────────────────────
    case 'execute_command': {
      const cmd = args.command;
      const needsApproval = args.requires_approval || isDestructive(cmd);
      if (needsApproval && !config.permissions.allowDestructive) {
        console.log(`\n${c.brightYellow}⚠️  Destructive Command Detected${c.reset}`);
        console.log(`${c.yellow}   ${cmd}${c.reset}\n`);
        const answer = await askUser(rl, `${c.brightRed}Approve execution? [y/N]:${c.reset} `);
        if (answer.toLowerCase() !== 'y') return 'User denied command execution.';
      }
      try {
        const out = execSync(cmd, {
          timeout: 120000,
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          cwd: process.cwd(),
        });
        return out.length > 10000 ? out.slice(0, 10000) + '\n... (truncated)' : out;
      } catch (e) {
        const msg = `Exit code ${e.status}\nSTDOUT: ${e.stdout?.slice(0, 2000) || '(none)'}\nSTDERR: ${e.stderr?.slice(0, 2000) || '(none)'}`;
        return msg;
      }
    }

    // ── List Files ─────────────────────────────────────────
    case 'list_files': {
      const dp = args.dir_path || '.';
      if (!fs.existsSync(dp)) return `Error: Directory not found: ${dp}`;
      try {
        const items = fs.readdirSync(dp, { withFileTypes: true });
        const dirs = items.filter(i => i.isDirectory()).map(i => `📁 ${i.name}/`);
        const files = items.filter(i => i.isFile()).map(i => `📄 ${i.name}`);
        return `${dp}/\n${[...dirs, ...files].join('\n')}`;
      } catch (e) { return `Error: ${e.message}`; }
    }

    // ── Search Content ─────────────────────────────────────
    case 'search_content': {
      const dir = args.directory || '.';
      if (!fs.existsSync(dir)) return `Error: Not found: ${dir}`;
      try {
        const regex = new RegExp(args.pattern, 'g');
        const results = [];
        function walk(d) {
          for (const i of fs.readdirSync(d, { withFileTypes: true })) {
            const fp = path.join(d, i.name);
            if (i.isDirectory()) {
              if (!i.name.startsWith('.') && i.name !== 'node_modules' && i.name !== '.git') walk(fp);
            } else if (i.isFile() && !['.lock', '.min.js', '.map'].some(ext => i.name.endsWith(ext))) {
              try {
                const lines = fs.readFileSync(fp, 'utf8').split('\n');
                lines.forEach((l, idx) => { if (regex.test(l)) results.push(`${fp}:${idx+1}: ${l.trim().slice(0, 150)}`); });
                regex.lastIndex = 0;
              } catch {}
            }
          }
        }
        walk(dir);
        const max = 60;
        return results.length > 0
          ? results.slice(0, max).join('\n') + (results.length > max ? `\n... and ${results.length - max} more matches` : '')
          : `No matches for /${args.pattern}/ in ${dir}`;
      } catch (e) { return `Error: ${e.message}`; }
    }

    // ── Search File ────────────────────────────────────────
    case 'search_file': {
      const dir = args.directory || '.';
      if (!fs.existsSync(dir)) return `Error: Not found: ${dir}`;
      try {
        const results = [];
        function walk(d) {
          for (const i of fs.readdirSync(d, { withFileTypes: true })) {
            const fp = path.join(d, i.name);
            const rel = path.relative(dir, fp);
            if (i.isDirectory()) {
              if (!i.name.startsWith('.') && i.name !== 'node_modules' && i.name !== '.git') walk(fp);
            } else {
              const gRe = new RegExp('^' + args.pattern.replace(/\*\*/g, '<<DB>>').replace(/\*/g, '[^/]*').replace(/<<DB>>/g, '.*') + '$');
              if (gRe.test(rel) || gRe.test(i.name)) results.push(rel);
            }
          }
        }
        walk(dir);
        const max = 100;
        return results.length ? results.slice(0, max).join('\n') + (results.length > max ? `\n... and ${results.length - max} more` : '') : `No files matching "${args.pattern}"`;
      } catch (e) { return `Error: ${e.message}`; }
    }

    // ── Run Tests ──────────────────────────────────────────
    case 'run_tests': {
      const customCmd = args.test_command;
      let cmd;
      if (customCmd) {
        cmd = customCmd;
      } else if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        cmd = pkg.scripts?.test ? 'npm test' : (pkg.scripts?.lint ? 'npm run lint' : 'echo "No test script found in package.json"');
      } else if (fs.existsSync('Makefile')) {
        cmd = 'make test';
      } else if (fs.existsSync('Cargo.toml')) {
        cmd = 'cargo test';
      } else if (fs.existsSync('go.mod')) {
        cmd = 'go test ./...';
      } else {
        return 'No test framework detected. Specify test_command.';
      }
      try {
        const out = execSync(cmd, { timeout: 120000, encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: process.cwd() });
        return out.slice(0, 8000) || 'Tests passed (no output).';
      } catch (e) {
        return `Tests FAILED (exit ${e.status})\n${e.stdout?.slice(0, 3000) || ''}\n${e.stderr?.slice(0, 3000) || ''}`;
      }
    }

    // ── Web Search ─────────────────────────────────────────
    case 'web_search': {
      // Uses a free DuckDuckGo lite search (no API key needed)
      const query = encodeURIComponent(args.query);
      try {
        const out = execSync(
          `curl -s -L "https://lite.duckduckgo.com/lite/?q=${query}" 2>/dev/null | grep -oP '(?<=<a rel="nofollow" class="result-link" href=")[^"]*' | head -5`,
          { timeout: 15000, encoding: 'utf8', maxBuffer: 1024*1024 }
        );
        const links = out.trim().split('\n').filter(Boolean);
        if (links.length === 0) return `No results for "${args.query}".`;
        const summaries = [];
        for (const link of links.slice(0, 3)) {
          try {
            const html = execSync(`curl -s -L --max-time 5 "${link}" 2>/dev/null | sed 's/<[^>]*>//g' | head -20`, { timeout: 10000, encoding: 'utf8', maxBuffer: 512*1024 });
            const clean = html.replace(/\s+/g, ' ').trim().slice(0, 300);
            summaries.push(`${link}\n   ${clean}`);
          } catch { summaries.push(link); }
        }
        return `Search results for "${args.query}":\n\n${summaries.join('\n\n')}`;
      } catch (e) {
        return `Web search failed: ${e.message}. Try a different query.`;
      }
    }

    // ── Git Diff ───────────────────────────────────────────
    case 'git_diff': {
      const staged = args.staged_only ? ' --staged' : '';
      try {
        const out = execSync(`git diff${staged} --no-color`, { timeout: 10000, encoding: 'utf8', maxBuffer: 5*1024*1024, cwd: process.cwd() });
        return out || 'No changes (working tree clean).';
      } catch (e) {
        return `Git diff failed: ${e.message}. Are you in a git repository?`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────
function buildSystemPrompt(config) {
  // 1. Load the core system prompt from file
  let corePrompt;
  if (fs.existsSync(SYSTEM_PROMPT)) {
    corePrompt = fs.readFileSync(SYSTEM_PROMPT, 'utf8');
  } else {
    // Fallback if file doesn't exist (first run)
    corePrompt = `You are CLD, a recursively self-improving coding agent.
Operate in a Think → Plan → Act → Observe → Reflect → (Re)Plan loop.
Always think in <thinking> tags before any action.
Use tools aggressively. Verify results. Never guess.`;
  }

  // 2. Inject project CLAUDE.md
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const claudeMd = fs.readFileSync(claudeMdPath, 'utf8');
    corePrompt += `\n\n<!-- PROJECT CONTEXT (CLAUDE.md) -->\n${claudeMd.slice(0, 4000)}${claudeMd.length > 4000 ? '\n... (truncated)' : ''}`;
  }

  // 3. Inject persistent memory
  const memory = loadMemory();
  const memKeys = Object.keys(memory);
  if (memKeys.length > 0) {
    corePrompt += '\n\n<!-- PERSISTENT MEMORY -->\n';
    memKeys.forEach(k => { corePrompt += `- ${k}: ${memory[k]}\n`; });
    corePrompt += 'Use these memories when relevant.\n';
  }

  // 4. Inject active skills
  const skills = loadSkills();
  if (skills.length > 0) {
    corePrompt += '\n\n<!-- ACTIVE SKILLS -->\n';
    skills.forEach(s => { corePrompt += `- **${s.name}**: ${s.prompt}\n`; });
    corePrompt += 'Apply these skill behaviors when relevant to the task.\n';
  }

  // 5. Inject output style directive
  if (config.outputStyle === 'concise') {
    corePrompt += '\n\n<!-- STYLE: CONCISE -->\nBe extremely brief. Short answers. Code over explanation. No preamble.\n';
  } else if (config.outputStyle === 'explanatory') {
    corePrompt += '\n\n<!-- STYLE: EXPLANATORY -->\nBe thorough. Explain your reasoning. Teach the user. Provide context and alternatives.\n';
  }

  // 6. Workspace info
  corePrompt += `\n\nCurrent directory: ${process.cwd()}`;
  corePrompt += `\nDate: ${new Date().toLocaleString()}`;
  corePrompt += `\nModel: ${config.modelName}`;
  corePrompt += `\nContext window: ${Math.round(config.contextLength / 1024)}k tokens`;

  return corePrompt;
}

// ─────────────────────────────────────────────────────────────────
// SKILLS & PLUGINS
// ─────────────────────────────────────────────────────────────────
function loadSkills() {
  const skills = [];
  // Global skills
  if (fs.existsSync(SKILLS_DIR)) {
    for (const f of fs.readdirSync(SKILLS_DIR)) {
      if (f.endsWith('.json')) {
        try { skills.push(JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'))); } catch {}
      }
    }
  }
  // Project-local skills
  const localDir = path.join(process.cwd(), '.cld', 'skills');
  if (fs.existsSync(localDir)) {
    for (const f of fs.readdirSync(localDir)) {
      if (f.endsWith('.json')) {
        try { skills.push(JSON.parse(fs.readFileSync(path.join(localDir, f), 'utf8'))); } catch {}
      }
    }
  }
  return skills;
}

function createSkill(name, prompt) {
  const skill = { name, prompt, createdAt: new Date().toISOString() };
  const fp = path.join(SKILLS_DIR, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  saveJSON(fp, skill);
  return skill;
}

function deleteSkill(name) {
  const fp = path.join(SKILLS_DIR, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

function loadPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  const plugins = [];
  for (const f of fs.readdirSync(PLUGINS_DIR)) {
    if (f.endsWith('.json')) {
      try { plugins.push(JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, f), 'utf8'))); } catch {}
    }
  }
  return plugins;
}

function installPlugin(name, serverCommand, env = {}) {
  const plugin = { name, serverCommand, env, installedAt: new Date().toISOString(), enabled: true };
  const fp = path.join(PLUGINS_DIR, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  saveJSON(fp, plugin);
  return plugin;
}

function removePlugin(name) {
  const fp = path.join(PLUGINS_DIR, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

// ─────────────────────────────────────────────────────────────────
// INPUT HELPER
// ─────────────────────────────────────────────────────────────────
function askUser(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, answer => resolve(answer)));
}

// ─────────────────────────────────────────────────────────────────
// TOKEN ESTIMATION
// ─────────────────────────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil((text || '').length / 3.5);
}

// ─────────────────────────────────────────────────────────────────
// HEADER BAR RENDER
// ─────────────────────────────────────────────────────────────────
function renderHeader(config, messages) {
  const w = tui.width();
  const sessionTokens = messages.reduce((sum, m) =>
    sum + estimateTokens(m.content || '') + estimateTokens(JSON.stringify(m.tool_calls || '')), 0);
  const ctxPct = Math.min(100, Math.round((sessionTokens / config.contextLength) * 100));

  // Context bar
  const barW = 20;
  const filled = Math.round((ctxPct / 100) * barW);
  let barColor = c.brightGreen;
  if (ctxPct > 50) barColor = c.brightYellow;
  if (ctxPct > 80) barColor = c.brightRed;
  const bar = barColor + '█'.repeat(filled) + c.dim + '░'.repeat(barW - filled) + c.reset;

  const left = `${c.bold}⚡ CLD${c.reset} ${c.dim}│${c.reset} ${c.cyan}${config.modelName}${c.reset}`;
  const right = `${bar} ${ctxPct}% ctx`;

  const leftLen = strip(left);
  const rightLen = strip(right);
  const spacer = Math.max(1, w - leftLen - rightLen - 2);

  return `\n ${left}${' '.repeat(spacer)}${right}\n${c.dim} ${'─'.repeat(w - 2)}${c.reset}\n`;
}

// ─────────────────────────────────────────────────────────────────
// SETUP WIZARD
// ─────────────────────────────────────────────────────────────────
async function setupWizard(rl) {
  console.clear();
  const w = tui.width();

  console.log(`\n${c.bold}${c.brightCyan}  ⚡ CLD v2.0 — Recursive Agent Loop${c.reset}`);
  console.log(`${c.dim}  Surpassing every other CLI. Free. Self-correcting.${c.reset}\n`);
  console.log(`${c.yellow}  ${'─'.repeat(Math.min(50, w - 4))}${c.reset}\n`);

  let apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    console.log(`  ${c.white}Get your key: ${c.brightCyan}https://openrouter.ai/keys${c.reset}\n`);
    apiKey = await askUser(rl, `  ${c.bold}OpenRouter API Key:${c.reset} `);
    apiKey = apiKey.trim();
    if (!apiKey.startsWith('sk-or-')) {
      console.log(`\n  ${c.red}Invalid key. Must start with sk-or-${c.reset}`);
      process.exit(1);
    }
  }

  console.log(`\n  ${c.dim}Fetching available free models...${c.reset}`);
  let models;
  try { models = await fetchAllModels(apiKey); } catch (e) {
    console.log(`  ${c.red}Failed: ${e.message}${c.reset}`);
    process.exit(1);
  }

  if (models.length === 0) {
    console.log(`  ${c.red}No free models found. Check your API key.${c.reset}`);
    process.exit(1);
  }

  console.log(`\n  ${c.bold}${c.brightGreen}Available Free Models:${c.reset}\n`);
  models.forEach((m, i) => {
    const num = `${c.yellow}${String(i+1).padStart(3)}${c.reset}`;
    const ctx = `(${Math.round(m.context_length/1024)}k ctx)`;
    console.log(`  ${num}. ${c.brightCyan}${m.name}${c.reset} ${c.dim}${ctx}${c.reset}`);
  });

  console.log('');
  const choice = await askUser(rl, `  ${c.bold}Choose model [1-${models.length}]:${c.reset} `);
  const idx = parseInt(choice.trim(), 10);
  if (isNaN(idx) || idx < 1 || idx > models.length) {
    console.log(`  ${c.red}Invalid selection.${c.reset}`);
    process.exit(1);
  }

  const config = {
    apiKey,
    model: models[idx-1].id,
    modelName: models[idx-1].name,
    contextLength: models[idx-1].context_length,
    outputStyle: 'default',
    permissions: {
      allowDestructive: false,
      autoApproveTools: ['read_file', 'list_files', 'search_content', 'search_file', 'web_search', 'git_diff', 'run_tests'],
    },
    theme: 'dark',
    benchmarkMode: false,
    createdAt: new Date().toISOString(),
  };
  saveConfig(config);

  // Ensure system prompt file exists
  if (!fs.existsSync(SYSTEM_PROMPT)) {
    const defaultPrompt = `# CLD — The Recursive Agent Loop

You are CLD, a recursively self-improving coding agent engineered to solve tasks completely, correctly, and efficiently. You operate in a continuous **Think → Plan → Act → Observe → Reflect → (Re)Plan** loop until the task is done.

## Loop Protocol (Mandatory)
Every task follows this cycle. You never break out of it until verification passes.

1. **Understand** — Parse the user's intent. Identify unknowns. Ask clarifying questions only if essential.
2. **Think** — Before ANY tool call, write your reasoning inside \`<thinking>\` tags. This is non-negotiable.
3. **Plan** — Break the task into small, verifiable subtasks. List them. Execute one at a time.
4. **Act** — Use tools aggressively. Read files before editing. Search before assuming. Run commands to verify.
5. **Observe** — Read tool outputs fully. Do not skip. Do not hallucinate results.
6. **Reflect** — After each tool call: "Did this succeed? Is the result correct? If not, why?" Correct immediately.
7. **Verify** — When all subtasks complete, test the final result. If it fails, loop back to Plan.
8. **Report** — Summarize what was done, with evidence (file paths, command outputs, test results).

## Tool Usage Rules
- \`read_file\` before any edit. Always.
- \`edit_file\` with EXACT \`old_string\` matching including whitespace. If it fails, re-read the file.
- \`execute_command\` — mark destructive commands with \`requires_approval: true\`.
- If a tool fails twice, re-think your approach. Do not retry the same failing call.

## Code Quality Standards
- Write production-grade code. Handle errors. Validate inputs.
- Prefer immutability. \`const\` over \`let\`. Pure functions where possible.
- Follow existing project conventions (read CLAUDE.md if injected below).
- Generate tests before or alongside implementation. Run them.

## Self-Correction
- If you make a mistake, own it silently and fix it. Do not apologize.
- If you are uncertain about a file's contents, re-read it. Never assume.

## Output Style
Be direct. No fluff. Code over prose. Explain only when necessary.
Adapt your verbosity based on the output style setting.
`;
    fs.writeFileSync(SYSTEM_PROMPT, defaultPrompt, 'utf8');
  }

  console.log(`\n  ${c.brightGreen}✅ Saved: ${config.modelName}${c.reset}`);
  console.log(`  ${c.dim}System prompt: ${SYSTEM_PROMPT}${c.reset}`);
  console.log(`  ${c.yellow}  ${'─'.repeat(Math.min(50, w - 4))}${c.reset}\n`);
  return config;
}

// ─────────────────────────────────────────────────────────────────
// SLASH COMMAND HANDLER
// ─────────────────────────────────────────────────────────────────
async function handleSlashCommand(cmd, args, config, messages, rl) {
  const fullCmd = cmd.toLowerCase();
  const rest = args.slice(1).join(' ');

  const commands = {
    help: () => {
      const cmds = [
        ['/help', 'Show all commands'],
        ['/exit, /quit', 'Exit CLD'],
        ['/clear', 'Clear conversation'],
        ['/compact', 'Compress context to save tokens'],
        ['/config', 'View configuration'],
        ['/config set <k> <v>', 'Set config (outputStyle, allowDestructive, theme)'],
        ['/cost', 'Token usage & cost'],
        ['/doctor', 'System diagnostic checkup'],
        ['/init', 'Initialize CLAUDE.md in current directory'],
        ['/model', 'Show current model'],
        ['/models', 'List all free models'],
        ['/switch <n>', 'Switch to model #n'],
        ['/memory', 'View saved memories'],
        ['/memory add <k> <v>', 'Save a memory (persists across sessions)'],
        ['/memory del <k>', 'Delete a memory'],
        ['/memory clear', 'Clear all memories'],
        ['/permissions', 'View tool permissions'],
        ['/permissions set <tool> <y/n>', 'Toggle auto-approve for tool'],
        ['/output-style', 'View current output style'],
        ['/output-style <style>', 'Set: default, concise, explanatory'],
        ['/workspace', 'Show workspace info'],
        ['/add-dir <path>', 'Add directory to workspace'],
        ['/status', 'Session dashboard'],
        ['/export', 'Export conversation to markdown'],
        ['/export <path>', 'Export to specific file'],
        ['/resume', 'Resume last session from history'],
        ['/review <file>', 'Code review a file'],
        ['/security <file>', 'Security audit (OWASP Top 10)'],
        ['/spawn <task>', 'Spawn sub-agent for parallel work'],
        ['/skills', 'List loaded skills'],
        ['/skills create <name>', 'Create a new skill interactively'],
        ['/skills delete <name>', 'Remove a skill'],
        ['/plugins', 'List installed plugins'],
        ['/plugins install <name> <cmd>', 'Install MCP plugin'],
        ['/plugins remove <name>', 'Remove plugin'],
        ['/benchmark', 'Run built-in benchmark suite'],
        ['/benchmark <target>', 'Benchmark & auto-improve target'],
        ['/edit-prompt', 'Open systemprompt.md in $EDITOR'],
        ['/reload', 'Reload system prompt and config'],
        ['/version', 'Show version'],
        ['/update', 'Update CLI'],
      ];
      const maxLen = Math.max(...cmds.map(c => c[0].length));
      console.log(`\n${c.bold}${c.brightCyan}  Slash Commands${c.reset}\n`);
      cmds.forEach(([cmd, desc]) => {
        console.log(`  ${c.yellow}${cmd.padEnd(maxLen)}${c.reset}  ${c.dim}${desc}${c.reset}`);
      });
      console.log('');
    },

    exit: () => 'exit',
    quit: () => 'exit',

    clear: () => {
      messages.length = 0;
      messages.push({ role: 'system', content: buildSystemPrompt(config) });
      saveHistory([]);
      console.log(`${c.brightGreen}✅ Session cleared.${c.reset}`);
      return 'messages_modified';
    },

    compact: async () => {
      if (messages.length <= 3) {
        console.log(`${c.yellow}Nothing to compact.${c.reset}`);
        return;
      }
      console.log(`${c.yellow}Compacting...${c.reset}`);
      const sysMsg = messages[0];
      const recent = messages.slice(-6);
      const old = messages.slice(1, -6);
      const oldText = old.map(m => `${m.role}: ${m.content || '[tools]'}`).join('\n');

      let summary = '';
      try {
        const summaryMsgs = [{ role: 'user', content: `Summarize this conversation into <=5 bullet points:\n\n${oldText.slice(0, 6000)}` }];
        for await (const chunk of streamChat(config.model, summaryMsgs, config.apiKey, [], 1000)) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) summary += content;
        }
      } catch { summary = 'Previous conversation summarized (auto).'; }

      messages.length = 0;
      messages.push(sysMsg);
      messages.push({ role: 'user', content: `[COMPACTED CONTEXT]\n${summary}` });
      messages.push(...recent);
      saveHistory(messages.slice(-50));
      console.log(`${c.brightGreen}✅ Compacted.${c.reset}`);
      return 'messages_modified';
    },

    config: () => {
      if (args[1] === 'set' && args[2]) {
        const key = args[2];
        const val = args.slice(3).join(' ');
        if (key === 'outputStyle' && ['default','concise','explanatory'].includes(val)) {
          config.outputStyle = val; saveConfig(config);
          console.log(`${c.brightGreen}✅ outputStyle = ${val}${c.reset}`);
        } else if (key === 'allowDestructive') {
          config.permissions.allowDestructive = ['true','yes','1'].includes(val.toLowerCase());
          saveConfig(config);
          console.log(`${c.brightGreen}✅ allowDestructive = ${config.permissions.allowDestructive}${c.reset}`);
        } else if (key === 'theme') {
          config.theme = val; saveConfig(config);
          console.log(`${c.brightGreen}✅ theme = ${val}${c.reset}`);
        } else {
          console.log(`${c.red}Unknown key: ${key}. Valid: outputStyle, allowDestructive, theme${c.reset}`);
        }
        return;
      }
      console.log(`\n${c.bold}Configuration:${c.reset}`);
      console.log(`  Model:    ${c.brightCyan}${config.modelName}${c.reset}`);
      console.log(`  API Key:  ${c.dim}sk-or-...${config.apiKey.slice(-8)}${c.reset}`);
      console.log(`  Context:  ${c.yellow}${Math.round(config.contextLength/1024)}k${c.reset} tokens`);
      console.log(`  Style:    ${c.magenta}${config.outputStyle}${c.reset}`);
      console.log(`  Destructive: ${config.permissions.allowDestructive ? c.red+'ALLOWED'+c.reset : c.brightGreen+'APPROVAL REQUIRED'+c.reset}`);
      console.log(`  Auto-approve: ${c.dim}${config.permissions.autoApproveTools.join(', ')}${c.reset}`);
    },

    cost: () => {
      const tl = loadTokenLog();
      const sessionTokens = messages.reduce((s, m) => s + estimateTokens(m.content||'') + estimateTokens(JSON.stringify(m.tool_calls||'')), 0);
      console.log(`\n${c.bold}Token Usage:${c.reset}`);
      console.log(`  Session:  ${c.yellow}${sessionTokens.toLocaleString()}${c.reset} tokens`);
      console.log(`  All-time in:  ${c.cyan}${tl.totalIn.toLocaleString()}${c.reset}`);
      console.log(`  All-time out: ${c.magenta}${tl.totalOut.toLocaleString()}${c.reset}`);
      console.log(`  Sessions: ${c.white}${tl.sessions.length}${c.reset}`);
      console.log(`  ${c.dim}Free models — actual cost: $0.00${c.reset}`);
    },

    doctor: async () => {
      console.log(`\n${c.bold}${c.brightCyan}🔍 CLD Doctor${c.reset}\n`);
      const checks = [
        ['Node.js', process.version, c.green],
        ['Config', fs.existsSync(CONFIG_FILE) ? 'OK' : 'MISSING', fs.existsSync(CONFIG_FILE) ? c.green : c.red],
        ['System Prompt', fs.existsSync(SYSTEM_PROMPT) ? 'OK' : 'MISSING', fs.existsSync(SYSTEM_PROMPT) ? c.green : c.red],
      ];
      try {
        await fetchOR('/models', config.apiKey);
        checks.push(['OpenRouter API', 'Connected', c.green]);
      } catch (e) {
        checks.push(['OpenRouter API', `FAILED: ${e.message.slice(0,50)}`, c.red]);
      }
      const skills = loadSkills();
      const plugins = loadPlugins();
      const memory = loadMemory();
      checks.push(['Skills', `${skills.length} loaded`, skills.length > 0 ? c.cyan : c.dim]);
      checks.push(['Plugins', `${plugins.length} installed`, plugins.length > 0 ? c.cyan : c.dim]);
      checks.push(['Memories', `${Object.keys(memory).length} stored`, c.white]);

      checks.forEach(([label, status, col]) => {
        console.log(`  ${col}●${c.reset} ${label}: ${col}${status}${c.reset}`);
      });
      console.log('');
    },

    init: async () => {
      const fp = path.join(process.cwd(), 'CLAUDE.md');
      if (fs.existsSync(fp)) {
        console.log(`${c.yellow}CLAUDE.md exists. Overwrite? [y/N]${c.reset}`);
        const ans = await askUser(rl, '> ');
        if (ans.toLowerCase() !== 'y') { console.log(`${c.dim}Cancelled.${c.reset}`); return; }
      }
      let content = `# CLAUDE.md — ${path.basename(process.cwd())}\n\nGenerated: ${new Date().toISOString()}\n\n`;
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
        content += `## Build & Test\n- Build: \`${pkg.scripts?.build || 'npm run build'}\`\n- Test: \`${pkg.scripts?.test || 'npm test'}\`\n- Lint: \`${pkg.scripts?.lint || 'npm run lint'}\`\n\n`;
      }
      content += `## Code Style\n- Follow existing conventions.\n- Use meaningful names.\n- Add comments for complex logic.\n`;
      fs.writeFileSync(fp, content, 'utf8');
      console.log(`${c.brightGreen}✅ Created CLAUDE.md${c.reset}`);
    },

    model: () => {
      console.log(`${c.brightCyan}${config.modelName}${c.reset} ${c.dim}(${config.model})${c.reset}`);
    },

    models: async () => {
      try {
        const models = await fetchAllModels(config.apiKey);
        models.forEach((m, i) => {
          console.log(`  ${c.yellow}${String(i+1).padStart(3)}${c.reset}. ${c.brightCyan}${m.name}${c.reset} ${c.dim}(${Math.round(m.context_length/1024)}k)${c.reset}`);
        });
        console.log(`${c.dim}Use /switch <number>${c.reset}`);
      } catch (e) { console.log(`${c.red}${e.message}${c.reset}`); }
    },

    switch: async () => {
      const num = parseInt(args[1], 10);
      if (isNaN(num)) { console.log(`${c.red}Usage: /switch <number>${c.reset}`); return; }
      try {
        const models = await fetchAllModels(config.apiKey);
        if (num < 1 || num > models.length) { console.log(`${c.red}Invalid. Use /models.${c.reset}`); return; }
        config.model = models[num-1].id;
        config.modelName = models[num-1].name;
        config.contextLength = models[num-1].context_length;
        saveConfig(config);
        messages[0] = { role: 'system', content: buildSystemPrompt(config) };
        console.log(`${c.brightGreen}✅ Switched to: ${config.modelName}${c.reset}`);
      } catch (e) { console.log(`${c.red}${e.message}${c.reset}`); }
    },

    memory: () => {
      if (args[1] === 'add' && args[2]) {
        const spaceIdx = rest.indexOf(' ', rest.indexOf(' ') + 1);
        if (spaceIdx === -1) { console.log(`${c.red}Usage: /memory add <key> <value>${c.reset}`); return; }
        const key = rest.slice(0, spaceIdx).trim();
        const val = rest.slice(spaceIdx + 1).trim();
        const mem = loadMemory(); mem[key] = val; saveMemory(mem);
        console.log(`${c.brightGreen}✅ Saved: ${key}${c.reset}`);
        return;
      }
      if (args[1] === 'del' && args[2]) {
        const mem = loadMemory(); delete mem[args[2]]; saveMemory(mem);
        console.log(`${c.brightGreen}✅ Deleted: ${args[2]}${c.reset}`);
        return;
      }
      if (args[1] === 'clear') { saveMemory({}); console.log(`${c.brightGreen}✅ Cleared.${c.reset}`); return; }
      const mem = loadMemory();
      const keys = Object.keys(mem);
      if (keys.length === 0) { console.log(`${c.dim}No memories. /memory add <k> <v>${c.reset}`); }
      else keys.forEach(k => console.log(`  ${c.cyan}${k}${c.reset}: ${mem[k]}`));
    },

    permissions: () => {
      if (args[1] === 'set' && args[2]) {
        const tool = args[2];
        const enable = ['yes','true','y','1'].includes((args[3]||'').toLowerCase());
        if (enable) {
          if (!config.permissions.autoApproveTools.includes(tool)) config.permissions.autoApproveTools.push(tool);
        } else {
          config.permissions.autoApproveTools = config.permissions.autoApproveTools.filter(t => t !== tool);
        }
        saveConfig(config);
        console.log(`${c.brightGreen}✅ ${tool}: auto-approve = ${enable}${c.reset}`);
        return;
      }
      console.log(`\n${c.bold}Tool Permissions:${c.reset}`);
      TOOLS.forEach(t => {
        const name = t.function.name;
        const auto = config.permissions.autoApproveTools.includes(name);
        console.log(`  ${auto ? c.brightGreen+'✓'+c.reset : c.red+'✗'+c.reset} ${name}`);
      });
    },

    'output-style': () => {
      if (args[1] && ['default','concise','explanatory'].includes(args[1])) {
        config.outputStyle = args[1]; saveConfig(config);
        messages[0] = { role: 'system', content: buildSystemPrompt(config) };
        console.log(`${c.brightGreen}✅ Style: ${args[1]}${c.reset}`);
        return;
      }
      console.log(`${c.magenta}Current: ${config.outputStyle}${c.reset} — Options: default, concise, explanatory`);
    },

    workspace: () => {
      const ws = loadWorkspaces();
      const current = ws[process.cwd()];
      console.log(`${c.bold}Workspace:${c.reset}`);
      console.log(`  Dir:  ${c.brightCyan}${process.cwd()}${c.reset}`);
      console.log(`  Name: ${current ? current.name : c.dim+'Unnamed'+c.reset}`);
      if (Object.keys(ws).length > 0) {
        console.log(`\n${c.dim}All workspaces:${c.reset}`);
        Object.entries(ws).forEach(([dir, info]) => {
          console.log(`  ${dir === process.cwd() ? c.brightGreen+'★'+c.reset : ' '} ${dir} — ${info.name}`);
        });
      }
    },

    'add-dir': () => {
      const dirPath = path.resolve(rest);
      if (!fs.existsSync(dirPath)) { console.log(`${c.red}Not found: ${dirPath}${c.reset}`); return; }
      const ws = loadWorkspaces();
      ws[dirPath] = { name: path.basename(dirPath), addedAt: new Date().toISOString() };
      saveWorkspaces(ws);
      console.log(`${c.brightGreen}✅ Added: ${dirPath}${c.reset}`);
    },

    status: () => {
      const sessionTokens = messages.reduce((s, m) => s + estimateTokens(m.content||'') + estimateTokens(JSON.stringify(m.tool_calls||'')), 0);
      const ctxPct = Math.round((sessionTokens / config.contextLength) * 100);
      const skills = loadSkills();
      const plugins = loadPlugins().filter(p => p.enabled);
      const memory = loadMemory();
      const barW = 30;
      const filled = Math.round((ctxPct / 100) * barW);
      const bar = c.brightGreen + '█'.repeat(Math.min(filled, barW)) + c.dim + '░'.repeat(Math.max(0, barW - filled)) + c.reset;

      console.log(`\n${c.bold}${c.brightCyan}📊 Session Dashboard${c.reset}\n`);
      console.log(`  ${c.cyan}Model:${c.reset}    ${config.modelName}`);
      console.log(`  ${c.yellow}Context:${c.reset}  ${bar} ${ctxPct}%`);
      console.log(`  ${c.white}Tokens:${c.reset}   ${sessionTokens.toLocaleString()} / ${config.contextLength.toLocaleString()}`);
      console.log(`  ${c.magenta}Messages:${c.reset} ${messages.length}`);
      console.log(`  ${c.green}Skills:${c.reset}   ${skills.length} loaded`);
      console.log(`  ${c.blue}Plugins:${c.reset}  ${plugins.length} active`);
      console.log(`  ${c.dim}Memories:${c.reset} ${Object.keys(memory).length} stored`);
      console.log(`  ${c.dim}Style:${c.reset}    ${config.outputStyle}`);
      console.log('');
    },

    export: () => {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fp = rest ? path.resolve(rest) : path.join(EXPORTS_DIR, `session-${ts}.md`);
      const content = `# CLD Session — ${new Date().toLocaleString()}\n\n` +
        messages.map(m => `## ${m.role.toUpperCase()}\n\n${m.content||''}${m.tool_calls ? '\n\n'+JSON.stringify(m.tool_calls, null, 2) : ''}`).join('\n\n---\n\n');
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, content, 'utf8');
      console.log(`${c.brightGreen}✅ Exported: ${fp}${c.reset}`);
    },

    resume: () => {
      const history = loadHistory();
      if (history.length === 0) { console.log(`${c.yellow}No previous session.${c.reset}`); return; }
      const sysMsg = messages[0];
      messages.length = 0;
      messages.push(sysMsg);
      messages.push(...history);
      console.log(`${c.brightGreen}✅ Resumed ${history.length} messages.${c.reset}`);
      return 'messages_modified';
    },

    review: () => {
      if (!rest) { console.log(`${c.yellow}Usage: /review <file>${c.reset}`); return; }
      const fp = path.resolve(rest);
      if (!fs.existsSync(fp)) { console.log(`${c.red}Not found: ${fp}${c.reset}`); return; }
      const content = fs.readFileSync(fp, 'utf8');
      const msg = {
        role: 'user',
        content: `Review this file thoroughly:\n\nFile: ${fp}\n\n\`\`\`\n${content.slice(0,12000)}${content.length>12000?'\n... (truncated)':''}\n\`\`\`\n\nCheck for: bugs, security issues, performance problems, code style violations. Provide line-specific feedback.`
      };
      return { inject: msg };
    },

    security: () => {
      if (!rest) { console.log(`${c.yellow}Usage: /security <file>${c.reset}`); return; }
      const fp = path.resolve(rest);
      if (!fs.existsSync(fp)) { console.log(`${c.red}Not found: ${fp}${c.reset}`); return; }
      const content = fs.readFileSync(fp, 'utf8');
      const msg = {
        role: 'user',
        content: `Security audit this file (OWASP Top 10):\n\nFile: ${fp}\n\n\`\`\`\n${content.slice(0,12000)}${content.length>12000?'\n... (truncated)':''}\n\`\`\`\n\nCheck: injection, auth, crypto, secrets, input validation. Rate severity.`
      };
      return { inject: msg };
    },

    spawn: () => {
      if (!rest) { console.log(`${c.yellow}Usage: /spawn <task>${c.reset}`); return; }
      const msg = {
        role: 'user',
        content: `[SUB-AGENT TASK — Complete independently]\n\n${rest}\n\nComplete this task. Return a summary when done.`
      };
      return { inject: msg };
    },

    skills: () => {
      if (args[1] === 'create' && args[2]) {
        const name = args.slice(2).join(' ');
        return { createSkill: name };
      }
      if (args[1] === 'delete' && args[2]) {
        if (deleteSkill(args[2])) console.log(`${c.brightGreen}✅ Deleted: ${args[2]}${c.reset}`);
        else console.log(`${c.yellow}Not found: ${args[2]}${c.reset}`);
        return;
      }
      const skills = loadSkills();
      if (skills.length === 0) console.log(`${c.dim}No skills. /skills create <name>${c.reset}`);
      else skills.forEach(s => console.log(`  ${c.cyan}${s.name}${c.reset}: ${s.prompt.slice(0,100)}...`));
    },

    plugins: () => {
      if (args[1] === 'install' && args[2] && args[3]) {
        const plugin = installPlugin(args[2], args.slice(3).join(' '));
        console.log(`${c.brightGreen}✅ Plugin: ${plugin.name}${c.reset}`);
        return;
      }
      if (args[1] === 'remove' && args[2]) {
        if (removePlugin(args[2])) console.log(`${c.brightGreen}✅ Removed: ${args[2]}${c.reset}`);
        else console.log(`${c.yellow}Not found: ${args[2]}${c.reset}`);
        return;
      }
      const plugins = loadPlugins();
      if (plugins.length === 0) console.log(`${c.dim}No plugins. /plugins install <name> <command>${c.reset}`);
      else plugins.forEach(p => console.log(`  ${c.cyan}${p.name}${c.reset} — ${p.enabled ? c.green+'on'+c.reset : c.red+'off'+c.reset} — ${c.dim}${p.serverCommand}${c.reset}`));
    },

    benchmark: async () => {
      console.log(`${c.brightMagenta}🏃 Running benchmark suite...${c.reset}\n`);
      const target = rest || 'all';
      const results = { target, timestamp: new Date().toISOString(), tests: [] };

      // Test 1: File read/write speed
      const testFile = path.join(BENCHMARKS_DIR, 'speed_test.txt');
      const start = Date.now();
      fs.writeFileSync(testFile, 'x'.repeat(100000), 'utf8');
      const content = fs.readFileSync(testFile, 'utf8');
      const elapsed = Date.now() - start;
      results.tests.push({ name: 'File R/W Speed', result: `${elapsed}ms for 100KB`, pass: elapsed < 1000 });
      fs.unlinkSync(testFile);

      // Test 2: Tool execution speed
      const cmdStart = Date.now();
      try { execSync('echo "benchmark"', { timeout: 5000 }); } catch {}
      const cmdElapsed = Date.now() - cmdStart;
      results.tests.push({ name: 'Command Execution', result: `${cmdElapsed}ms`, pass: cmdElapsed < 1000 });

      // Test 3: API latency
      try {
        const apiStart = Date.now();
        await fetchAllModels(config.apiKey);
        const apiElapsed = Date.now() - apiStart;
        results.tests.push({ name: 'API Latency', result: `${apiElapsed}ms`, pass: apiElapsed < 5000 });
      } catch {
        results.tests.push({ name: 'API Latency', result: 'FAILED', pass: false });
      }

      const passed = results.tests.filter(t => t.pass).length;
      console.log(`  Tests: ${results.tests.length} | ${c.brightGreen}Passed: ${passed}${c.reset} | ${c.red}Failed: ${results.tests.length - passed}${c.reset}`);
      results.tests.forEach(t => {
        console.log(`  ${t.pass ? c.brightGreen+'✓'+c.reset : c.red+'✗'+c.reset} ${t.name}: ${t.result}`);
      });
      saveJSON(path.join(BENCHMARKS_DIR, `bench_${Date.now()}.json`), results);
      console.log('');
    },

    'edit-prompt': () => {
      const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
      console.log(`${c.dim}Opening ${SYSTEM_PROMPT} with ${editor}...${c.reset}`);
      try {
        execSync(`${editor} "${SYSTEM_PROMPT}"`, { stdio: 'inherit' });
        messages[0] = { role: 'system', content: buildSystemPrompt(config) };
        console.log(`${c.brightGreen}✅ Prompt reloaded.${c.reset}`);
      } catch (e) {
        console.log(`${c.red}Editor failed: ${e.message}${c.reset}`);
      }
    },

    reload: () => {
      messages[0] = { role: 'system', content: buildSystemPrompt(config) };
      console.log(`${c.brightGreen}✅ System prompt and config reloaded.${c.reset}`);
    },

    version: () => {
      console.log(`${c.brightCyan}CLD v2.0${c.reset} — Recursive Agent Loop`);
      console.log(`${c.dim}Node ${process.version} | OpenRouter | Zero dependencies${c.reset}`);
    },

    update: () => {
      console.log(`${c.yellow}Run:${c.reset} curl -fsSL https://raw.githubusercontent.com/open-cld/install/main/install.sh | bash`);
    },
  };

  if (commands[fullCmd]) {
    const result = commands[fullCmd]();
    if (result instanceof Promise) await result;
    return result;
  }

  // Try partial matches
  for (const [key, fn] of Object.entries(commands)) {
    if (key.startsWith(fullCmd) && args[1]) {
      const result = fn();
      if (result instanceof Promise) await result;
      return result;
    }
  }

  console.log(`${c.red}Unknown command: /${fullCmd}${c.reset} — Type ${c.yellow}/help${c.reset}`);
}

// ─────────────────────────────────────────────────────────────────
// MAIN CHAT LOOP
// ─────────────────────────────────────────────────────────────────
async function chatLoop(config, rl) {
  let messages = [
    { role: 'system', content: buildSystemPrompt(config) },
  ];

  // Check for saved history
  const savedHistory = loadHistory();
  if (savedHistory.length > 0) {
    console.log(`${c.dim}Previous session found. /resume to restore.${c.reset}`);
  }

  console.log(renderHeader(config, messages));
  console.log(`${c.dim}Type ${c.yellow}/help${c.dim} for commands.${c.reset}\n`);

  const tl = loadTokenLog();
  let sessionIn = 0;
  let sessionOut = 0;

  while (true) {
    const input = await askUser(rl, `${c.bold}${c.brightMagenta}▸${c.reset} `);
    const trimmed = input.trim();
    if (!trimmed) continue;

    // ── Slash Commands ────────────────────────────────────
    if (trimmed.startsWith('/')) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].slice(1);
      const result = await handleSlashCommand(cmd, parts, config, messages, rl);

      if (result === 'exit') {
        console.log(`${c.dim}Goodbye.${c.reset}\n`);
        break;
      }
      if (result === 'messages_modified') {
        saveHistory(messages.slice(-50));
        console.log(renderHeader(config, messages));
        continue;
      }
      if (result && result.inject) {
        messages.push(result.inject);
        // Fall through to AI processing
      }
      if (result && result.createSkill) {
        const prompt = await askUser(rl, `${c.bold}Skill prompt:${c.reset} `);
        if (prompt.trim()) {
          const skill = createSkill(result.createSkill, prompt.trim());
          console.log(`${c.brightGreen}✅ Created: ${skill.name}${c.reset}`);
          messages[0] = { role: 'system', content: buildSystemPrompt(config) };
        }
        continue;
      }
      if (result === undefined || result === null || typeof result === 'object') {
        // Command was handled or injected; if injected, continue to AI
        if (result && result.inject) {
          // Will fall through
        } else {
          continue;
        }
      }
      continue;
    }

    // ── Normal Message ────────────────────────────────────
    messages.push({ role: 'user', content: trimmed });
    sessionIn += estimateTokens(trimmed);

    // Agentic Loop
    let agentDone = false;
    let loopCount = 0;
    const MAX_LOOPS = 25;

    while (!agentDone && loopCount < MAX_LOOPS) {
      loopCount++;
      process.stdout.write(`${c.brightCyan}${c.bold}CLD${c.reset} `);

      const fullContent = [];
      const toolCalls = [];
      let usageInfo = null;

      try {
        for await (const chunk of streamChat(config.model, messages, config.apiKey, TOOLS)) {
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;
          if (chunk.usage) usageInfo = chunk.usage;

          if (delta.content) {
            fullContent.push(delta.content);
            process.stdout.write(delta.content);
          }
          if (delta.tool_calls) {
            for (const tcDelta of delta.tool_calls) {
              const idx = tcDelta.index || 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (tcDelta.id) toolCalls[idx].id += tcDelta.id;
              if (tcDelta.function?.name) toolCalls[idx].function.name += tcDelta.function.name;
              if (tcDelta.function?.arguments) toolCalls[idx].function.arguments += tcDelta.function.arguments;
            }
          }
        }
        process.stdout.write('\n');

        if (usageInfo) {
          sessionIn += usageInfo.prompt_tokens || 0;
          sessionOut += usageInfo.completion_tokens || 0;
        } else {
          sessionOut += estimateTokens(fullContent.join(''));
        }
      } catch (e) {
        console.log(`\n${c.red}Stream error: ${e.message}${c.reset}`);
        messages.pop();
        break;
      }

      const validToolCalls = toolCalls.filter(tc => tc && tc.id && tc.function.name);
      if (validToolCalls.length > 0) {
        // Add assistant message with tool calls
        const assistantMsg = {
          role: 'assistant',
          content: fullContent.join('').trim() || null,
        };
        assistantMsg.tool_calls = validToolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
        messages.push(assistantMsg);

        // Execute each tool
        for (const tc of validToolCalls) {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}

          const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
          let si = 0;
          const spinnerInterval = setInterval(() => {
            process.stdout.write(`\r${c.brightYellow}${spinner[si]}${c.reset} ${c.dim}${tc.function.name}...${c.reset}`);
            si = (si + 1) % spinner.length;
          }, 80);

          const result = await executeTool(tc.function.name, parsedArgs, config, rl);

          clearInterval(spinnerInterval);
          process.stdout.write(`\r${c.dim}🔧 ${tc.function.name}${c.reset}\n`);
          const preview = result.slice(0, 500) + (result.length > 500 ? '...' : '');
          console.log(`${c.dim}${preview}${c.reset}\n`);

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          });
        }
        // Continue agent loop
      } else {
        const content = fullContent.join('').trim();
        if (content) {
          messages.push({ role: 'assistant', content });
        }
        agentDone = true;
      }
    }

    if (loopCount >= MAX_LOOPS) {
      console.log(`${c.yellow}⚠️  Max agent loops reached (${MAX_LOOPS}). Stopping.${c.reset}`);
    }

    // Save state
    saveHistory(messages.slice(-50));
    tl.sessions.push({
      timestamp: new Date().toISOString(),
      tokensIn: sessionIn,
      tokensOut: sessionOut,
      model: config.model,
    });
    tl.totalIn += sessionIn;
    tl.totalOut += sessionOut;
    saveTokenLog(tl);

    // Re-render header with updated context
    process.stdout.write(renderHeader(config, messages));
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────
async function main() {
  let config = loadConfig();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  process.on('SIGINT', () => {
    console.log(`\n${c.dim}Use /exit to quit.${c.reset}`);
  });

  // Handle --spawn flag
  const spawnIdx = process.argv.indexOf('--spawn');
  if (spawnIdx !== -1) {
    const task = process.argv.slice(spawnIdx + 1).join(' ');
    if (!config) { console.log('Run cld first to configure.'); process.exit(1); }
    console.log(`${c.brightMagenta}🚀 Sub-agent: ${task.slice(0, 60)}...${c.reset}`);
    const msgs = [
      { role: 'system', content: buildSystemPrompt(config) + '\n\nYou are a sub-agent. Complete the task. No interactive prompts.' },
      { role: 'user', content: task },
    ];
    for await (const chunk of streamChat(config.model, msgs, config.apiKey, TOOLS)) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
    console.log('');
    process.exit(0);
  }

  // Setup or load
  if (!config) {
    config = await setupWizard(rl);
  } else {
    console.clear();
    console.log(`\n  ${c.bold}${c.brightCyan}⚡ CLD v2.0${c.reset} — ${c.dim}${config.modelName}${c.reset}`);
    try {
      const models = await fetchAllModels(config.apiKey);
      const exists = models.find(m => m.id === config.model);
      if (!exists) {
        console.log(`  ${c.yellow}Model changed. Re-running setup...${c.reset}\n`);
        config = await setupWizard(rl);
      }
    } catch (e) {
      console.log(`  ${c.red}API error: ${e.message}${c.reset}`);
      config = await setupWizard(rl);
    }
  }

  await chatLoop(config, rl);
  rl.close();
}

main().catch(e => {
  console.error(`${c.red}Fatal: ${e.message}${c.reset}`);
  process.exit(1);
});