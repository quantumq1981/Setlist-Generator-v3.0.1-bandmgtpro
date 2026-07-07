'use strict';
const algorithm = require('./extract-algorithm.js');

// Build a library of N distinct songs. Defaults make every song a 4-minute
// "rock" number in C so tests can isolate the behavior under test; pass a
// per-index override function to vary style/key/duration/energy.
function makeLibrary(n, override) {
  const songs = [];
  for (let i = 0; i < n; i++) {
    const base = {
      id: 'S' + i,
      title: 'Song ' + i,
      artist: 'Artist ' + (i % 4),
      duration: 4,
      style: 'rock',
      key: 'C',
      bpm: '120',
    };
    songs.push(override ? { ...base, ...override(i, base) } : base);
  }
  return songs;
}

const flatIds = (sets) => sets.flatMap((s) => s.songs.map((x) => x.id));
const hasDuplicate = (ids) => new Set(ids).size !== ids.length;
const setOfSong = (sets, id) => sets.findIndex((s) => s.songs.some((x) => x.id === id));
const lastId = (set) => set.songs[set.songs.length - 1].id;

// Run `fn` over `trials` iterations; returns true only if every iteration returns
// truthy. Used to make assertions about randomized generation robust.
function everyTrial(trials, fn) {
  for (let t = 0; t < trials; t++) if (!fn(t)) return false;
  return true;
}

module.exports = { algorithm, makeLibrary, flatIds, hasDuplicate, setOfSong, lastId, everyTrial };
