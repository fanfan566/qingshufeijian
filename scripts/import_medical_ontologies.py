#!/usr/bin/env python3
"""Build an offline, attributed term catalog from pinned upstream OBO releases.

Run: python scripts/import_medical_ontologies.py --download
Or:  python scripts/import_medical_ontologies.py --source-dir /path/to/downloads
The latter expects hp, mondo and hp-zh.tsv. No third-party Python packages needed.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import tempfile
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUTS = {
    'hp': 'https://raw.githubusercontent.com/obophenotype/human-phenotype-ontology/920d4eb3608b50a2c19ddb10290224ab35a759c5/hp.obo',
    'mondo': 'https://github.com/monarch-initiative/mondo/releases/download/v2026-10-06/mondo.obo',
    'hp-zh.tsv': 'https://raw.githubusercontent.com/obophenotype/hpo-translations/cd44f61b40f7728ea1b6a09e74d9fbca1187f17f/babelon/hp-zh.babelon.tsv',
}
INPUT_SHA256 = {
    'hp': '93dace952fcb3ec4728818857f6ba76bc2d5312f4d83266519b8694b8e798f22',
    'mondo': '2631e8e165d41def1a46749adb1ce0a336c8aba7f6bc0978729592cee8fed60b',
    'hp-zh.tsv': '64a30d5f065e1180fa6a30c192dd84aa403cd1b44f2b24ee883fcde948b1ca53',
}
SOURCES = {
    'hpo': {'name': 'Human Phenotype Ontology (HPO)', 'version': '2026-09-01',
            'url': 'https://github.com/obophenotype/human-phenotype-ontology',
            'license': 'HPO License', 'licenseUrl': 'https://hpo.jax.org/app/license',
            'translation': 'HPO Chinese Language Working Group / Chinese HPO consortium',
            'translationUrl': 'https://github.com/obophenotype/hpo-translations/blob/cd44f61b40f7728ea1b6a09e74d9fbca1187f17f/docs/translations/zh.md'},
    'mondo': {'name': 'Mondo Disease Ontology', 'version': '2026-10-06',
              'url': 'https://github.com/monarch-initiative/mondo',
              'license': 'CC BY 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/'},
}


def unquote(value):
    try:
        return json.loads('"' + value + '"')
    except ValueError:
        return re.sub(r'\\(.)', r'\1', value)


def parse_obo(text):
    terms = {}
    for kind, body in re.findall(r'^\[(\w+)\]\n(.*?)(?=^\[\w+\]|\Z)', text, re.M | re.S):
        if kind != 'Term' or re.search(r'^is_obsolete: true$', body, re.M):
            continue
        fields = defaultdict(list)
        for line in body.splitlines():
            if ': ' in line:
                key, value = line.split(': ', 1)
                fields[key].append(value)
        if not fields['id'] or not fields['name']:
            continue
        definition = re.match(r'"((?:\\.|[^"\\])*)"\s*(.*)', next(iter(fields['def']), ''))
        synonyms = []
        for value in fields['synonym']:
            match = re.match(r'"((?:\\.|[^"\\])*)"\s+(EXACT|NARROW)\b', value)
            if match:
                synonyms.append(unquote(match[1]))
        terms[fields['id'][0]] = {
            'name': fields['name'][0], 'definition': unquote(definition[1]) if definition else '',
            'definitionSources': definition[2] if definition else '',
            'aliases': sorted(set(synonyms)), 'parents': [value.split()[0] for value in fields['is_a']],
            'xrefs': sorted(set(value.split()[0] for value in fields['xref'])),
        }
    return terms


def descendants(terms, root):
    children = defaultdict(list)
    for code, term in terms.items():
        for parent in term['parents']:
            children[parent].append(code)
    result, queue = {root}, deque([root])
    while queue:
        for code in children[queue.popleft()]:
            if code not in result:
                result.add(code)
                queue.append(code)
    return result


def build(source_dir):
    blobs = {key: (source_dir / key).read_bytes() for key in INPUTS}
    for key, value in blobs.items():
        if hashlib.sha256(value).hexdigest() != INPUT_SHA256[key]:
            raise ValueError(f'Source checksum mismatch: {key}; do not use an altered or incomplete download')
    translations = {row['subject_id']: row for row in csv.DictReader(io.StringIO(blobs['hp-zh.tsv'].decode('utf-8-sig')), delimiter='\t')
                    if row['predicate_id'] == 'rdfs:label' and row['translation_status'] == 'OFFICIAL'}
    records = []
    # Avoid broad anatomical words such as "thoracic" (also vertebrae) or
    # "alveolar" (also dental structures), and non-respiratory pneumocephalus.
    respiratory_pattern = re.compile(r'\b(lung|pulmonary|bronch\w*|respirat\w*|trache\w*|pleur\w*|pneumon\w*|pneumothorax|pneumomediastinum|pneumoconio\w*)\b', re.I)
    for key, prefix, category, root in [('hp', 'HP:', '症状与体征', 'HP:0002086'), ('mondo', 'MONDO:', '疾病术语', 'MONDO:0005087')]:
        terms = parse_obo(blobs[key].decode())
        respiratory = descendants(terms, root)
        phenotypes = descendants(terms, 'HP:0000118') if key == 'hp' else None
        nonhuman = descendants(terms, 'MONDO:0005583') if key == 'mondo' else set()
        version = re.search(r'^data-version: (.+)$', blobs[key].decode()[:2000], re.M)[1]
        if SOURCES['hpo' if key == 'hp' else key]['version'] not in version:
            raise ValueError(f'Unexpected upstream version: {version}')
        for code, term in sorted(terms.items()):
            # Only source-owned, active terms with real definitions. Imported IDs,
            # obsolete concepts and bare labels are never used to pad the count.
            if not code.startswith(prefix) or not term['definition'] or code in nonhuman or (phenotypes is not None and code not in phenotypes):
                continue
            name = term['name']
            translation = translations.get(code)
            if translation and translation['translation_value'].strip() and translation['source_value'].casefold() == name.casefold():
                name = translation['translation_value']
            records.append({
                'code': code, 'name': name, 'englishName': term['name'], 'category': category,
                'aliases': sorted(set(term['aliases'] + ([term['name']] if name != term['name'] else []))),
                'definition': term['definition'], 'definitionSources': term['definitionSources'],
                'source': 'hpo' if key == 'hp' else 'mondo',
                'respiratory': code in respiratory or bool(respiratory_pattern.search(term['name'])),
                'parents': term['parents'], 'xrefs': term['xrefs'],
            })
    if len(records) < 30000 or len({entry['code'] for entry in records}) != len(records):
        raise ValueError('Catalog validation failed: insufficient or duplicate records')
    manifest = {
        'formatVersion': 1, 'sources': SOURCES,
        'inputs': {key: {'url': INPUTS[key], 'sha256': hashlib.sha256(value).hexdigest()} for key, value in blobs.items()},
        'importedCount': len(records), 'chineseLabelCount': sum(bool(re.search(r'[\u4e00-\u9fff]', entry['name'])) for entry in records),
        'respiratoryCount': sum(entry['respiratory'] for entry in records),
        'categoryCounts': {category: sum(entry['category'] == category for entry in records) for category in ['症状与体征', '疾病术语']},
    }
    payload = json.dumps({'metadata': manifest, 'entries': records}, ensure_ascii=False, separators=(',', ':')).encode()
    destination = ROOT / 'data/knowledge'
    destination.mkdir(parents=True, exist_ok=True)
    temporary = destination / 'catalog.json.gz.tmp'
    temporary.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    temporary.replace(destination / 'catalog.json.gz')
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: manifest[key] for key in ['importedCount', 'chineseLabelCount', 'respiratoryCount', 'categoryCounts']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--download', action='store_true')
    group.add_argument('--source-dir', type=Path)
    args = parser.parse_args()
    if args.download:
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            for key, url in INPUTS.items():
                with urllib.request.urlopen(url, timeout=120) as response:
                    (directory / key).write_bytes(response.read())
            build(directory)
    else:
        build(args.source_dir)
