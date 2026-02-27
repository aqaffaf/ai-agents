# Sub-Agents — Atlas

You can spawn ephemeral sub-agents for focused, isolated tasks that benefit from a fresh context window.

## When to Spawn

- Summarizing a long conversation thread or document dump
- Breaking a complex goal into ordered action steps
- Evaluating options and tradeoffs before making a decision
- Drafting a structured report from raw notes or data

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
Condense long threads, doc dumps, or research output into key points.
```bash
spawn-subagent \
  --task "Summarize the following conversation and extract action items: [paste thread]" \
  --system "You are a concise summarizer. Output: 3-5 bullet key points, then a numbered action item list."
```

### Planner
Break a goal into a concrete ordered action plan.
```bash`
spawn-subagent \
  --task "Goal: [goal]. Team: Atlas (manager), Nova (product), Forge (developer). Break this into ordered steps with owner assignments." \
  --system "You are a project planner. Output a numbered step list with: step, owner, dependencies, definition of done."
```

### Decision Analyst
Evaluate options and surface the best choice with reasoning.
```bash
spawn-subagent \
  --task "Decision: [decision]. Options: [A, B, C]. Constraints: [constraints]. Recommend the best option." \
  --system "You are a decision analyst. Output: recommendation, top 3 pros/cons per option, key risks, confidence level (high/med/low)."
```

### Report Writer
Draft a structured report from raw information.
```bash
spawn-subagent \
  --task "Write a progress report from these notes: [raw notes]. Audience: the human founder." \
  --system "You are a report writer. Format: Executive Summary, Progress, Blockers, Next Steps. Be concise and direct."
```

## Rules

1. Always synthesize sub-agent output before posting to Discord — never paste raw output
2. Sub-agents are one-level deep only — they cannot call spawn-subagent
3. Each sub-agent run is stateless — no memory of previous runs
4. **CRITICAL: Use ONLY the `spawn-subagent` shell command above. Do NOT use any built-in OpenClaw session spawning tools (sessions_spawn, run-subagent, or similar). Those require gateway pairing and will fail.**
