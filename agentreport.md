Agent Report: Setlist Generator App v3.5.0 Update (2026-02-09)

## Summary of Changes — v3.5.0

### TASK 1: Critical Bug Fixes (Duplicate Generation)

Two root-cause bugs causing duplicate songs in generated setlists have been fixed:

1. **Force Closer Duplicate Leak (FIXED)**: When the generator replaced the last song in a set with a closer-style song, the original song remained marked as "used" in the global dedup map. This prevented it from appearing in later sets AND could allow the closer to duplicate a song already in the set. Fix: `unmarkUsed()` is now called on the replaced song before selecting a closer, and the closer is properly marked after insertion.

2. **Cross-Set Exhaustion Fallback (FIXED)**: When the candidate pool was exhausted mid-generation, the code would `break` the inner loop but continue generating subsequent sets. This could lead to partial sets and reuse of songs from earlier sets. Fix: Added `generationAborted` flag that halts the outer set loop when unique songs are exhausted with `allowSongReuse === false`.

3. **Added `unmarkUsed()` helper**: Symmetric counterpart to `markUsed()` that properly decrements the usage counter in the dedup Map.

### TASK 2: Performance Optimizations

1. **Set-based dedup in generator inner loop**: Replaced O(n) `setArr.some(x => x && x.id === song.id)` calls with O(1) `setUsedIds.has(song.id)` using a per-set `Set`. This eliminates the primary bottleneck in the candidate filtering hot path, particularly noticeable with large song libraries (50+ songs).

2. **Algorithmic complexity improvement**: The candidate filtering loop previously had O(n*m) complexity per iteration (n=pool size, m=set size). With the Set-based lookup, it's now O(n) per iteration.

### TASK 3: PDF Import & Universal File Upload

1. **PDF.js integration**: Added pdf.js v3.11.174 for client-side PDF text extraction.

2. **PDF parsing engine**: New functions:
   - `pdfExtractText()`: Extracts text from PDF files, grouping items by Y-position to reconstruct rows
   - `pdfParseBandListLine()`: Smart parser that detects numbered song rows with heuristic field detection (title, artist, vocalist, duration in M:SS, key, BPM)
   - `pdfParseAllPages()`: Multi-page PDF concatenation and parsing
   - `pdfSongsToCSV()`: Converts parsed PDF songs to standard CSV format

3. **Universal file import**: Both Quick Import and Import + Normalize modal now accept PDF, CSV, TSV, and TXT files. PDF files are automatically parsed and fed into the existing normalization pipeline.

4. **Updated sample CSV**: Now includes Vocalist column and sample songs matching the Down South Jukers format.

5. **CSV export updated**: Now includes Vocalist column in exported CSV files.

### TASK 4: Enhanced UX — Manual Arrange, Lock/Swap, Gig Profiles

1. **Improved Manual Edit Mode**: Cleaner UI separation — in manual mode, shows Move Up/Down and Remove buttons; in normal mode, shows Lock and Swap buttons. No more cramped button row.

2. **Remove from setlist → Cold List**: New "Remove" button (red X) in manual edit mode removes a song from the generated setlist and automatically shelves it to the Cold List. Duration is recalculated.

3. **Lock Entire Set**: New "Lock Set" / "Unlock Set" button on each set header. One click locks or unlocks all songs in a set. Visual indicator shows when all songs are locked.

4. **Gig Profiles**: New feature under each band profile:
   - Create gig profiles with name, venue, date, and notes
   - Save current generated setlists to a gig profile
   - Load saved setlists from a gig profile
   - Delete gig profiles
   - Data stored per-band in localStorage (`setlist_band_gigs_v3_{bandId}`)
   - Accessible via "Gig Profiles" button in the band bar

5. **Version bump**: v3.4.0 → v3.5.0

## Previous Changes (v3.4.0)

1. Default duration for zero-duration songs: 4 minutes fallback in `parseDuration`.
2. Removed unused parameters from `generateTonalDiagnostics_TG()`.
3. Added configurable constants: MAX_GUARD, DURATION_TOLERANCE_POSITIVE/NEGATIVE, DEFAULT_PASSES.
4. Improved localStorage error handling with catch blocks.
5. Updated duration filter logic with tolerance constants.
6. Unified refinement pass count with DEFAULT_PASSES.

## Current Status

- **Bug fixes verified**: Both duplicate-generation leaks (Force Closer + Cross-Set Exhaustion) are patched. The `unmarkUsed()` / `generationAborted` pattern ensures correctness.
- **PDF import operational**: PDF files from band management apps (BandHelper format) can be uploaded directly.
- **Gig profiles functional**: Per-band gig management with save/load setlist capability.
- **All existing features intact**: Song library (Active/Cold), CSV import/export, tonal gravity, energy curves, printing.

## Recommended Next Steps

1. **Drag-and-drop reorder**: Replace up/down buttons with HTML5 drag-and-drop or touch-friendly sortable for mobile use.
2. **PDF parser refinement**: Test with additional PDF formats beyond BandHelper. May need format-specific adapters for other band management apps.
3. **Gig calendar view**: Add a timeline/calendar view for gig profiles to help with scheduling.
4. **Refactor dedup logic**: Extract shared `getSongDedupKeys` into a single utility (currently duplicated in `generateSetlistsCore` and `swapSong`).
5. **Improve input sanitization**: Consider using a dedicated library for HTML sanitization beyond regex-based `sanitizeInput`.
6. **Add useEffect cleanup**: Prevent stale state on rapid band switching.
