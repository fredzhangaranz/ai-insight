# Ontology Enrichment Documentation

This folder contains the complete plan and implementation guide for enriching the wound-care ontology (YAML + database) using the nurse-created PDF glossary.

## Start here

- **Quick overview**: [ONTOLOGY_ENRICHMENT_SUMMARY.md](./ONTOLOGY_ENRICHMENT_SUMMARY.md) (5 min)
- **Full index & navigation**: [DOCUMENTS_INDEX.md](./DOCUMENTS_INDEX.md)

## Documents

| Document                                                               | Purpose                                 |
| ---------------------------------------------------------------------- | --------------------------------------- |
| [ONTOLOGY_ENRICHMENT_SUMMARY.md](./ONTOLOGY_ENRICHMENT_SUMMARY.md)     | Executive summary, timeline, scope      |
| [ONTOLOGY_ENRICHMENT_PLAN.md](./ONTOLOGY_ENRICHMENT_PLAN.md)           | Full implementation plan (11 parts)     |
| [CODE_EXAMPLES_AND_TESTS.md](./CODE_EXAMPLES_AND_TESTS.md)             | SQL, types, services, test templates    |
| [PDF_IMAGE_STRATEGY.md](./PDF_IMAGE_STRATEGY.md)                       | Image extraction & description strategy |
| [ONTOLOGY_ENRICHMENT_CHECKLIST.md](./ONTOLOGY_ENRICHMENT_CHECKLIST.md) | Phase-by-phase implementation checklist |
| [DOCUMENTS_INDEX.md](./DOCUMENTS_INDEX.md)                             | Navigation and cross-references         |

## Related

- Ontology data: `data/ontology/wound-care-terminology.yaml`
- Source PDF: `data/ontology/Wound Terminolgy Glossary.pdf`
- Loader: `lib/jobs/ontology_loader.ts`, `scripts/load-ontology-synonyms.js`
- Setup: `docs/design/semantic_layer/SETUP_ONTOLOGY_LOADER.md`
