#!/usr/bin/env bash
# ==============================================================================
# Claude API Gateway & IDE Auto-Configurator
# ==============================================================================
# Sets up the containerized Claude API Gateway and configures local IDE
# extensions (Antigravity IDE, VS Code, Cursor, CLI) to route through it.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GATEWAY_PORT="${PORT:-8765}"
GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}"

# Terminal colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✔${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✖${NC} $1"; }

# ------------------------------------------------------------------------------
# Action: Restore Original Binaries
# ------------------------------------------------------------------------------
restore_binaries() {
  log_info "Restoring original Claude binaries..."
  local restored=0

  # Search across common extension & version directories
  local search_dirs=(
    "$HOME/.antigravity-ide/extensions"
    "$HOME/.cursor/extensions"
    "$HOME/.vscode/extensions"
    "$HOME/.local/share/claude/versions"
  )

  for base_dir in "${search_dirs[@]}"; do
    if [[ -d "$base_dir" ]]; then
      while IFS= read -r real_binary; do
        local orig_binary="${real_binary%-real}"
        if [[ -f "$real_binary" ]]; then
          rm -f "$orig_binary"
          mv "$real_binary" "$orig_binary"
          chmod +x "$orig_binary"
          log_success "Restored: $orig_binary"
          ((restored++))
        fi
      done < <(find "$base_dir" -name "*claude*-real" -o -name "*2.*-real" 2>/dev/null || true)
    fi
  done

  if [[ $restored -eq 0 ]]; then
    log_info "No wrapped binaries found to restore."
  else
    log_success "Successfully restored $restored binary(ies)."
  fi
}

if [[ "$1" == "--restore" || "$1" == "--uninstall" ]]; then
  restore_binaries
  log_info "Stopping Docker gateway container..."
  docker compose down 2>/dev/null || true
  log_success "All changes reverted."
  exit 0
fi

# ------------------------------------------------------------------------------
# Step 1: Check Environment Configuration
# ------------------------------------------------------------------------------
log_info "Checking environment configuration..."

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    log_warn "Created .env from .env.example."
    log_warn "Please open .env and add your ANTHROPIC_API_KEY, then re-run ./setup.sh"
    exit 1
  else
    log_error "No .env or .env.example found. Please create .env with ANTHROPIC_API_KEY."
    exit 1
  fi
fi

# Load variables from .env
# shellcheck disable=SC2046
export $(grep -v '^#' .env | xargs)

if [[ -z "$ANTHROPIC_API_KEY" || "$ANTHROPIC_API_KEY" == "your_anthropic_api_key_here" ]]; then
  log_error "ANTHROPIC_API_KEY in .env is not set. Please set a valid Anthropic API key."
  exit 1
fi

log_success "Environment loaded (Key: ${ANTHROPIC_API_KEY:0:15}...)"

# ------------------------------------------------------------------------------
# Step 2: Docker Verification & Gateway Startup
# ------------------------------------------------------------------------------
log_info "Checking Docker daemon status..."

if ! docker info >/dev/null 2>&1; then
  log_error "Docker is not running or not installed. Please launch Docker and try again."
  exit 1
fi

log_info "Starting Claude API Gateway container..."
docker compose up -d --build

log_info "Waiting for gateway to become healthy on port ${GATEWAY_PORT}..."
for i in {1..15}; do
  if curl -s "${GATEWAY_URL}/api/stats" >/dev/null 2>&1; then
    log_success "Gateway is healthy and responding on ${GATEWAY_URL}"
    break
  fi
  sleep 1
  if [[ $i -eq 15 ]]; then
    log_error "Gateway did not respond within 15 seconds. Check logs with 'docker compose logs'."
    exit 1
  fi
done

