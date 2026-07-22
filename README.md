 ⚡ OPENCLD — Recursive Agent Loop CLI

**CLD** is a zero-dependency, self-correcting coding agent that runs in Termux (or any Linux/macOS terminal). It connects to **OpenRouter's free models**, remembers your preferences, and works in a continuous Think→Plan→Act→Observe→Reflect loop until your task is done.

No API costs. No bloat. Just a single Node.js file.

---

## What It Can Do

- **30+ slash commands** — everything from `/review` to `/spawn`
- **10 built-in tools** — read, write, edit files, run commands, search code, web search, git diff, run tests
- **Persistent memory** — remembers facts across sessions
- **Skills system** — create custom behaviors, inject into every prompt
- **Plugin system** — MCP-compatible server descriptors
- **Multi-model** — lists all OpenRouter free models, switch with `/switch 2`
- **Context bar** — live token usage in the header
- **Agent loop** — thinks in `<thinking>` tags, self-corrects on failure
- **Sub-agents** — spawn parallel workers with `/spawn`
- **Code review & security audit** — `/review file.js` and `/security file.js`
- **Session resume** — `/resume` restores your last conversation
- **Export** — save conversations as markdown
- **System prompt from file** — edit `~/.cld/System/systemprompt.md` anytime, reload with `/reload`

---

## Prerequisites

- **Termux** (from [F-Droid](https://f-droid.org/packages/com.termux/), not Play Store)
- Or any Linux/macOS system with Node.js 18+

---

## Step-by-Step Installation (Termux)

### Step 1: Update Termux & Install Node.js

Open Termux and run:

```bash
pkg update -y && pkg upgrade -y
pkg install nodejs curl -y
```

Verify installation:

```bash
node -v
```

Should show v18.x.x or higher.

---

Step 2: Install CLD

Run the one-command installer:

```bash
curl -fsSL https://raw.githubusercontent.com/ropuk019/open-cld/main/install/install.sh | bash
```

This will:

· Create ~/.cld/ with all subdirectories (System, Skills, Plugins, Exports, Benchmarks)
· Download cld.js to ~/.cld/cld.js
· Download systemprompt.md to ~/.cld/System/systemprompt.md
· Create a cld command in ~/.local/bin/
· Add ~/.local/bin to your PATH (in .bashrc)

---

Step 3: Reload Your Shell

```bash
source ~/.bashrc
```

Or close and reopen Termux.

---

Step 4: Run CLD

```bash
cld
```

On first run, you'll see the setup wizard.

---

First-Time Setup

Get an OpenRouter API Key

1. Go to https://openrouter.ai/keys
2. Sign up (free, no payment required)
3. Click "Create Key"
4. Copy the key (starts with sk-or-)

Configure CLD

When you run cld for the first time:

1. Paste your API key when prompted
2. Wait for the free model list to load
3. Choose a model by typing its number (e.g., 1 for Google Gemini Flash, 2 for Meta Llama, etc.)
4. Done. Your choice is saved permanently.

---

Basic Usage

Start a conversation

Just type your request and press Enter:

```
▸ Create a Python script that sorts a CSV file by date
```

CLD will:

· Think in <thinking> tags (you'll see its reasoning)
· Plan the steps
· Use tools to create files, run commands
· Self-correct if something fails
· Report when done

Slash Commands

Type /help to see all commands. The most useful ones:

Command What It Does
/help Show all commands
/models List available free models
/switch 2 Switch to model #2
/status Session dashboard (tokens, context usage)
/compact Compress long conversations to save tokens
/memory add name value Remember something permanently
/memory View all saved memories
/review file.js Code review a file
/security file.js Security audit a file
/export Save conversation to markdown
/resume Restore last session
/init Create a CLAUDE.md for your project
/edit-prompt Open system prompt in nano/vim
/reload Reload system prompt after editing
/spawn task Run a sub-agent in parallel
/clear Start fresh conversation
/exit Quit CLD

---

Project Context (CLD.md)

Want CLD to remember your project's conventions? Run:

```bash
cd ~/my-project
cld
```

Then inside CLD:

```
▸ /init
```

This creates a CLD.md file in your project root. CLD automatically reads it and follows your build commands, test scripts, and code style rules.

---

Editing the System Prompt

The system prompt controls how CLD thinks and behaves. Edit it anytime:

```
▸ /edit-prompt
```

This opens ~/.cld/System/systemprompt.md in your default editor (nano by default). Make changes, save, then:

```
▸ /reload
```

Your changes take effect immediately.

---

Skills (Custom Behaviors)

Create reusable skill presets:

```
▸ /skills create python-expert
Skill prompt: You are a Python expert. Always use type hints. Follow PEP 8 strictly. Write pytest tests.
```

Skills are stored in ~/.cld/Skills/ and automatically injected into every conversation.

---

Updating CLD

To update to the latest version:

```bash
curl -fsSL https://raw.githubusercontent.com/ropuk019/open-cld/main/Install/install.sh | bash
```

Your config, memories, skills, and plugins are preserved.

---

File Locations

What Where
Main script ~/.cld/cld.js
System prompt ~/.cld/System/systemprompt.md
Config (API key, model) ~/.cld/config.json
Persistent memory ~/.cld/memory.json
Conversation history ~/.cld/history.json
Skills ~/.cld/Skills/*.json
Plugins ~/.cld/Plugins/*.json
Exported sessions ~/.cld/Exports/
Benchmarks ~/.cld/Benchmarks/
CLI command ~/.local/bin/cld → ~/.cld/cld.js

---

Troubleshooting

"cld: command not found"

```bash
source ~/.bashrc
```

Or add manually:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

"Node.js >= 18 required"

```bash
pkg update -y && pkg install nodejs -y
```

"API error: 401"

Your API key is invalid or expired. Run:

```bash
rm ~/.cld/config.json
cld
```

And re-enter your key.

Models list is empty

Check your internet connection. OpenRouter may be temporarily down. Try again in a few minutes.

"Permission denied" on install

```bash
chmod +x ~/.cld/cld.js
```

---

Uninstalling

```bash
rm -rf ~/.cld
rm ~/.local/bin/cld
```

---

License

MIT
