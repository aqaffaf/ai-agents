#!/bin/bash
set -euo pipefail
exec > /var/log/openclaw-bootstrap.log 2>&1

AGENT_ID="%%AGENT_ID%%"
AGENT_NAME="%%AGENT_NAME%%"
REGION="%%REGION%%"

echo "=== Bootstrapping OpenClaw agent: ${AGENT_NAME} (${AGENT_ID}) ==="

# ── System packages ─────────────────────────────────────────────
dnf update -y
dnf install -y jq python3

# ── Install OpenClaw ────────────────────────────────────────────
# The installer runs an interactive setup wizard at the end which fails
# in user data (no /dev/tty). The binary installs fine — we handle config ourselves.
export HOME=/root
curl -fsSL https://openclaw.ai/install.sh | bash || true

# ── Fetch secrets from SSM Parameter Store ──────────────────────
get_ssm_param() {
  aws ssm get-parameter \
    --name "$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text \
    --region "${REGION}"
}

ANTHROPIC_API_KEY=$(get_ssm_param "%%ANTHROPIC_KEY_PARAM%%")
OPENROUTER_API_KEY=""
if [ "%%API_PROVIDER%%" = "openrouter" ]; then
  OPENROUTER_API_KEY=$(get_ssm_param "%%OPENROUTER_KEY_PARAM%%")
fi
DISCORD_BOT_TOKEN=$(get_ssm_param "%%DISCORD_BOT_TOKEN_PARAM%%")
GATEWAY_TOKEN=$(get_ssm_param "%%GATEWAY_TOKEN_PARAM%%")

# ── Create OpenClaw directory structure ─────────────────────────
OC_HOME="/home/ec2-user/.openclaw"
# OpenClaw's actual workspace lives at STATE_DIR/.openclaw/workspace (double-nested)
# when OPENCLAW_STATE_DIR is set. We write to both locations for safety.
ACTUAL_WORKSPACE="${OC_HOME}/.openclaw/workspace"
AGENT_WORKSPACE="${OC_HOME}/agents/main/workspace"
mkdir -p "${ACTUAL_WORKSPACE}" "${AGENT_WORKSPACE}"

# ── Fetch workspace files from GitHub ──────────────────────────
REPO_RAW="https://raw.githubusercontent.com/aqaffaf/ai-agents/main/lib/workspace-templates/${AGENT_ID}"
for WS_DIR in "${ACTUAL_WORKSPACE}" "${AGENT_WORKSPACE}"; do
  for FILE in SOUL.md IDENTITY.md AGENTS.md HEARTBEAT.md SUBAGENTS.md; do
    curl -fsSL "${REPO_RAW}/${FILE}" -o "${WS_DIR}/${FILE}"
  done
done

# ── Install spawn-subagent script ──────────────────────────────
cat > /usr/local/bin/spawn-subagent << 'SUBAGENT_SCRIPT_EOF'
#!/usr/bin/env python3
"""Spawn an ephemeral sub-agent via Anthropic or OpenRouter."""
import sys, json, os, argparse, urllib.request

