'use strict';
/*
 * Built-in Vegas venue directory — data integrity. The directory browser and
 * bulkAddVenues both dedup by lowercase name, so a duplicate name here would
 * silently hide one of the two entries; closed rooms must never be listed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { VENUE_DIRECTORY, VENUE_TYPES, directoryEntryToVenue,
  directoryNameKey, findDirectoryMatch, enrichProspectFromDirectory, prospectToVenue } = algorithm;
const key = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

test('no duplicate names (case- and accent-insensitive)', () => {
  const seen = new Map();
  for (const d of VENUE_DIRECTORY) {
    const k = key(d.name);
    assert.ok(!seen.has(k), `duplicate directory name: "${d.name}" vs "${seen.get(k)}"`);
    seen.set(k, d.name);
  }
  assert.ok(VENUE_DIRECTORY.length >= 220);
});

test('every entry is well-formed', () => {
  for (const d of VENUE_DIRECTORY) {
    assert.ok(d.region && d.name && d.city, `missing region/name/city: ${d.name}`);
    assert.ok(VENUE_TYPES.includes(d.type), `bad type "${d.type}" on ${d.name}`);
    assert.equal(d.state, 'NV');
    assert.equal(typeof d.verified, 'boolean');
    if (d.email) assert.match(d.email, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, `bad email on ${d.name}`);
  }
});

test('closed and not-a-fit rooms are not listed', () => {
  const names = VENUE_DIRECTORY.map(d => key(d.name));
  for (const dead of ['fat cat', 'mama rabbit', 'vino del lago', 'skyfall', 'double down', 'foundation room',
    'e-string', "don't tell mama", 'pepper club', 'artifice', 'beauty bar', 'joseph james',
    'downtown cocktail room', 'andiron', 'public school 702']) {
    assert.ok(!names.some(n => n.includes(dead)), `closed/unfit venue listed: ${dead}`);
  }
});

test('the direct-booking leads carry their published channels', () => {
  const byName = Object.fromEntries(VENUE_DIRECTORY.map(d => [d.name, d]));
  assert.equal(byName['The Sand Dollar Lounge'].email, 'booking@thesanddollarlv.com');
  assert.equal(byName["Vic's Las Vegas"].email, 'chris@stoneys.com');
  assert.equal(byName['The Dispensary Lounge'].email, 'ulimusic@gmail.com');
  assert.equal(byName['Maxan Jazz Club'].email, 'owner@maxanjazz.com');
  assert.equal(byName['Gold Mine Tavern'].email, 'sam@goldminetavern.com');
  assert.equal(byName['Category 10 (Flamingo)'].email, 'promotions@category10.com');
  assert.equal(byName['Red Dwarf'].email, 'Natalie@reddwarflv.com');
  assert.equal(byName['Taverna Costera'].email, 'booking@tavernacostera.com');
  assert.equal(byName['Red Rock Country Club'].email, 'sgamble@redrockcc.com');
  assert.equal(byName['Las Vegas Country Club'].email, 'brandim@lasvegascc.com');
});

test('directoryEntryToVenue flags unverified entries and keeps contacts', () => {
  const unverified = VENUE_DIRECTORY.find(d => !d.verified);
  const v = directoryEntryToVenue(unverified);
  assert.match(v.notes, /verify current booking contact/);
  assert.equal(v.status, 'prospect');
  const gm = directoryEntryToVenue(VENUE_DIRECTORY.find(d => d.name === 'Gold Mine Tavern'));
  assert.equal(gm.email, 'sam@goldminetavern.com');
  assert.doesNotMatch(gm.notes, /verify current booking contact/);
  assert.match(gm.notes, /23 S Water St/);
});

test('prospector results pick up directory contacts by name', () => {
  // exact (case, accents, "The", punctuation, property suffix ignored)
  assert.equal(findDirectoryMatch('the red dwarf').name, 'Red Dwarf');
  assert.equal(findDirectoryMatch('Rí Rá Irish Pub').name, 'Rí Rá Irish Pub');
  assert.equal(findDirectoryMatch('Ri Ra Irish Pub').name, 'Rí Rá Irish Pub');
  // OSM name that extends a distinctive directory name
  assert.equal(findDirectoryMatch('Mickie Finnz Fish House & Bar').name, 'Mickie Finnz');
  assert.equal(findDirectoryMatch('Chinitas Tapas & Sushi').name, 'Chinitas');
  // no match on short or generic names
  assert.equal(findDirectoryMatch('Jing Fong'), null);
  assert.equal(findDirectoryMatch('Bar'), null);
  assert.equal(findDirectoryMatch('Some Unlisted Tavern'), null);
  assert.equal(directoryNameKey("ARIA Lounges: Lift Bar, Lobby Bar, Easy's"), 'aria lounges');

  const osm = { name: 'Red Dwarf', email: '', phone: '(702) 000-0000', website: '', signals: ['🎵 live music tagged'], type: 'Bar', city: 'Las Vegas', fit: null };
  const e = enrichProspectFromDirectory(osm);
  assert.equal(e.email, 'Natalie@reddwarflv.com');
  assert.equal(e.phone, '(702) 000-0000', 'map data the place already has is kept');
  assert.equal(e.website, 'reddwarflv.com');
  assert.ok(e.signals.some(x => /booking contact on file/.test(x)));
  const v = prospectToVenue(e);
  assert.equal(v.email, 'Natalie@reddwarflv.com');
  assert.equal(v.contactName, 'Natalie (Band Booking)');
  assert.match(v.notes, /Vegas Directory entry "Red Dwarf"/);
  const untouched = { name: 'Nowhere In Particular', signals: [] };
  assert.equal(enrichProspectFromDirectory(untouched), untouched);
});

test('Nov 2026 merge: act fit is a valid format and survives into the pipeline', () => {
  const { VENUE_FORMATS } = algorithm;
  const byName = Object.fromEntries(VENUE_DIRECTORY.map(d => [d.name, d]));
  for (const d of VENUE_DIRECTORY) {
    if (d.preferredFormat !== undefined) assert.ok(VENUE_FORMATS.includes(d.preferredFormat), `bad preferredFormat on ${d.name}`);
  }
  assert.equal(byName['ECHO - Taste and Sound'].preferredFormat, 'duo');
  assert.equal(byName['The Dustland Bar'].preferredFormat, 'late_shift');
  assert.equal(byName['Brooklyn Bowl (LINQ Promenade)'].preferredFormat, 'late_shift');
  assert.equal(byName['Commonwealth'].preferredFormat, undefined, 'low-fit room gets no pitch format');
  assert.equal(directoryEntryToVenue(byName['ECHO - Taste and Sound']).preferredFormat, 'duo');
  assert.equal(directoryEntryToVenue(byName['Grey Witch']).preferredFormat, 'late_shift');
  // rooms that live inside a property entry were updated, not duplicated
  assert.equal(byName["Alexxa's (Paris)"].preferredFormat, 'band');
  for (const dup of ["Alexxa's Bar at Paris Las Vegas", 'The Club at Cannery', 'ETA Lounge at Aliante',
    'Rocks Lounge at Red Rock Casino', "Caspian's Rock & Roe", "Hank's Fine Steaks & Martinis"]) {
    assert.ok(!byName[dup], `duplicate of a property entry added: ${dup}`);
  }
  // existing verified booking channels were not downgraded by the list's "prospect" status
  assert.equal(byName['The Sand Dollar Lounge'].verified, true);
  assert.equal(byName["Stoney's Rockin' Country"].email, 'booking@stoneys.com');
});

test('prospector: curated act fit overrides the map heuristic', () => {
  const osm = { name: 'ECHO - Taste and Sound', email: '', phone: '', website: '', signals: [], type: 'Restaurant',
    city: 'Las Vegas', format: 'band', fit: { soloDuo: 3, band: 5 } };
  const e = enrichProspectFromDirectory(osm);
  assert.equal(e.format, 'duo');
  assert.equal(prospectToVenue(e).preferredFormat, 'duo');
  const lateShift = prospectToVenue(enrichProspectFromDirectory({ ...osm, name: 'The Dustland Bar', format: 'duo' }));
  assert.equal(lateShift.preferredFormat, 'late_shift');
  assert.match(lateShift.notes, /Best fit: late-night band/);
  // a directory room with no curated fit keeps the heuristic's format
  const plain = VENUE_DIRECTORY.find(d => !d.preferredFormat && d.name.length > 8 && !/[:(]/.test(d.name));
  assert.equal(enrichProspectFromDirectory({ ...osm, name: plain.name, format: 'band' }).format, 'band');
});

test('prospector matcher: no generic-word or wrong-town matches', () => {
  assert.equal(findDirectoryMatch('The Lounge at Gold Coast'), null);
  assert.equal(findDirectoryMatch('Lounge 107'), null);
  assert.equal(findDirectoryMatch('The Tavern'), null);
  assert.equal(findDirectoryMatch("Juan's Flaming Fajitas & Cantina North Las Vegas").name,
    "Juan's Flaming Fajitas & Cantina (North Las Vegas)", 'same-town suffix still matches');
  assert.equal(findDirectoryMatch("Juan's Flaming Fajitas & Cantina Henderson").name,
    "Juan's Flaming Fajitas & Cantina Henderson", 'the Henderson location matches its own entry');
  // the existing distinctive-prefix behaviour is unchanged
  assert.equal(findDirectoryMatch('Mickie Finnz Fish House & Bar').name, 'Mickie Finnz');
});
