import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { OpenClawInstance } from '../constructs/openclaw-instance';
import { AGENTS } from '../config/agents';

export interface AgentFleetStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

export class AgentFleetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentFleetStackProps) {
    super(scope, id, props);

    for (const agent of AGENTS) {
      const instance = new OpenClawInstance(this, `Agent-${agent.agentName}`, {
        agent,
        vpc: props.vpc,
        securityGroup: props.securityGroup,
      });

      new cdk.CfnOutput(this, `${agent.agentName}InstanceId`, {
        value: instance.instance.instanceId,
        description: `Instance ID for ${agent.agentName} (${agent.role}) — SSM: aws ssm start-session --target <id>`,
      });
    }
  }
}
