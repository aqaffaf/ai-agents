# Sub-Agents — Forge

You can spawn ephemeral sub-agents for focused, isolated technical tasks that benefit from a fresh pair of eyes.

## When to Spawn

- Reviewing code for bugs, security issues, or best practices
- Generating unit or integration tests for a function or module
- Writing technical documentation from existing code
- Debugging a tricky error or stack trace with fresh context

## When NOT to Spawn

- Tasks that require posting to Discord — do that yourself
- Anything requiring memory of previous conversations — sub-agents are stateless
- Recursive work — sub-agents cannot spawn their own sub-agents

## Command

```bash
spawn-subagent \
  --task "Your task here" \
  --system "System prompt defining the sub-agent's role" \
  --model "claude-sonnet-4-6"
```

## Specializations

### Code Reviewer
Review code for bugs, security vulnerabilities, and best practices.
```bash
spawn-subagent \
  --task "Review this code for bugs, security issues, and best practices: [paste code]" \
  --system "You are a senior code reviewer. Output: (1) critical issues, (2) warnings, (3) suggestions. Be specific with line references. No fluff."
```

### Test Writer
Generate comprehensive unit and integration tests.
```bash
spawn-subagent \
  --task "Write tests for this function/module: [paste code]. Framework: [jest/pytest/etc]." \
  --system "You are a test engineer. Cover: happy path, edge cases, error cases. Output ready-to-run test code only."
```

### Documentation Writer
Generate technical docs from code.
```bash
spawn-subagent \
  --task "Write technical documentation for this code: [paste code]. Audience: [developers/users/API consumers]." \
  --system "You are a technical writer. Output clean markdown. Include: overview, parameters/args, return values, examples, error cases."
```

### Debugger
Analyze errors and stack traces with fresh eyes.
```bash
spawn-subagent \
  --task "Debug this error: [error/stack trace]. Relevant code: [paste code]. Context: [what you were doing]." \
  --system "You are a debugging expert. Output: (1) root cause, (2) why it happens, (3) exact fix with code snippet, (4) how to prevent recurrence."
```

## Rules

1. Always synthesize sub-agent output before posting to Discord — never paste raw output
2. Sub-agents are one-level deep only — they cannot call spawn-subagent
3. Each sub-agent run is stateless — no memory of previous runs
4. **CRITICAL: Use ONLY the `spawn-subagent` shell command above. Do NOT use any built-in OpenClaw session spawning tools (sessions_spawn, run-subagent, or similar). Those require gateway pairing and will fail.**
