'use strict';
/*
 * Audit §12 #3 — backup/restore must not silently drop charts or destroy data it can't
 * replace. These lock the pure pieces the App's exportBackup / importBackup are built on:
 * referenced-attachment discovery, restore planning, and the all-or-nothing store swap.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');
const { backupReferencedAttachmentIds, planBackupRestore, replaceStoresAtomically } = algorithm;

const songsWith = (...ids) => JSON.stringify(ids.map((id, i) => ({ id: 'S' + i, title: 'T' + i, attachments: [{ id, name: id + '.pdf', mime: 'application/pdf' }] })));

test('backupReferencedAttachmentIds finds charts in songs, saved gigs and snapshots', () => {
  const stores = {
    setlist_band_songs_v3_a: songsWith('att1', 'att2'),
    setlist_band_gigs_v3_a: JSON.stringify([{ id: 'g', setlists: [{ songs: [{ id: 'x', attachments: [{ id: 'att3' }] }] }] }]),
    setlist_band_snapshots_v3_a: JSON.stringify([{ songs: [{ attachments: [{ id: 'att1' }] }] }]),
    setlist_bands_v3: JSON.stringify([{ id: 'a', name: 'Band' }]),
    setlist_broken: '{not json',
  };
  assert.deepEqual(backupReferencedAttachmentIds(stores).sort(), ['att1', 'att2', 'att3']);
  assert.deepEqual(backupReferencedAttachmentIds({}), []);
  assert.deepEqual(backupReferencedAttachmentIds(null), []);
});

test('planBackupRestore rejects non-backups and damaged stores', () => {
  assert.equal(planBackupRestore(null).ok, false);
  assert.equal(planBackupRestore({ kind: 'other', stores: {} }).ok, false);
  assert.equal(planBackupRestore({ kind: 'full-backup', stores: [] }).ok, false);
  assert.equal(planBackupRestore({ kind: 'full-backup', stores: { foo: '1' } }).ok, false);   // no setlist_ data
  const bad = planBackupRestore({ kind: 'full-backup', stores: { setlist_a: { nested: true } } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /damaged/);
});

test('planBackupRestore reports charts the backup references but does not carry', () => {
  const plan = planBackupRestore({
    kind: 'full-backup',
    stores: { setlist_band_songs_v3_a: songsWith('att1', 'att2') },
    attachments: { att1: { mime: 'application/pdf', b64: 'JVBERg==' }, junk: { mime: 'x' } },
    annotations: { 'att1:1': { strokes: [] } },
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.attIds, ['att1']);           // the entry without b64 is ignored
  assert.deepEqual(plan.missing, ['att2']);
  assert.deepEqual(plan.annotationKeys, ['att1:1']);
  // Old backups (no attachments / annotations keys) still plan cleanly.
  const old = planBackupRestore({ kind: 'full-backup', stores: { setlist_bands_v3: '[]' } });
  assert.equal(old.ok, true);
  assert.deepEqual(old.attIds, []);
  assert.deepEqual(old.missing, []);
});

// A Storage double with an optional byte quota, like localStorage.
function fakeStorage(init, quota = Infinity) {
  const m = new Map(Object.entries(init));
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const before = m.get(k);
      m.set(k, String(v));
      if (used() > quota) { if (before === undefined) m.delete(k); else m.set(k, before); const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

test('replaceStoresAtomically swaps setlist_ stores and leaves other keys alone', () => {
  const st = fakeStorage({ setlist_a: 'old', setlist_b: 'gone', other_key: 'keep' });
  const r = replaceStoresAtomically(st, { setlist_a: 'new', setlist_c: 'added', not_ours: 'ignored' });
  assert.equal(r.ok, true);
  assert.deepEqual(st.dump(), { other_key: 'keep', setlist_a: 'new', setlist_c: 'added' });
});

test('replaceStoresAtomically rolls back to the exact previous data on a quota failure', () => {
  const before = { setlist_a: 'x'.repeat(40), setlist_b: 'y'.repeat(40), other: 'z' };
  const st = fakeStorage(before, 150);
  const r = replaceStoresAtomically(st, { setlist_a: 'n'.repeat(60), setlist_big: 'q'.repeat(100) });
  assert.equal(r.ok, false);
  assert.equal(r.error.name, 'QuotaExceededError');
  assert.notEqual(r.rollbackFailed, true);
  assert.deepEqual(st.dump(), before);
});
