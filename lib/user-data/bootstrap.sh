#!/bin/bash
set -euo pipefail
exec > /var/log/openclaw-bootstrap.log 2>&1

AGENT_ID="%%AGENT_ID%%"
AGENT_NAME="%%AGENT_NAME%%"
REGION="%%REGION%%"

echo "=== Bootstrapping OpenClaw agent: ${AGENT_NAME} (${AGENT_ID}) ==="

# ── System packages ─────────────────────────────────────────────
dnf update -y
dnf install -y jq

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
TELEGRAM_BOT_TOKEN=$(get_ssm_param "%%TELEGRAM_BOT_TOKEN_PARAM%%")
GATEWAY_TOKEN=$(get_ssm_param "%%GATEWAY_TOKEN_PARAM%%")
TELEGRAM_GROUP_ID=$(get_ssm_param "%%TELEGRAM_GROUP_ID_PARAM%%")

# ── Create OpenClaw directory structure ─────────────────────────
OC_HOME="/home/ec2-user/.openclaw"
# OpenClaw's actual workspace lives at STATE_DIR/.openclaw/workspace (double-nested)
# when OPENCLAW_STATE_DIR is set. We write to both locations for safety.
ACTUAL_WORKSPACE="${OC_HOME}/.openclaw/workspace"
AGENT_WORKSPACE="${OC_HOME}/agents/main/workspace"
mkdir -p "${ACTUAL_WORKSPACE}" "${AGENT_WORKSPACE}"

# ── Write workspace files (injected by CDK) ────────────────────
# Write to the actual workspace path OpenClaw reads from
for WS_DIR in "${ACTUAL_WORKSPACE}" "${AGENT_WORKSPACE}"; do

cat > "${WS_DIR}/SOUL.md" << 'SOUL_EOF'
%%SOUL_MD%%
SOUL_EOF

cat > "${WS_DIR}/IDENTITY.md" << 'IDENTITY_EOF'
%%IDENTITY_MD%%
IDENTITY_EOF

cat > "${WS_DIR}/AGENTS.md" << 'AGENTS_EOF'
%%AGENTS_MD%%
AGENTS_EOF

cat > "${WS_DIR}/HEARTBEAT.md" << 'HEARTBEAT_EOF'
%%HEARTBEAT_MD%%
HEARTBEAT_EOF

done

# ── Write openclaw.json ────────────────────────────────────────
cat > "${OC_HOME}/openclaw.json" << OCEOF
%%OPENCLAW_JSON%%
OCEOF

# ── Write .env file ────────────────────────────────────────────
cat > "${OC_HOME}/.env" << ENVEOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
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
tailscale up --authkey="${TS_AUTH_KEY}" --hostname="${HOSTNAME}" --accept-routes

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
Environment=TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
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
