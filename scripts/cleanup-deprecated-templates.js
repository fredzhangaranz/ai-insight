#!/usr/bin/env node

/**
 * Cleanup script for deprecated long-form templates
 * 
 * This script removes the 3 deprecated templates:
 * 1. Area Reduction at Fixed Time Point with Healing State
 * 2. Multi-Assessment Correlation with Anti-Join
 * 3. Workflow State Progress Filtering
 * 
 * These are being replaced with composable snippets in Week 4B.
 * 
 * Usage: node scripts/cleanup-deprecated-templates.js [--confirm]
 * 
 * Run WITHOUT --confirm to preview what will be deleted.
 * Run WITH --confirm to actually delete.
 */

const { Pool } = require('pg');
const path = require('path');

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'insight_gen_dev'
});

const CONFIRM_FLAG = process.argv.includes('--confirm');

const DEPRECATED_TEMPLATES = [
  'Area Reduction at Fixed Time Point with Healing State',
  'Multi-Assessment Correlation with Anti-Join',
  'Workflow State Progress Filtering'
];

async function preflightCheck() {
  console.log('\n🔍 PRE-FLIGHT CHECK - What will be deleted:\n');

  try {
    // Check templates
    const templatesResult = await pool.query(
      `SELECT id, name, status, intent FROM "Template" 
       WHERE name = ANY($1)
       ORDER BY name`,
      [DEPRECATED_TEMPLATES]
    );

    console.log(`📋 Templates found: ${templatesResult.rows.length}`);
    templatesResult.rows.forEach((row) => {
      console.log(`   - ID ${row.id}: "${row.name}" (${row.status}, intent: ${row.intent})`);
    });

    if (templatesResult.rows.length === 0) {
      console.log('   ⚠️  No deprecated templates found (already cleaned up?)');
      return { hasTemplates: false, templateIds: [] };
    }

    const templateIds = templatesResult.rows.map((r) => r.id);

    // Check versions
    const versionsResult = await pool.query(
      `SELECT COUNT(*) as count, "templateId", array_agg(id) as version_ids
       FROM "TemplateVersion" 
       WHERE "templateId" = ANY($1)
       GROUP BY "templateId"`,
      [templateIds]
    );

    console.log(`\n📌 TemplateVersions to delete:`);
    if (versionsResult.rows.length === 0) {
      console.log('   (none found)');
    } else {
      versionsResult.rows.forEach((row) => {
        console.log(`   - Template ID ${row.templateId}: ${row.count} version(s) [${row.version_ids.join(', ')}]`);
      });
    }

    // Check usage logs
    const usageResult = await pool.query(
      `SELECT COUNT(*) as count, "templateVersionId"
       FROM "TemplateUsage" 
       WHERE "templateVersionId" IN (
         SELECT id FROM "TemplateVersion" WHERE "templateId" = ANY($1)
       )
       GROUP BY "templateVersionId"`,
      [templateIds]
    );

    console.log(`\n📊 TemplateUsage logs to delete:`);
    if (usageResult.rows.length === 0) {
      console.log('   (none found)');
    } else {
      const totalUsageLogs = usageResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
      console.log(`   - Total logs: ${totalUsageLogs} entries`);
    }

    console.log('\n' + '='.repeat(70));
    console.log(`SUMMARY: ${templatesResult.rows.length} templates, ${versionsResult.rows.length} versions, ${usageResult.rows.length} usage groups`);
    console.log('='.repeat(70));

    return { hasTemplates: true, templateIds };
  } catch (error) {
    console.error('❌ Pre-flight check failed:', error.message);
    throw error;
  }
}

async function cleanupDeprecatedTemplates() {
  const { hasTemplates, templateIds } = await preflightCheck();

  if (!hasTemplates) {
    console.log('\n✅ Nothing to clean up!');
    await pool.end();
    process.exit(0);
  }

  if (!CONFIRM_FLAG) {
    console.log('\n⚠️  DRY RUN MODE - No changes made.');
    console.log('To actually delete, run with --confirm flag:');
    console.log('   node scripts/cleanup-deprecated-templates.js --confirm\n');
    await pool.end();
    process.exit(0);
  }

  console.log('\n🚀 DELETING DEPRECATED TEMPLATES...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Delete TemplateUsage logs
    // These cascade from TemplateVersion, so we delete explicitly for clarity
    const usageDeleted = await client.query(
      `DELETE FROM "TemplateUsage" 
       WHERE "templateVersionId" IN (
         SELECT id FROM "TemplateVersion" WHERE "templateId" = ANY($1)
       )`,
      [templateIds]
    );
    console.log(`✓ Deleted ${usageDeleted.rowCount} TemplateUsage logs`);

    // Step 2: Delete TemplateVersion records
    // These cascade from Template, so we delete explicitly for clarity
    const versionsDeleted = await client.query(
      `DELETE FROM "TemplateVersion" 
       WHERE "templateId" = ANY($1)`,
      [templateIds]
    );
    console.log(`✓ Deleted ${versionsDeleted.rowCount} TemplateVersion records`);

    // Step 3: Delete Template records
    const templatesDeleted = await client.query(
      `DELETE FROM "Template" 
       WHERE id = ANY($1)`,
      [templateIds]
    );
    console.log(`✓ Deleted ${templatesDeleted.rowCount} Template records`);

    await client.query('COMMIT');
    console.log('\n✅ Cleanup successful!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Cleanup failed, rolling back:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function verifyCleanup() {
  console.log('\n🔍 VERIFICATION - Checking cleanup success:\n');

  const result = await pool.query(
    `SELECT id, name FROM "Template" 
     WHERE name = ANY($1)`,
    [DEPRECATED_TEMPLATES]
  );

  if (result.rows.length === 0) {
    console.log('✅ All deprecated templates successfully removed!');
  } else {
    console.log('❌ WARNING: Some templates still exist:');
    result.rows.forEach((row) => {
      console.log(`   - ID ${row.id}: "${row.name}"`);
    });
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Cleanup Deprecated Long-Form Templates (Week 4B)      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  try {
    await cleanupDeprecatedTemplates();

    if (CONFIRM_FLAG) {
      await verifyCleanup();
    }

    console.log('\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

