# Akela — Critical Review & Feedback

## Overall Assessment

After reviewing Akela directly, the architecture and motivation are much clearer.

**Akela is the more interesting and foundational project.**

QABuddy demonstrates the architecture in a concrete domain, but Akela contains the broader technical idea: a deterministic system for controlling what knowledge an AI agent receives, recording what happened when that knowledge was used, and allowing evidence to inform future knowledge changes.

The central architecture can be understood as:

```text
Markdown Knowledge
       ↓
     Index
       ↓
 Scoped Knowledge
       ↓
 Deterministic Compilation
       ↓
 Context Slice + Manifest
       ↓
     Agent
       ↓
    Evidence
       ↓
    Learning
       ↓
 Human Judgment
       ↓
    Knowledge
```

This is a coherent system rather than a collection of unrelated agent utilities.

The strongest parts of the project are the deterministic compilation model, explicit knowledge boundaries, auditable manifests, and the deliberate rejection of hidden autonomous memory.

---

# 1. "Rectified Context" Is a Meaningful Concept

The phrase **"rectified context"** initially sounds abstract, but the underlying concept is strong.

Akela is not simply saying:

> Retrieve information relevant to the current task.

Instead, the model is closer to:

> Correct, structure, scope, and constrain knowledge before allowing it to enter an agent's working context.

That creates an important distinction from conventional RAG.

RAG primarily asks:

```text
What information appears relevant?
```

Akela asks something closer to:

```text
What knowledge is permitted to participate
in this execution, under these explicit constraints?
```

The distinction becomes particularly important because retrieved RAG results can still be incorporated into an Akela slice without automatically becoming authoritative knowledge.

That architectural boundary is one of Akela's strongest ideas.

### Recommendation

Keep **"rectified context"** as a technical concept.

However, explain it in plain language immediately when introducing it. A new user should not need to understand the terminology before understanding the value proposition.

---

# 2. Deterministic Compilation Is Probably the Strongest Technical Feature

The most compelling property of Akela is the deterministic guarantee:

> Same inputs → same slice.

That changes context from an ephemeral prompt construction process into an inspectable artifact.

For example:

```text
Run 183
────────────────────────────
Included:
  WIKI-refunds#under-50
  REF-billing#refund-policy
  LRN-20260822-01

Dropped:
  WIKI-admin#permissions
  Reason: scope mismatch

Budget:
  530 lines
```

This is significantly more useful than simply saying:

> The agent was given some relevant context.

The manifest provides an audit trail for:

- what was included
- what was excluded
- why something was excluded
- what budget was applied
- what knowledge was actually available to the agent

That makes the system feel much more like a **compiler/build system** than prompt engineering.

### Recommendation

Emphasize this much more heavily in the README.

The manifest should be presented as a first-class artifact rather than merely an implementation detail.

A useful mental model is:

```text
Knowledge
    ↓
Compiler
    ↓
Context Artifact
    ↓
Agent
```

The agent does not directly "search the knowledge base."

It consumes a compiled representation of knowledge.

---

# 3. The "Not Autonomous Memory" Position Is a Major Strength

One of the strongest design decisions is the explicit rejection of hidden autonomous memory.

The distinction can be represented as:

### Conventional autonomous memory

```text
Agent observes something
        ↓
AI decides it is important
        ↓
Memory
        ↓
Future agent behavior
```

The system is therefore silently modifying the agent's future operating environment.

### Akela

```text
Agent observes something
        ↓
Learning proposal
        ↓
Evidence accumulation
        ↓
Statistics
        ↓
Human judgment
        ↓
Knowledge
```

This is much easier to reason about and audit.

More importantly, Akela does not pretend that autonomous curation is perfectly reliable.

The documentation acknowledges that autonomous curation can potentially retire a correct rule because the system may sincerely distrust recently updated knowledge.

That admission is valuable.

It demonstrates that the project is treating knowledge evolution as a problem requiring evidence and judgment rather than assuming that an LLM can safely curate its own operating rules.

### Recommendation

Keep this principle central:

> **The system should not silently change the knowledge that governs future agents.**

This could potentially become one of Akela's defining design principles.

---

# 4. Akela Is the Foundational Project; QABuddy Is the Domain Application

The relationship between the two projects becomes much clearer when Akela is viewed as the underlying system.

A useful architecture is:

```text
                    AKELA
                      │
        ┌─────────────┴─────────────┐
        │                           │
 Context Compiler              Learning Layer
        │                           │
        └─────────────┬─────────────┘
                      │
                   QABuddy
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   Test Plans      E2E Tests      Exploration
```

