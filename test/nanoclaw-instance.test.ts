import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AgentDefinition } from '../lib/config/agents';
import { buildNanoClawJson } from '../lib/constructs/nanoclaw-instance';

const baseNanoAgent = (
  overrides: Partial<AgentDefinition['nanoClawConfig']>,
): AgentDefinition => ({
  agentId: 'test',
  agentName: 'TestAgent',
  emoji: '🤖',
  role: 'Test Role',
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
  frameworkType: 'nanoclaw',
  nanoClawConfig: {
    primaryModel: 'test/model',
    heartbeatIntervalMinutes: 15,
    discord: {
      botTokenSsmParam: '/nanoclaw/discord-bot-token/test',
      gatewayTokenSsmParam: '/nanoclaw/gateway-token/test',
    },
    apiProvider: 'anthropic',
    ...overrides,
  },
});

describe('buildNanoClawJson()', () => {
  it('throws if nanoClawConfig is missing', () => {
    const agent: AgentDefinition = {
      agentId: 'bad',
      agentName: 'Bad',
      emoji: '❌',
      role: 'Bad',
      frameworkType: 'nanoclaw',
      // intentionally omit nanoClawConfig
    };
    expect(() => buildNanoClawJson(agent)).toThrow(/nanoClawConfig/);
  });

  describe('ollama provider', () => {
    it('emits a models.providers.ollama block when ollamaBaseUrl is set', () => {
      const agent = baseNanoAgent({
        apiProvider: 'ollama',
        primaryModel: 'ollama/qwen3-coder:480b-cloud',
        ollamaBaseUrl: 'http://100.104.1.104:11434',
      });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.models.providers.ollama).toBeDefined();
      expect(result.models.providers.ollama.baseUrl).toBe('http://100.104.1.104:11434');
      expect(result.models.providers.ollama.api).toBe('ollama');
      expect(result.models.providers.ollama.models[0].id).toBe('qwen3-coder:480b-cloud');
    });

    it('omits models.providers when ollamaBaseUrl is not set', () => {
      const agent = baseNanoAgent({
        apiProvider: 'ollama',
        primaryModel: 'ollama/qwen3-coder',
        ollamaBaseUrl: undefined,
      });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.models).toBeUndefined();
    });
  });

  describe('bedrock provider', () => {
    it('emits a models.providers.bedrock block with region and model', () => {
      const agent = baseNanoAgent({
        apiProvider: 'bedrock',
        primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
        bedrockRegion: 'us-east-1',
        bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });
      const result = JSON.parse(buildNanoClawJson(agent, 'us-east-1'));
      expect(result.models.providers.bedrock).toBeDefined();
      expect(result.models.providers.bedrock.region).toBe('us-east-1');
      expect(result.models.providers.bedrock.api).toBe('bedrock');
      expect(result.models.providers.bedrock.models[0].id).toBe(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
      );
    });

    it('falls back to stack region when bedrockRegion is not set', () => {
      const agent = baseNanoAgent({
        apiProvider: 'bedrock',
        primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
        bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });
      const result = JSON.parse(buildNanoClawJson(agent, 'eu-west-1'));
      expect(result.models.providers.bedrock.region).toBe('eu-west-1');
    });
  });

  describe('gemini provider', () => {
    it('emits a models.providers.gemini block with baseUrl and model', () => {
      const agent = baseNanoAgent({
        apiProvider: 'gemini',
        primaryModel: 'gemini/gemini-2.0-flash',
      });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.models.providers.gemini).toBeDefined();
      expect(result.models.providers.gemini.baseUrl).toBe(
        'https://generativelanguage.googleapis.com/v1beta',
      );
      expect(result.models.providers.gemini.api).toBe('openai');
      expect(result.models.providers.gemini.models[0].id).toBe('gemini-2.0-flash');
    });
  });

  describe('anthropic provider', () => {
    it('does NOT emit a models.providers block for anthropic', () => {
      const agent = baseNanoAgent({ apiProvider: 'anthropic', primaryModel: 'claude-sonnet-4-6' });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.models).toBeUndefined();
    });
  });

  describe('common fields', () => {
    it('always includes agents.defaults.heartbeat', () => {
      const agent = baseNanoAgent({ heartbeatIntervalMinutes: 20 });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.agents.defaults.heartbeat.every).toBe('20m');
    });

    it('always includes channels.discord config', () => {
      const agent = baseNanoAgent({});
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.channels.discord.enabled).toBe(true);
    });

    it('always includes gateway config', () => {
      const agent = baseNanoAgent({});
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.gateway.mode).toBe('local');
    });

    it('includes fallbackModel when provided', () => {
      const agent = baseNanoAgent({ fallbackModel: 'claude-haiku' });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.agents.defaults.model.fallback).toBe('claude-haiku');
    });

    it('omits fallback key when fallbackModel is not provided', () => {
      const agent = baseNanoAgent({ fallbackModel: undefined });
      const result = JSON.parse(buildNanoClawJson(agent));
      expect(result.agents.defaults.model.fallback).toBeUndefined();
    });
  });
});
