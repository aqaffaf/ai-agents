import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface AgentDefinition {
  agentId: string;
  agentName: string;
  emoji: string;
  role: string;
  instanceType: ec2.InstanceType;
  openclawConfig: OpenClawConfig;
}

export type ApiProvider = 'anthropic' | 'openrouter' | 'ollama' | 'bedrock' | 'gemini';

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

export const SHARED_SSM_PARAMS = {
  anthropicApiKey:  '/openclaw/anthropic-api-key',
  openrouterApiKey: '/openclaw/openrouter-api-key',
  geminiApiKey:     '/openclaw/gemini-api-key',
  tailscaleAuthKey: '/openclaw/tailscale-auth-key',
  telegramGroupId:  '/openclaw/telegram-group-id',
};

export const AGENTS: AgentDefinition[] = [
  {
    agentId: 'manager',
    agentName: 'Atlas',
    emoji: '🗺️',
    role: 'Manager & Coordinator',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
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
