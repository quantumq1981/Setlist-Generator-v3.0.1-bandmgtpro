'use strict';
/*
 * Gig Prospector (OpenStreetMap discovery) — query shape, response validation,
 * dual-format scoring, prospect→venue mapping, and the outreach compliance footer.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const {
  PROSPECT_AREAS, PROSPECT_KINDS, OVERPASS_ENDPOINTS, PROSPECT_RESULT_CAP,
  buildOverpassQuery, overpassResponseIssue, prospectsTruncated, distanceMi, opensLate,
  scoreProspect, overpassToProspects, prospectToVenue, epkLinkForVenue,
  outreachNeedsFooter, appendOutreachFooter,
} = algorithm;

const downtown = PROSPECT_AREAS.find(a => a.key === 'lv-downtown');

test('query asks for the full result cap, not the old 400', () => {
  const q = buildOverpassQuery(36.16, -115.14, 8000, ['bar|pub', 'casino|gambling']);
  assert.match(q, new RegExp(`out center tags ${PROSPECT_RESULT_CAP};$`));
  assert.ok(PROSPECT_RESULT_CAP >= 2000);
  assert.match(q, /\^\(bar\|pub\|casino\|gambling\)\$/);
  assert.match(q, /around:8000,36\.16,-115\.14/);
});

test('casinos are on by default and there are at least three endpoints', () => {
  assert.equal(PROSPECT_KINDS.find(k => k.key === 'casino').on, true);
  assert.ok(OVERPASS_ENDPOINTS.length >= 3);
  assert.ok(PROSPECT_AREAS.every(a => a.state === 'NV'));
});

test('overpassResponseIssue catches a timed-out HTTP-200 response and malformed bodies', () => {
  assert.match(overpassResponseIssue({ remark: 'runtime error: Query timed out in "query" at line 1 after 31 seconds.', elements: [] }), /timed out/);
  assert.ok(overpassResponseIssue({ remark: 'runtime error: Query run out of memory using about 2048 MB of RAM.', elements: [] }));
  assert.ok(overpassResponseIssue(null));
  assert.ok(overpassResponseIssue({ foo: 1 }));
  assert.equal(overpassResponseIssue({ elements: [] }), null, 'a genuinely empty area is not an error');
  assert.equal(overpassResponseIssue({ elements: [{}], remark: 'some harmless note' }), null);
});

test('prospectsTruncated flags a response that hit the cap', () => {
  assert.equal(prospectsTruncated({ elements: new Array(PROSPECT_RESULT_CAP).fill({}) }), true);
  assert.equal(prospectsTruncated({ elements: new Array(10).fill({}) }), false);
  assert.equal(prospectsTruncated(null), false);
});

test('distanceMi is a sane haversine and null-safe', () => {
  const d = distanceMi(36.1620, -115.1470, 36.1447, -115.1728); // Downtown → Strip
  assert.ok(d > 1.5 && d < 2.5, `got ${d}`);
  assert.equal(distanceMi(36, -115, 36, -115), 0);
  assert.equal(distanceMi(undefined, -115, 36, -115), null);
});

test('opensLate reads OSM opening_hours', () => {
  assert.equal(opensLate('Mo-Su 16:00-02:00'), true, 'past midnight');
  assert.equal(opensLate('Fr-Sa 17:00-23:30; Su-Th 17:00-21:00'), true);
  assert.equal(opensLate('24/7'), true);
  assert.equal(opensLate('Mo-Fr 07:00-15:00'), false);
  assert.equal(opensLate(''), false);
  assert.equal(opensLate(undefined), false);
});

test('a chain that tags live music is kept (ranked lower); a plain chain is zeroed', () => {
  const live = scoreProspect({ amenity: 'restaurant', name: 'Smokehouse BBQ', brand: 'Smokehouse', live_music: 'yes', cuisine: 'barbecue', phone: 'x' });
  assert.ok(live.score > 0, 'kept');
  assert.ok(live.signals.some(s => /chain location/.test(s)));
  const plainLive = scoreProspect({ amenity: 'restaurant', name: 'Smokehouse BBQ', live_music: 'yes', cuisine: 'barbecue', phone: 'x' });
  assert.ok(live.score < plainLive.score, 'brand still costs points');
  const chain = scoreProspect({ amenity: 'bar', name: "Franchise Tavern", brand: 'Franchise', phone: 'x' });
  assert.equal(chain.score, 0);
  assert.match(chain.signals[0], /chain/);
});

test('takeout counters are zeroed and "grill"/"social" no longer read as bar rooms', () => {
  assert.equal(scoreProspect({ amenity: 'restaurant', name: 'Teriyaki Grill', takeaway: 'only' }).score, 0);
  assert.equal(scoreProspect({ amenity: 'restaurant', name: 'Burger Hut', drive_through: 'yes' }).score, 0);
  assert.equal(scoreProspect({ amenity: 'fast_food', name: 'Taco Spot' }).score, 0);
  const grill = scoreProspect({ amenity: 'restaurant', name: 'Main Street Grill' });
  assert.ok(!grill.signals.some(s => /name/.test(s)), 'plain "grill" earns no name signal');
  const social = scoreProspect({ amenity: 'cafe', name: 'Social Coffee' });
  assert.ok(!social.signals.some(s => /name|lounge/.test(s)));
  const bng = scoreProspect({ amenity: 'restaurant', name: "Sully's Bar & Grill" });
  assert.ok(bng.signals.some(s => /bar-room/.test(s)), '"bar & grill" still counts');
});

test('dual-format scoring: patio wine bar → duo; late big casino lounge → band', () => {
  const wine = scoreProspect({ amenity: 'bar', name: 'Grape Street Wine Bar', outdoor_seating: 'yes', website: 'x' });
  assert.equal(wine.format, 'duo');
  assert.ok(wine.fit.soloDuo > wine.fit.band);
  const casino = scoreProspect({ amenity: 'casino', name: 'Desert Rose Casino', opening_hours: '24/7', capacity: '300', live_music: 'yes' });
  assert.equal(casino.format, 'band');
  assert.ok(casino.fit.band > casino.fit.soloDuo);
  assert.equal(casino.score, Math.max(casino.fit.soloDuo, casino.fit.band));
  for (const r of [wine, casino]) {
    assert.ok(r.score >= 0 && r.score <= 10);
    assert.ok(r.fit.soloDuo >= 0 && r.fit.soloDuo <= 10 && r.fit.band >= 0 && r.fit.band <= 10);
  }
});

test('overpassToProspects keeps coords (node or way centre), distance, state, and flags a guessed city', () => {
  const json = { elements: [
    { type: 'node', id: 1, lat: 36.1700, lon: -115.1400, tags: { amenity: 'bar', name: 'Dive One' } },
    { type: 'way', id: 2, center: { lat: 36.1500, lon: -115.1500 }, tags: { amenity: 'pub', name: 'The Tavern', 'addr:city': 'Las Vegas', 'addr:street': 'Fremont St', 'addr:housenumber': '100' } },
    { type: 'node', id: 3, lat: 36.1, lon: -115.1, tags: { amenity: 'bar' } }, // unnamed → dropped
  ] };
  const rows = overpassToProspects(json, downtown);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.equal(a.lat, 36.17); assert.equal(a.lon, -115.14);
  assert.equal(b.lat, 36.15);
  assert.ok(typeof a.distanceMi === 'number' && a.distanceMi < 2);
  assert.equal(a.state, 'NV');
  assert.equal(a.cityGuessed, true);
  assert.equal(b.cityGuessed, false);
  assert.equal(b.addr, '100 Fremont St, Las Vegas');
  // The old (json, cityString) signature still works.
  const legacy = overpassToProspects(json, 'Henderson');
  assert.equal(legacy[0].city, 'Henderson');
  assert.equal(legacy[0].distanceMi, null);
});

test('prospectToVenue carries the best-fit act, so the tagged EPK link opens the right page', () => {
  const [duoRow] = overpassToProspects({ elements: [
    { type: 'node', id: 9, lat: 36.16, lon: -115.15, tags: { amenity: 'bar', name: 'Patio Wine Bar', outdoor_seating: 'yes' } },
  ] }, downtown);
  const v = prospectToVenue(duoRow);
  assert.equal(v.preferredFormat, 'duo');
  assert.equal(v.state, 'NV');
  assert.equal(v.lat, 36.16);
  assert.equal(v.status, 'prospect');
  assert.match(v.notes, /Best fit: solo\/duo/);
  assert.match(v.notes, /city inferred/);
  const link = epkLinkForVenue('https://example.com/epk/', { ...v, trackingToken: 'abc123' });
  assert.equal(link, 'https://example.com/epk/?act=duo&track=abc123');
});

test('outreach footer: added to cold outreach, skipped for transactional templates, idempotent', () => {
  assert.equal(outreachNeedsFooter('outreach'), true);
  assert.equal(outreachNeedsFooter('followup'), true);
  assert.equal(outreachNeedsFooter('callRequest'), false);
  assert.equal(outreachNeedsFooter('bookingConfirmation'), false);

  const out = appendOutreachFooter('Hi there,\n\nBest,\nBand\n\n', 'outreach', 'P.O. Box 1, Las Vegas, NV 89101');
  assert.match(out, /Band\n\n—\nNot booking live music.*"no thanks".*\nP\.O\. Box 1, Las Vegas, NV 89101$/s);
  assert.equal(appendOutreachFooter(out, 'outreach', 'P.O. Box 1'), out, 'second pass is a no-op');
  assert.equal(appendOutreachFooter('Hi', 'bookingConfirmation', 'X'), 'Hi');
  assert.equal(appendOutreachFooter('Reply STOP to opt out.', 'followup', 'X'), 'Reply STOP to opt out.', 'user wording respected');
  const noAddr = appendOutreachFooter('Hi', 'followup', '  ');
  assert.match(noAddr, /"no thanks".*follow up\.$/);
  assert.match(appendOutreachFooter('Hi', 'outreach', 'Line 1\n Line 2'), /Line 1, Line 2$/, 'multi-line address flattened');
});
