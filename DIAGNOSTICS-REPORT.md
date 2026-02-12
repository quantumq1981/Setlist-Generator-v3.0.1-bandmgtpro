# Diagnostic Report: Energy Curve & Tonal Gravity Features

**Setlist Generator v3.6.0 | February 2026**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Energy Curve Optimization — Current State Diagnosis](#2-energy-curve-optimization--current-state-diagnosis)
3. [Tonal Gravity (Circle of Fifths) — Current State Diagnosis](#3-tonal-gravity-circle-of-fifths--current-state-diagnosis)
4. [Interaction Analysis: Features x List-Generation Pipeline](#4-interaction-analysis-features-x-list-generation-pipeline)
5. [Identified Issues & Limitations](#5-identified-issues--limitations)
6. [Best Practices & Industry Research](#6-best-practices--industry-research)
7. [Recommended Enhancements](#7-recommended-enhancements)
8. [Proposed New Features for Varied Setlist Structures](#8-proposed-new-features-for-varied-setlist-structures)
9. [Implementation Priority Matrix](#9-implementation-priority-matrix)
10. [Appendix: Technical Reference](#10-appendix-technical-reference)

---

## 1. Executive Summary

This report presents a comprehensive diagnostic analysis of the **Energy Curve Optimization** and **Tonal Gravity (Circle of Fifths)** features in the Setlist Generator v3.6.0. The analysis covers current implementation strengths and weaknesses, interaction patterns with the core list-generation pipeline, industry best practices, and a prioritized roadmap of recommended upgrades.

### Key Findings

| Area | Current Grade | Potential Grade | Priority |
|------|:---:|:---:|:---:|
| Energy Curve Model | B- | A | HIGH |
| Tonal Gravity Scoring | B | A | HIGH |
| Feature Interaction / Integration | C+ | A- | HIGH |
| User Feedback Mechanisms | N/A (absent) | B+ | MEDIUM |
| Algorithmic Sophistication | C+ | A- | HIGH |
| Setlist Variety / Randomness Control | C | B+ | MEDIUM |
| Diagnostics & Transparency | B- | A | MEDIUM |

---

## 2. Energy Curve Optimization — Current State Diagnosis

### 2.1 Implementation Overview

**Location**: `index.html` lines 1336–1345 (scoring), lines 357–359 (ENERGY_MAP)

The energy curve uses a **4-zone positional model** that maps each song's position within a set to a target energy level:

| Set Position | Target Energy | Zone Description |
|---|---|---|
| 0–15% | 3.5 | Low start / warm-up |
| 15–40% | 4.5 | Build phase |
| 40–75% | 5.5 | Peak / sustain |
| 75–100% | 3.0 | Cool down |

Songs are scored against these targets using the penalty formula:

```
energyPenalty = |actualEnergy - targetEnergy| * 0.35
```

Where `actualEnergy` is derived from the `ENERGY_MAP` static lookup:

```javascript
{ ballad: 2, uptempo: 6, midtempo: 4, funk: 5, shuffle: 5, swing: 4, groove: 5 }
```

### 2.2 Strengths

- **S1**: The 4-zone model captures the basic concert energy arc (build-peak-release).
- **S2**: The penalty weight (0.35) provides reasonable influence without overwhelming duration/diversity scoring.
- **S3**: Energy curve is optional (checkbox toggle), respecting user autonomy.
- **S4**: The `ENERGY_MAP` provides discrete, intuitive energy levels tied to musical styles.

### 2.3 Diagnosed Issues

#### ISSUE EC-1: Static 4-Zone Model Is Too Rigid
The hard-coded breakpoints (0.15, 0.40, 0.75) create abrupt energy target jumps. A song at position 0.14 targets 3.5 energy while one at 0.16 targets 4.5 — a jarring 1.0-point discontinuity. Professional live performance energy flows are continuous, not stepped.

**Impact**: Suboptimal song placement near zone boundaries. The algorithm may place a ballad (energy 2) and a funk track (energy 5) adjacent to each other simply because they straddle a zone boundary.

#### ISSUE EC-2: Energy Map Is Coarse-Grained (Only 7 Styles)
The `ENERGY_MAP` supports only 7 styles. Songs without a matching style default to energy 3 (via `|| 3`), which penalizes untagged or custom-style songs unpredictably. The scale itself (2–6) uses only 5 of a possible 10+ discrete levels.

**Impact**: Songs labeled "rock," "country," "pop," "reggae," "blues," or any other style are all treated identically (energy 3), losing significant differentiation.

#### ISSUE EC-3: No BPM Integration
The energy model relies entirely on style tags and ignores BPM data, which is already collected during import. BPM is a primary indicator of energy in live music — a 140 BPM "midtempo" is very different from a 90 BPM "midtempo."

**Impact**: Two songs tagged "midtempo" at 80 BPM and 130 BPM receive identical energy scores, despite dramatically different perceived energy.

#### ISSUE EC-4: No User-Customizable Energy Curve Shape
Users cannot adjust the energy arc profile (e.g., "start high for a party," "build slowly for a jazz club," "double peak for a festival"). The single fixed curve assumes one show format.

**Impact**: The feature is unsuitable for diverse venue types and performance contexts (wedding vs. club vs. festival vs. corporate event).

#### ISSUE EC-5: Energy Penalty Weight Is Fixed
The `0.35` multiplier is not configurable. For some setlists, energy flow should dominate; for others, duration fit or tonal flow should take priority.

**Impact**: Users cannot tune how aggressively the algorithm enforces the energy curve.

#### ISSUE EC-6: No Transition Smoothness Constraint
The energy curve only targets per-position energy levels. It does not penalize large energy *jumps* between consecutive songs. A sequence of [energy 6, energy 2, energy 6] satisfies positional targets but creates a poor live experience.

**Impact**: Consecutive songs can have jarring energy swings even when each individually matches its zone target.

---

## 3. Tonal Gravity (Circle of Fifths) — Current State Diagnosis

### 3.1 Implementation Overview

**Location**: `index.html` lines 940–1166

The Tonal Gravity system operates as a **post-processing wrapper** around the core generator. It:

1. Enriches songs with normalized key data (`normalizeKey_TG`)
2. Generates a base setlist via `generateSetlistsCore()` (energy/duration/locks)
3. Applies local refinement via adjacent-swap optimization (2 passes by default)
4. Attaches diagnostic output (average circle distance, quality scores)

**Scoring model** (`calculateTonalTransitionScore_TG`):

| Circle Distance | Base Score |
|---|---|
| 0–1 | +10 |
| 2 | +6 |
| 3 | +2 |
| 4+ | -4 |

Bonuses: Relative keys +5, Parallel keys +4. Repetition penalty: same key -5.

### 3.2 Strengths

- **S1**: Correct implementation of circle of fifths distance calculation (bidirectional shortest path).
- **S2**: Relative and parallel key detection provides musically meaningful bonuses.
- **S3**: The contrast slot mechanism (`isContrastSlot_TG`) intelligently allows intentional harmonic tension at the ~66% mark.
- **S4**: The anchor key auto-detection (`determineAnchorKey_TG`) uses a centrality measure over the top-5 most common keys — a well-designed heuristic.
- **S5**: Tonal smoothness slider (0–100) gives users some control over the smoothness-vs-contrast tradeoff.
- **S6**: The diagnostic output (avg distance, quality rating, contrast jumps) provides meaningful transparency.

### 3.3 Diagnosed Issues

#### ISSUE TG-1: Post-Processing Architecture Limits Optimization Quality
Tonal gravity operates as a post-hoc refinement (adjacent swaps) on an already-generated setlist. The core generator (`generateSetlistsCore`) selects songs without any tonal awareness. The refinement pass can only swap adjacent songs — it cannot insert, remove, or replace songs, nor can it perform non-adjacent swaps.

**Impact**: The tonal optimizer is constrained to local optima. If the core generator places tonally incompatible songs throughout the set, adjacent swaps may be unable to resolve the conflicts. The swap threshold (`swappedScore > currentScore + 3`) further limits the number of swaps.

#### ISSUE TG-2: Only 2 Refinement Passes (DEFAULT_PASSES = 2)
Two passes of a single-direction sweep (left-to-right adjacent swaps) provide minimal convergence. The algorithm may miss improvements that require multiple cascading swaps or right-to-left propagation.

**Impact**: Suboptimal tonal flow, especially for longer sets (10+ songs) where cascading improvements are likely.

#### ISSUE TG-3: Swap Threshold Is Too Conservative
The threshold `swappedScore > currentScore + 3` means a swap must yield a net improvement of at least 4 points to trigger. Given that the maximum transition score is 15 (distance 1 + relative bonus), requiring +4 net improvement means many beneficial swaps are rejected.

**Impact**: The algorithm leaves known improvements on the table because the margin requirement is too high.

#### ISSUE TG-4: Anchor Key Is Computed but Never Used in Scoring
The `determineAnchorKey_TG` function computes an anchor key, but it is only attached to diagnostics output — it is never factored into transition scoring or song selection. Songs near the anchor key should be slightly preferred, especially at set boundaries.

**Impact**: The anchor key feature is purely decorative. The algorithm does not optimize toward tonal coherence around a central key.

#### ISSUE TG-5: No Integration with Energy Curve During Tonal Optimization
When tonal swaps occur, they may disrupt the energy curve that the core generator carefully constructed. The swap logic does not check whether a swap damages energy flow.

**Impact**: Tonal optimization can actively degrade energy curve quality. The two features work against each other rather than cooperatively.

#### ISSUE TG-6: Missing Keys Silently Score 0
Songs without key data (`normalizedKey === null`) contribute a transition score of 0, meaning they are treated as "neutral" rather than penalized or flagged. In a library where many songs lack key data, the tonal optimizer has no useful signal.

**Impact**: Libraries with incomplete key data produce tonal diagnostics that appear better than reality, since null-key transitions are invisible.

#### ISSUE TG-7: No Camelot Wheel / Energy Direction Awareness
The current system treats all circle-of-fifths movements as equivalent. In professional harmonic mixing, moving clockwise (+1 on the Camelot wheel, e.g., C→G) creates an energy boost, while counterclockwise (-1, e.g., C→F) creates an energy drain. This directional information is lost.

**Impact**: Missed opportunity to coordinate tonal movement direction with the energy curve. The system could prefer clockwise transitions during build phases and counterclockwise during cool-down phases.

---

## 4. Interaction Analysis: Features x List-Generation Pipeline

### 4.1 Pipeline Flow

```
User clicks "Generate"
  │
  ├── settings.useTonalGravity === true?
  │     ├── YES: generateSetlistsCore_WithTonalGravity(activeSongs, settings)
  │     │         ├── Enrich songs with normalizedKey
  │     │         ├── Call generateSetlistsCore() ← core algorithm
  │     │         ├── Adjacent-swap refinement (2 passes)
  │     │         └── Attach diagnostics
  │     │
  │     └── NO: generateSetlistsCore(activeSongs, settings)
  │
  └── Core generator internally:
        ├── For each set:
        │   ├── Apply locked slots (lockPlan)
        │   ├── Force opener (if enabled)
        │   ├── Main selection loop:
        │   │   ├── Filter by duration window
        │   │   ├── Score: timePenalty + diversityPenalty + energyPenalty
        │   │   ├── Sort by score, pick from top-6 randomly
        │   │   └── Repeat until set duration filled
        │   └── Force closer (if enabled)
        └── Return setlists + stats + warnings
```

### 4.2 Interaction Issues

#### INTERACTION-1: Sequential, Non-Cooperative Feature Application
Energy curve and tonal gravity are applied in sequence, not jointly. The core generator optimizes for energy+duration+diversity. Then tonal gravity re-orders songs without energy awareness. This creates a **feature conflict**: tonal swaps can degrade energy flow, and the energy curve has no mechanism to incorporate tonal preferences.

**Severity**: HIGH — This is the single most impactful architectural issue.

#### INTERACTION-2: Top-6 Random Selection Wastes Tonal Information
The core generator picks randomly from the top 6 candidates (line 1354). When tonal gravity is enabled, the generator could preferentially select tonally compatible candidates — but this information is not available to the core generator because tonal scoring happens only in the post-processing wrapper.

**Severity**: HIGH — The generator makes blind choices that the post-processor then tries to fix.

#### INTERACTION-3: Locked Songs Block Tonal Optimization
Locked songs (via lockPlan) are correctly preserved by the core generator but are also preserved during tonal swaps (the swap loop starts at index 1 and ends at `len - 1`). However, there is no explicit lock-awareness in the tonal swap logic. If a locked song happens to be at index `i` where `1 <= i <= len-2`, it will be swapped.

**Severity**: MEDIUM — This is a latent bug. Locked songs should be exempt from tonal swaps.

#### INTERACTION-4: Closer/Opener Constraints Not Tonal-Aware
Forced openers and closers are selected based on style alone (e.g., "uptempo" for openers, "ballad/midtempo/swing" for closers). The tonal gravity system is not consulted when selecting these boundary songs, despite them defining the tonal start and end points of each set.

**Severity**: MEDIUM — Opener and closer keys set the tonal "bookends" that influence the entire set's harmonic flow.

#### INTERACTION-5: Diversity Penalty Does Not Scale with Set Length
The diversity penalty (same style +1.25, same artist +1.0) is fixed regardless of set length. In a 15-song set, consecutive same-style songs are a minor issue; in a 5-song set, it's a critical one.

**Severity**: LOW — Becomes significant only for very short or very long sets.

---

## 5. Identified Issues & Limitations

### 5.1 Summary Table

| ID | Feature | Issue | Severity | Effort |
|---|---|---|---|---|
| EC-1 | Energy | Static 4-zone model | HIGH | LOW |
| EC-2 | Energy | Coarse energy map (7 styles) | HIGH | MEDIUM |
| EC-3 | Energy | No BPM integration | HIGH | MEDIUM |
| EC-4 | Energy | No customizable curve shape | MEDIUM | MEDIUM |
| EC-5 | Energy | Fixed penalty weight | LOW | LOW |
| EC-6 | Energy | No transition smoothness | HIGH | LOW |
| TG-1 | Tonal | Post-processing architecture | HIGH | HIGH |
| TG-2 | Tonal | Only 2 refinement passes | MEDIUM | LOW |
| TG-3 | Tonal | Conservative swap threshold | MEDIUM | LOW |
| TG-4 | Tonal | Anchor key unused in scoring | MEDIUM | LOW |
| TG-5 | Tonal | No energy-aware tonal swaps | HIGH | MEDIUM |
| TG-6 | Tonal | Missing keys score 0 silently | LOW | LOW |
| TG-7 | Tonal | No directional awareness | MEDIUM | MEDIUM |
| INT-1 | Integration | Sequential non-cooperative | HIGH | HIGH |
| INT-2 | Integration | Top-6 blind to tonal data | HIGH | MEDIUM |
| INT-3 | Integration | Locked songs not swap-exempt | MEDIUM | LOW |
| INT-4 | Integration | Opener/closer not tonal-aware | MEDIUM | LOW |
| INT-5 | Integration | Diversity doesn't scale | LOW | LOW |

---

## 6. Best Practices & Industry Research

### 6.1 Energy Curve — Industry Standards

**Professional DJ / Concert Planning Approaches:**

| Technique | Description | Applicability |
|---|---|---|
| 4-Phase Arc (Ignite/Rebuild/Explode/Cool) | Standard live performance energy model | Direct — refine current zones |
| BPM-Anchored Energy | Map BPM ranges to energy levels | Missing — integrate BPM data |
| Anchor Peaks | Place strongest songs at 60–70% mark | Partially implemented |
| 2–3 BPM Incremental Transitions | Limit BPM jumps between songs | Missing — no BPM transition scoring |
| Continuous Energy Functions | Smooth curves instead of step functions | Missing — would fix EC-1 |

**Recommended Energy Curve Formula** (continuous, replaces 4-zone step):

```
targetEnergy(position) = A * sin(π * position * stretchFactor + phaseShift) + baselineEnergy
```

This produces a smooth build-peak-release curve. Parameters `A` (amplitude), `stretchFactor`, `phaseShift`, and `baselineEnergy` can be adjusted per venue type.

### 6.2 Tonal Gravity — Industry Standards

**Camelot Wheel Compatibility Tiers** (from Mixed In Key / DJ.Studio):

| Tier | Movement | Transition Quality | Current Coverage |
|---|---|---|---|
| S | Same key | Perfect | YES (but penalized as repetition) |
| A | Adjacent ±1 on wheel | Excellent | YES (distance 1: +10) |
| B | Relative major/minor | Very good | YES (+5 bonus) |
| B | Parallel major/minor | Very good | YES (+4 bonus) |
| C | +2 steps on wheel | Good | YES (distance 2: +6) |
| D | +7 (mod 12) — Energy Boost | Surprising but compatible | NO — not distinguished |
| F | 3+ steps, no relationship | Poor | Partially (distance 3: +2, 4+: -4) |

**Key Insight**: The "+7 modular movement" (e.g., from Camelot 5A to 12A) is a well-known harmonic mixing technique for energy boosts. The current system treats distance-5 and distance-6 identically to distance-4, all scoring -4. This misses a significant musical nuance.

### 6.3 Optimization Algorithms

**Simulated Annealing (SA)** is the most-cited academic approach for playlist optimization:

- **Why SA**: Playlist generation is NP-hard (proven in published research). Greedy approaches get stuck in local optima. SA can escape local optima through controlled acceptance of temporarily worse solutions.
- **Implementation**: Replace the current adjacent-swap-only refinement with SA that can perform arbitrary swaps, song replacements, and reorderings.
- **Cost function**: Weighted sum of energy penalty, tonal penalty, diversity penalty, duration penalty.
- **Cooling schedule**: Exponential decay (T = T₀ * α^t, α ≈ 0.95–0.99).

**Genetic Algorithms (GA)** are an alternative for generating multiple diverse setlists simultaneously:

- **Why GA**: Natural fit for "generate N setlists" — the population IS the set of candidate setlists.
- **Crossover**: Combine partial setlists from two parent solutions.
- **Mutation**: Swap songs, replace with similar alternatives.

### 6.4 User Feedback Mechanisms

The application currently has **no feedback loop**. Research shows the most impactful feedback signals are:

| Signal | Type | Implementation Path |
|---|---|---|
| Song swap / replacement | Explicit negative | Track which songs users replace post-generation |
| Song lock | Explicit positive | Already tracked — songs users lock are preferred |
| Regeneration count | Implicit dissatisfaction | Track how many times users regenerate before accepting |
| Manual reorder | Implicit preference | Track position preferences (e.g., user always moves song X to opener) |
| Gig save | Implicit satisfaction | Saved gig setlists represent "approved" orderings |

**Recommended approach**: Lightweight implicit feedback via existing interaction data (locks, swaps, manual reorders, gig saves). No explicit rating UI needed.

### 6.5 Controlled Stochasticity

The current top-6 random selection provides basic variety but is untuned. Best practices suggest:

- **Epsilon-greedy**: With probability ε (0.1–0.3), select randomly from all valid candidates; otherwise select from top-K.
- **Softmax selection**: Convert scores to probabilities via temperature-controlled softmax, rather than uniform random from top-K.
- **Diversity injection**: Guarantee minimum variety metrics (no more than N consecutive songs of the same style/artist/key).

---

## 7. Recommended Enhancements

### 7.1 Energy Curve Upgrades

#### Enhancement E1: Continuous Energy Curve (fixes EC-1)
Replace the 4-zone step function with a smooth parametric curve:

```javascript
function targetEnergy(position, curveType = 'standard') {
  const curves = {
    standard:  { amp: 1.5, freq: 1.0, phase: -0.3, base: 3.5 },
    party:     { amp: 1.0, freq: 0.8, phase: 0.0,  base: 4.5 },
    jazz:      { amp: 1.0, freq: 1.0, phase: -0.5, base: 3.0 },
    festival:  { amp: 1.8, freq: 1.5, phase: -0.2, base: 4.0 },
    wedding:   { amp: 1.2, freq: 1.0, phase: -0.3, base: 3.8 }
  };
  const c = curves[curveType] || curves.standard;
  return c.base + c.amp * Math.sin(Math.PI * position * c.freq + c.phase);
}
```

**Benefit**: Eliminates zone-boundary discontinuities. Enables venue-specific curve presets.

#### Enhancement E2: Extended Energy Map (fixes EC-2)
Expand `ENERGY_MAP` to cover more styles and use a 1–10 scale:

```javascript
const ENERGY_MAP_V2 = {
  ballad: 2, acoustic: 2.5, waltz: 3,
  swing: 4, bossa: 3.5, blues: 3.5,
  midtempo: 4.5, country: 4, jazz: 3.5,
  reggae: 4, soul: 4.5, rnb: 4.5,
  groove: 5.5, funk: 6, shuffle: 5,
  rock: 6.5, uptempo: 7, ska: 6.5,
  punk: 8, metal: 9, edm: 8.5
};
```

Add a fallback that uses BPM when style is unknown:

```javascript
function getEnergy(song) {
  if (ENERGY_MAP_V2[song.style]) return ENERGY_MAP_V2[song.style];
  if (song.bpm) return Math.min(10, Math.max(1, (song.bpm - 60) / 20 + 2));
  return 4; // neutral default
}
```

#### Enhancement E3: BPM-Aware Energy Scoring (fixes EC-3)
Incorporate BPM into energy calculation as a weighted composite:

```javascript
function compositeEnergy(song) {
  const styleEnergy = ENERGY_MAP_V2[song.style] || 4;
  const bpmEnergy = song.bpm ? Math.min(10, (song.bpm - 60) / 20 + 2) : styleEnergy;
  return 0.6 * styleEnergy + 0.4 * bpmEnergy;
}
```

#### Enhancement E4: Energy Transition Smoothness (fixes EC-6)
Add a penalty for large energy jumps between consecutive songs:

```javascript
const energyJump = Math.abs(getEnergy(currentSong) - getEnergy(previousSong));
const jumpPenalty = energyJump > 2.5 ? (energyJump - 2.5) * 0.5 : 0;
```

### 7.2 Tonal Gravity Upgrades

#### Enhancement T1: Integrated Tonal Scoring in Core Generator (fixes TG-1, INT-1, INT-2)
Move tonal scoring into the core generator's candidate scoring function. This is the single highest-impact change:

```javascript
// Inside generateSetlistsCore, within the scored.map() block:
let tonalPenalty = 0;
if (useTonalGravity && last?.normalizedKey && s.normalizedKey) {
  const tonalScore = calculateTonalTransitionScore_TG(last, s, pos, setLen, tonalSmoothness);
  tonalPenalty = -tonalScore * 0.25; // Convert bonus to penalty (negative = better)
}
const score = timePenalty + diversityPenalty + energyPenalty + tonalPenalty;
```

**Benefit**: Tonal compatibility is considered during initial song selection, not just post-hoc. The post-processing wrapper becomes a refinement layer rather than the only tonal optimization.

#### Enhancement T2: Improved Refinement Algorithm (fixes TG-2, TG-3)
Replace the simple 2-pass adjacent-swap with a more capable optimizer:

- Increase passes to 4–6 with bidirectional sweeps (left-to-right then right-to-left)
- Reduce swap threshold from +3 to +1
- Add non-adjacent swap exploration (try swapping songs at distance 2–3)
- Add lock-awareness to skip locked song positions (fixes INT-3)

#### Enhancement T3: Anchor Key Integration (fixes TG-4)
Use the anchor key in transition scoring — songs that return to or approach the anchor key at set boundaries receive a small bonus:

```javascript
function anchorBonus(songKey, anchorKey, position, setLength) {
  if (!songKey || !anchorKey) return 0;
  const dist = circleDistance_TG(songKey.tonic, anchorKey.tonic);
  const isNearBoundary = position < 2 || position > setLength - 3;
  return isNearBoundary && dist <= 1 ? 3 : 0;
}
```

#### Enhancement T4: Directional Harmonic Movement (fixes TG-7)
Track clockwise vs. counterclockwise movement on the circle. Prefer clockwise (energy boost) during build phases and counterclockwise (energy drain) during cool-down:

```javascript
function circleDirection_TG(fromTonic, toTonic) {
  const ia = getCircleIndex_TG(fromTonic);
  const ib = getCircleIndex_TG(toTonic);
  const clockwise = (ib - ia + 12) % 12;
  const counterclockwise = (ia - ib + 12) % 12;
  return clockwise <= counterclockwise ? 'clockwise' : 'counterclockwise';
}
```

#### Enhancement T5: Tonal-Aware Opener/Closer Selection (fixes INT-4)
When selecting forced openers and closers, prefer songs whose keys are near the anchor key:

```javascript
// In opener selection, add tonal preference scoring:
const openerCandidatesScored = openerCandidates.map(s => {
  const tonalDist = s.normalizedKey && anchor
    ? circleDistance_TG(s.normalizedKey.tonic, anchor.tonic)
    : 6;
  return { s, tonalScore: 6 - tonalDist }; // lower distance = higher score
});
```

### 7.3 Integration Upgrades

#### Enhancement I1: Unified Multi-Objective Scoring Function (fixes INT-1)
Create a single weighted scoring function that combines all objectives:

```javascript
function unifiedScore(candidate, context) {
  const { remaining, last, position, setLength, settings } = context;

  const timePenalty = Math.abs(remaining - candidate.duration);

  let diversityPenalty = 0;
  if (last?.style === candidate.style) diversityPenalty += 1.25;
  if (last?.artist === candidate.artist) diversityPenalty += 1.0;

  let energyPenalty = 0;
  if (settings.useEnergyCurve) {
    const target = targetEnergy(position / setLength, settings.curveType);
    const actual = compositeEnergy(candidate);
    energyPenalty = Math.abs(actual - target) * settings.energyWeight;
    // Transition smoothness
    if (last) {
      const jump = Math.abs(compositeEnergy(candidate) - compositeEnergy(last));
      energyPenalty += jump > 2.5 ? (jump - 2.5) * 0.3 : 0;
    }
  }

  let tonalPenalty = 0;
  if (settings.useTonalGravity && last?.normalizedKey && candidate.normalizedKey) {
    const score = calculateTonalTransitionScore_TG(last, candidate, position, setLength, settings.tonalSmoothness);
    tonalPenalty = -score * settings.tonalWeight;
  }

  return timePenalty + diversityPenalty + energyPenalty + tonalPenalty;
}
```

#### Enhancement I2: Configurable Scoring Weights
Allow users to adjust the relative importance of each scoring dimension:

| Weight | Default | Range | UI Control |
|---|---|---|---|
| `energyWeight` | 0.35 | 0.0–1.0 | Slider |
| `tonalWeight` | 0.25 | 0.0–1.0 | Slider |
| `diversityWeight` | 1.0 | 0.0–2.0 | Slider |
| `durationWeight` | 1.0 | 0.5–2.0 | Slider |

### 7.4 User Feedback Enhancements

#### Enhancement F1: Implicit Preference Learning
Track user interactions to build song-pair preference data:

- **Lock tracking**: Songs that users frequently lock should receive a small scoring bonus.
- **Swap tracking**: If a user frequently swaps out song X after generation, reduce its selection probability.
- **Position affinity**: If a user repeatedly moves a song to position 1, learn that it's a preferred opener.
- **Regeneration tracking**: If users regenerate many times before accepting, the current scoring weights may need adjustment — surface this as a suggestion.

Storage: Per-band `songPreferences` object in localStorage:

```javascript
{
  [songId]: {
    lockCount: 5,      // times locked in generated setlists
    swapOutCount: 2,   // times swapped out after generation
    positionHistory: [0, 0, 1, 0],  // positions user places this song
    pairAvoidance: ['otherId1'],     // songs frequently swapped when adjacent
  }
}
```

#### Enhancement F2: Post-Generation Feedback Toast
After a user accepts a generated setlist (saves to gig, exports PDF, or navigates away without regenerating), show a brief "How was this setlist?" prompt with a 3-option response (good / neutral / needs work). This provides explicit quality signal with minimal friction.

### 7.5 Diagnostics Enhancements

#### Enhancement D1: Per-Song Energy Visualization
Display the actual vs. target energy for each song position in the setlist view:

```
Song 1 (opener):  ████████░░  Energy: 6/7 target  ✓
Song 2:           ██████░░░░  Energy: 4/4.5 target ✓
Song 3:           ███░░░░░░░  Energy: 2/5 target   ✗ (large gap)
```

#### Enhancement D2: Tonal Path Visualization
Show the circle-of-fifths path as a visual diagram in diagnostics, highlighting smooth transitions (green), acceptable transitions (yellow), and contrast jumps (red).

#### Enhancement D3: Unified Quality Score
Provide a single 0–100 quality score for each generated setlist combining energy curve adherence, tonal flow quality, diversity metrics, and duration accuracy.

---

## 8. Proposed New Features for Varied Setlist Structures

### 8.1 Adaptive Algorithm: Simulated Annealing Mode

**Description**: An optional "Deep Optimization" mode that uses simulated annealing to explore a larger solution space. Rather than greedy selection + post-hoc swaps, SA can find globally better solutions.

**Implementation sketch**:
1. Generate an initial setlist (current greedy method).
2. Define a cost function: `cost = w1*energyDeviation + w2*tonalDistance + w3*diversityLoss + w4*durationError`.
3. Apply SA: randomly swap/replace songs, accept improvements always and worsening moves with probability `e^(-ΔC/T)`.
4. Cool temperature T from ~10 to ~0.1 over 500–1000 iterations.
5. Return the best solution found.

**User-facing**: A toggle or dropdown: "Optimization Level: Quick / Standard / Deep". Quick = current greedy. Standard = current + improved post-processing. Deep = SA-based.

### 8.2 Venue/Context Presets

**Description**: Pre-configured profiles that adjust energy curve shape, tonal smoothness, diversity penalties, and set structure for common performance contexts.

| Preset | Energy Curve | Tonal Smoothness | Diversity | Notes |
|---|---|---|---|---|
| Club/Dance | High baseline, single peak | 60 (moderate) | Low (crowd wants consistency) | BPM-driven, harmonic mixing priority |
| Jazz Club | Low baseline, gentle build | 80 (smooth) | High (variety valued) | Key transitions very important |
| Wedding | Moderate, double peak | 50 (balanced) | Medium | Two energy peaks (dinner → dance) |
| Festival | High energy, sustained | 40 (contrast OK) | Medium | Impact > smoothness |
| Corporate | Conservative, steady | 90 (very smooth) | Medium | No jarring transitions |
| Acoustic/Coffeehouse | Low, gradual build | 85 (smooth) | High | Intimate, key flow critical |

### 8.3 Set Structure Templates

**Description**: Allow users to define structural templates for sets:

- **Classic arc**: Opener → Build → Peak → Cool → Closer
- **Double peak**: Opener → Build → Peak1 → Valley → Peak2 → Closer
- **Bookend**: Strong opener → Free middle → Strong closer
- **Thematic blocks**: Group by key/style/era, smooth transitions between blocks

Each template constrains which song styles/energies are eligible for each position, giving the generator more structured guidance.

### 8.4 "Surprise Me" Controlled Randomness

**Description**: A randomness dial (0–100) that controls how adventurous the generator is:

- **0 (Predictable)**: Always select the best-scoring candidate. Minimal variety between regenerations.
- **50 (Balanced)**: Current behavior (top-6 random selection).
- **100 (Adventurous)**: Softmax selection from all valid candidates, with occasional "wildcard" picks that break rules for serendipity.

Implementation: Replace the hard-coded `topK = 6` with a temperature-controlled selection:

```javascript
const temperature = (randomness / 100) * 2 + 0.1; // 0.1 (deterministic) to 2.1 (very random)
const probabilities = softmax(scored.map(s => -s.score / temperature));
const pick = weightedRandomSelect(scored, probabilities);
```

### 8.5 Multi-Set Coherence

**Description**: Currently, each set is generated independently (aside from dedup). A coherence system would ensure:

- **Key continuity**: The closing key of Set 1 is harmonically close to the opening key of Set 2.
- **Energy reset**: Set 2 starts at a lower energy than Set 1 ended (natural break feel).
- **Thematic variety**: If Set 1 was heavy on funk/groove, Set 2 could emphasize different styles.
- **Progressive difficulty**: For rehearsal setlists, order songs by learning difficulty across sets.

### 8.6 Song Affinity / Anti-Affinity Rules

**Description**: Allow users to define song relationships:

- **Affinity** ("pair these"): Songs X and Y work well together — prefer placing them adjacent.
- **Anti-affinity** ("separate these"): Songs X and Y are too similar — keep them at least N positions apart.
- **Medley support**: Songs A, B, C should appear in exact sequence.

---

## 9. Implementation Priority Matrix

### Phase 1 — Quick Wins (Low Effort, High Impact)

| # | Enhancement | Issue(s) Fixed | Estimated Complexity |
|---|---|---|---|
| 1 | Reduce swap threshold from +3 to +1 | TG-3 | Single constant change |
| 2 | Increase DEFAULT_PASSES from 2 to 4 | TG-2 | Single constant change |
| 3 | Add lock-awareness to tonal swap loop | INT-3 | ~10 lines |
| 4 | Add bidirectional sweep to tonal refinement | TG-2 | ~15 lines |
| 5 | Add anchor key bonus at set boundaries | TG-4 | ~20 lines |
| 6 | Configurable energy penalty weight (slider) | EC-5 | UI + ~5 lines logic |

### Phase 2 — Core Architecture Improvements (Medium Effort, High Impact)

| # | Enhancement | Issue(s) Fixed | Estimated Complexity |
|---|---|---|---|
| 7 | Continuous energy curve function | EC-1 | ~30 lines, replace 4-zone |
| 8 | Integrate tonal scoring into core generator | TG-1, INT-1, INT-2 | ~40 lines in scoring |
| 9 | Expanded ENERGY_MAP + BPM fallback | EC-2, EC-3 | ~30 lines |
| 10 | Energy transition smoothness penalty | EC-6 | ~15 lines |
| 11 | Tonal-aware opener/closer selection | INT-4 | ~25 lines |
| 12 | Unified multi-objective scoring function | INT-1 | Refactor scoring block |

### Phase 3 — New Capabilities (Higher Effort, High Value)

| # | Enhancement | Description | Estimated Complexity |
|---|---|---|---|
| 13 | Venue/context presets | Pre-built profiles | UI + settings model |
| 14 | Softmax temperature-controlled selection | "Surprise Me" randomness | ~30 lines, UI slider |
| 15 | Implicit preference learning | Feedback from locks/swaps/reorders | New data model + tracking |
| 16 | Per-song energy visualization | Visual energy bars in setlist view | UI component |
| 17 | Tonal path visualization | Circle-of-fifths diagram | SVG/Canvas component |
| 18 | Multi-set coherence system | Cross-set key/energy continuity | ~60 lines |

### Phase 4 — Advanced (High Effort, Transformative)

| # | Enhancement | Description | Estimated Complexity |
|---|---|---|---|
| 19 | Simulated annealing optimization mode | "Deep Optimization" toggle | ~120 lines SA engine |
| 20 | Set structure templates | Structural position constraints | Data model + UI |
| 21 | Song affinity/anti-affinity rules | User-defined song relationships | Data model + UI + scoring |
| 22 | Directional harmonic movement | Clockwise/CCW awareness | ~40 lines, scoring integration |
| 23 | Unified quality score (0–100) | Combined metric for setlist quality | ~50 lines |

---

## 10. Appendix: Technical Reference

### A. File Locations

| Component | File | Lines |
|---|---|---|
| Algorithm constants | `index.html` | 280–288 |
| ENERGY_MAP | `index.html` | 357–359 |
| Circle of Fifths data | `index.html` | 944–947 |
| Tonal normalization | `index.html` | 949–984 |
| Tonal distance functions | `index.html` | 986–1007 |
| Anchor key detection | `index.html` | 1009–1031 |
| Contrast slot detection | `index.html` | 1033–1037 |
| Tonal transition scoring | `index.html` | 1039–1067 |
| Tonal diagnostics | `index.html` | 1073–1113 |
| Tonal gravity wrapper | `index.html` | 1116–1166 |
| Core generator | `index.html` | 1170–1432 |
| Energy scoring (in generator) | `index.html` | 1336–1345 |
| Set configuration UI | `index.html` | 1625–1868 |
| Tonal gravity UI | `index.html` | 1761–1833 |
| Generation handler | `index.html` | 2932–2952 |
| Default settings | `index.html` | 2815 |

### B. Current Scoring Formula

```
totalScore = timePenalty + diversityPenalty + energyPenalty
           = |remaining - duration|
             + (sameStyle ? 1.25 : 0) + (sameArtist ? 1.0 : 0)
             + |actualEnergy - targetEnergy| * 0.35

Lower score = better candidate (penalty-based scoring)
```

### C. Proposed Unified Scoring Formula

```
totalScore = w_d * |remaining - duration|
           + w_div * [(sameStyle ? 1.25 : 0) + (sameArtist ? 1.0 : 0)]
           + w_e * |compositeEnergy(song) - targetEnergy(position)|
           + w_e_trans * max(0, |ΔEnergy| - 2.5) * 0.3
           + w_t * (-tonalTransitionScore * 0.25)
           + w_anchor * (-anchorBonus)

Where:
  w_d = durationWeight (default 1.0)
  w_div = diversityWeight (default 1.0)
  w_e = energyWeight (default 0.35)
  w_e_trans = energyTransitionWeight (default 0.3)
  w_t = tonalWeight (default 0.25)
  w_anchor = anchorWeight (default 0.1)
```

### D. Industry References

- Mixed In Key: Camelot Wheel harmonic mixing system
- DJ.Studio: AUTOMIX with energy mapping and harmonic sequencing
- Academic: "Music playlist generation by adapted simulated annealing" (Information Sciences, 2007)
- Academic: "Constraint-based playlist generation by applying genetic algorithm" (ISMIR)
- Spotify: Prompted Playlists (2025) — real-time adaptive learning from user feedback
- Spotify Research: "Personalizing Agentic AI to Users' Musical Tastes with Scalable Preference Optimization" (2025)

---

*Report generated: February 12, 2026*
*Setlist Generator v3.6.0 — Diagnostic Analysis*
