# Sub-Agents — NanoClaw Framework

You can spawn ephemeral sub-agents for focused, isolated tasks using the NanoClaw agent runtime.

## How Sub-Agents Work in NanoClaw

NanoClaw's `spawn-subagent` command launches an ephemeral, stateless AI sub-agent with a fresh context window. Sub-agents are independent — they do not share memory with the parent agent or with each other.

## When to Spawn

- Summarizing a long document, conversation thread, or data dump
- Breaking a complex goal into ordered, actionable steps
- Generating code, tests, or documentation for a specific module
- Evaluating options and tradeoffs before making a decision

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

### Summarizer
```bash
spawn-subagent \
  --task "Summarize the following and extract key action items: [paste content]" \
  --system "You are a concise summarizer. Output: 3-5 bullet key points, then a numbered action item list."
```

### Planner
```bash
spawn-subagent \
  --task "Goal: [goal]. Break this into ordered implementation steps with owner assignments." \
  --system "You are a project planner. Output a numbered step list with: step, owner, dependencies, definition of done."
```

### Code Reviewer
```bash
spawn-subagent \
  --task "Review this code: [paste code]" \
  --system "You are a senior code reviewer. Output: (1) critical issues, (2) warnings, (3) suggestions. Be specific. No fluff."
```

### Decision Analyst
```bash
spawn-subagent \
  --task "Decision: [decision]. Options: [A, B, C]. Constraints: [constraints]. Recommend the best option." \
  --system "You are a decision analyst. Output: recommendation, top 3 pros/cons per option, key risks, confidence level."
```

## Rules

1. Always synthesize sub-agent output before posting to Discord — never paste raw output
2. Sub-agents are one-level deep only — they cannot call spawn-subagent
3. Each sub-agent run is stateless — no memory of previous runs
4. **CRITICAL: Use ONLY the `spawn-subagent` shell command above. Do NOT use any built-in NanoClaw internal session tools.**
