
Upgrading the “Zemba Master List” for the Setlist Generator v3.6.0

Why the new columns matter

Modern versions of Setlist Generator (v3.6.0) use more sophisticated algorithms to balance song order and energy.  Two of the new features described in the Diagnostic Report – Energy Curve and Tonal Gravity – depend on specific data columns:
Column	Why the app needs it	Supporting evidence
KEY	The Tonal Gravity algorithm calculates the “distance” between songs on the circle of fifths.  Keys that are a fifth apart or are relative minors/majors are treated as more compatible.  Music theory resources note that the circle of fifths shows each major key adjacent to its relative minor and that closely related keys differ by a single sharp or flat .  Without a valid key, the system cannot compute tonal distances and defaults to a neutral value.	When a file lists the key, it should follow standard notation: major keys as a single letter (e.g., E, Bb, F#) or with “maj” (Cmaj).  Minor keys should be indicated with a lowercase m (e.g., Em, Am, C#m).  Music‑theory guides emphasize that major chords are usually represented by the letter alone while minor chords use a lowercase m .  This consistent notation lets the parser treat C and Cmaj as identical while recognizing Am as minor.
BPM	The new Energy Curve uses BPM to distinguish between, for example, a 90 BPM mid‑tempo groove and a 130 BPM fast rocker.  Production guides note that a 150 BPM dance track typically feels more energetic than a 105 BPM chill song .  If the BPM column is empty, the app guesses energy based solely on the Style tag, which reduces accuracy.	BPM must be a numeric value (e.g., 120 or 94.5).  For tracks where the BPM isn’t known, use a metronome or software such as Mixed In Key to determine it.  In the uploaded list, Song #11 “Revelation” by Robben Ford has no BPM value—this should be filled in.
STYLE	The Style column maps to energy levels on a 1–10 scale.  Mixed In Key’s energy‑level guide shows that low‑energy tracks (levels 1–3) include chill‑out and ambient music, mid‑energy tracks (levels 5–6) are danceable, and high‑energy tracks (levels 7–10) are festival anthems .  If an unfamiliar style word is used (e.g., “Jam”), the system defaults to a low energy level.	Use the Golden Style List recommended in the diagnostic report.  For example:

	•	Low energy (1–3): ballad, acoustic, waltz
	•	Moderate/Cool (3.5–4): swing, bossa, blues, jazz, country, reggae
	•	Mid‑High (4.5–5.5): midtempo, soul, rnb, shuffle, groove
	•	High (6–7): rock, uptempo, ska, funk
	•	Peak (8–10): punk, metal, edm

Adjust existing tags accordingly: “slow blues” should be renamed to blues or ballad depending on its feel; “Classic Rock” should be simplified to rock or uptempo.
|
| ARTIST | The Diversity Penalty algorithm prevents too many songs by the same artist appearing back‑to‑back.  Playlist‑shuffling research notes that listeners dislike hearing the same artist twice in a row and that shuffling algorithms interleave tracks from different artists to avoid consecutive repeats . | Ensure artist names are spelled consistently—e.g., use Jimi Hendrix rather than alternating between “Hendrix, Jimi” and “Jimi Hendrix.”  Uniform naming allows the algorithm to recognize duplicates. |
| DURATION | Used to calculate the total length of each set.  Since the system expects minutes, use either an integer representing minutes (5) or a m:ss format if supported. | |

If any of these columns are missing or contain inconsistent data, the algorithms default to neutral settings, effectively turning off the Energy Curve, Tonal Gravity, and Simulated Annealing features.

Identified gaps in the uploaded PDF (Zemba Master List)

The provided PDF already follows the recommended structure for most entries (Title, Artist, Duration, Style, Key, BPM, Vocalist).  However, a few issues must be addressed:
	1.	Missing BPM – Song #11 (“Revelation” by Robben Ford) has no BPM value in the list.  Add the correct BPM; otherwise the energy for this track will be guessed from its style (groove).
	2.	Style standardization – The list uses the tag “slow blues.”  To align with the Golden Style List, rename this either blues (moderate energy) or ballad (low energy) depending on the track’s feel.  Likewise, replace any occurrences of “Classic Rock” with rock or uptempo.  Use only the controlled vocabulary terms.
	3.	Key notation – Keys are generally correct (e.g., Em, C, F#).  To ensure the Tonal Gravity parser treats keys properly, always use a single letter for major keys and a lowercase m for minor keys.  For example, C and Cmaj both signify C major, while Am denotes A minor.  Music‑theory guides confirm that major chords are represented by an uppercase letter alone, while minor chords use a lowercase m .
	4.	Column order and headers – Ensure the CSV uses the following headers exactly: Title, Artist, Style, Key, BPM, Duration (optionally Vocalist as an extra column).  The order is important for the import tool.
	5.	No blank fields – Every song must have a value for Key and BPM.  Blank cells deactivate the advanced algorithms.
	6.	Uniform artist names – Use consistent spelling and formatting.  Avoid mixing “Firstname Lastname” with “Lastname, Firstname.”  This consistency supports the diversity algorithm and duplicates detection.

Preparing the CSV/PDF for import

To fully activate Energy Curve, Tonal Gravity and Simulated Annealing in Setlist Generator v3.6.0:
	1.	Update missing data: Fill in BPM for song #11 (“Revelation”) and any other missing BPM or keys.  You can use online metronome tools or Mixed In Key’s BPM detector.  Double‑check each entry for blanks.
	2.	Standardize styles: Scan the Style column and map each value to one of the Golden Style List keywords.  Use spreadsheet functions (e.g., Find/Replace in Excel or Google Sheets) to replace “slow blues” with blues or ballad, and “Classic Rock” with rock or uptempo.
	3.	Normalize keys: Use the letter‑only notation for major keys (e.g., C, E, F#) and add lowercase m for minor keys (Am, C#m).  Avoid phrases like “Key of G.”  The circle of fifths organizes keys in steps of perfect fifths and pairs relative major/minor keys , so consistent notation is vital.
	4.	Ensure uniform artist names: Pick a single format (e.g., Stevie Wonder) and apply it consistently throughout the list.  Avoid reversing names or adding extra characters.  Studies of playlist‑shuffle algorithms show that listeners dislike consecutive tracks by the same artist ; consistent names help the diversity algorithm distribute artists evenly.
	5.	Check duration format: Use whole minutes (e.g., 5) or m:ss (e.g., 4:30) depending on what the app supports.  Consistency ensures accurate set‑length calculations.
	6.	Export to CSV: After making changes, export the spreadsheet as CSV with UTF‑8 encoding.  Use the column order Title,Artist,Style,Key,BPM,Duration (and Vocalist if included).  Ensure there are no extra spaces or hidden characters.
	7.	Test the import: Upload the CSV to the Setlist Generator and review the diagnostic report.  If the report shows “neutral” energy or tonal values for any track, check that the corresponding rows follow the standards above.

Exploring the “Import and Normalize” feature and best practices

The Diagnostic Report mentions an Import and Normalize feature that lets you edit song data from within the app.  While exact documentation isn’t public, the following best practices can help you make full use of such a feature:
	1.	Backup your master file – Always keep an original copy of your song list (in CSV or spreadsheet form).  Before experimenting with the import tool, duplicate your file so you can revert if the normalized data isn’t satisfactory.
	2.	Use the mapping interface – Most import tools allow you to map columns from your CSV to fields in the app (e.g., Title → Title, BPM → BPM).  Confirm that each column is correctly mapped before finalizing the import.
	3.	Normalize within the app – After importing, use the normalization screen to correct any remaining issues.  This usually involves editing entries directly in the app (correcting misspellings, adjusting styles, entering missing BPMs) and ensuring all entries conform to the Golden Style List and key notation.  If the app provides drop‑down menus for styles or keys, use them to guarantee correct values.
	4.	Iterate and validate – Import the normalized list, generate a set list, and review the energy curve and key transitions.  If transitions feel abrupt or neutral values appear, return to the Normalize tool and adjust the problematic songs (e.g., tweak style tags or BPM values).
	5.	Keep fields consistent – Normalization is most effective when the data is clean.  Use consistent capitalization and spacing.  Avoid adding comments or extra symbols in the Style or Key fields.
	6.	Manual editing vs. automated mapping – If the app misinterprets certain fields during import, you can open the CSV in a spreadsheet tool and manually correct issues before re‑uploading.  For large changes (e.g., converting “slow blues” to “blues”), spreadsheet functions (e.g., Find/Replace) are more efficient than editing each entry in the app.

Following these guidelines will ensure that Energy Curve, Tonal Gravity, and Simulated Annealing features operate at full capacity.  The clean data will allow the system to generate more dynamic, musically coherent setlists that maintain crowd engagement and smooth key transitions.