Under this model:

**Akela is the infrastructure and conceptual contribution.**

**QABuddy is the first serious domain application.**

This separation is valuable because it allows Akela to evolve independently from QA-specific concepts.

### Recommendation

Position QABuddy as an example of what Akela enables rather than making Akela feel like a dependency extracted from QABuddy.

That distinction matters for how people understand the project's ambition.

---

# 5. The Protocol Model Is Elegant

The separation between:

```text
PROTOCOL.md
ONBOARD.md
CURATE.md
```

is conceptually clean.

They represent three different stages of the knowledge lifecycle:

### PROTOCOL

What happens during normal agent execution?

```text
Knowledge → Context → Agent → Evidence
```

### ONBOARD

How does new knowledge enter the system?

```text
New Knowledge
      ↓
Structure
      ↓
Scope
      ↓
Available Knowledge
```

### CURATE

How does evidence influence knowledge?

```text
Evidence
    ↓
Statistics
    ↓
Human Judgment
    ↓
Knowledge Change
```

This creates a useful lifecycle:

```text
ONBOARD
   ↓
Knowledge Structure

PROTOCOL
   ↓
Runtime Behavior

CURATE
   ↓
Knowledge Evolution
```

The fact that `init` can generate these protocols is particularly interesting because the repository does not merely contain knowledge.

**It contains an operating model for how that knowledge is supposed to be used.**

### Recommendation

Keep this architecture, but explain it visually in the README. It is easier to understand as a lifecycle than as three independent Markdown files.

---

# 6. Domain Packs Provide a Strong Path to Generalization

The domain-pack architecture is another important strength.

Conceptually:

```text
Akela
  └── Domain Pack
        ├── Activities
        ├── Probes
        ├── Fingerprints
        └── Outcomes
```

This allows the core engine to remain domain-independent while specialized knowledge lives with the application.

For example:

```text
Akela
│
├── QABuddy
│     └── QA Domain Pack
│
├── Support Agent
│     └── Support Domain Pack
│
├── Research Agent
│     └── Research Domain Pack
│
└── Ops Agent
      └── Ops Domain Pack
```

This separation is important because it prevents the compiler itself from becoming a QA framework.

### Recommendation

Make the boundary between **engine primitives** and **domain semantics** extremely explicit.

A reader should be able to answer:

> What does Akela know about QA?

with:

> Nothing inherently. QABuddy supplies the QA domain pack.

That would strengthen the claim that Akela is general-purpose.

---

# 7. The Main Weakness: Conceptual Density

The biggest concern is not the architecture.

It is **how many concepts a new reader has to understand simultaneously.**

The current vocabulary includes concepts such as:

- context compiler
- rectified context
- evidence
- learning
- promotion
- falsification
- curation
- domain packs
- probes
- fingerprints
- scopes
- tiers
- manifests
- activities

Each concept may be justified individually.

The problem is that together they can obscure the central idea.

A reader may understand every individual feature while still failing to answer:

> **What is Akela fundamentally doing?**

### Recommendation

Reduce the conceptual model presented to users to three primary primitives:

## Knowledge

What the organization believes.

```text
Wiki
References
Learnings
```

## Compilation

What the agent is allowed to know for this task.

```text
Activity
Scope
Tier
Budget
    ↓
Context Slice
```

## Evidence

What happened when the agent used that knowledge.

```text
Applied
Contradicted
Outcome
    ↓
Statistics
    ↓
Curation
```

Everything else can then be introduced as an implementation of one of these three primitives.

This would substantially reduce the cognitive load of the project.

---

# 8. A Stronger Thesis Is Hiding Inside the Project

The project appears to be making a stronger argument than:

> Agents need better memory.

A more accurate thesis is:

> **An agent should not have "memory." It should have an auditable knowledge system whose runtime context is compiled from explicit knowledge and whose evolution is governed by evidence.**

This thesis explains many of Akela's design choices.

It explains the rejection of:

- naive RAG
- autonomous memory
- unrestricted context
- hidden learning
- similarity ranking as authority

The goal is not to make the LLM "remember" more.

The goal is to create a **knowledge control plane around a probabilistic agent.**

That is arguably the most interesting conceptual contribution of the project.

---

# 9. The README Should Answer "Why Not RAG + Memory?" Immediately

The most important positioning question for a new visitor is:

> **Why isn't Akela just RAG + memory?**

The README should answer this within the first few sections.

A possible framing:

