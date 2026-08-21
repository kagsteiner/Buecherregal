import assert from 'node:assert/strict';
import test from 'node:test';
import { unarchiveKeyedPlist } from '../src/kindle/bplist.js';

test('unarchives NSKeyedArchiver dictionaries and arrays', () => {
  const archive = {
    $archiver: 'NSKeyedArchiver',
    $top: { root: { UID: 1 } },
    $objects: [
      '$null',
      { 'NS.keys': [{ UID: 2 }], 'NS.objects': [{ UID: 3 }], $class: { UID: 8 } },
      'authors',
      { 'NS.objects': [{ UID: 4 }, { UID: 6 }], $class: { UID: 9 } },
      { 'NS.keys': [{ UID: 5 }], 'NS.objects': ['Ada Lovelace'], $class: { UID: 8 } },
      'author',
      { 'NS.keys': [{ UID: 5 }], 'NS.objects': ['Alan Turing'], $class: { UID: 8 } },
      'unused',
      { $classname: 'NSDictionary' },
      { $classname: 'NSArray' },
    ],
  };

  assert.deepEqual(unarchiveKeyedPlist(archive), {
    authors: [{ author: 'Ada Lovelace' }, { author: 'Alan Turing' }],
  });
});
