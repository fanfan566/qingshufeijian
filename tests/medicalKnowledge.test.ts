import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_KNOWLEDGE_CATEGORIES, medicalKnowledge, searchKnowledge, matchKnowledge } from '../src/data/medicalKnowledge';

test('all four categories have complete sourced entries with unique stable codes', () => {
  assert.equal(new Set(medicalKnowledge.map(entry => entry.code)).size, medicalKnowledge.length);
  for (const category of CORE_KNOWLEDGE_CATEGORIES) assert.ok(medicalKnowledge.some(entry => entry.category === category));
  for (const entry of medicalKnowledge) {
    for (const field of ['name', 'brief', 'feature', 'risk', 'follow', 'differential'] as const) assert.ok(entry[field].trim(), `${entry.code}.${field}`);
    assert.ok(entry.references.length);
    for (const source of entry.references) assert.equal(new URL(source.url).protocol, 'https:');
  }
});

test('search supports Chinese partial text, aliases, codes, case, whitespace and category intersection', () => {
  assert.ok(searchKnowledge('磨玻璃').some(entry => entry.code === 'NODULE_GGO'));
  assert.deepEqual(searchKnowledge('  PgGn  ').map(entry => entry.code), ['NODULE_GGO']);
  assert.deepEqual(searchKnowledge('nodule_ggo').map(entry => entry.code), ['NODULE_GGO']);
  assert.equal(searchKnowledge('磨玻璃', '肺部解剖').length, 0);
  assert.ok(searchKnowledge('磨玻璃', '肺结节亚型').length > 0);
  assert.equal(searchKnowledge('不存在的影像术语').length, 0);
  assert.equal(searchKnowledge('   ').length, medicalKnowledge.length);
});

test('result linking preserves each lesion identity, matches signs and deduplicates entries', () => {
  const result = matchKnowledge([
    { id: '结节 #1', label_code: 'NODULE_GGO', signs: ['SPICULATION', 'SPICULATION', '胸膜牵拉'] },
    { id: '结节 #2', type: 'solid' },
    { id: '病变 #1', name: '肺纤维化' },
  ]);
  assert.equal(result[0].finding.id, '结节 #1');
  assert.deepEqual(result[0].entries.map(entry => entry.code), ['NODULE_GGO', 'SPICULATION', 'PLEURAL_TRACTION']);
  assert.deepEqual(result[1].entries.map(entry => entry.code), ['NODULE_SOLID']);
  assert.deepEqual(result[2].entries.map(entry => entry.code), ['FIBROSIS']);
});

test('explicit codes override legacy types; unknown labels and negated names never invent a diagnosis', () => {
  assert.deepEqual(matchKnowledge([{ id: '1', label_code: 'NODULE_GGO', type: 'solid', name: '肺炎' }])[0].entries.map(entry => entry.code), ['NODULE_GGO']);
  assert.equal(matchKnowledge([{ id: '2', label_code: 'UNKNOWN', type: 'solid', name: '肺炎' }])[0].entries.length, 0);
  assert.equal(matchKnowledge([{ id: '3', name: '未见肺纤维化' }])[0].entries.length, 0);
  assert.deepEqual(matchKnowledge([]), []);
});

test('subsolid is mapped to its umbrella category rather than asserting a solid component', () => {
  assert.deepEqual(matchKnowledge([{ id: '1', type: 'subsolid' }])[0].entries.map(entry => entry.code), ['NODULE_SUBSOLID']);
});
