# Handoff Note — Musician Preparedness Prototype

## What was added
- Draft HTML prototype with musician roster, gig setup, viable song filtering, and prep packet exports.
- LocalStorage persistence for musicians and gigs on a per-band basis.
- Gig-aware generation pipeline that preserves legacy behavior when no gig is active.

## TODO / Stubs
- No dedicated UI for song-level notes or form deltas (exports include them if present on song objects).
- No validation for minimum viable song counts beyond zero-viable abort.

## Assumptions
- "Core repertoire" implies "knows cold"; literacy level drives readiness for non-core songs.
- Prep packets are based on the most recently generated setlists.
