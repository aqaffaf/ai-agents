import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AgentDefinition } from '../lib/config/agents';
import { buildOpenClawJson } from '../lib/constructs/openclaw-instance';

const baseAgent = (overrides: Partial<AgentDefinition['openclawConfig']>): AgentDefinition => ({
  agentId: 'test',
  agentName: 'TestAgent',
  emoji: '🤖',
  role: 'Test Role',
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
  openclawConfig: {
    primaryModel: 'test/model',
    heartbeatIntervalMinutes: 15,
    discord: {
      botTokenSsmParam: '/openclaw/discord-bot-token/test',
      gatewayTokenSsmParam: '/openclaw/gateway-token/test',
    },
    sandbox: false,
    apiProvider: 'anthropic',
    ...overrides,
  },
});

describe('buildOpenClawJson()', () => {
  describe('ollama provider', () => {
    it('emits a models.providers.ollama block when ollamaBaseUrl is set', () => {
      const agent = baseAgent({
        apiProvider: 'ollama',
        primaryModel: 'ollama/qwen3-coder:480b-cloud',
        ollamaBaseUrl: 'http://100.104.1.104:11434',
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models.providers.ollama).toBeDefined();
      expect(result.models.providers.ollama.baseUrl).toBe('http://100.104.1.104:11434');
      expect(result.models.providers.ollama.api).toBe('ollama');
      expect(result.models.providers.ollama.models[0].id).toBe('qwen3-coder:480b-cloud');
    });

    it('omits models.providers when ollamaBaseUrl is not set', () => {
      const agent = baseAgent({
        apiProvider: 'ollama',
        primaryModel: 'ollama/qwen3-coder',
        ollamaBaseUrl: undefined,
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models).toBeUndefined();
    });
  });

  describe('bedrock provider', () => {
    it('emits a models.providers.bedrock block with region and model', () => {
      const agent = baseAgent({
        apiProvider: 'bedrock',
        primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
        bedrockRegion: 'us-east-1',
        bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });
      const result = JSON.parse(buildOpenClawJson(agent, 'us-east-1'));
      expect(result.models.providers.bedrock).toBeDefined();
      expect(result.models.providers.bedrock.region).toBe('us-east-1');
      expect(result.models.providers.bedrock.api).toBe('bedrock');
      expect(result.models.providers.bedrock.models[0].id).toBe(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
      );
    });

    it('falls back to stack region when bedrockRegion is not set', () => {
      const agent = baseAgent({
        apiProvider: 'bedrock',
        primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
        bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });
      const result = JSON.parse(buildOpenClawJson(agent, 'eu-west-1'));
      expect(result.models.providers.bedrock.region).toBe('eu-west-1');
    });

    it('uses default modelId when bedrockModelId is not set', () => {
      const agent = baseAgent({
        apiProvider: 'bedrock',
        primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      });
      const result = JSON.parse(buildOpenClawJson(agent, 'us-east-1'));
      expect(result.models.providers.bedrock.models[0].id).toBe(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
      );
    });
  });

  describe('gemini provider', () => {
    it('emits a models.providers.gemini block with baseUrl and model', () => {
      const agent = baseAgent({
        apiProvider: 'gemini',
        primaryModel: 'gemini/gemini-2.0-flash',
        geminiApiKeyParam: '/openclaw/gemini-api-key',
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models.providers.gemini).toBeDefined();
      expect(result.models.providers.gemini.baseUrl).toBe(
        'https://generativelanguage.googleapis.com/v1beta',
      );
      expect(result.models.providers.gemini.api).toBe('openai');
      expect(result.models.providers.gemini.models[0].id).toBe('gemini-2.0-flash');
    });

    it('uses custom geminiBaseUrl when provided', () => {
      const agent = baseAgent({
        apiProvider: 'gemini',
        primaryModel: 'gemini/gemini-2.0-flash',
        geminiBaseUrl: 'https://custom.gemini.endpoint/v1',
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models.providers.gemini.baseUrl).toBe('https://custom.gemini.endpoint/v1');
    });
  });

  describe('anthropic provider', () => {
    it('does NOT emit a models.providers block for anthropic', () => {
      const agent = baseAgent({
        apiProvider: 'anthropic',
        primaryModel: 'claude-sonnet-4-6',
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models).toBeUndefined();
    });
  });

  describe('openrouter provider', () => {
    it('does NOT emit a models.providers block for openrouter', () => {
      const agent = baseAgent({
        apiProvider: 'openrouter',
        primaryModel: 'openrouter/anthropic/claude-3-5-sonnet',
      });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.models).toBeUndefined();
    });
  });

  describe('common fields', () => {
    it('always includes agents.defaults.heartbeat', () => {
      const agent = baseAgent({ heartbeatIntervalMinutes: 30 });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.agents.defaults.heartbeat.every).toBe('30m');
    });

    it('always includes channels.discord config', () => {
      const agent = baseAgent({});
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.channels.discord.enabled).toBe(true);
    });

    it('always includes gateway config', () => {
      const agent = baseAgent({});
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.gateway.mode).toBe('local');
    });

    it('includes fallbackModel when provided', () => {
      const agent = baseAgent({ fallbackModel: 'claude-haiku' });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.agents.defaults.model.fallback).toBe('claude-haiku');
    });

    it('omits fallback key when fallbackModel is not provided', () => {
      const agent = baseAgent({ fallbackModel: undefined });
      const result = JSON.parse(buildOpenClawJson(agent));
      expect(result.agents.defaults.model.fallback).toBeUndefined();
    });
  });
});
