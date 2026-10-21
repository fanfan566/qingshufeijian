import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

export const KNOWLEDGE_CATEGORIES = ['肺部解剖', '肺结节亚型', '影像征象', '肺部病变', '症状与体征', '疾病术语'];
const normalize = value => value.normalize('NFKC').trim().toLocaleLowerCase();
const hasChinese = value => /[\u4e00-\u9fff]/.test(value);

export function createKnowledgeCatalog(core, imported, metadata) {
  const entries = [
    ...core.map(entry => ({ ...entry, kind: 'core', respiratory: true })),
    ...imported.map(entry => ({ ...entry, kind: 'ontology', brief: entry.definition })),
  ];
  const byCode = new Map(entries.map(entry => [entry.code, entry]));
  if (byCode.size !== entries.length) throw new Error('Duplicate knowledge codes');
  const collator = new Intl.Collator('zh-CN', { numeric: true });
  const nameOrder = [...entries].sort((a, b) => collator.compare(a.name, b.name) || a.code.localeCompare(b.code));
  const nameRank = new Map(nameOrder.map((entry, index) => [entry.code, index]));
  const indices = entries.map(entry => ({
    entry, name: normalize(entry.name), english: normalize(entry.englishName || ''),
    aliases: entry.aliases.map(normalize),
    text: normalize([entry.code, entry.name, entry.englishName, entry.brief, entry.feature, ...entry.aliases, ...(entry.xrefs || [])].filter(Boolean).join(' ')),
    priority: (entry.kind === 'core' ? 100 : 0) + (entry.respiratory ? 20 : 0) + (hasChinese(entry.name) ? 5 : 0),
  }));
  const categoryCounts = KNOWLEDGE_CATEGORIES.map(name => ({
    name, count: entries.filter(entry => entry.category === name).length,
    respiratoryCount: entries.filter(entry => entry.category === name && entry.respiratory).length,
  }));
  const info = {
    total: entries.length, coreTotal: core.length,
    respiratoryTotal: entries.filter(entry => entry.respiratory).length,
    chineseTotal: entries.filter(entry => hasChinese(entry.name)).length,
    categories: categoryCounts, sources: metadata.sources,
  };
  function search({ q = '', category = '全部', scope = 'all', sort = 'relevance', page = 1, pageSize = 24 } = {}) {
    const query = normalize(q).replace(/\b(hp|mondo)_(\d+)\b/g, '$1:$2');
    const tokens = query.split(/\s+/).filter(Boolean);
    const found = [];
    for (const item of indices) {
      const entry = item.entry;
      if (category !== '全部' && entry.category !== category) continue;
      if (scope === 'respiratory' && !entry.respiratory) continue;
      if (!tokens.every(token => item.text.includes(token))) continue;
      let score = item.priority;
      if (query) {
        score += normalize(entry.code) === query ? 1000 : item.name === query || item.english === query ? 900 :
          item.aliases.includes(query) ? 800 : item.name.startsWith(query) || item.english.startsWith(query) ? 700 :
            item.name.includes(query) || item.english.includes(query) ? 600 : 100;
      }
      found.push({ entry, score });
    }
    found.sort((a, b) => (sort === 'name' ? 0 : b.score - a.score) || nameRank.get(a.entry.code) - nameRank.get(b.entry.code));
    const pages = Math.max(1, Math.ceil(found.length / pageSize));
    page = Math.min(page, pages);
    const items = found.slice((page - 1) * pageSize, page * pageSize).map(({ entry }) => ({
      code: entry.code, name: entry.name, englishName: entry.englishName, category: entry.category,
      brief: entry.brief.length > 240 ? entry.brief.slice(0, 240) + '…' : entry.brief,
      kind: entry.kind, respiratory: entry.respiratory, source: entry.source,
    }));
    return { items, total: found.length, page, pageSize, pages };
  }
  function detail(code) {
    const entry = byCode.get(code);
    if (!entry) return null;
    if (entry.kind === 'core') return entry;
    const sourceInfo = metadata.sources[entry.source];
    return {
      ...entry, sourceInfo,
      parents: (entry.parents || []).map(code => ({ code, name: byCode.get(code)?.name || code })),
      references: [
        { title: sourceInfo.name + ' · ' + sourceInfo.version, url: sourceInfo.url },
        { title: '查看原始词条 ' + entry.code, url: 'https://purl.obolibrary.org/obo/' + entry.code.replace(':', '_') },
        ...(sourceInfo.translationUrl && hasChinese(entry.name) ? [{ title: sourceInfo.translation, url: sourceInfo.translationUrl }] : []),
      ],
    };
  }
  return { search, detail, metadata: info };
}

let cached;
export function loadKnowledgeCatalog() {
  if (!cached) {
    const core = JSON.parse(fs.readFileSync(new URL('../src/data/medicalKnowledgeCore.json', import.meta.url), 'utf8'));
    const data = JSON.parse(gunzipSync(fs.readFileSync(new URL('../data/knowledge/catalog.json.gz', import.meta.url))).toString('utf8'));
    if (data.metadata.formatVersion !== 1 || data.entries.length !== data.metadata.importedCount) throw new Error('Invalid knowledge catalog');
    cached = createKnowledgeCatalog(core, data.entries, data.metadata);
  }
  return cached;
}
