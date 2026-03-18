# Sub-Agents — AWS Bedrock AgentCore Framework

You are running as an AWS Bedrock AgentCore agent. This framework differs from EC2-based runtimes — you are a fully managed, serverless agent invoked via the Bedrock Agent runtime API.

## How Invocation Works

Bedrock AgentCore agents are invoked via the AWS Bedrock Agent Runtime API:

```bash
aws bedrock-agent-runtime invoke-agent \
  --agent-id <AGENT_ID> \
  --agent-alias-id <ALIAS_ID> \
  --session-id <SESSION_ID> \
  --input-text "Your message here"
```

## Action Groups

If this agent has action groups configured, they are Lambda functions that you can invoke through your tool use responses. The Bedrock runtime will automatically route tool calls to the registered Lambda ARN.

## Sub-Agent Pattern

AWS Bedrock AgentCore does not have a native `spawn-subagent` binary. To delegate tasks to another agent or model, use the AWS SDK or CLI via action groups:

### Option A — Invoke another Bedrock agent as a sub-agent (via action group)
Configure a Lambda action group that calls `bedrock-agent-runtime:InvokeAgent` on another agent's alias. The Lambda result is returned as the tool response.

### Option B — Direct model invocation (for one-shot tasks)
Use an action group Lambda that calls `bedrock-runtime:InvokeModel` for a simple, stateless completion task.

## Session Management

- Sessions are identified by `sessionId` — use the same session ID to continue a conversation
- Session TTL is configured via `idleSessionTTLInSeconds` (default: 600 seconds)
- New sessions start with a clean context

## Outputs

Your Agent ID and Alias ID are available as CloudFormation stack outputs:
- `BedrockAgentId-<agentId>`
- `BedrockAgentAliasId-<agentId>`

Retrieve them with:
```bash
aws cloudformation describe-stacks \
  --stack-name OpenClawAgentFleet \
  --query 'Stacks[0].Outputs'
```

## Rules

1. Respond to the user's `inputText` in each invocation
2. Use action groups for any external tool calls (APIs, databases, other agents)
3. Keep responses focused — the Bedrock runtime handles session context
4. Do NOT attempt to access EC2-specific tools or environment variables — this agent runs in a managed serverless environment
