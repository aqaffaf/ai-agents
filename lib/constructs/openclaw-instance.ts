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
  workspaceDir: string; // absolute path to workspace template dir
}

export class OpenClawInstance extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: OpenClawInstanceProps) {
    super(scope, id);

    const { agent, vpc, securityGroup, workspaceDir } = props;
    const region = cdk.Stack.of(this).region;

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

    // ── Read workspace template files ──────────────────────────
    const readTemplate = (filename: string): string => {
      const filePath = path.join(workspaceDir, filename);
      return fs.readFileSync(filePath, 'utf-8');
    };

    const soulMd = readTemplate('SOUL.md');
    const identityMd = readTemplate('IDENTITY.md');
    const agentsMd = readTemplate('AGENTS.md');
    const heartbeatMd = readTemplate('HEARTBEAT.md');

    // ── Build openclaw.json ────────────────────────────────────
    const openclawJson = buildOpenClawJson(agent);

    // ── User Data ──────────────────────────────────────────────
    const bootstrapScript = fs.readFileSync(
      path.join(__dirname, '..', 'user-data', 'bootstrap.sh'),
      'utf-8',
    );

    const userData = ec2.UserData.forLinux();
    const rendered = bootstrapScript
      .replaceAll('%%AGENT_ID%%', agent.agentId)
      .replaceAll('%%AGENT_NAME%%', agent.agentName)
      .replaceAll('%%REGION%%', region)
      .replaceAll('%%ANTHROPIC_KEY_PARAM%%', SHARED_SSM_PARAMS.anthropicApiKey)
      .replaceAll('%%TELEGRAM_BOT_TOKEN_PARAM%%', agent.openclawConfig.telegram.botTokenSsmParam)
      .replaceAll('%%GATEWAY_TOKEN_PARAM%%', agent.openclawConfig.telegram.gatewayTokenSsmParam)
      .replaceAll('%%TELEGRAM_GROUP_ID_PARAM%%', SHARED_SSM_PARAMS.telegramGroupId)
      .replaceAll('%%TAILSCALE_KEY_PARAM%%', SHARED_SSM_PARAMS.tailscaleAuthKey)
      .replaceAll('%%SOUL_MD%%', soulMd)
      .replaceAll('%%IDENTITY_MD%%', identityMd)
      .replaceAll('%%AGENTS_MD%%', agentsMd)
      .replaceAll('%%HEARTBEAT_MD%%', heartbeatMd)
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
    });

    cdk.Tags.of(this.instance).add('Project', 'openclaw-squad');
    cdk.Tags.of(this.instance).add('Agent', agent.agentId);
    cdk.Tags.of(this.instance).add('AgentName', agent.agentName);
    cdk.Tags.of(this.instance).add('Name', `openclaw-${agent.agentId}`);
  }
}

function buildOpenClawJson(agent: AgentDefinition): string {
  // Only include keys recognized by OpenClaw's config schema.
  // Agent identity (name, role, model) goes in workspace SOUL/IDENTITY files.
  const config: Record<string, unknown> = {
    channels: {
      telegram: {
        enabled: true,
      },
    },
    gateway: {
      mode: 'local',
      bind: 'loopback',
      auth: {
        mode: 'token',
      },
      controlUi: {
        dangerouslyDisableDeviceAuth: true,
      },
    },
  };

  return JSON.stringify(config, null, 2);
}
