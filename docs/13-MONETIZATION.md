# Monetization

## Principles

1. **Core forever free + open source.** Cross-vendor neutrality is the moat; closing it kills the project.
2. **Charge the org, not the individual.** Individuals are the seed; orgs are the revenue.
3. **Charge for value-add, never the basics.** Installing CLIs and syncing skills stays free forever; collaboration / governance / private catalog is where money lives.

## Five revenue paths, ranked by feasibility

### 1. clihub Cloud — sync layer

**Price**: $5 / month individual · $20 / seat / month team.

**What you get**: encrypted cross-machine sync of catalog selection, presets and per-machine config drift. Laptop + desktop + work laptop + remote server all stay in lock-step.

**Why it works**: multi-machine developers feel this pain weekly; analogues (Raycast Pro, 1Password) prove the willingness to pay. A 5–10 % conversion of weekly actives is realistic.

**Build cost**: low — Cloudflare R2 + Workers for end-to-end encrypted blobs, < $50 / month server cost at first scale.

**Targets**: $5k ARR in year 1, $50k in year 2.

### 2. Enterprise tier — private registry + governance

**Price**: $500 / month starter (10 seats), $50 / seat / month above that.

**What you get**:
- Private skill / MCP / plugin catalog (internal distribution).
- SSO (Okta, Azure AD, Google Workspace).
- Audit log: who installed what, when, which version was rolled back.
- Version lock: `clihub.lock.json` enforced at the team level.
- License-compliance scan for skill sources.

**Why it works**: once an org puts AI CLIs into production, governance is mandatory. Cheaper to buy than for IT to roll its own.

**Build cost**: medium — SSO + audit pipeline + admin web UI.

**Targets**: 3 pilots ($20k) in year 1, 30 customers ($200k) in year 3.

### 3. Marketplace cut — long-term, low priority

**What**: third-party paid skills / plugins / MCP servers. clihub takes 20–30 %.

**Risk**: breaks vendor neutrality; lets [ccpi](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) own the paid-content lane.

**When**: after monthly active users cross 10k. Not before.

### 4. Sponsorship & brand partnerships

- **CLI vendors** (Anthropic / OpenAI / Google / AWS) pay for default-preset slots and homepage placement. Always labelled "sponsored"; never reorders neutral lists.
- **GitHub Sponsors / OpenCollective** for individual / corporate tips.
- Expected: $1–5k / month, passive.

### 5. Services & training — long tail

- Enterprise onboarding ($5–20k per engagement): catalog setup, lock files, team training.
- Online course "AI CLI team playbook" ($99–299 per seat).
- Doesn't scale, but high gross margin.

## Three-phase rollout

| Phase | Audience | Revenue source | Timing |
|---|---|---|---|
| **1. Free, grow** | Individual devs | $0 | months 0–6 |
| **2. Sync** | Multi-device individuals | clihub Cloud | months 6–18 |
| **3. Enterprise** | Teams + companies | Enterprise + services | month 12+ |

## Phase 1 focus — do NOT skip

Hit these before any monetisation work:

1. **v1.0 ship** — stable public API; users dare to depend on it.
2. **5k weekly npm downloads** — critical mass for the moat to matter.
3. **2k GitHub stars** — trust signal for enterprise buyers.
4. **3 KOL endorsements** — Theo, Anthropic blog, V2EX front page, etc.
5. **i18n expansion** — non-English markets are still wide open.

## Phase 2 trigger conditions

Start building clihub Cloud only when **all** of these are true:

- ≥ 5k weekly npm downloads.
- ≥ 2k GitHub stars.
- ≥ 5 unsolicited GitHub Discussions / issues asking "is there cross-machine sync?".

Until then, building it is premature; the time should go to v1.0 quality, plugin SDK and catalog breadth.

## Anti-patterns to avoid

| Don't | Why |
|---|---|
| Charge individual developers in v0.x | kills community, ships users to competitors |
| Close-source the core | breaks neutrality; CLI vendors send proxies |
| Bind tightly to one CLI vendor | when that CLI dies or pivots, we die with it |
| Build the marketplace too early | the content is too thin to take a cut from |
| Pose as a polished SaaS company | we're a toolkit; users want tools, not branding |

## Open questions (revisit each release)

1. Should the local CLI ever phone home for anonymous counters? (currently no.)
2. Should the catalog be Git-versioned or registry-versioned? (currently Git-bundled; v2.0 may flip.)
3. Cloud-sync conflict resolution policy (last-writer-wins vs. CRDT vs. user prompt)?
4. Plugin SDK packaging — npm scoped (`@clihub/plugin-*`) or freeform?
