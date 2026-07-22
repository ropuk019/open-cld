#!/usr/bin/env bash
set -euo


APP=cld
APP_NAME="CLD"
APP_DESC="Recursive Agent Loop CLI — Zero deps. Free models via OpenRouter."

# ── Colors ─────────────────────────────────────────────────
MUTED='\033[0;2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
ORANGE='\033[38;5;214m'
BOLD='\033[1m'
NC='\033[0m'

# ── Configuration ──────────────────────────────────────────
REPO_OWNER="${CLD_REPO_OWNER:-ropuk019}"
REPO_NAME="${CLD_REPO_NAME:-open-cld}"
REPO_BRANCH="${CLD_REPO_BRANCH:-main}"
RAW_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install"

INSTALL_DIR="${CLD_INSTALL_DIR:-$HOME/.cld}"
BIN_DIR="${XDG_BIN_DIR:-$HOME/.local/bin}"
CLI_FILE="${INSTALL_DIR}/cld.js"
SYMLINK="${BIN_DIR}/${APP}"
SYSTEM_PROMPT_FILE="${INSTALL_DIR}/System/systemprompt.md"

requested_version="${CLD_VERSION:-}"
no_modify_path=false
local_file=""

# ── Usage ──────────────────────────────────────────────────
usage() {
    cat <<EOF
${BOLD}${APP_NAME}${NC} — ${APP_DESC}

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 2.0.0)
    -f, --file <path>       Install from a local cld.js instead of downloading
        --no-modify-path    Don't modify shell config files (.zshrc, .bashrc, etc.)

Examples:
    curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install/install.sh | bash
    curl -fsSL https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install/install.sh | bash -s -- --version 2.0.0
    ./install.sh --file ./cld.js

Repository: https://github.com/${REPO_OWNER}/${REPO_NAME}
EOF
}

# ── Parse Arguments ────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                echo -e "${RED}Error: --version requires a version argument${NC}" >&2
                exit 1
            fi
            ;;
        -f|--file)
            if [[ -n "${2:-}" ]]; then
                local_file="$2"
                shift 2
            else
                echo -e "${RED}Error: --file requires a path argument${NC}" >&2
                exit 1
            fi
            ;;
        --no-modify-path)
            no_modify_path=true
            shift
            ;;
        *)
            echo -e "${ORANGE}Warning: Unknown option '$1'${NC}" >&2
            shift
            ;;
    esac
done

# ── Print Helpers ──────────────────────────────────────────
info()    { printf "${MUTED}  →${NC} %s\n" "$1"; }
ok()     { printf "${GREEN}  ✓${NC} %s\n" "$1"; }
warn()   { printf "${YELLOW}  !${NC} %s\n" "$1"; }
fail()   { printf "${RED}  ✗${NC} %s\n" "$1" >&2; }

# ── Progress Bar ───────────────────────────────────────────
unbuffered_sed() {
    if echo | sed -u -e "" >/dev/null 2>&1; then
        sed -nu "$@"
    elif echo | sed -l -e "" >/dev/null 2>&1; then
        sed -nl "$@"
    else
        sed -ne "$@"
    fi
}

