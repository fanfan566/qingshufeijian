# Medical ontology data attribution

The compressed catalog contains selected, transformed records from these upstream sources:

1. **Human Phenotype Ontology (HPO)**, Human Phenotype Ontology Consortium, release **2026-09-01**.
   - Source: https://github.com/obophenotype/human-phenotype-ontology
   - HPO licensing and citation terms: https://hpo.jax.org/app/license
   - Original upstream license notice: https://github.com/obophenotype/human-phenotype-ontology/blob/920d4eb3608b50a2c19ddb10290224ab35a759c5/LICENSE.md
   - Definitions retain their original provenance identifiers in `definitionSources`.
2. **HPO Chinese translation**, HPO Chinese Language Working Group / Chinese HPO consortium (Weihong Gu and Kai Wang, as identified by the upstream working-group page).
   - Source and contributor attribution: https://github.com/obophenotype/hpo-translations/blob/cd44f61b40f7728ea1b6a09e74d9fbca1187f17f/docs/translations/zh.md
   - Translation table: https://github.com/obophenotype/hpo-translations/blob/cd44f61b40f7728ea1b6a09e74d9fbca1187f17f/babelon/hp-zh.babelon.tsv
   - Only OFFICIAL Chinese labels whose English source still matches the imported term are used. The English definitions have not been translated by this project.
3. **Mondo Disease Ontology**, Monarch Initiative and Mondo contributors, release **2026-10-06**, licensed under **Creative Commons Attribution 4.0 International**.
   - Source: https://github.com/monarch-initiative/mondo
   - Release: https://github.com/monarch-initiative/mondo/releases/tag/v2026-10-06
   - License: https://creativecommons.org/licenses/by/4.0/
   - Full license text: `licenses/MONDO-CC-BY-4.0.txt`.

Changes made by this project: selected source-owned active terms with definitions; limited HPO to the phenotypic-abnormality branch; excluded MONDO's non-human-animal-disease branch; retained selected synonyms, parent identifiers, cross-references and definition provenance; applied available official Chinese labels; added topic flags; serialized and compressed the result for offline search. No missing medical advice was generated. This is a downstream snapshot, not an official upstream release or a statement of upstream endorsement.

`manifest.json` records the exact source versions, download addresses and SHA-256 hashes. The application's original curated lung-imaging entries are maintained separately in `src/data/medicalKnowledgeCore.json`.
