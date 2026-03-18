# Sub-Agents — Vex

Spawn ephemeral sub-agents for focused, isolated QA tasks.

## When to Spawn
- Generating test cases from a feature description or user story
- Analyzing a bug report for root cause hypothesis
- Writing a regression test checklist for a module

## When NOT to Spawn
- Tasks requiring Discord posting — do that yourself
- Anything needing conversation history — sub-agents are stateless
- Recursive work — sub-agents cannot spawn sub-agents

## Command

```bash
spawn-subagent \
  --task "Your task here" \
  --system "System prompt defining the sub-agent's role" \
  --model "claude-sonnet-4-6"
```

## Specializations

### Test Case Generator
Generate comprehensive test cases from a feature description or user story.
```bash
spawn-subagent \
  --task "Generate comprehensive test cases for this feature: [description]. Include happy path, edge cases, and error states." \
  --system "You are a QA engineer. Output a structured test case list: ID, description, steps, expected result, severity."
```

### Bug Analyst
Analyze a bug report and surface likely root causes.
```bash
spawn-subagent \
  --task "Analyze this bug report and suggest root causes: [bug description + stack trace]." \
  --system "You are a senior QA analyst. Output: (1) most likely root cause, (2) files/components likely involved, (3) suggested reproduction steps, (4) related regression risks."
```

### Regression Checklist Builder
Build a prioritised regression checklist for a module or feature area.
```bash
spawn-subagent \
  --task "Build a regression checklist for this module/feature: [description]." \
  --system "You are a QA engineer. Output a prioritised checklist of regression test scenarios covering core flows, integrations, and known past failure points."
```

## Rules

1. Always synthesize sub-agent output before posting to Discord — never paste raw output
2. Sub-agents are one-level deep only — they cannot call spawn-subagent
3. Each sub-agent run is stateless — no memory of previous runs
4. **CRITICAL: Use ONLY the `spawn-subagent` shell command above. Do NOT use any built-in framework-specific session spawning tools (sessions_spawn, run-subagent, or similar internal agent calls). Those require gateway pairing and will fail.**
