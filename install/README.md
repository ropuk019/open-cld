# CLD

CLD is a compact, zero-runtime-dependency coding agent that runs in your terminal. It reads and edits files, searches a project, runs commands and tests, uses skills and executable plugins, and keeps lightweight sessions and memory.

CLD uses OpenRouter and Node.js built-in APIs.

## Requirements

- Node.js 18.18 or newer
- An OpenRouter API key
- `curl` or `wget` for the shell installer

## Install

### Shell installer

```bash
curl -fsSL https://raw.githubusercontent.com/ropuk019/open-cld/main/install/install.sh | bash
```

The installer writes the CLI to `~/.cld/cld.js`, keeps user data under `~/.cld/`, and links `cld` into `~/.local/bin/`.

### From this repository

```bash
git clone https://github.com/ropuk019/open-cld.git
cd open-cld/install
npm install -g .
```

## Configure and run

```bash
export OPENROUTER_API_KEY="your-key"
cld
```

If the environment variable is absent, first-run setup asks for the key and a free OpenRouter model. Config files use mode `0600`.

Useful CLI modes:

```bash
cld                         # interactive terminal session
cld -p "review this repo"   # one non-interactive task
cld --spawn "run tests"     # isolated full agent loop
cld --cwd ./project         # select a workspace
cld --version
cld --help
```

Press `Ctrl+C` to cancel active work without closing the session.

## Commands

Run `/help` for the executable command list. Help is generated from the same registry used for dispatch, so displayed names and handlers cannot drift.

Common commands:

```text
/help
/clear
/compact
/model
/models
/switch <number>
/memory add <key> <value>
/session save <name>
/session load <name>
/review [path]
/security [path]
/spawn <task>
/skills
/plugins
/permissions
/doctor
/exit
```

Custom skills are invoked directly as `/<skill-name> [arguments]`.

## Skills

CLD loads Agent Skills-style `SKILL.md` files from:

- `~/.cld/skills/<name>/SKILL.md`
- `.claude/skills/<name>/SKILL.md`
- `.cld/skills/<name>/SKILL.md`

Project skills override global skills with the same command name.

Example:

```markdown
---
name: review-code
description: Review code for correctness and security
---

Review $ARGUMENTS. Read the relevant files and report findings by severity.
```

Invoke it with:

```text
/review-code src/auth.js
```

Use `/skills create <name>` for a simple interactive skill or `/skills delete <name>` to remove one.

## Plugins

A CLD plugin is one executable tool. It receives one JSON object on standard input and prints JSON or text on standard output.

Install a local command:

```text
/plugins install formatter "node /absolute/path/formatter.js"
```

The model sees it as `plugin_formatter`.

Minimal plugin:

```js
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const args = JSON.parse(input);
  process.stdout.write(JSON.stringify({ content: String(args.text).trim() }));
});
```

Management:

```text
/plugins
/plugins enable formatter
/plugins disable formatter
/plugins remove formatter
```

Plugin processes do not inherit `OPENROUTER_API_KEY`. Invalid plugin files appear in `/plugins` and `/doctor` diagnostics instead of loading silently.

## Safety

- Writes outside the starting workspace require approval.
- Existing files require `overwrite=true` for full replacement.
- Exact edits fail when their match is missing or ambiguous.
- Destructive and unrecognized shell commands require approval.
- Tool output and file reads are bounded.
- API keys are redacted from provider errors and removed from plugin environments.
- Corrupt JSON is preserved as a timestamped backup and reported.

CLD can execute commands and edit files. Review permission prompts before approving them in important repositories.

## Migration

On first v3 start, CLD backs up legacy v2 state under `~/.cld/backup-v2-<timestamp>/` and copies `System`, `Skills`, and `Plugins` into canonical lowercase directories. Existing system prompts are preserved during reinstall.

## Development

```bash
cd install
npm test
npm run verify
```

The test suite uses Node's built-in test runner and mocked OpenRouter streams; no real API key is needed.

## License

MIT