```text
RAG asks:

"What information is probably relevant?"

Memory asks:

"What should the agent remember?"

Akela asks:

"What knowledge is this agent authorized to use
for this task, under this scope and budget —
and what evidence justifies changing that knowledge?"
```

This communicates the architectural difference much faster than explaining the implementation first.

The three questions represent three different philosophies:

```text
RAG
↓
Relevance

Memory
↓
Persistence

Akela
↓
Governance + Determinism + Evidence
```

That is a much stronger positioning story.

---

# 10. The Akela Name Fits Better Than Expected

The name becomes more appropriate when the project's role is understood.

Akela is not simply "the thing that does the work."

The analogy is closer to:

```text
Agent
   ↓
Does the work

Akela
   ↓
Controls available knowledge
   ↓
Records evidence
   ↓
Maintains order
   ↓
Helps determine what survives
```

This fits the project's philosophy surprisingly well.

It also gives the project a recognizable identity instead of sounding like another generic `context-engine`, `agent-memory`, or `RAG-framework` project.

### Recommendation

Keep the name.

The conceptual association is useful once the project philosophy is understood.

---

# 11. Positioning: Keep the Technical Tagline, Add a Plain-English One

The current tagline:

> **A deterministic compiler over rectified context.**

is technically distinctive, but it is not immediately understandable to someone discovering the project.

That does not mean the tagline should be removed.

Instead, pair it with a plain-English explanation.

For example:

> **A deterministic compiler over rectified context.**
>
> Akela turns an existing knowledge base into a bounded, reproducible context slice for AI agents—and uses evidence from agent runs to help determine what knowledge should change.

This gives the reader:

```text
Technical identity
        +
Immediate comprehension
```

instead of requiring them to decode "rectified context" before understanding the project.

---

# 12. Suggested Conceptual Model for the README

The project could potentially be introduced through this simplified model:

```text
                 KNOWLEDGE
                     │
                     ▼
              ┌─────────────┐
              │    AKELA    │
              │  COMPILER   │
              └──────┬──────┘
                     │
             Context Slice
                     │
                     ▼
                  AGENT
                     │
                     ▼
                 EVIDENCE
                     │
                     ▼
                CURATION
                     │
                     ▼
                 KNOWLEDGE
```

Then explain that Akela provides three guarantees:

### 1. Deterministic

The same inputs and constraints produce the same context.

### 2. Auditable

Every compilation can explain what was included and excluded.

### 3. Governed

Knowledge changes are driven by evidence rather than hidden autonomous memory.

This may be a more accessible entry point than introducing every Akela concept individually.

---

# 13. What I Would Prioritize

If the goal is to make Akela stronger as an open-source project, I would prioritize the following.

### Priority 1 — Clarify the thesis

Make the reader understand within seconds:

> Akela is not RAG and not agent memory. It is a deterministic knowledge/context control system.

### Priority 2 — Simplify the conceptual vocabulary

Lead with:

```text
Knowledge
Compilation
Evidence
```

Introduce the other terminology afterward.

### Priority 3 — Showcase the manifest

The deterministic compilation artifact is one of the easiest features to demonstrate concretely.

Show an actual example.

### Priority 4 — Demonstrate the knowledge lifecycle

Show:

```text
Knowledge
   ↓
Compilation
   ↓
Agent
   ↓
Evidence
   ↓
Curation
   ↓
Knowledge
```

This communicates the architecture much faster than individual command documentation.

### Priority 5 — Make QABuddy the reference implementation

Use QABuddy as proof that the architecture works in a meaningful domain.

The story becomes:

```text
Akela
  ↓
General knowledge-control architecture

QABuddy
  ↓
Concrete QA implementation
```

---

# Final Assessment

Akela has a more interesting idea underneath it than initially apparent.

The strongest aspect is not any individual command, Markdown format, or agent workflow.

It is the combination of:

```text
Explicit Knowledge
       +
Deterministic Compilation
       +
Bounded Context
       +
Auditable Manifests
       +
Evidence
       +
Human-Governed Evolution
```

That creates a coherent alternative to the common:

```text
RAG + Agent + Memory
```

architecture.

The project should therefore avoid positioning itself primarily as another context-management or agent-memory tool.

The more compelling argument is:

> **AI agents are probabilistic, but the knowledge system surrounding them does not have to be.**

Akela provides deterministic control over what knowledge enters an agent's context, makes that decision auditable, and creates an evidence-based path for changing the underlying knowledge.

That is the idea I would build the project narrative around.

**QABuddy is the demonstration.  
Akela is the architecture.**