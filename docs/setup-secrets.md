# Setup Secrets Runbook

This document describes the pre-deployment steps required to provision all secrets and enable the required service access before running `cdk deploy`.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [SSM Parameter Store Setup](#2-ssm-parameter-store-setup)
3. [Amazon Bedrock: Enable Model Access](#3-amazon-bedrock-enable-model-access)
4. [Google Gemini: Create an API Key](#4-google-gemini-create-an-api-key)
5. [Discord Bot Tokens](#5-discord-bot-tokens)
6. [Tailscale Auth Key](#6-tailscale-auth-key)
7. [Verification Checklist](#7-verification-checklist)

---

## 1. Prerequisites

- AWS CLI v2 configured with credentials that have `ssm:PutParameter` and `ssm:GetParameter` permissions for the `openclaw/*` namespace.
- An AWS account with Amazon Bedrock available in **`us-east-1`** (N. Virginia).
- A Google account with access to [Google AI Studio](https://aistudio.google.com/).

---

## 2. SSM Parameter Store Setup

All secrets are stored as `SecureString` parameters under the `/openclaw/` prefix.

### 2.1 Anthropic API Key (used by the `anthropic` provider)

```bash
aws ssm put-parameter \
  --name "/openclaw/anthropic-api-key" \
  --type "SecureString" \
  --value "sk-ant-..." \
  --region us-east-1
```

### 2.2 OpenRouter API Key (used by the `openrouter` provider)

```bash
aws ssm put-parameter \
  --name "/openclaw/openrouter-api-key" \
  --type "SecureString" \
  --value "sk-or-..." \
  --region us-east-1
```

### 2.3 Gemini API Key (used by the `gemini` provider — Nova agent)

```bash
aws ssm put-parameter \
  --name "/openclaw/gemini-api-key" \
  --type "SecureString" \
  --value "AIza..." \
  --region us-east-1
```

> **Note:** This parameter is fetched at EC2 bootstrap time by the Nova agent. It must exist before you run `cdk deploy`, otherwise the Nova instance bootstrap will fail.

### 2.4 Tailscale Auth Key

```bash
aws ssm put-parameter \
  --name "/openclaw/tailscale-auth-key" \
  --type "SecureString" \
  --value "tskey-auth-..." \
  --region us-east-1
```

### 2.5 Discord Bot Tokens (per agent)

```bash
# Manager (Atlas)
aws ssm put-parameter \
  --name "/openclaw/discord-bot-token/manager" \
  --type "SecureString" \
  --value "MTxx..." \
  --region us-east-1

# Product (Nova)
aws ssm put-parameter \
  --name "/openclaw/discord-bot-token/product" \
  --type "SecureString" \
  --value "MTxx..." \
  --region us-east-1

# Developer (Forge)
aws ssm put-parameter \
  --name "/openclaw/discord-bot-token/developer" \
  --type "SecureString" \
  --value "MTxx..." \
  --region us-east-1
```

### 2.6 Gateway Tokens (per agent)

```bash
aws ssm put-parameter \
  --name "/openclaw/gateway-token/manager" \
  --type "SecureString" \
  --value "..." \
  --region us-east-1

aws ssm put-parameter \
  --name "/openclaw/gateway-token/product" \
  --type "SecureString" \
  --value "..." \
  --region us-east-1

aws ssm put-parameter \
  --name "/openclaw/gateway-token/developer" \
  --type "SecureString" \
  --value "..." \
  --region us-east-1
```

---

## 3. Amazon Bedrock: Enable Model Access

Bedrock uses IAM role authentication — **no API key is stored in SSM**. The EC2 instance IAM role is granted `bedrock:InvokeModel` automatically by CDK when `apiProvider: 'bedrock'` is configured.

However, you must **enable model access** in the AWS Bedrock console before the model can be invoked:

1. Open the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock) in **us-east-1**.
2. In the left sidebar, click **Model access**.
3. Click **Manage model access**.
4. Find **Anthropic Claude 3.5 Sonnet v2** (`anthropic.claude-3-5-sonnet-20241022-v2:0`) and check the checkbox.
5. Click **Save changes**.
6. Wait for the status to change to **Access granted** (usually takes a few minutes).

> ⚠️ **Important:** Without this step, the Atlas and Forge agents will fail at runtime with an `AccessDeniedException` from Bedrock, even though the IAM policy is correct.

### Verify Bedrock Access

Once access is granted, verify with the CLI (requires the EC2 IAM role or equivalent permissions):

```bash
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --region us-east-1 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}' \
  --content-type application/json \
  --accept application/json \
  /tmp/bedrock-test.json && cat /tmp/bedrock-test.json
```

---

## 4. Google Gemini: Create an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** in the left sidebar.
3. Click **Create API key** and select or create a Google Cloud project.
4. Copy the generated key (starts with `AIza`).
5. Store it in SSM as shown in [Section 2.3](#23-gemini-api-key-used-by-the-gemini-provider--nova-agent).

### Verify Gemini Access

```bash
GEMINI_KEY="AIza..."
curl -s \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}]}' \
  | jq '.candidates[0].content.parts[0].text'
```

---

## 5. Discord Bot Tokens

Each agent requires its own Discord bot application:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it the agent's name (e.g., "Atlas").
3. Go to **Bot** → click **Reset Token** → copy the token.
4. Enable the **Message Content Intent** under Privileged Gateway Intents.
5. Invite the bot to your server with appropriate permissions.
6. Store the token in SSM as shown in [Section 2.5](#25-discord-bot-tokens-per-agent).

---

## 6. Tailscale Auth Key

1. Go to the [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys).
2. Click **Generate auth key**.
3. Select **Reusable** and **Ephemeral** (so deprovisioned instances clean up automatically).
4. Copy the key and store it in SSM as shown in [Section 2.4](#24-tailscale-auth-key).

---

## 7. Verification Checklist

Run the following to confirm all parameters are present before deploying:

```bash
REGION="us-east-1"
PARAMS=(
  "/openclaw/anthropic-api-key"
  "/openclaw/openrouter-api-key"
  "/openclaw/gemini-api-key"
  "/openclaw/tailscale-auth-key"
  "/openclaw/discord-bot-token/manager"
  "/openclaw/discord-bot-token/product"
  "/openclaw/discord-bot-token/developer"
  "/openclaw/gateway-token/manager"
  "/openclaw/gateway-token/product"
  "/openclaw/gateway-token/developer"
)

echo "Checking SSM parameters..."
ALL_OK=true
for PARAM in "${PARAMS[@]}"; do
  if aws ssm get-parameter --name "${PARAM}" --region "${REGION}" --query 'Parameter.Name' --output text > /dev/null 2>&1; then
    echo "  ✅ ${PARAM}"
  else
    echo "  ❌ ${PARAM} — MISSING"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = "true" ]; then
  echo ""
  echo "✅ All parameters present. Safe to run: npx cdk deploy"
else
  echo ""
  echo "❌ Some parameters are missing. Please provision them before deploying."
fi
```
