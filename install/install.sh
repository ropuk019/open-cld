#!/usr/bin/env bash
set -e

echo ""
echo "  ⚡ CLD v2.0 — Recursive Agent Loop CLI"
echo "  Surpasses every other CLI. Zero deps."
echo ""

if ! command -v node &> /dev/null; then
    echo "  Node.js not found. Install it:"
    echo "    pkg install nodejs    # Termux"
    echo "    apt install nodejs    # Debian/Ubuntu"
    echo "    brew install node     # macOS"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  Node.js >= 18 required. Current: $(node -v)"
    exit 1
fi

# Create directory structure
mkdir -p "$HOME/.cld/system" "$HOME/.cld/skills" "$HOME/.cld/plugins" \
         "$HOME/.cld/exports" "$HOME/.cld/benchmarks"
chmod 700 "$HOME/.cld"

# Download cli.js
CLI_URL="https://raw.githubusercontent.com/open-cld/install/main/cli.js"
echo "  Downloading cli.js..."
if command -v curl &> /dev/null; then
    curl -fsSL "$CLI_URL" -o "$HOME/.cld/cli.js"
elif command -v wget &> /dev/null; then
    wget -q "$CLI_URL" -O "$HOME/.cld/cli.js"
else
    echo "  Need curl or wget."; exit 1
fi
chmod +x "$HOME/.cld/cli.js"

# Write default system prompt
PROMPT_URL="https://raw.githubusercontent.com/open-cld/install/main/systemprompt.md"
echo "  Downloading systemprompt.md..."
if command -v curl &> /dev/null; then
    curl -fsSL "$PROMPT_URL" -o "$HOME/.cld/system/systemprompt.md" 2>/dev/null || true
elif command -v wget &> /dev/null; then
    wget -q "$PROMPT_URL" -O "$HOME/.cld/system/systemprompt.md" 2>/dev/null || true
fi

# If download failed, create default
if [ ! -s "$HOME/.cld/system/systemprompt.md" ]; then
    cat > "$HOME/.cld/system/systemprompt.md" << 'PROMPTEOF'
# CLD — The Recursive Agent Loop

You are CLD, a recursively self-improving coding agent engineered to solve tasks completely, correctly, and efficiently. You operate in a continuous **Think → Plan → Act → Observe → Reflect → (Re)Plan** loop until the task is done.

## Loop Protocol (Mandatory)
1. **Understand** — Parse the user's intent.
2. **Think** — Before ANY tool call, write reasoning inside `<thinking>` tags.
3. **Plan** — Break into small, verifiable subtasks.
4. **Act** — Use tools aggressively. Read files before editing.
5. **Observe** — Read tool outputs fully. Do not hallucinate.
6. **Reflect** — "Did this succeed? If not, correct immediately."
7. **Verify** — Test final result. Loop back if it fails.
8. **Report** — Summarize with evidence.

## Rules
- `read_file` before any edit. Always.
- `edit_file` with EXACT `old_string`. Whitespace matters.
- Destructive commands require approval.
- Write production code. Handle errors.
- Never guess file contents. Re-read if uncertain.
- If a tool fails twice, re-think approach.
PROMPTEOF
fi

# Create symlink
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$HOME/.cld/cli.js" "$BIN_DIR/cld"

# Add to PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    SHELL_RC=""
    case "$SHELL" in
        */zsh) SHELL_RC="$HOME/.zshrc" ;;
        */bash) SHELL_RC="$HOME/.bashrc" ;;
        */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
    esac
    if [ -n "$SHELL_RC" ]; then
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
        echo "  Added to PATH in $SHELL_RC"
        echo "  Run: source $SHELL_RC"
    fi
fi

echo ""
echo "  ✅ CLD v2.0 installed."
echo ""
echo "  Run:  cld"
echo "  Edit prompt: /edit-prompt"
echo "  System prompt: ~/.cld/system/systemprompt.md"
echo ""