print_progress() {
    local bytes="$1"
    local length="$2"
    [ "$length" -gt 0 ] || return 0

    local width=40
    local percent=$(( bytes * 100 / length ))
    [ "$percent" -gt 100 ] && percent=100
    local on=$(( percent * width / 100 ))
    local off=$(( width - on ))

    local filled=$(printf "%*s" "$on" "")
    filled=${filled// /█}
    local empty=$(printf "%*s" "$off" "")
    empty=${empty// /░}

    printf "\r  ${CYAN}%s${MUTED}%s${NC} ${BOLD}%3d%%${NC}" "$filled" "$empty" "$percent" >&4
}

download_with_progress() {
    local url="$1"
    local output="$2"

    if [ -t 2 ]; then
        exec 4>&2
    else
        exec 4>/dev/null
    fi

    local tmp_dir="${TMPDIR:-/tmp}"
    local tracefile="${tmp_dir}/cld_install_trace_$$"

    rm -f "$tracefile"
    mkfifo "$tracefile" 2>/dev/null || {
        # Fallback if mkfifo fails (some restricted environments)
        curl -fsSL -o "$output" "$url"
        return $?
    }

    printf "\033[?25l" >&4
    trap "trap - RETURN; rm -f '$tracefile'; printf '\033[?25h' >&4; exec 4>&-" RETURN

    (
        curl --trace-ascii "$tracefile" -s -L -o "$output" "$url"
    ) &
    local curl_pid=$!

    unbuffered_sed \
        -e '/^0000: content-length:/p' \
        -e '/^<= recv data/p' \
        "$tracefile" 2>/dev/null | \
    {
        local length=0
        local bytes=0

        while IFS=" " read -r -a line; do
            [ "${#line[@]}" -lt 2 ] && continue
            local tag="${line[0]} ${line[1]}"

            if [ "$tag" = "0000: content-length:" ]; then
                length="${line[2]}"
                length=$(echo "$length" | tr -d '\r')
                bytes=0
            elif [ "$tag" = "<= recv" ]; then
                local size="${line[3]}"
                bytes=$(( bytes + size ))
                if [ "$length" -gt 0 ]; then
                    print_progress "$bytes" "$length"
                fi
            fi
        done
    }

    wait $curl_pid
    local ret=$?
    printf "\n" >&4
    return $ret
}

# ── Banner ─────────────────────────────────────────────────
show_banner() {
    local term_width
    term_width=$(tput cols 2>/dev/null || echo 80)

    echo ""
    if [ "$term_width" -ge 70 ] 2>/dev/null; then
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

# ── Check Prerequisites ────────────────────────────────────
check_prerequisites() {
    # Node.js
    if ! command -v node &>/dev/null; then
        fail "Node.js not found"
        echo ""
        echo -e "  Install it first:"
        echo -e "    ${YELLOW}pkg install nodejs${NC}     # Termux"
        echo -e "    ${YELLOW}apt install nodejs${NC}     # Debian/Ubuntu"
        echo -e "    ${YELLOW}brew install node${NC}      # macOS"
        echo -e "    ${YELLOW}winget install OpenJS.NodeJS${NC}  # Windows"
        echo ""
        exit 1
    fi

    local node_ver
    node_ver=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$node_ver" -lt 18 ]; then
        fail "Node.js 18+ required. Current: $(node -v)"
        exit 1
    fi
    ok "Node.js $(node -v)"

    # Download tool
    if command -v curl &>/dev/null; then
        DOWNLOAD_CMD="curl -fsSL"
    elif command -v wget &>/dev/null; then
        DOWNLOAD_CMD="wget -qO-"
    else
        fail "Need curl or wget. Install one and retry."
        exit 1
    fi
    ok "Download tool ready"
}

# ── Version Check ──────────────────────────────────────────
check_version() {
    if [ -f "$CLI_FILE" ]; then
        local installed_version
        installed_version=$(node -e "
            try {
                const pkg = require('${INSTALL_DIR}/package.json');
                console.log(pkg.version || '0.0.0');
            } catch { console.log('0.0.0'); }
        " 2>/dev/null || echo "0.0.0")
        installed_version=$(echo "$installed_version" | tr -d '[:space:]')

        if [ -n "$requested_version" ] && [ "$installed_version" = "$requested_version" ]; then
            info "Version $requested_version already installed"
            return 0
        fi

        if [ -z "$requested_version" ] && [ "$installed_version" != "0.0.0" ]; then
            info "Installed: v$installed_version — will update to latest"
        fi
    fi
    return 1
}

# ── Create Directories ─────────────────────────────────────
setup_directories() {
    local subdirs="System Skills Plugins Exports Benchmarks"
    for d in $subdirs; do
        mkdir -p "${INSTALL_DIR}/${d}"
    done
    mkdir -p "${BIN_DIR}"
    chmod -R 700 "${INSTALL_DIR}" 2>/dev/null || true
    ok "Directory structure ready"
}

# ── Download File ──────────────────────────────────────────
download_file() {
    local url="$1"
    local dest="$2"
    local label="$3"

    info "Downloading $label..."

    if [ -t 2 ] && command -v curl &>/dev/null; then
        download_with_progress "$url" "$dest" || {
            warn "Progress download failed, retrying with standard curl..."
            curl -fsSL -o "$dest" "$url" || {
                fail "Failed to download $label"
                return 1
            }
        }
    else
        $DOWNLOAD_CMD "$url" > "$dest" || {
            fail "Failed to download $label"
            return 1
        }
    fi
    ok "$label downloaded"
}

# ── Install from remote ────────────────────────────────────
install_from_remote() {
    local version_path=""
    if [ -n "$requested_version" ]; then
        version_path="v${requested_version}/"
    fi

    local cli_url="${RAW_BASE}/${version_path}main/cld.js"
    local prompt_url="${RAW_BASE}/${version_path}systemprompt.md"
    local pkg_url="${RAW_BASE}/${version_path}package.json"

    # Download cld.js
    download_file "$cli_url" "$CLI_FILE" "cld.js"
    chmod +x "$CLI_FILE"

    # Download package.json (for version tracking)
    $DOWNLOAD_CMD "$pkg_url" > "${INSTALL_DIR}/package.json" 2>/dev/null || true

    # Download system prompt
    if $DOWNLOAD_CMD "$prompt_url" > "$SYSTEM_PROMPT_FILE" 2>/dev/null; then
        ok "systemprompt.md downloaded"
    else
        warn "systemprompt.md not found — using default"
        write_default_prompt
    fi
}

# ── Install from local file ────────────────────────────────
install_from_local() {
    info "Installing from local file: $local_file"
    if [ ! -f "$local_file" ]; then
        fail "File not found: $local_file"
        exit 1
    fi
    cp "$local_file" "$CLI_FILE"
    chmod +x "$CLI_FILE"
    ok "cld.js installed from local file"

    # Create default system prompt
    if [ ! -f "$SYSTEM_PROMPT_FILE" ]; then
        write_default_prompt
    fi
}

# ── Default System Prompt ──────────────────────────────────
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
5. **Observe** — Read tool outputs fully. Never hallucinate results.
6. **Reflect** — "Did this succeed? If not, correct immediately."
7. **Verify** — Test the final result. Loop back if it fails.
8. **Report** — Summarize what was done, with evidence.

## Core Rules
- `read_file` before any edit. Always.
- `edit_file` with EXACT `old_string`. Whitespace matters.
- Destructive commands require approval.
- Write production code. Handle errors. Validate inputs.
- Never guess file contents. Re-read if uncertain.
- If a tool fails twice, re-think your approach.
- Be direct. No fluff. Code over prose.
EOF
}

# ── Create Symlink ─────────────────────────────────────────
create_symlink() {
    ln -sf "$CLI_FILE" "$SYMLINK"
    ok "Symlink: ${SYMLINK} → cld.js"
}

# ── Configure PATH ─────────────────────────────────────────
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

add_to_path() {
    local config_file="$1"
    local path_line="$2"

    if [ ! -f "$config_file" ]; then
        return 1
    fi

    if grep -q "$path_line" "$config_file" 2>/dev/null; then
        return 2  # Already exists
    fi

    echo "" >> "$config_file"
    echo "# CLD — Recursive Agent Loop" >> "$config_file"
    echo "$path_line" >> "$config_file"
    return 0
}

configure_path() {
    if [ "$no_modify_path" = true ]; then
        info "Skipping PATH modification (--no-modify-path)"
        return
    fi

    local current_shell
    current_shell=$(basename "${SHELL:-/bin/bash}")

    local config_files=""
    local path_command=""

    case "$current_shell" in
        fish)
            config_files="$HOME/.config/fish/config.fish"
            path_command="fish_add_path $BIN_DIR"
            ;;
        zsh)
            config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv"
            path_command="export PATH=\"$BIN_DIR:\$PATH\""
            ;;
        bash)
            config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc"
            path_command="export PATH=\"$BIN_DIR:\$PATH\""
            ;;
        *)
            config_files="$HOME/.profile $HOME/.bashrc"
            path_command="export PATH=\"$BIN_DIR:\$PATH\""
            ;;
    esac

    local written=false
    for cf in $config_files; do
        add_to_path "$cf" "$path_command"
        local result=$?
        if [ $result -eq 0 ]; then
            ok "Added to ${cf}"
            written=true
            break
        elif [ $result -eq 2 ]; then
            ok "Already in ${cf}"
            written=true
            break
        fi
    done

    if [ "$written" = false ]; then
        # No config file existed — create .profile
        local fallback="$HOME/.profile"
        echo "# CLD" >> "$fallback"
        echo "$path_command" >> "$fallback"
        ok "Created ${fallback} with PATH entry"
    fi

    # Also handle fish if it exists but isn't current shell
    if [ "$current_shell" != "fish" ] && [ -d "$HOME/.config/fish" ]; then
        add_to_path "$HOME/.config/fish/config.fish" "fish_add_path $BIN_DIR" 2>/dev/null || true
    fi
}

