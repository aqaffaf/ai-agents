# OpenClaw AI Agent Fleet

A CDK TypeScript project that deploys a fleet of four autonomous AI agents (**Atlas**, **Nova**, **Forge**, **Vex**) on EC2, each backed by a configurable AI model provider.

## Agents

| Agent | Role | Default Provider | Default Model |
|-------|------|-----------------|---------------|
| 🗺️ **Atlas** | Manager & Coordinator | Amazon Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| 🚀 **Nova** | Product & Growth Lead | Google Gemini | `gemini-2.0-flash` |
| 🔧 **Forge** | Technical Developer | Amazon Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| 🧪 **Vex** | Quality Assurance Engineer | Amazon Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |

> ⚠️ **Vex pre-deployment prerequisites:** Create SSM parameters `/openclaw/discord-bot-token/qa` and `/openclaw/gateway-token/qa` before running `cdk deploy`. See [Pre-deployment Setup](#pre-deployment-setup).

---

## Supported AI Model Providers

All providers are configured per-agent in `lib/config/agents.ts` via the `ApiProvider` type.

| Provider | `apiProvider` value | Authentication | Key in SSM | Notes |
|----------|-------------------|----------------|-----------|-------|
| **Amazon Bedrock** | `'bedrock'` | IAM Role (no key) | — | Requires model access enabled in Bedrock console |
| **Google Gemini** | `'gemini'` | API Key | `/openclaw/gemini-api-key` | Uses `generateContent` REST API |
| **Anthropic** | `'anthropic'` | API Key | `/openclaw/anthropic-api-key` | Direct Anthropic API |
| **OpenRouter** | `'openrouter'` | API Key | `/openclaw/openrouter-api-key` | Routes to many models |
| **Ollama** | `'ollama'` | None | — | Self-hosted; set `ollamaBaseUrl` |

### Quick-start per provider

#### Amazon Bedrock
```typescript
// lib/config/agents.ts
apiProvider: 'bedrock',
primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
bedrockRegion: 'us-east-1',
bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
```
**Pre-requisite:** Enable model access in the [Bedrock console](https://console.aws.amazon.com/bedrock) → Model access. See [`docs/setup-secrets.md`](docs/setup-secrets.md#3-amazon-bedrock-enable-model-access).

#### Google Gemini
```typescript
apiProvider: 'gemini',
primaryModel: 'gemini/gemini-2.0-flash',
geminiApiKeyParam: '/openclaw/gemini-api-key',  // or custom SSM path
```
**Pre-requisite:** Store your Gemini API key in SSM. See [`docs/setup-secrets.md`](docs/setup-secrets.md#4-google-gemini-create-an-api-key).

#### Anthropic
```typescript
apiProvider: 'anthropic',
primaryModel: 'claude-sonnet-4-6',
```
**Pre-requisite:** `aws ssm put-parameter --name /openclaw/anthropic-api-key --type SecureString --value sk-ant-...`

#### OpenRouter
```typescript
apiProvider: 'openrouter',
primaryModel: 'openrouter/anthropic/claude-3-5-sonnet',
```
**Pre-requisite:** `aws ssm put-parameter --name /openclaw/openrouter-api-key --type SecureString --value sk-or-...`

#### Ollama (self-hosted)
```typescript
apiProvider: 'ollama',
primaryModel: 'ollama/llama3',
ollamaBaseUrl: 'http://<your-ollama-host>:11434',
```

---

## Pre-deployment Setup

Before running `cdk deploy`, provision all required SSM parameters and enable service access. Full instructions: **[`docs/setup-secrets.md`](docs/setup-secrets.md)**.

### Vex (QA agent) — additional required SSM parameters

```bash
aws ssm put-parameter \
  --name "/openclaw/discord-bot-token/qa" \
  --value "<VEX_DISCORD_BOT_TOKEN>" \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/openclaw/gateway-token/qa" \
  --value "<VEX_GATEWAY_TOKEN>" \
  --type SecureString \
  --region us-east-1
```

After creating the Vex Discord bot, replace `VEX_DISCORD_ID` in all `lib/workspace-templates/qa/*.md` files and the three existing `AGENTS.md` files with the real Discord bot User ID.

Quick verification:
```bash
bash docs/setup-secrets.md  # follow the checklist in section 7
```

---

## Useful Commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    run jest unit tests
* `npx cdk synth`   emit synthesized CloudFormation template
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk deploy`  deploy to your default AWS account/region

---

## Architecture

Each agent runs as a dedicated EC2 instance (ARM64, `t4g.small`) with:
- **OpenClaw gateway** as a systemd service
- **Tailscale** for secure remote access
- **CloudWatch** agent for log collection
- IAM role with least-privilege SSM and (optionally) Bedrock permissions
- All secrets fetched from SSM Parameter Store at bootstrap time

Provider selection is a single config value — change `apiProvider` in `lib/config/agents.ts` and redeploy.
