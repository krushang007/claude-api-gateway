# Anthropic API Gateway & Local Token Analytics

A high-performance, containerized Docker API gateway for Anthropic Claude Code that unlocks service account API keys (`sk-ant-svc-...`), eliminates artificial billing blocks (`Credit balance is too low`), tracks live token spend with prompt caching metrics, and provides an HTML cost analytics dashboard.

---

## 🎯 Why This Exists

### The Problem
When using custom Anthropic service account keys (`sk-ant-svc-...`) with Claude Code (CLI or VS Code / Cursor / Antigravity extensions), requests frequently fail with:
```
Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
```
Even when your API key has full credits and billing active!

### The Two Root Causes
1. **The Artificial Header Block**: Claude Code automatically injects the header `anthropic-beta: claude-code-20250219`. Anthropic's backend enforces a strict balance threshold check specifically when this beta header is detected. Stripping this single header while keeping all other betas (prompt caching, thinking, context management) allows the exact same API key to work 100% reliably.
2. **The Extension Forced-OAuth Trap**: In VS Code / Antigravity IDE / Cursor extensions, the extension sets `CLAUDE_CODE_ENTRYPOINT="claude-vscode"`. Anthropic's native binary hardcodes an internal check: if the entrypoint is `claude-vscode`, it **ignores `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`**, forcing `claude.ai` OAuth authentication instead.

### The Solution
1. **Docker Reverse Proxy (`0.0.0.0:8765`)**: Intercepts requests, strips the blocker header, preserves real capabilities (thinking, caching, streaming), injects the API key, and calculates real-time token spend.
2. **One-Command Auto-Configurator (`./setup.sh`)**: Backs up native binaries, installs a lightweight wrapper that sets `CLAUDE_CODE_ENTRYPOINT="sdk-cli"`, and points all Claude Code extensions to the local gateway container.
3. **Live Web Dashboard (`http://localhost:8765`)**: Real-time spending charts, token breakdown, prompt caching savings, and per-request logs.

---

## 🚀 Quick Start (For Any Developer PC)

### Prerequisites
- Docker & Docker Compose installed and running
- Bash shell (macOS or Linux)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/krushang007/claude-api-gateway.git
   cd claude-api-gateway
   ```

2. **Configure your API key:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your key:
   ```env
   ANTHROPIC_API_KEY=sk-ant-svc-...
   PORT=8765
   ```

3. **Run the automated setup:**
   ```bash
   ./setup.sh
   ```
   This script will:
   - Build and start the Docker container in the background.
   - Detect and configure Claude Code in Antigravity IDE, VS Code, Cursor, and standalone CLI.
   - Perform an automated end-to-end verification test against Anthropic.

4. **Reload your IDE window:**
   In Antigravity IDE / VS Code / Cursor:
   - Press `Cmd + Shift + P` (or `Ctrl + Shift + P`)
   - Select **`Developer: Reload Window`**
   - Open Claude Code panel and start chatting!

---

## 📊 Analytics Dashboard

Open [http://localhost:8765](http://localhost:8765) in your browser:

- **Spend by Model**: Live breakdowns for Claude 3.5 / 3.7 / Opus 5.5, Sonnet 5.5, and Haiku 5.5.
- **Prompt Caching Metrics**: Shows cache read tokens (90% discount) vs. 5m/1h cache writes and calculates exact dollar savings.
- **Daily Spend Summary**: Track day-by-day request volume and expenditure.
- **Real-Time Request Stream**: Inspect request latency, HTTP status, token counts, and per-request cost with auto-refresh every 8 seconds.

---

## 💰 Accurate Pricing Model

The gateway implements Anthropic's exact token pricing tiers:

| Model | Input / Mtok | 5m Cache Write | Cache Read (90% off) | Output / Mtok |
| :--- | :---: | :---: | :---: | :---: |
| **Claude Opus 5.5** | \$15.00 | \$3.75 | \$1.50 | \$75.00 |
| **Claude Sonnet 5.5** | \$3.00 | \$0.75 | \$0.30 | \$15.00 |
| **Claude Haiku 5.5** | \$0.80 | \$0.20 | \$0.08 | \$4.00 |

Thinking tokens and streaming responses are calculated in real time via SSE decoding.

---

## 🛠 Commands & Management

- **View live gateway logs:**
  ```bash
  docker compose logs -f
  ```
- **Check gateway health API:**
  ```bash
  curl http://localhost:8765/api/stats
  ```
- **Restart gateway:**
  ```bash
  docker compose restart
  ```
- **Uninstall & Restore Original Binaries:**
  ```bash
  ./setup.sh --restore
  ```
  This cleanly restores all original binary files and stops the Docker container.

---

## 🔒 Security
- All sensitive API keys and usage data (`.env`, `data/`) are excluded from version control via `.gitignore`.
- Zero host daemon processes or background agents outside Docker.
