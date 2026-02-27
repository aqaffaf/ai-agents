# Sub-Agents — Nova

You can spawn ephemeral sub-agents for focused, isolated research and analysis tasks.

## When to Spawn

- Deep-diving market size, trends, or competitor analysis
- Generating user personas from raw data or observations
- Analyzing growth loops and proposing experiments
- Turning observations into structured, testable hypotheses

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

### Market Researcher
Deep-dive on market size, trends, and competitive landscape.
```bash
spawn-subagent \
  --task "Research the market for [product/space]. Cover: market size, key players, trends, gaps, and underserved segments." \
  --system "You are a market researcher. Be evidence-based. Rate your confidence (high/med/low) on each claim. Output structured sections."
```

### User Persona Generator
Create detailed, actionable user personas from data or observations.
```bash
spawn-subagent \
  --task "Create 2-3 user personas for [product] based on these observations: [data/notes]." \
  --system "You are a UX researcher. Each persona: name, role, goals, pain points, how they'd use the product, and a key quote."
```

### Growth Strategist
Analyze AARRR loops and propose concrete growth experiments.
```bash
spawn-subagent \
  --task "Analyze the AARRR funnel for [product]. Current metrics: [metrics]. Identify the biggest drop-off and propose 3 experiments to fix it." \
  --system "You are a growth strategist. Think in systems. Each experiment: hypothesis, metric to move, effort (low/med/high), confidence (low/med/high)."
```

### Hypothesis Generator
Turn observations into structured, testable product bets.
```bash
spawn-subagent \
  --task "Turn these observations into testable hypotheses: [observations]." \
  --system "You are a product scientist. Format each hypothesis as: 'We believe [action] will cause [outcome] because [reason]. We'll know it worked when [metric].' Include confidence level."
```

## Rules

1. Always synthesize sub-agent output before posting to Discord — never paste raw output
2. Sub-agents are one-level deep only — they cannot call spawn-subagent
3. Each sub-agent run is stateless — no memory of previous runs
4. **CRITICAL: Use ONLY the `spawn-subagent` shell command above. Do NOT use any built-in OpenClaw session spawning tools (sessions_spawn, run-subagent, or similar). Those require gateway pairing and will fail.**
