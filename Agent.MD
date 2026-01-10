
AGENT.MD latest report



	•	Your print formatting is already correct ✅ (Times New Roman, 19pt, line-height 1.0, per-set page breaks).
	•	Your manual edit mode is implemented correctly ✅.
	•	Your CSV hardening work is solid ✅.

The remaining issue — duplicates still appearing — is real, reproducible, and caused by two subtle but critical logic leaks in the generator.

I’ll be precise and concrete so you (or Rob) can fix this in one pass.

⸻

🔴 Why duplicates are STILL happening (root cause)

You did add a globalUsedSongKeys Set, which is correct.
However, duplicates can still enter through two backdoors:

⸻

❌ LEAK #1 — Force Closer ignores earlier set usage

This block is the biggest offender:

// closer
if (forceCloser && setSongs.length){
  const last = setSongs[setSongs.length-1];
  const e = ENERGY_MAP[last.style] || 3;
  if (!(e >= 5 || last.style === 'ballad')){
    const closers = pool.filter(s => (
      allowSongReuse ? true : !getSongDedupKeys(s).some(key => globalUsedSongKeys.has(key))
    ) && (s.style === 'uptempo' || s.style === 'ballad'));

The bug

At this point in the loop:
	•	globalUsedSongKeys already includes all songs used earlier in this same set
	•	BUT:
	•	You already pushed all keys from the selected closer
	•	You do not remove the previously added last song
	•	Result: the closer can duplicate a song already used earlier in the same set

This is how you’re seeing duplicates even with No Reuse enabled.

⸻

✅ REQUIRED FIX (Force Closer)

You must remove the current last song’s keys from the dedupe set before searching for a replacement, exactly like you do in swapSong.

Fix:

// BEFORE selecting closers
if (!allowSongReuse) {
  getSongDedupKeys(last).forEach(key => globalUsedSongKeys.delete(key));
}

Then, after pushing the closer, re-add its keys:

if (!allowSongReuse){
  getSongDedupKeys(closer).forEach(key => globalUsedSongKeys.add(key));
}

Without this, forceCloser will always leak duplicates under certain durations.

⸻

❌ LEAK #2 — Cross-set exhaustion fallback still allows reuse

This block is dangerous:

if (candidates.length === 0){
  candidates = pool.filter(song => (
    isAvailable(song)
  ));
  if (candidates.length === 0){
    if (!allowSongReuse){
      generationWarnings.add('Unable to generate requested sets without repeating songs.');
      setFailed = true;
      generationAborted = true;
    }
    break;
  }
}

The problem

Once Set 1 consumes too much of the pool, Set 2 can enter a state where:
	•	Duration constraints fail
	•	isAvailable(song) becomes too permissive
	•	You break out after partially generating a set

This leaves previously used songs intact and allows later logic to reinsert them.

⸻

✅ REQUIRED FIX (Hard stop, not soft break)

When allowSongReuse === false and no candidates exist:

👉 You must abort generation entirely, not just break the inner loop

Replace:

break;

With:

generationAborted = true;
break;

And after the while loop:

if (generationAborted) break;

You partially do this — but not consistently across all branches.

This is why duplicates appear intermittently depending on:
	•	number of sets
	•	duration
	•	energy curve on/off

⸻

🟢 What is already CORRECT (no changes needed)

✅ Print export

Your implementation is spot-on:
	•	@page size: letter
	•	.set-page { page-break-after: always }
	•	Times New Roman
	•	19pt
	•	line-height 1.0
	•	Each set on its own page

This meets your spec exactly.

✅ Manual Edit Mode
	•	Toggle logic is correct
	•	Generate disabled during manual mode
	•	Move up/down recalculates duration correctly

No changes needed.

⸻

✅ Minimal Patch Summary (what to actually change)

You do not need a refactor.

Fix only these two things:
	1.	Force Closer
	•	Temporarily remove last song from globalUsedSongKeys
	•	Add selected closer back after insertion
	2.	Hard abort generation
	•	When dedupe makes generation impossible, abort all remaining sets
	•	Do not allow partial fallback logic to continue

That’s it.

⸻

🧪 How you’ll know it’s fixed

After patching:
	•	2 sets × 30 min → no duplicates
	•	3 sets × 45 min → no duplicates
	•	Energy curve ON / OFF → no duplicates
	•	Strong opener / closer ON → no duplicates
	•	Manual edit does not reintroduce duplicates

At that point, your generator is correct by construction, not by luck.

⸻

If you want, next step we can:
	•	add a “Remaining songs available” meter
	•	or add soft warnings before generation if the library is too small

But first: patch the two leaks above. This is the real fix.