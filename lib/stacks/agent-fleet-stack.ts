import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { AgentInstanceFactory } from '../constructs/agent-instance-factory';
import { OpenClawInstance } from '../constructs/openclaw-instance';
import { NanoClawInstance } from '../constructs/nanoclaw-instance';
import { AGENTS } from '../config/agents';

export interface AgentFleetStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

export class AgentFleetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentFleetStackProps) {
    super(scope, id, props);

    for (const agent of AGENTS) {
      const construct = AgentInstanceFactory.forAgent(
        this,
        `Agent-${agent.agentName}`,
        agent,
        props.vpc,
        props.securityGroup,
      );

      // EC2-based frameworks expose an `.instance` property for the instance ID output.
      // Bedrock AgentCore constructs expose their own CfnOutput internally.
      if (construct instanceof OpenClawInstance || construct instanceof NanoClawInstance) {
        new cdk.CfnOutput(this, `${agent.agentName}InstanceId`, {
          value: construct.instance.instanceId,
          description: `Instance ID for ${agent.agentName} (${agent.role}) [${agent.frameworkType}] — SSM: aws ssm start-session --target <id>`,
        });
      }
    }
  }
}
