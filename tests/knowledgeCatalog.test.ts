import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import { loadKnowledgeCatalog } from '../server/knowledgeCatalog.js';
import { createKnowledgeRouter } from '../server/routes/knowledge.js';
import { KNOWLEDGE_CATEGORIES } from '../src/data/medicalKnowledge';
import { categoryStyles } from '../src/data/knowledgeCategories';

const catalog = loadKnowledgeCatalog();

test('every imported record has a unique source-owned code and a nonempty original definition', () => {
  const data = JSON.parse(gunzipSync(readFileSync(new URL('../data/knowledge/catalog.json.gz', import.meta.url))).toString('utf8'));
  assert.equal(data.entries.length, data.metadata.importedCount);
  assert.equal(new Set(data.entries.map(entry => entry.code)).size, data.entries.length);
  for (const entry of data.entries) {
    assert.ok(entry.name.trim() && entry.definition.trim());
    assert.ok(entry.source === 'hpo' ? entry.code.startsWith('HP:') : entry.code.startsWith('MONDO:'));
    assert.equal(new Set(entry.aliases).size, entry.aliases.length);
  }
});

test('shipped catalog contains tens of thousands of defined terms, official Chinese labels and respiratory records', () => {
  assert.ok(catalog.metadata.total > 30000);
  assert.equal(catalog.metadata.coreTotal, 14);
  assert.ok(catalog.metadata.chineseTotal > 15000);
  assert.ok(catalog.metadata.respiratoryTotal > 1200);
  assert.equal(catalog.metadata.categories.reduce((sum, category) => sum + category.count, 0), catalog.metadata.total);
  for (const category of KNOWLEDGE_CATEGORIES) assert.ok(catalog.metadata.categories.some(item => item.name === category));
});

test('all category colors are distinct and contain visible text labels in the registry', () => {
  assert.equal(new Set(KNOWLEDGE_CATEGORIES.map(category => categoryStyles[category].dot)).size, KNOWLEDGE_CATEGORIES.length);
  assert.ok(KNOWLEDGE_CATEGORIES.every(category => categoryStyles[category].badge && categoryStyles[category].active));
});

test('Chinese, English, aliases and normalized IDs retrieve real definitions', () => {
  for (const q of ['哮喘', 'asthma', 'HP:0002099', 'hp_0002099']) {
    assert.ok(catalog.search({ q }).items.some(entry => entry.code === 'HP:0002099'), q);
  }
  const asthma = catalog.detail('HP:0002099');
  assert.equal(asthma.name, '哮喘');
  assert.equal(asthma.englishName, 'Asthma');
  assert.ok(asthma.definition.length > 30);
  assert.equal(asthma.sourceInfo.name, 'Human Phenotype Ontology (HPO)');
  assert.ok(asthma.references.some(reference => reference.title.includes('Chinese HPO')));
  assert.ok(asthma.parents.length > 0);
  assert.equal(asthma.follow, undefined, 'no invented follow-up advice for ontology terms');
  assert.equal(catalog.detail('HP:9999999'), null);
  assert.equal(catalog.detail('MONDO:0005583'), null, 'exclude non-human animal diseases');
  assert.equal(catalog.detail('MONDO:1013264'), null, 'exclude animal-only respiratory diseases');
  assert.equal(catalog.detail('HP:0030306')?.respiratory, false, 'thoracic vertebral counts must not be classified as lung knowledge by a broad keyword');
});

test('filters and pagination work across the actual large catalog without duplicate records or inflated synonym counts', () => {
  const first = catalog.search({ page: 1 });
  const second = catalog.search({ page: 2 });
  assert.equal(first.items.length, 24);
  assert.equal(first.total, catalog.metadata.total);
  assert.equal(new Set([...first.items, ...second.items].map(entry => entry.code)).size, 48);
  const category = catalog.search({ category: '症状与体征', scope: 'respiratory', pageSize: 100 });
  assert.ok(category.total < catalog.metadata.respiratoryTotal);
  assert.ok(category.items.every(entry => entry.category === '症状与体征' && entry.respiratory));
  assert.equal(catalog.search({ q: '不存在的词条xyz987' }).total, 0);
  const last = catalog.search({ page: 999999 });
  assert.equal(last.page, last.pages);
  assert.equal(last.items.length, first.total % 24 || 24);
  const sorted = catalog.search({ sort: 'name', pageSize: 12 });
  const compare = new Intl.Collator('zh-CN', { numeric: true }).compare;
  assert.ok(sorted.items.every((entry, index) => index === 0 || compare(sorted.items[index - 1].name, entry.name) <= 0));
});

test('representative warm searches complete within one second on the large shipped dataset', () => {
  for (const q of ['肺', 'pulmonary fibrosis', 'HP:0002099', '不存在的医学名称']) {
    const started = performance.now();
    catalog.search({ q, scope: 'all' });
    assert.ok(performance.now() - started < 1000, q);
  }
});

test('HTTP API returns bounded pages, full source details, validation errors and recoverable service failures', async () => {
  const app = express();
  app.use('/api/knowledge', createKnowledgeRouter(() => catalog));
  app.use('/unavailable', createKnowledgeRouter(() => { throw new Error('test catalog unavailable'); }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/api/knowledge?q=asthma&pageSize=12');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.items.length <= 12 && result.total > 0);
    assert.equal(result.items[0].definition, undefined, 'full definitions load only on demand');
    const detail = await fetch(base + '/api/knowledge/HP%3A0002099');
    assert.ok((await detail.json()).definition);
    assert.equal((await fetch(base + '/api/knowledge/metadata')).status, 200);
    assert.equal((await fetch(base + '/api/knowledge/UNKNOWN')).status, 404);
    for (const query of ['page=0', 'page=1.1', 'page=Infinity', 'pageSize=10000', 'category=unknown', 'scope=invalid', 'q[]=x', 'q=' + 'a'.repeat(257)]) {
      assert.equal((await fetch(base + '/api/knowledge?' + query)).status, 400, query);
    }
    assert.equal((await fetch(base + '/unavailable/metadata')).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
