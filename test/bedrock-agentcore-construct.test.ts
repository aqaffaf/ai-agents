import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BedrockAgentCoreConstruct } from '../lib/constructs/bedrock-agentcore-construct';
import { AgentDefinition } from '../lib/config/agents';

function makeStack() {
  const app = new cdk.App();
  return new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
}

const baseBedrockAgent = (
  overrides: Partial<AgentDefinition['bedrockAgentCoreConfig']> = {},
): AgentDefinition => ({
  agentId: 'test-support',
  agentName: 'Sage',
  emoji: '🧠',
  role: 'Customer Support',
  frameworkType: 'bedrock-agentcore',
  bedrockAgentCoreConfig: {
    foundationModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    agentInstruction: 'You are Sage, a helpful support agent.',
    idleSessionTTLInSeconds: 600,
    ...overrides,
  },
});

describe('BedrockAgentCoreConstruct', () => {
  it('synthesizes without error for a minimal valid config', () => {
    const stack = makeStack();
    expect(() => {
      new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    }).not.toThrow();
  });

  it('throws if bedrockAgentCoreConfig is missing', () => {
    const stack = makeStack();
    const agent: AgentDefinition = {
      agentId: 'bad',
      agentName: 'Bad',
      emoji: '❌',
      role: 'Bad',
      frameworkType: 'bedrock-agentcore',
      // intentionally omit bedrockAgentCoreConfig
    };
    expect(() => {
      new BedrockAgentCoreConstruct(stack, 'BadAgent', { agent });
    }).toThrow(/bedrockAgentCoreConfig/);
  });

  it('creates a CfnAgent resource with the correct foundationModel', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      FoundationModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });
  });

  it('creates a CfnAgent with the correct instruction', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', {
      agent: baseBedrockAgent({ agentInstruction: 'Custom instruction text.' }),
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      Instruction: 'Custom instruction text.',
    });
  });

  it('creates a CfnAgent with the correct idle session TTL', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', {
      agent: baseBedrockAgent({ idleSessionTTLInSeconds: 300 }),
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      IdleSessionTTLInSeconds: 300,
    });
  });

  it('defaults idle session TTL to 600 when not specified', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', {
      agent: baseBedrockAgent({ idleSessionTTLInSeconds: undefined }),
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      IdleSessionTTLInSeconds: 600,
    });
  });

  it('creates a CfnAgentAlias resource', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Bedrock::AgentAlias', 1);
  });

  it('creates an IAM role with bedrock:InvokeModel permission', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['bedrock:InvokeModel']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  it('does NOT create an EC2 instance', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::Instance', 0);
  });

  it('adds action group when actionGroupLambdaArn is provided', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', {
      agent: baseBedrockAgent({
        actionGroupLambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-actions',
      }),
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      ActionGroups: Match.arrayWith([
        Match.objectLike({
          ActionGroupExecutor: {
            Lambda: 'arn:aws:lambda:us-east-1:123456789012:function:my-actions',
          },
        }),
      ]),
    });
  });

  it('does NOT add action groups when actionGroupLambdaArn is not provided', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', {
      agent: baseBedrockAgent({ actionGroupLambdaArn: undefined }),
    });
    const template = Template.fromStack(stack);
    // ActionGroups should not be present
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      ActionGroups: Match.absent(),
    });
  });

  it('emits Agent ID and Alias ID as CfnOutputs', () => {
    const stack = makeStack();
    new BedrockAgentCoreConstruct(stack, 'TestAgent', { agent: baseBedrockAgent() });
    const template = Template.fromStack(stack);
    const outputs = template.toJSON().Outputs;
    const outputKeys = Object.keys(outputs ?? {});
    expect(outputKeys.some((k) => k.includes('AgentId'))).toBe(true);
    expect(outputKeys.some((k) => k.includes('AgentAliasId'))).toBe(true);
  });
});
