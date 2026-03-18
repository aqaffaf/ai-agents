import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { AgentDefinition, SHARED_SSM_PARAMS } from '../config/agents';

export interface NanoClawInstanceProps {
  agent: AgentDefinition;
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

/**
 * CDK construct for a NanoClaw-powered agent EC2 instance.
 *
 * NanoClaw is a lightweight alternative agent runtime. This construct mirrors
 * OpenClawInstance but uses:
 *  - NanoClaw's installer and binary
 *  - nanoclaw.json config file
 *  - nanoclaw-agent systemd unit
 *  - /nanoclaw/* SSM parameter namespace
 *  - /nanoclaw/<agentId>/* CloudWatch log groups
 */
export class NanoClawInstance extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: NanoClawInstanceProps) {
    super(scope, id);

    const { agent, vpc, securityGroup } = props;
    const region = cdk.Stack.of(this).region;

    if (!agent.nanoClawConfig) {
      throw new Error(
        `Agent "${agent.agentId}" has frameworkType 'nanoclaw' but is missing nanoClawConfig.`,
      );
    }

    if (!agent.instanceType) {
      throw new Error(
        `Agent "${agent.agentId}" has frameworkType 'nanoclaw' but is missing instanceType.`,
      );
    }

    const cfg = agent.nanoClawConfig;

