import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import { AgentDefinition } from '../config/agents';

export interface BedrockAgentCoreProps {
  agent: AgentDefinition;
}

/**
 * CDK construct for an AWS Bedrock AgentCore agent.
 *
 * Bedrock AgentCore is Amazon's fully managed agent execution environment.
 * Unlike OpenClaw and NanoClaw, this construct provisions NO EC2 instances —
 * instead it creates:
 *  - An IAM resource role for the Bedrock Agent
 *  - A CfnAgent (AWS::Bedrock::Agent) with the specified foundation model
 *  - A CfnAgentAlias (AWS::Bedrock::AgentAlias) pointing to the DRAFT version
 *  - Optional action group wiring if actionGroupLambdaArn is provided
 *  - CfnOutputs for the Agent ID and Alias ID
 */
export class BedrockAgentCoreConstruct extends Construct {
  /** The underlying CfnAgent resource */
  public readonly cfnAgent: bedrock.CfnAgent;
  /** The CfnAgentAlias pointing to the DRAFT version */
  public readonly cfnAgentAlias: bedrock.CfnAgentAlias;
  /** IAM role assumed by the Bedrock Agent for model invocation */
  public readonly agentResourceRole: iam.Role;

  constructor(scope: Construct, id: string, props: BedrockAgentCoreProps) {
    super(scope, id);

    const { agent } = props;
    const stack = cdk.Stack.of(this);
    const region = stack.region;
    const account = stack.account;

    if (!agent.bedrockAgentCoreConfig) {
      throw new Error(
        `Agent "${agent.agentId}" has frameworkType 'bedrock-agentcore' but is missing bedrockAgentCoreConfig.`,
      );
    }

    const cfg = agent.bedrockAgentCoreConfig;
    const agentRegion = cfg.agentRegion ?? region;

    // ── IAM Resource Role for the Bedrock Agent ────────────────
    // The agent's resource role is assumed by the Bedrock service to call
    // foundation models and (optionally) invoke Lambda action groups.
    this.agentResourceRole = new iam.Role(this, 'AgentResourceRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': account,
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock:${agentRegion}:${account}:agent/*`,
          },
        },
      }),
      description: `Bedrock AgentCore resource role for ${agent.agentName} (${agent.agentId})`,
    });

    // Least-privilege: allow the agent to invoke its foundation model
    this.agentResourceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowBedrockModelInvocation',
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${agentRegion}::foundation-model/${cfg.foundationModel}`,
          // Also allow cross-region inference profiles
          `arn:aws:bedrock:${agentRegion}:${account}:inference-profile/*`,
        ],
      }),
    );

    // If a Lambda action group is specified, allow the agent to invoke it
    if (cfg.actionGroupLambdaArn) {
      this.agentResourceRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'AllowActionGroupLambdaInvocation',
          actions: ['lambda:InvokeFunction'],
          resources: [cfg.actionGroupLambdaArn],
        }),
      );
    }

    // ── Bedrock Agent (CfnAgent) ───────────────────────────────
    const actionGroups: bedrock.CfnAgent.AgentActionGroupProperty[] = [];

    if (cfg.actionGroupLambdaArn) {
      actionGroups.push({
        actionGroupName: `${agent.agentId}-actions`,
        actionGroupExecutor: {
          lambda: cfg.actionGroupLambdaArn,
        },
        // Schema would be defined here in production — omitted for flexibility
        description: `Custom action group for ${agent.agentName}`,
      });
    }

    this.cfnAgent = new bedrock.CfnAgent(this, 'Agent', {
      agentName: `${agent.agentId}-${agent.agentName.toLowerCase()}`,
      foundationModel: cfg.foundationModel,
      instruction: cfg.agentInstruction,
      agentResourceRoleArn: this.agentResourceRole.roleArn,
      idleSessionTtlInSeconds: cfg.idleSessionTTLInSeconds ?? 600,
      description: `${agent.emoji} ${agent.agentName} — ${agent.role}`,
      ...(actionGroups.length > 0 && { actionGroups }),
      ...(cfg.knowledgeBaseId && {
        knowledgeBases: [
          {
            knowledgeBaseId: cfg.knowledgeBaseId,
            description: `Knowledge base for ${agent.agentName}`,
            knowledgeBaseState: 'ENABLED',
          },
        ],
      }),
    });

    // ── Bedrock Agent Alias ────────────────────────────────────
    // Points to DRAFT version. Update routingConfiguration to pin to a
    // specific version once the agent has been prepared and versioned.
    this.cfnAgentAlias = new bedrock.CfnAgentAlias(this, 'AgentAlias', {
      agentId: this.cfnAgent.attrAgentId,
      agentAliasName: `${agent.agentId}-latest`,
      description: `Latest alias for ${agent.agentName}`,
      // No routingConfiguration = points to DRAFT
    });

    // Alias must be created after agent
    this.cfnAgentAlias.addDependency(this.cfnAgent);

    // ── Outputs ────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AgentId', {
      value: this.cfnAgent.attrAgentId,
      description: `Bedrock Agent ID for ${agent.agentName} (${agent.role})`,
      exportName: `BedrockAgentId-${agent.agentId}`,
    });

    new cdk.CfnOutput(this, 'AgentAliasId', {
      value: this.cfnAgentAlias.attrAgentAliasId,
      description: `Bedrock Agent Alias ID for ${agent.agentName} — invoke via: bedrock-agent-runtime invoke-agent --agent-id <id> --agent-alias-id <alias>`,
      exportName: `BedrockAgentAliasId-${agent.agentId}`,
    });

    // Tags
    cdk.Tags.of(this.cfnAgent).add('Project', 'bedrock-agentcore-squad');
    cdk.Tags.of(this.cfnAgent).add('Framework', 'bedrock-agentcore');
    cdk.Tags.of(this.cfnAgent).add('Agent', agent.agentId);
    cdk.Tags.of(this.cfnAgent).add('AgentName', agent.agentName);
  }
}