# ── GitHub Actions ─────────────────────────────────────────
setup_github_actions() {
    if [ -n "${GITHUB_ACTIONS:-}" ] && [ "${GITHUB_ACTIONS}" = "true" ]; then
        echo "$BIN_DIR" >> "$GITHUB_PATH"
        info "Added to \$GITHUB_PATH"
    fi
}

# ── Post-Install Message ───────────────────────────────────
post_install_message() {
    local in_path=false
    if echo "$PATH" | tr ':' '\n' | grep -qxF "$BIN_DIR"; then
        in_path=true
    fi

    echo ""
    if $in_path; then
        echo -e "${GREEN}${BOLD}  CLD is ready!${NC}"
        echo ""
        echo -e "  Run:    ${CYAN}${BOLD}cld${NC}"
        echo -e "  Help:   ${MUTED}cld → /help${NC}"
        echo -e "  Prompt: ${MUTED}~/.cld/System/systemprompt.md${NC}"
        echo -e "  Edit:   ${MUTED}/edit-prompt${NC}"
    else
        echo -e "${YELLOW}${BOLD}  Almost done! Activate CLD:${NC}"
        echo ""
        echo -e "  ${CYAN}export PATH=\"$BIN_DIR:\$PATH\"${NC}"
        echo -e "  ${CYAN}cld${NC}"
        echo ""
        echo -e "  ${MUTED}Or restart your terminal.${NC}"
    fi
    echo ""
    echo -e "${MUTED}  Docs: https://github.com/${REPO_OWNER}/${REPO_NAME}${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════

show_banner

echo -e "${BOLD}${APP_NAME} Installer${NC}"
echo -e "${MUTED}${APP_DESC}${NC}"
echo ""

check_prerequisites
setup_directories

if [ -n "$local_file" ]; then
    # Install from local file
    install_from_local
elif check_version; then
    # Already installed at requested version
    create_symlink
    configure_path
    setup_github_actions
    post_install_message
    exit 0
else
    # Download and install
    install_from_remote
fi

create_symlink
configure_path
setup_github_actions
post_install_message
