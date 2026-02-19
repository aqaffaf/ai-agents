import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface AgentDefinition {
  agentId: string;
  agentName: string;
  emoji: string;
  role: string;
  instanceType: ec2.InstanceType;
  openclawConfig: OpenClawConfig;
}

export interface OpenClawConfig {
  primaryModel: string;
  fallbackModel?: string;
  heartbeatIntervalMinutes: number;
  telegram: {
    botTokenSsmParam: string;
    gatewayTokenSsmParam: string;
  };
  sandbox: boolean;
}

export const SHARED_SSM_PARAMS = {
  anthropicApiKey: '/openclaw/anthropic-api-key',
  telegramGroupId: '/openclaw/telegram-group-id',
  tailscaleAuthKey: '/openclaw/tailscale-auth-key',
};

export const AGENTS: AgentDefinition[] = [
  {
    agentId: 'manager',
    agentName: 'Atlas',
    emoji: '🗺️',
    role: 'Manager & Coordinator',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'claude-opus-4-6',
      fallbackModel: 'claude-sonnet-4-5-20241022',
      heartbeatIntervalMinutes: 15,
      telegram: {
        botTokenSsmParam: '/openclaw/telegram-bot-token/manager',
        gatewayTokenSsmParam: '/openclaw/gateway-token/manager',
      },
      sandbox: false,
    },
  },
  {
    agentId: 'product',
    agentName: 'Nova',
    emoji: '🚀',
    role: 'Product & Growth Lead',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'claude-sonnet-4-5-20241022',
      heartbeatIntervalMinutes: 30,
      telegram: {
        botTokenSsmParam: '/openclaw/telegram-bot-token/product',
        gatewayTokenSsmParam: '/openclaw/gateway-token/product',
      },
      sandbox: false,
    },
  },
  {
    agentId: 'developer',
    agentName: 'Forge',
    emoji: '🔧',
    role: 'Technical Developer',
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    openclawConfig: {
      primaryModel: 'claude-sonnet-4-5-20241022',
      fallbackModel: 'claude-opus-4-6',
      heartbeatIntervalMinutes: 30,
      telegram: {
        botTokenSsmParam: '/openclaw/telegram-bot-token/developer',
        gatewayTokenSsmParam: '/openclaw/gateway-token/developer',
      },
      sandbox: true,
    },
  },
];
