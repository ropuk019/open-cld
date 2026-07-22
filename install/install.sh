#!/usr/bin/env bash
set -eu

APP=cld
APP_NAME="CLD"
APP_DESC="Recursive Agent Loop CLI — Zero deps. Free models via OpenRouter."

MUTED='\033[0;2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
ORANGE='\033[38;5;214m'
BOLD='\033[1m'
NC='\033[0m'

REPO_OWNER="ropuk019"
REPO_NAME="open-cld"
REPO_BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install"

INSTALL_DIR="${HOME}/.cld"
BIN_DIR="${HOME}/.local/bin"
CLI_FILE="${INSTALL_DIR}/cld.js"
SYMLINK="${BIN_DIR}/${APP}"
SYSTEM_PROMPT_FILE="${INSTALL_DIR}/System/systemprompt.md"

usage() {
    cat <<EOF
${BOLD}${APP_NAME}${NC} — ${APP_DESC}

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    --no-modify-path        Don't modify shell config files

Examples:
    curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install/install.sh | bash

Repository: https://github.com/${REPO_OWNER}/${REPO_NAME}
EOF
}

no_modify_path=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --no-modify-path) no_modify_path=true; shift ;;
        *) echo -e "${ORANGE}Unknown option: $1${NC}" >&2; shift ;;
    esac
done

info()  { printf "${MUTED}  →${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}  ✓${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}  !${NC} %s\n" "$1"; }
fail()  { printf "${RED}  ✗${NC} %s\n" "$1" >&2; }

show_banner() {
    local tw=$(tput cols 2>/dev/null || echo 80)
    echo ""
    if [ "$tw" -ge 70 ] 2>/dev/null; then
        echo -e "${CYAN}   ██████╗ ██╗     ██████╗ ${NC}"
        echo -e "${CYAN}  ██╔════╝ ██║     ██╔══██╗${NC}"
        echo -e "${CYAN}  ██║      ██║     ██║  ██║${NC}"
        echo -e "${CYAN}  ██║      ██║     ██║  ██║${NC}"
        echo -e "${CYAN}  ╚██████╗ ███████╗██████╔╝${NC}"
        echo -e "${CYAN}   ╚═════╝ ╚══════╝╚═════╝ ${NC}"
        echo -e "${MUTED}  Recursive Agent Loop • Zero Dependencies${NC}"
    else
        echo -e "${CYAN}▄▄▄▄  ▄   ▄▄▄${NC}"
        echo -e "${CYAN}█   █ █   █  █${NC}"
        echo -e "${CYAN}█     █   █  █${NC}"
        echo -e "${CYAN}█     █   █  █${NC}"
        echo -e "${CYAN}▀▀▀▀▀ ▀▀▀ ▀▀▀${NC}"
    fi
    echo ""
}

check_prerequisites() {
    if ! command -v node &>/dev/null; then
        fail "Node.js not found"
        echo ""
        echo -e "  Install it first:"
        echo -e "    ${YELLOW}pkg install nodejs${NC}     # Termux"
        echo -e "    ${YELLOW}apt install nodejs${NC}     # Debian/Ubuntu"
        echo -e "    ${YELLOW}brew install node${NC}      # macOS"
        echo ""
        exit 1
    fi
    local nv=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$nv" -lt 18 ]; then
        fail "Node.js 18+ required. Current: $(node -v)"
        exit 1
    fi
    ok "Node.js $(node -v)"

    if command -v curl &>/dev/null; then
        DOWNLOAD="curl -fsSL"
    elif command -v wget &>/dev/null; then
        DOWNLOAD="wget -qO-"
    else
        fail "Need curl or wget."
        exit 1
    fi
    ok "Download tool ready"
}

setup_directories() {
    for d in System Skills Plugins Exports Benchmarks; do
        mkdir -p "${INSTALL_DIR}/${d}"
    done
    mkdir -p "${BIN_DIR}"
    chmod -R 700 "${INSTALL_DIR}" 2>/dev/null || true
    ok "Directory structure ready"
}