    // ── IAM Role ───────────────────────────────────────────────
    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Allow reading SSM parameters — scoped to /nanoclaw/* namespace
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          cdk.Arn.format(
            { service: 'ssm', resource: 'parameter', resourceName: 'nanoclaw/*' },
            cdk.Stack.of(this),
          ),
        ],
      }),
    );

    // Grant Bedrock invoke permissions when the agent uses Bedrock as its LLM provider
    if (cfg.apiProvider === 'bedrock') {
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [
            `arn:aws:bedrock:${cfg.bedrockRegion ?? region}::foundation-model/*`,
          ],
        }),
      );
    }

    // ── Build nanoclaw.json ────────────────────────────────────
    const nanoClawJson = buildNanoClawJson(agent, region);

    // ── User Data ──────────────────────────────────────────────
    const bootstrapScript = fs.readFileSync(
      path.join(__dirname, '..', 'user-data', 'bootstrap-nanoclaw.sh'),
      'utf-8',
    );

    const spawnSubagentDefaultModel =
      cfg.apiProvider === 'openrouter'
        ? cfg.primaryModel.replace(/^openrouter\//, '')
        : cfg.apiProvider === 'ollama'
          ? cfg.primaryModel.replace(/^ollama\//, '')
          : cfg.apiProvider === 'bedrock'
            ? cfg.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0'
            : cfg.apiProvider === 'gemini'
              ? cfg.primaryModel.replace(/^gemini\//, '')
              : 'claude-sonnet-4-6';

    const userData = ec2.UserData.forLinux();
    const rendered = bootstrapScript
      .replaceAll('%%AGENT_ID%%', agent.agentId)
      .replaceAll('%%AGENT_NAME%%', agent.agentName)
      .replaceAll('%%REGION%%', region)
      .replaceAll('%%ANTHROPIC_KEY_PARAM%%', SHARED_SSM_PARAMS.nanoClawAnthropicKey)
      .replaceAll('%%DISCORD_BOT_TOKEN_PARAM%%', cfg.discord.botTokenSsmParam)
      .replaceAll('%%GATEWAY_TOKEN_PARAM%%', cfg.discord.gatewayTokenSsmParam)
      .replaceAll('%%TAILSCALE_KEY_PARAM%%', SHARED_SSM_PARAMS.nanoClawTailscaleKey)
      .replaceAll('%%API_PROVIDER%%', cfg.apiProvider)
      .replaceAll('%%OPENROUTER_KEY_PARAM%%', SHARED_SSM_PARAMS.nanoClawOpenrouterKey)
      .replaceAll('%%OLLAMA_BASE_URL%%', cfg.ollamaBaseUrl ?? '')
      .replaceAll('%%BEDROCK_REGION%%', cfg.bedrockRegion ?? region)
      .replaceAll('%%BEDROCK_MODEL_ID%%', cfg.bedrockModelId ?? '')
      .replaceAll('%%GEMINI_KEY_PARAM%%', cfg.geminiApiKeyParam ?? SHARED_SSM_PARAMS.nanoClawGeminiKey)
      .replaceAll('%%GEMINI_BASE_URL%%', cfg.geminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta')
      .replaceAll('%%SPAWN_SUBAGENT_DEFAULT_MODEL%%', spawnSubagentDefaultModel)
      .replaceAll('%%NANOCLAW_JSON%%', nanoClawJson);

    userData.addCommands(rendered);

    // ── EC2 Instance ───────────────────────────────────────────
    this.instance = new ec2.Instance(this, 'Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup,
      instanceType: agent.instanceType,
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      associatePublicIpAddress: true,
      requireImdsv2: true,
    });

    cdk.Tags.of(this.instance).add('Project', 'nanoclaw-squad');
    cdk.Tags.of(this.instance).add('Framework', 'nanoclaw');
    cdk.Tags.of(this.instance).add('Agent', agent.agentId);
    cdk.Tags.of(this.instance).add('AgentName', agent.agentName);
    cdk.Tags.of(this.instance).add('Name', `nanoclaw-${agent.agentId}`);
  }
}

/**
 * Build the nanoclaw.json configuration object for a NanoClaw agent.
 * The structure mirrors openclaw.json but is namespaced for NanoClaw.
 */
export function buildNanoClawJson(agent: AgentDefinition, region?: string): string {
  if (!agent.nanoClawConfig) {
    throw new Error(`buildNanoClawJson called on agent "${agent.agentId}" without nanoClawConfig`);
  }

  const resolvedRegion = region ?? 'us-east-1';
  const cfg = agent.nanoClawConfig;

  const modelConfig: Record<string, unknown> = {
    primary: cfg.primaryModel,
  };
  if (cfg.fallbackModel) {
    modelConfig.fallback = cfg.fallbackModel;
  }

  const config: Record<string, unknown> = {};
  const provider = cfg.apiProvider;

  if (provider === 'ollama' && cfg.ollamaBaseUrl) {
    const ollamaModelName = cfg.primaryModel.replace(/^ollama\//, '');
    config.models = {
      providers: {
        ollama: {
          baseUrl: cfg.ollamaBaseUrl,
          apiKey: 'ollama-local',
          api: 'ollama',
          models: [{ id: ollamaModelName, name: ollamaModelName }],
        },
      },
    };
  } else if (provider === 'bedrock') {
    const bedrockModelId = cfg.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    config.models = {
      providers: {
        bedrock: {
          region: cfg.bedrockRegion ?? resolvedRegion,
          api: 'bedrock',
          models: [{ id: bedrockModelId, name: bedrockModelId }],
        },
      },
    };
  } else if (provider === 'gemini') {
    const geminiModel = cfg.primaryModel.replace(/^gemini\//, '');
    const geminiBaseUrl =
      cfg.geminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    config.models = {
      providers: {
        gemini: {
          baseUrl: geminiBaseUrl,
          api: 'openai',
          models: [{ id: geminiModel, name: geminiModel }],
        },
      },
    };
  }
  // anthropic and openrouter: no custom provider block needed

  Object.assign(config, {
    agents: {
      defaults: {
        model: modelConfig,
        heartbeat: {
          every: `${cfg.heartbeatIntervalMinutes}m`,
        },
      },
    },
    channels: {
      discord: {
        enabled: true,
        groupPolicy: 'open',
        allowBots: true,
      },
    },
    gateway: {
      mode: 'local',
      bind: 'loopback',
      auth: {
        mode: 'none',
      },
    },
  });

  return JSON.stringify(config, null, 2);
}
