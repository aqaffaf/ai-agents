import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { AgentDefinition, SHARED_SSM_PARAMS } from '../config/agents';

export interface OpenClawInstanceProps {
  agent: AgentDefinition;
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

export class OpenClawInstance extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: OpenClawInstanceProps) {
    super(scope, id);

    const { agent, vpc, securityGroup } = props;
    const region = cdk.Stack.of(this).region;

    if (!agent.openclawConfig) {
      throw new Error(
        `Agent "${agent.agentId}" has frameworkType 'openclaw' but is missing openclawConfig.`,
      );
    }

    if (!agent.instanceType) {
      throw new Error(
        `Agent "${agent.agentId}" has frameworkType 'openclaw' but is missing instanceType.`,
      );
    }

    // ── IAM Role ───────────────────────────────────────────────
    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Allow reading SSM parameters for secrets
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          cdk.Arn.format(
            { service: 'ssm', resource: 'parameter', resourceName: 'openclaw/*' },
            cdk.Stack.of(this),
          ),
        ],
      }),
    );

    // Grant Bedrock invoke permissions when the agent uses Bedrock as its provider
    if (agent.openclawConfig.apiProvider === 'bedrock') {
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [
            `arn:aws:bedrock:${agent.openclawConfig.bedrockRegion ?? region}::foundation-model/*`,
          ],
        }),
      );
    }

    // ── Build openclaw.json ────────────────────────────────────
    const openclawJson = buildOpenClawJson(agent, region);

    // ── User Data ──────────────────────────────────────────────
    const bootstrapScript = fs.readFileSync(
      path.join(__dirname, '..', 'user-data', 'bootstrap.sh'),
      'utf-8',
    );

    const spawnSubagentDefaultModel =
      agent.openclawConfig.apiProvider === 'openrouter'
        ? agent.openclawConfig.primaryModel.replace(/^openrouter\//, '')
        : agent.openclawConfig.apiProvider === 'ollama'
          ? agent.openclawConfig.primaryModel.replace(/^ollama\//, '')
          : agent.openclawConfig.apiProvider === 'bedrock'
            ? agent.openclawConfig.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0'
            : agent.openclawConfig.apiProvider === 'gemini'
              ? agent.openclawConfig.primaryModel.replace(/^gemini\//, '')
              : 'claude-sonnet-4-6';

    const userData = ec2.UserData.forLinux();
    const rendered = bootstrapScript
      .replaceAll('%%AGENT_ID%%', agent.agentId)
      .replaceAll('%%AGENT_NAME%%', agent.agentName)
      .replaceAll('%%REGION%%', region)
      .replaceAll('%%ANTHROPIC_KEY_PARAM%%', SHARED_SSM_PARAMS.anthropicApiKey)
      .replaceAll('%%DISCORD_BOT_TOKEN_PARAM%%', agent.openclawConfig.discord.botTokenSsmParam)
      .replaceAll('%%GATEWAY_TOKEN_PARAM%%', agent.openclawConfig.discord.gatewayTokenSsmParam)
      .replaceAll('%%TAILSCALE_KEY_PARAM%%', SHARED_SSM_PARAMS.tailscaleAuthKey)
      .replaceAll('%%API_PROVIDER%%', agent.openclawConfig.apiProvider)
      .replaceAll('%%OPENROUTER_KEY_PARAM%%', SHARED_SSM_PARAMS.openrouterApiKey)
      .replaceAll('%%OLLAMA_BASE_URL%%', agent.openclawConfig.ollamaBaseUrl ?? '')
      .replaceAll('%%BEDROCK_REGION%%', agent.openclawConfig.bedrockRegion ?? region)
      .replaceAll('%%BEDROCK_MODEL_ID%%', agent.openclawConfig.bedrockModelId ?? '')
      .replaceAll('%%GEMINI_KEY_PARAM%%', agent.openclawConfig.geminiApiKeyParam ?? SHARED_SSM_PARAMS.geminiApiKey)
      .replaceAll('%%GEMINI_BASE_URL%%', agent.openclawConfig.geminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta')
      .replaceAll('%%SPAWN_SUBAGENT_DEFAULT_MODEL%%', spawnSubagentDefaultModel)
      .replaceAll('%%OPENCLAW_JSON%%', openclawJson);

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

    cdk.Tags.of(this.instance).add('Project', 'openclaw-squad');
    cdk.Tags.of(this.instance).add('Framework', 'openclaw');
    cdk.Tags.of(this.instance).add('Agent', agent.agentId);
    cdk.Tags.of(this.instance).add('AgentName', agent.agentName);
    cdk.Tags.of(this.instance).add('Name', `openclaw-${agent.agentId}`);
  }
}

export function buildOpenClawJson(agent: AgentDefinition, region?: string): string {
  if (!agent.openclawConfig) {
    throw new Error(`buildOpenClawJson called on agent "${agent.agentId}" without openclawConfig`);
  }

  const resolvedRegion = region ?? 'us-east-1';
  const modelConfig: Record<string, unknown> = {
    primary: agent.openclawConfig.primaryModel,
  };
  if (agent.openclawConfig.fallbackModel) {
    modelConfig.fallback = agent.openclawConfig.fallbackModel;
  }

  const config: Record<string, unknown> = {};
  const provider = agent.openclawConfig.apiProvider;

  if (provider === 'ollama' && agent.openclawConfig.ollamaBaseUrl) {
    const ollamaModelName = agent.openclawConfig.primaryModel.replace(/^ollama\//, '');
    config.models = {
      providers: {
        ollama: {
          baseUrl: agent.openclawConfig.ollamaBaseUrl,
          apiKey: 'ollama-local',
          api: 'ollama',
          models: [{ id: ollamaModelName, name: ollamaModelName }],
        },
      },
    };
  } else if (provider === 'bedrock') {
    const bedrockModelId =
      agent.openclawConfig.bedrockModelId ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    config.models = {
      providers: {
        bedrock: {
          region: agent.openclawConfig.bedrockRegion ?? resolvedRegion,
          api: 'bedrock',
          models: [{ id: bedrockModelId, name: bedrockModelId }],
        },
      },
    };
  } else if (provider === 'gemini') {
    const geminiModel = agent.openclawConfig.primaryModel.replace(/^gemini\//, '');
    const geminiBaseUrl =
      agent.openclawConfig.geminiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    config.models = {
      providers: {
        gemini: {
          baseUrl: geminiBaseUrl,
          // Gemini exposes an OpenAI-compatible endpoint
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
          every: `${agent.openclawConfig.heartbeatIntervalMinutes}m`,
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
      controlUi: {
        dangerouslyDisableDeviceAuth: true,
      },
    },
  });

  return JSON.stringify(config, null, 2);
}