write_default_prompt() {
    cat > "$SYSTEM_PROMPT_FILE" << 'EOF'
# CLD — The Recursive Agent Loop

You are CLD, a recursively self-improving coding agent. Operate in a continuous
**Think → Plan → Act → Observe → Reflect → (Re)Plan** loop until the task is done.

## Loop Protocol (Mandatory)
1. **Understand** — Parse the user's intent.
2. **Think** — Write reasoning inside `<thinking>` tags before ANY tool call.
3. **Plan** — Break into small, verifiable subtasks.
4. **Act** — Use tools aggressively. Read files before editing.
5. **Observe** — Read tool outputs fully. Never hallucinate.
6. **Reflect** — "Did this succeed? If not, correct immediately."
7. **Verify** — Test the final result. Loop back if it fails.
8. **Report** — Summarize what was done, with evidence.

## Core Rules
- `read_file` before any edit. Always.
- `edit_file` with EXACT `old_string`. Whitespace matters.
- Destructive commands require approval.
- Write production code. Handle errors.
- Never guess file contents. Re-read if uncertain.
- If a tool fails twice, re-think.
- Be direct. No fluff. Code over prose.
EOF
}

install_files() {
    info "Downloading cld.js..."
    $DOWNLOAD "${RAW_BASE}/main/cld.js" > "$CLI_FILE" || {
        fail "Failed to download cld.js"
        exit 1
    }
    chmod +x "$CLI_FILE"
    ok "cld.js downloaded"

    info "Downloading systemprompt.md..."
    if $DOWNLOAD "${RAW_BASE}/systemprompt.md" > "$SYSTEM_PROMPT_FILE" 2>/dev/null; then
        ok "systemprompt.md downloaded"
    else
        warn "Using default system prompt"
        write_default_prompt
    fi
}

create_symlink() {
    ln -sf "$CLI_FILE" "$SYMLINK"
    ok "Symlink: ${SYMLINK} → cld.js"
}

configure_path() {
    if [ "$no_modify_path" = true ]; then
        info "Skipping PATH modification"
        return
    fi

    local shell_name=$(basename "${SHELL:-/bin/bash}")
    local configs=""
    local line=""

    case "$shell_name" in
        fish)
            configs="$HOME/.config/fish/config.fish"
            line="fish_add_path $BIN_DIR"
            ;;
        zsh)
            configs="${ZDOTDIR:-$HOME}/.zshrc"
            line="export PATH=\"$BIN_DIR:\$PATH\""
            ;;
        *)
            configs="$HOME/.bashrc $HOME/.profile"
            line="export PATH=\"$BIN_DIR:\$PATH\""
            ;;
    esac

    local done=false
    for cf in $configs; do
        if [ -f "$cf" ]; then
            if ! grep -q "$line" "$cf" 2>/dev/null; then
                echo "" >> "$cf"
                echo "# CLD" >> "$cf"
                echo "$line" >> "$cf"
                ok "Added to ${cf}"
            else
                ok "Already in ${cf}"
            fi
            done=true
            break
        fi
    done

    if [ "$done" = false ]; then
        echo "# CLD" >> "$HOME/.profile"
        echo "$line" >> "$HOME/.profile"
        ok "Created ~/.profile with PATH entry"
    fi
}

post_install() {
    local in_path=false
    echo "$PATH" | tr ':' '\n' | grep -qxF "$BIN_DIR" && in_path=true

    echo ""
    if $in_path; then
        echo -e "${GREEN}${BOLD}  CLD is ready!${NC}"
        echo ""
        echo -e "  Run:    ${CYAN}${BOLD}cld${NC}"
        echo -e "  Help:   ${MUTED}cld → /help${NC}"
    else
        echo -e "${YELLOW}${BOLD}  Almost done!${NC}"
        echo ""
        echo -e "  ${CYAN}export PATH=\"$BIN_DIR:\$PATH\"${NC}"
        echo -e "  ${CYAN}cld${NC}"
        echo ""
        echo -e "  ${MUTED}Or restart your terminal.${NC}"
    fi
    echo -e "  Prompt: ${MUTED}~/.cld/System/systemprompt.md${NC}"
    echo ""
    echo -e "${MUTED}  Docs: https://github.com/${REPO_OWNER}/${REPO_NAME}${NC}"
    echo ""
}

show_banner
echo -e "${BOLD}${APP_NAME} Installer${NC}"
echo -e "${MUTED}${APP_DESC}${NC}"
echo ""

check_prerequisites
setup_directories
install_files
create_symlink
configure_path
post_install
