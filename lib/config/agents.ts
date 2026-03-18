import * as ec2 from 'aws-cdk-lib/aws-ec2';

// ── Framework type discriminator ────────────────────────────────
export type FrameworkType = 'openclaw' | 'nanoclaw' | 'bedrock-agentcore';

// ── LLM API provider (used by EC2-based frameworks) ─────────────
export type ApiProvider = 'anthropic' | 'openrouter' | 'ollama' | 'bedrock' | 'gemini';

// ── OpenClaw config (existing) ──────────────────────────────────
export interface OpenClawConfig {
  primaryModel: string;
  fallbackModel?: string;
  heartbeatIntervalMinutes: number;
  discord: {
    botTokenSsmParam: string;
    gatewayTokenSsmParam: string;
  };
  sandbox: boolean;
  apiProvider: ApiProvider;
  // Ollama
  ollamaBaseUrl?: string;
  // Bedrock (uses IAM auth — no API key required)
  bedrockRegion?: string;    // e.g. 'us-east-1'
  bedrockModelId?: string;   // e.g. 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  // Gemini
  geminiApiKeyParam?: string; // SSM parameter path for the Gemini API key
  geminiBaseUrl?: string;     // defaults to 'https://generativelanguage.googleapis.com/v1beta'
}

// ── NanoClaw config (new) ───────────────────────────────────────
export interface NanoClawConfig {
  primaryModel: string;
  fallbackModel?: string;
  heartbeatIntervalMinutes: number;
  discord: {
    botTokenSsmParam: string;
    gatewayTokenSsmParam: string;
  };
  apiProvider: ApiProvider;
  // Ollama
  ollamaBaseUrl?: string;
  // Bedrock (uses IAM auth — no API key required)
  bedrockRegion?: string;
  bedrockModelId?: string;
  // Gemini
  geminiApiKeyParam?: string;
  geminiBaseUrl?: string;
}

// ── Bedrock AgentCore config (new) ──────────────────────────────
export interface BedrockAgentCoreConfig {
  /** Foundation model ARN or model ID, e.g. 'anthropic.claude-3-5-sonnet-20241022-v2:0' */
  foundationModel: string;
  /** The agent's base instruction / system prompt */
  agentInstruction: string;
  /** Idle session TTL in seconds. Default: 600 */
  idleSessionTTLInSeconds?: number;
  /** Defaults to the CDK stack region */
  agentRegion?: string;
  /** Optional Lambda ARN for custom action groups */
  actionGroupLambdaArn?: string;
  /** Optional Bedrock Knowledge Base ID to associate */
  knowledgeBaseId?: string;
}

// ── Agent definition — supports all three frameworks ────────────
export interface AgentDefinition {
  agentId: string;
  agentName: string;
  emoji: string;
  role: string;
  /** Optional — EC2-based frameworks (openclaw, nanoclaw) require this field */
  instanceType?: ec2.InstanceType;
  /** Discriminates which agent runtime framework this agent uses */
  frameworkType: FrameworkType;
  /** Present when frameworkType === 'openclaw' */
  openclawConfig?: OpenClawConfig;
  /** Present when frameworkType === 'nanoclaw' */
  nanoClawConfig?: NanoClawConfig;
  /** Present when frameworkType === 'bedrock-agentcore' */
  bedrockAgentCoreConfig?: BedrockAgentCoreConfig;
}

// ── SSM parameter paths ─────────────────────────────────────────
export const SHARED_SSM_PARAMS = {
  // OpenClaw (existing)
  anthropicApiKey:              '/openclaw/anthropic-api-key',
  openrouterApiKey:             '/openclaw/openrouter-api-key',
  geminiApiKey:                 '/openclaw/gemini-api-key',
  tailscaleAuthKey:             '/openclaw/tailscale-auth-key',
  telegramGroupId:              '/openclaw/telegram-group-id',
  // NanoClaw (new)
  nanoClawAnthropicKey:         '/nanoclaw/anthropic-api-key',
  nanoClawOpenrouterKey:        '/nanoclaw/openrouter-api-key',
  nanoClawGeminiKey:            '/nanoclaw/gemini-api-key',
  nanoClawTailscaleKey:         '/nanoclaw/tailscale-auth-key',
  // Bedrock AgentCore (new — uses IAM auth, no API keys required by default)
  bedrockAgentCoreTailscaleKey: '/bedrock-agentcore/tailscale-auth-key',
};

// ── Active agent fleet ──────────────────────────────────────────
export const AGENTS: AgentDefinition[] = [
  {
    agentId: 'manager',
    agentName: 'Atlas',
    emoji: '🗺️',
    role: 'Manager & Coordinator',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    frameworkType: 'openclaw',
    openclawConfig: {
      primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      heartbeatIntervalMinutes: 15,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/manager',
        gatewayTokenSsmParam: '/openclaw/gateway-token/manager',
      },
      sandbox: false,
      apiProvider: 'bedrock',
      bedrockRegion: 'us-east-1',
      bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    },
  },
  {
    agentId: 'product',
    agentName: 'Nova',
    emoji: '🚀',
    role: 'Product & Growth Lead',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    frameworkType: 'openclaw',
    openclawConfig: {
      primaryModel: 'gemini/gemini-2.0-flash',
      heartbeatIntervalMinutes: 30,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/product',
        gatewayTokenSsmParam: '/openclaw/gateway-token/product',
      },
      sandbox: false,
      apiProvider: 'gemini',
      geminiApiKeyParam: '/openclaw/gemini-api-key',
    },
  },
  {
    agentId: 'developer',
    agentName: 'Forge',
    emoji: '🔧',
    role: 'Technical Developer',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    frameworkType: 'openclaw',
    openclawConfig: {
      primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      heartbeatIntervalMinutes: 30,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/developer',
        gatewayTokenSsmParam: '/openclaw/gateway-token/developer',
      },
      sandbox: true,
      apiProvider: 'bedrock',
      bedrockRegion: 'us-east-1',
      bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    },
  },
];

// ── Example agent definitions for NanoClaw and Bedrock AgentCore ─
// These are reference configurations. Add entries to AGENTS above to deploy them.
export const EXAMPLE_AGENTS: AgentDefinition[] = [
  // ── NanoClaw example ──────────────────────────────────────────
  {
    agentId: 'analyst',
    agentName: 'Iris',
    emoji: '🔬',
    role: 'Data Analyst',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    frameworkType: 'nanoclaw',
    nanoClawConfig: {
      primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      heartbeatIntervalMinutes: 30,
      discord: {
        botTokenSsmParam: '/nanoclaw/discord-bot-token/analyst',
        gatewayTokenSsmParam: '/nanoclaw/gateway-token/analyst',
      },
      apiProvider: 'bedrock',
      bedrockRegion: 'us-east-1',
      bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    },
  },
  // ── Bedrock AgentCore example ─────────────────────────────────
  {
    agentId: 'support',
    agentName: 'Sage',
    emoji: '🧠',
    role: 'Customer Support Specialist',
    // Note: no instanceType — Bedrock AgentCore is fully managed, no EC2 needed
    frameworkType: 'bedrock-agentcore',
    bedrockAgentCoreConfig: {
      foundationModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      agentInstruction:
        'You are Sage, a helpful customer support specialist. ' +
        'Answer customer questions clearly and concisely, and escalate complex issues to the human team.',
      idleSessionTTLInSeconds: 600,
    },
  },
];
