import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AgentDefinition } from '../config/agents';
import { OpenClawInstance } from './openclaw-instance';
import { NanoClawInstance } from './nanoclaw-instance';
import { BedrockAgentCoreConstruct } from './bedrock-agentcore-construct';

/**
 * Static factory that dispatches to the correct CDK construct
 * based on the agent's frameworkType discriminator.
 *
 * Usage:
 *   const construct = AgentInstanceFactory.forAgent(this, `Agent-${agent.agentName}`, agent, vpc, sg);
 */
export class AgentInstanceFactory {
  /**
   * Create the appropriate CDK construct for the given agent definition.
   *
   * @param scope         CDK construct scope (typically the fleet stack)
   * @param id            Logical CDK construct ID
   * @param agent         Agent definition — must have frameworkType set
   * @param vpc           VPC for EC2-based agents (unused for bedrock-agentcore)
   * @param securityGroup Security group for EC2-based agents (unused for bedrock-agentcore)
   */
  static forAgent(
    scope: Construct,
    id: string,
    agent: AgentDefinition,
    vpc: ec2.IVpc,
    securityGroup: ec2.ISecurityGroup,
  ): OpenClawInstance | NanoClawInstance | BedrockAgentCoreConstruct {
    switch (agent.frameworkType) {
      case 'openclaw':
        return new OpenClawInstance(scope, id, { agent, vpc, securityGroup });

      case 'nanoclaw':
        return new NanoClawInstance(scope, id, { agent, vpc, securityGroup });

      case 'bedrock-agentcore':
        return new BedrockAgentCoreConstruct(scope, id, { agent });

      default:
        // TypeScript exhaustiveness check — this branch should never be reached
        throw new Error(
          `Unknown frameworkType: "${(agent as AgentDefinition).frameworkType}". ` +
            `Supported values: 'openclaw', 'nanoclaw', 'bedrock-agentcore'.`,
        );
    }
  }
}
