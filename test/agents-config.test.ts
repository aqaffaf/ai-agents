import { AGENTS, SHARED_SSM_PARAMS, ApiProvider, OpenClawConfig } from '../lib/config/agents';

/**
 * Replicates the spawnSubagentDefaultModel logic from openclaw-instance.ts
 * so we can test it in isolation without pulling in CDK.
 */
function spawnSubagentDefaultModel(config: OpenClawConfig): string {
  return config.apiProvider === 'openrouter'
    ? config.primaryModel.replace(/^openrouter\//, '')
    : config.apiProvider === 'ollama'
      ? config.primaryModel.replace(/^ollama\//, '')
      : config.apiProvider === 'bedrock'
        ? config.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0'
        : config.apiProvider === 'gemini'
          ? config.primaryModel.replace(/^gemini\//, '')
          : 'claude-sonnet-4-6';
}

describe('AGENTS config', () => {
  it('contains exactly three agents', () => {
    expect(AGENTS).toHaveLength(3);
  });

  it('includes Atlas (manager), Nova (product), and Forge (developer)', () => {
    const ids = AGENTS.map((a) => a.agentId);
    expect(ids).toContain('manager');
    expect(ids).toContain('product');
    expect(ids).toContain('developer');
  });

  it('Atlas is configured to use bedrock', () => {
    const atlas = AGENTS.find((a) => a.agentId === 'manager')!;
    expect(atlas.openclawConfig.apiProvider).toBe('bedrock');
    expect(atlas.openclawConfig.bedrockRegion).toBe('us-east-1');
    expect(atlas.openclawConfig.bedrockModelId).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('Nova is configured to use gemini', () => {
    const nova = AGENTS.find((a) => a.agentId === 'product')!;
    expect(nova.openclawConfig.apiProvider).toBe('gemini');
    expect(nova.openclawConfig.geminiApiKeyParam).toBe(SHARED_SSM_PARAMS.geminiApiKey);
  });

  it('Forge is configured to use bedrock', () => {
    const forge = AGENTS.find((a) => a.agentId === 'developer')!;
    expect(forge.openclawConfig.apiProvider).toBe('bedrock');
    expect(forge.openclawConfig.bedrockRegion).toBe('us-east-1');
    expect(forge.openclawConfig.bedrockModelId).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });
});

describe('SHARED_SSM_PARAMS', () => {
  it('includes geminiApiKey param', () => {
    expect(SHARED_SSM_PARAMS.geminiApiKey).toBe('/openclaw/gemini-api-key');
  });

  it('retains all existing params', () => {
    expect(SHARED_SSM_PARAMS.anthropicApiKey).toBe('/openclaw/anthropic-api-key');
    expect(SHARED_SSM_PARAMS.openrouterApiKey).toBe('/openclaw/openrouter-api-key');
    expect(SHARED_SSM_PARAMS.tailscaleAuthKey).toBe('/openclaw/tailscale-auth-key');
    expect(SHARED_SSM_PARAMS.telegramGroupId).toBe('/openclaw/telegram-group-id');
  });
});

describe('ApiProvider type', () => {
  it('accepts all five providers without TypeScript errors', () => {
    const providers: ApiProvider[] = ['anthropic', 'openrouter', 'ollama', 'bedrock', 'gemini'];
    expect(providers).toHaveLength(5);
  });
});

describe('spawnSubagentDefaultModel()', () => {
  it('strips openrouter/ prefix for openrouter provider', () => {
    const config: OpenClawConfig = {
      primaryModel: 'openrouter/anthropic/claude-3-5-sonnet',
      apiProvider: 'openrouter',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe('anthropic/claude-3-5-sonnet');
  });

  it('strips ollama/ prefix for ollama provider', () => {
    const config: OpenClawConfig = {
      primaryModel: 'ollama/qwen3-coder:480b-cloud',
      apiProvider: 'ollama',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe('qwen3-coder:480b-cloud');
  });

  it('uses bedrockModelId for bedrock provider', () => {
    const config: OpenClawConfig = {
      primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      apiProvider: 'bedrock',
      bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      bedrockRegion: 'us-east-1',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('falls back to default bedrockModelId when bedrockModelId is not set', () => {
    const config: OpenClawConfig = {
      primaryModel: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      apiProvider: 'bedrock',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('strips gemini/ prefix for gemini provider', () => {
    const config: OpenClawConfig = {
      primaryModel: 'gemini/gemini-2.0-flash',
      apiProvider: 'gemini',
      geminiApiKeyParam: '/openclaw/gemini-api-key',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe('gemini-2.0-flash');
  });

  it('returns claude-sonnet-4-6 for anthropic provider (default fallback)', () => {
    const config: OpenClawConfig = {
      primaryModel: 'claude-sonnet-4-6',
      apiProvider: 'anthropic',
      heartbeatIntervalMinutes: 15,
      discord: { botTokenSsmParam: '', gatewayTokenSsmParam: '' },
      sandbox: false,
    };
    expect(spawnSubagentDefaultModel(config)).toBe('claude-sonnet-4-6');
  });
});