def call_anthropic(api_key, model, system, task, max_tokens):
    payload = json.dumps({
        'model': model, 'max_tokens': max_tokens,
        'system': system,
        'messages': [{'role': 'user', 'content': task}]
    }).encode()
    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages', data=payload,
        headers={'x-api-key': api_key, 'anthropic-version': '2023-06-01',
                 'content-type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())['content'][0]['text']

def call_openrouter(api_key, model, system, task, max_tokens):
    payload = json.dumps({
        'model': model, 'max_tokens': max_tokens,
        'messages': [{'role': 'system', 'content': system},
                     {'role': 'user', 'content': task}]
    }).encode()
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions', data=payload,
        headers={'Authorization': f'Bearer {api_key}',
                 'content-type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())['choices'][0]['message']['content']

def call_ollama(base_url, model, system, task, max_tokens):
    payload = json.dumps({
        'model': model, 'max_tokens': max_tokens,
        'messages': [{'role': 'system', 'content': system},
                     {'role': 'user', 'content': task}]
    }).encode()
    req = urllib.request.Request(
        f'{base_url}/v1/chat/completions', data=payload,
        headers={'Authorization': 'Bearer ollama',
                 'content-type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())['choices'][0]['message']['content']

def main():
    provider = os.environ.get('SPAWN_SUBAGENT_PROVIDER', 'anthropic')
    default_model = os.environ.get('SPAWN_SUBAGENT_DEFAULT_MODEL', 'claude-sonnet-4-6')

    p = argparse.ArgumentParser()
    p.add_argument('--task', required=True)
    p.add_argument('--system', default='You are a helpful AI assistant.')
    p.add_argument('--model', default=default_model)
    p.add_argument('--max-tokens', type=int, default=4096)
    args = p.parse_args()

    if provider == 'openrouter':
        api_key = os.environ.get('OPENROUTER_API_KEY', '')
        if not api_key:
            print('ERROR: OPENROUTER_API_KEY not set', file=sys.stderr)
            sys.exit(1)
        print(call_openrouter(api_key, args.model, args.system, args.task, args.max_tokens))
    elif provider == 'ollama':
        base_url = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
        print(call_ollama(base_url, args.model, args.system, args.task, args.max_tokens))
    else:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            print('ERROR: ANTHROPIC_API_KEY not set', file=sys.stderr)
            sys.exit(1)
        print(call_anthropic(api_key, args.model, args.system, args.task, args.max_tokens))

if __name__ == '__main__':
    main()
SUBAGENT_SCRIPT_EOF
chmod +x /usr/local/bin/spawn-subagent

# ── Write openclaw.json ────────────────────────────────────────
cat > "${OC_HOME}/openclaw.json" << OCEOF
%%OPENCLAW_JSON%%
OCEOF

# ── Write .env file ────────────────────────────────────────────
cat > "${OC_HOME}/.env" << ENVEOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
OLLAMA_BASE_URL=%%OLLAMA_BASE_URL%%
SPAWN_SUBAGENT_PROVIDER=%%API_PROVIDER%%
SPAWN_SUBAGENT_DEFAULT_MODEL=%%SPAWN_SUBAGENT_DEFAULT_MODEL%%
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
GATEWAY_TOKEN=${GATEWAY_TOKEN}
OPENCLAW_HOME=${OC_HOME}
ENVEOF

# ── Fix ownership ──────────────────────────────────────────────
chown -R ec2-user:ec2-user "${OC_HOME}"

# ── Install Tailscale (tailnet-only HTTPS for Control UI) ─────
curl -fsSL https://tailscale.com/install.sh | sh
TS_AUTH_KEY=$(get_ssm_param "%%TAILSCALE_KEY_PARAM%%")
HOSTNAME="openclaw-$(echo ${AGENT_NAME} | tr '[:upper:]' '[:lower:]')"
systemctl enable tailscaled
systemctl start tailscaled
tailscale up --authkey="${TS_AUTH_KEY}" --hostname="${HOSTNAME}" --accept-routes --ssh

# ── Create system-level systemd service for OpenClaw gateway ────
# openclaw gateway install creates a user-level service which doesn't
# work in headless cloud-init. We create a system service directly.
cat > /etc/systemd/system/openclaw-gateway.service << SVCEOF
[Unit]
Description=OpenClaw Gateway - ${AGENT_NAME}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${OC_HOME}
Environment=HOME=/home/ec2-user
Environment=OPENCLAW_STATE_DIR=${OC_HOME}
Environment=OPENCLAW_CONFIG_PATH=${OC_HOME}/openclaw.json
Environment=ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
Environment=OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
Environment=OLLAMA_BASE_URL=%%OLLAMA_BASE_URL%%
Environment=SPAWN_SUBAGENT_PROVIDER=%%API_PROVIDER%%
Environment=SPAWN_SUBAGENT_DEFAULT_MODEL=%%SPAWN_SUBAGENT_DEFAULT_MODEL%%
Environment=DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
Environment=OPENCLAW_GATEWAY_TOKEN=${GATEWAY_TOKEN}
ExecStart=/usr/bin/openclaw gateway run --bind loopback --tailscale serve
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

# ── Grant full gateway scopes to backend client ────────────────
# OpenClaw's native subagent spawning requires operator.approvals +
# operator.pairing scopes. The backend client is auto-approved with
# only operator.admin on first connect. We watch for the device record
# and patch it immediately, then restart to apply.
(
  PAIRED="${OC_HOME}/devices/paired.json"
  for i in $(seq 1 72); do
    if [ -f "${PAIRED}" ]; then
      jq 'with_entries(.value.scopes = ["operator.admin", "operator.approvals", "operator.pairing"] | .value.tokens.operator.scopes = ["operator.admin", "operator.approvals", "operator.pairing"])' \
        "${PAIRED}" > /tmp/paired_patched.json && mv /tmp/paired_patched.json "${PAIRED}"
      chown ec2-user:ec2-user "${PAIRED}"
      systemctl restart openclaw-gateway
      echo "$(date): Gateway scopes patched for ${AGENT_NAME}"
      break
    fi
    sleep 10
  done
) &

# ── Install and configure CloudWatch agent ─────────────────────
dnf install -y amazon-cloudwatch-agent

cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << 'CWEOF'
{
  "agent": { "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/openclaw-bootstrap.log",
            "log_group_name": "/openclaw/%%AGENT_ID%%/bootstrap",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/home/ec2-user/.openclaw/logs/*.log",
            "log_group_name": "/openclaw/%%AGENT_ID%%/app",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
CWEOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

echo "=== OpenClaw agent ${AGENT_NAME} bootstrap complete ==="
