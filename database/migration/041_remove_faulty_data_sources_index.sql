/**
 * Migration 041: Remove invalid data_sources table index
 *
 * The original migration 040 attempted to create a GIN index using
 * `(data_sources -> 'table')`, which is not a valid expression for
 * JSONB containment queries. The primary GIN index on data_sources
 * already covers the intended workload, so we drop the invalid index.
 */

DROP INDEX IF EXISTS idx_ontology_data_sources_table;