# ------------------------------------------------------------------------------
# Step 3: IDE & Binary Patching
# ------------------------------------------------------------------------------
# Claude Code's native binary has two hardcoded behaviors:
# 1. Strips all custom environment variables not starting with CLAUDE_CODE_RESUME_
# 2. When CLAUDE_CODE_ENTRYPOINT="claude-vscode", it forces claude.ai OAuth and bypasses custom base URLs.
#
# By inserting an entrypoint wrapper around the native binary, we override
# CLAUDE_CODE_ENTRYPOINT="sdk-cli" and guarantee ANTHROPIC_BASE_URL & API Key are active.
# ------------------------------------------------------------------------------
log_info "Scanning for Claude Code installations to configure..."

patch_binary() {
  local binary_path="$1"
  local dir_path
  dir_path="$(dirname "$binary_path")"
  local file_name
  file_name="$(basename "$binary_path")"
  local real_binary_path="${dir_path}/${file_name}-real"

  # If not yet backed up as -real, back it up
  if [[ ! -f "$real_binary_path" ]]; then
    mv "$binary_path" "$real_binary_path"
  fi

  # Create interception wrapper script
  cat << EOF > "$binary_path"
#!/usr/bin/env bash
# Injected Claude Code Gateway Wrapper
export ANTHROPIC_BASE_URL="${GATEWAY_URL}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
export CLAUDE_CODE_ENTRYPOINT="sdk-cli"

REAL_SCRIPT="\$(readlink -f "\$0" 2>/dev/null || perl -MCwd -e 'print Cwd::realpath(\$ARGV[0])' "\$0")"
DIR="\$(cd "\$(dirname "\$REAL_SCRIPT")" && pwd)"
exec "\$DIR/${file_name}-real" "\$@"
EOF

  chmod +x "$binary_path"
  chmod +x "$real_binary_path"
  log_success "Configured: $binary_path"
}

configured_count=0

# 1. Antigravity IDE Extensions
for b in "$HOME"/.antigravity-ide/extensions/anthropic.claude-code-*/resources/native-binary/claude; do
  if [[ -f "$b" || -f "${b}-real" ]]; then
    patch_binary "$b"
    ((configured_count++))
  fi
done

# 2. Cursor Extensions
for b in "$HOME"/.cursor/extensions/anthropic.claude-code-*/resources/native-binary/claude; do
  if [[ -f "$b" || -f "${b}-real" ]]; then
    patch_binary "$b"
    ((configured_count++))
  fi
done

# 3. VS Code Extensions
for b in "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude; do
  if [[ -f "$b" || -f "${b}-real" ]]; then
    patch_binary "$b"
    ((configured_count++))
  fi
done

# 4. Standalone Claude CLI versions
for b in "$HOME"/.local/share/claude/versions/*; do
  if [[ -f "$b" && ! "$b" == *-real ]]; then
    patch_binary "$b"
    ((configured_count++))
  fi
done

log_success "Configured $configured_count Claude environment(s)."

# ------------------------------------------------------------------------------
# Step 4: Verification Test
# ------------------------------------------------------------------------------
log_info "Running end-to-end verification test..."

TEST_OUTPUT=$(curl -s -X POST "${GATEWAY_URL}/v1/messages" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: claude-code-20250219" \
  -d '{
    "model": "claude-haiku-5-5",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "ping"}]
  }')

if echo "$TEST_OUTPUT" | grep -q '"content"'; then
  log_success "Gateway verification test passed! (Claude responded successfully)"
else
  log_warn "Gateway returned: $TEST_OUTPUT"
fi

# ------------------------------------------------------------------------------
# Complete Banner
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  Claude API Gateway Setup Complete!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "  Dashboard:     ${BLUE}${GATEWAY_URL}${NC}"
echo -e "  Logs:          ${BLUE}docker compose logs -f${NC}"
echo -e "  Status:        ${BLUE}curl ${GATEWAY_URL}/api/stats${NC}"
echo -e "  Restore/Reset: ${YELLOW}./setup.sh --restore${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "  Tip: If your IDE is already open, reload it via Command Palette:"
echo -e "       'Developer: Reload Window'"
echo -e "${GREEN}================================================================${NC}"
echo ""

