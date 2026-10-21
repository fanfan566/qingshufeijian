"""Regression checks for upstream parsing and source-integrity failures."""
import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
importer = runpy.run_path(str(ROOT / 'scripts/import_medical_ontologies.py'))


class OntologyImportTest(unittest.TestCase):
    def test_obsolete_terms_and_related_synonyms_do_not_become_active_records(self):
        text = r'''format-version: 1.2

[Term]
id: HP:1
name: Clinical example
def: "A definition with \"quoted\" text." [TEST:1]
synonym: "Exact name" EXACT []
synonym: "Broadly related idea" RELATED []
is_a: HP:0 ! Root

[Term]
id: HP:2
name: Deprecated example
is_obsolete: true

[Typedef]
id: has_part
name: has part
'''
        terms = importer['parse_obo'](text)
        self.assertEqual(set(terms), {'HP:1'})
        self.assertEqual(terms['HP:1']['definition'], 'A definition with "quoted" text.')
        self.assertEqual(terms['HP:1']['aliases'], ['Exact name'])
        self.assertEqual(terms['HP:1']['definitionSources'], '[TEST:1]')

    def test_topic_traversal_is_transitive_and_terminates_on_a_cycle(self):
        terms = {'A': {'parents': ['C']}, 'B': {'parents': ['A']}, 'C': {'parents': ['B']}, 'X': {'parents': []}}
        self.assertEqual(importer['descendants'](terms, 'A'), {'A', 'B', 'C'})

    def test_corrupt_sources_fail_before_replacing_the_shipped_snapshot(self):
        snapshot = ROOT / 'data/knowledge/catalog.json.gz'
        before = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            for name in importer['INPUTS']:
                (Path(directory) / name).write_text('incomplete or modified upstream download')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                importer['build'](Path(directory))
        self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), before)


if __name__ == '__main__':
    unittest.main()
