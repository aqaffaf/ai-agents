import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface AgentDefinition {
  agentId: string;
  agentName: string;
  emoji: string;
  role: string;
  instanceType: ec2.InstanceType;
  openclawConfig: OpenClawConfig;
}

export type ApiProvider = 'anthropic' | 'openrouter' | 'ollama';

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
  ollamaBaseUrl?: string;
}

export const SHARED_SSM_PARAMS = {
  anthropicApiKey: '/openclaw/anthropic-api-key',
  telegramGroupId: '/openclaw/telegram-group-id',
  tailscaleAuthKey: '/openclaw/tailscale-auth-key',
  openrouterApiKey: '/openclaw/openrouter-api-key',
};

export const AGENTS: AgentDefinition[] = [
  {
    agentId: 'manager',
    agentName: 'Atlas',
    emoji: '🗺️',
    role: 'Manager & Coordinator',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'ollama/qwen3:14b',
      heartbeatIntervalMinutes: 15,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/manager',
        gatewayTokenSsmParam: '/openclaw/gateway-token/manager',
      },
      sandbox: false,
      apiProvider: 'ollama',
      ollamaBaseUrl: 'http://z6:11434',
    },
  },
  {
    agentId: 'product',
    agentName: 'Nova',
    emoji: '🚀',
    role: 'Product & Growth Lead',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'ollama/qwen3:14b',
      heartbeatIntervalMinutes: 30,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/product',
        gatewayTokenSsmParam: '/openclaw/gateway-token/product',
      },
      sandbox: false,
      apiProvider: 'ollama',
      ollamaBaseUrl: 'http://z6:11434',
    },
  },
  {
    agentId: 'developer',
    agentName: 'Forge',
    emoji: '🔧',
    role: 'Technical Developer',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'ollama/qwen3:14b',
      heartbeatIntervalMinutes: 30,
      discord: {
        botTokenSsmParam: '/openclaw/discord-bot-token/developer',
        gatewayTokenSsmParam: '/openclaw/gateway-token/developer',
      },
      sandbox: true,
      apiProvider: 'ollama',
      ollamaBaseUrl: 'http://z6:11434',
    },
  },
];
