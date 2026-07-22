#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  CLD Installer — Recursive Agent Loop CLI
#  Termux / Linux / macOS
# ═══════════════════════════════════════════════════════════════

# ── Colors ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Repo Configuration ─────────────────────────────────────
REPO_OWNER="ropuk019"
REPO_NAME="open-cld"
REPO_BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install"

# ── Paths ──────────────────────────────────────────────────
CLD_DIR="${HOME}/.cld"
BIN_DIR="${HOME}/.local/bin"
CLI_FILE="${CLD_DIR}/cld.js"
SYMLINK="${BIN_DIR}/cld"

# ── Print helpers ──────────────────────────────────────────
info()  { printf "${DIM}  →${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}  ✓${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}  !${NC} %s\n" "$1"; }
fail()  { printf "${RED}  ✗${NC} %s\n" "$1"; }
banner(){ printf "\n  ${BOLD}${CYAN}%s${NC}\n" "$1"; }

# ── Banner ─────────────────────────────────────────────────
clear
banner "⚡ CLD — Recursive Agent Loop CLI"
printf "  ${DIM}Zero dependencies. Free models via OpenRouter.${NC}\n\n"

# ── Check Node.js ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
    fail "Node.js not found."
    printf "\n  Install it first:\n"
    printf "    ${YELLOW}pkg install nodejs${NC}    # Termux\n"
    printf "    ${YELLOW}apt install nodejs${NC}    # Debian/Ubuntu\n"
    printf "    ${YELLOW}brew install node${NC}     # macOS\n\n"
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    fail "Node.js 18+ required. You have: $(node -v)"
    exit 1
fi
ok "Node.js $(node -v)"

# ── Check download tool ────────────────────────────────────
if command -v curl &>/dev/null; then
    DOWNLOAD="curl -fsSL"
elif command -v wget &>/dev/null; then
    DOWNLOAD="wget -qO-"
else
    fail "Need curl or wget."
    printf "    ${YELLOW}pkg install curl${NC}\n"
    exit 1
fi
ok "Download tool found"

# ── Create directories ─────────────────────────────────────
SUBDIRS="System Skills Plugins Exports Benchmarks"
for d in $SUBDIRS; do
    mkdir -p "${CLD_DIR}/${d}"
done
chmod -R 700 "${CLD_DIR}" 2>/dev/null || true
mkdir -p "${BIN_DIR}"

info "Directory structure ready"

# ── Download cld.js ────────────────────────────────────────
info "Downloading cld.js..."
if $DOWNLOAD "${RAW_BASE}/main/cld.js" > "${CLI_FILE}" 2>/dev/null; then
    chmod +x "${CLI_FILE}"
    ok "cld.js downloaded"
else
    fail "Failed to download cld.js"
    exit 1
fi

# ── Download system prompt ─────────────────────────────────
info "Downloading systemprompt.md..."
if $DOWNLOAD "${RAW_BASE}/systemprompt.md" > "${CLD_DIR}/System/systemprompt.md" 2>/dev/null; then
    ok "systemprompt.md downloaded"
else
    warn "Could not download systemprompt.md — using default"
    cat > "${CLD_DIR}/System/systemprompt.md" << 'EOF'
# CLD — The Recursive Agent Loop

You are CLD, a recursively self-improving coding agent engineered to solve tasks completely, correctly, and efficiently. You operate in a continuous **Think → Plan → Act → Observe → Reflect → (Re)Plan** loop until the task is done.

## Loop Protocol (Mandatory)
1. **Understand** — Parse the user's intent. Ask clarifying questions only if essential.
2. **Think** — Before ANY tool call, write reasoning inside `<thinking>` tags. Non-negotiable.
3. **Plan** — Break into small, verifiable subtasks. Execute one at a time.
4. **Act** — Use tools aggressively. Read files before editing. Search before assuming.
5. **Observe** — Read tool outputs fully. Do not hallucinate results.
6. **Reflect** — "Did this succeed? If not, correct immediately."
7. **Verify** — Test the final result. Loop back if it fails.
8. **Report** — Summarize what was done, with evidence.

## Rules
- `read_file` before any edit. Always.
- `edit_file` with EXACT `old_string`. Whitespace matters.
- Destructive commands require approval.
- Write production code. Handle errors. Validate inputs.
- Never guess file contents. Re-read if uncertain.
- If a tool fails twice, re-think your approach.
- Be direct. No fluff. Code over prose.
EOF
fi

# ── Create symlink ─────────────────────────────────────────
ln -sf "${CLI_FILE}" "${SYMLINK}"
ok "Symlink created: ${SYMLINK} → cld.js"

# ── Add to PATH ────────────────────────────────────────────
add_to_path() {
    local rc="$1"
    if [ -f "$rc" ]; then
        if ! grep -q "${BIN_DIR}" "$rc" 2>/dev/null; then
            echo "export PATH=\"${BIN_DIR}:\$PATH\"" >> "$rc"
            return 0
        fi
    fi
    return 1
}

ADDED=false
if add_to_path "${HOME}/.bashrc"; then ADDED=true; fi
if add_to_path "${HOME}/.zshrc"; then ADDED=true; fi
if [ -d "${HOME}/.config/fish" ]; then
    mkdir -p "${HOME}/.config/fish"
    if ! grep -q "${BIN_DIR}" "${HOME}/.config/fish/config.fish" 2>/dev/null; then
        echo "set -gx PATH ${BIN_DIR} \$PATH" >> "${HOME}/.config/fish/config.fish"
        ADDED=true
    fi
fi

if $ADDED; then
    ok "Added ${BIN_DIR} to PATH"
fi

# ── Verify symlink is in PATH ──────────────────────────────
if echo "$PATH" | grep -q "${BIN_DIR}"; then
    ok "cld is ready to use"
else
    warn "Run this to activate cld now:"
    printf "\n    ${CYAN}export PATH=\"${BIN_DIR}:\$PATH\"${NC}\n"
    printf "    ${CYAN}cld${NC}\n\n"
    printf "  Or restart your terminal.\n"
fi

# ── Done ───────────────────────────────────────────────────
printf "\n${GREEN}${BOLD}  ═══════════════════════════════════${NC}\n"
printf "${GREEN}${BOLD}   CLD installed successfully!${NC}\n"
printf "${GREEN}${BOLD}  ═══════════════════════════════════${NC}\n\n"
printf "  Run:  ${CYAN}${BOLD}cld${NC}\n"
printf "  Help: ${DIM}cld → /help${NC}\n"
printf "  Edit: ${DIM}~/.cld/System/systemprompt.md${NC}\n\n"
