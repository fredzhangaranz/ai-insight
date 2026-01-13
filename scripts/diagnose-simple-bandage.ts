/**
 * Diagnostic Script: "Simple Bandage" Discovery Investigation
 *
 * This script investigates why "Treatment Applied" field is not being discovered
 * for customer b4328dd3-5977-4e0d-a1a3-a46be57cd012
 */

import { getInsightGenDbPool } from '@/lib/db';
import { getSqlServerPool } from '@/lib/services/sqlserver/client';

const CUSTOMER_ID = 'b4328dd3-5977-4e0d-a1a3-a46be57cd012';

async function diagnoseSimpleBandage() {
  console.log('='.repeat(80));
  console.log('Diagnostic Script: "Simple Bandage" Discovery Investigation');
  console.log('Customer ID:', CUSTOMER_ID);
  console.log('='.repeat(80));
  console.log('');

  // ============================================
  // PART 1: Check InsightGen Postgres Database
  // ============================================
  console.log('📊 PART 1: Checking InsightGen Postgres Database...');
  console.log('');

  const pgPool = await getInsightGenDbPool();

  // Check which forms were discovered
  console.log('🔍 Query 1: Forms discovered for this customer');
  const formsResult = await pgPool.query(`
    SELECT
      si.form_name,
      si.form_identifier,
      si.discovered_at,
      COUNT(DISTINCT sif.id) as field_count,
      COUNT(DISTINCT sio.id) as option_count
    FROM "SemanticIndex" si
    LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
    LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
    WHERE si.customer_id = $1
    GROUP BY si.id, si.form_name, si.form_identifier, si.discovered_at
    ORDER BY si.form_name
  `, [CUSTOMER_ID]);

  console.table(formsResult.rows);
  console.log('Total forms discovered:', formsResult.rows.length);
  console.log('');

  // Check if "Treatment Applied" field exists
  console.log('🔍 Query 2: Checking for "Treatment Applied" field in semantic index');
  const treatmentFieldResult = await pgPool.query(`
    SELECT
      si.form_name,
      sif.field_name,
      sif.data_type,
      sif.semantic_concept,
      si.discovered_at,
      COUNT(sio.id) as option_count
    FROM "SemanticIndexField" sif
    JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
    LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
    WHERE si.customer_id = $1
      AND sif.field_name ILIKE '%treatment%'
    GROUP BY si.id, si.form_name, sif.field_name, sif.data_type, sif.semantic_concept, si.discovered_at
  `, [CUSTOMER_ID]);

  if (treatmentFieldResult.rows.length === 0) {
    console.log('❌ "Treatment Applied" field NOT FOUND in semantic index');
  } else {
    console.table(treatmentFieldResult.rows);
  }
  console.log('');

  // Check recent discovery runs
  console.log('🔍 Query 3: Recent discovery runs');
  const discoveryRunsResult = await pgPool.query(`
    SELECT
      id,
      started_at,
      completed_at,
      status,
      forms_discovered,
      fields_discovered,
      options_discovered,
      error_message
    FROM "DiscoveryRun"
    WHERE customer_id = $1
    ORDER BY started_at DESC
    LIMIT 5
  `, [CUSTOMER_ID]);

  console.table(discoveryRunsResult.rows);
  console.log('');

  // ============================================
  // PART 2: Check Customer SQL Server Database
  // ============================================
  console.log('📊 PART 2: Checking Customer SQL Server Database...');
  console.log('');

  // Get customer connection string
  const customerResult = await pgPool.query(
    `SELECT id, name, connection_string FROM "Customer" WHERE id = $1`,
    [CUSTOMER_ID]
  );

  if (customerResult.rows.length === 0) {
    console.error('❌ Customer not found in database');
    process.exit(1);
  }

  const customer = customerResult.rows[0];
  console.log('Customer Name:', customer.name);
  console.log('');

  const sqlServerPool = await getSqlServerPool(customer.connection_string);

  // Check "Treatment Applied" field in SQL Server
  console.log('🔍 Query 4: "Treatment Applied" field configuration in SQL Server');
  const treatmentFieldConfig = await sqlServerPool.request().query(`
    SELECT
      AS_SET.id as form_id,
      AS_SET.name as form_name,
      AS_SET.attributeSetKey,
      AS_SET.isDeleted as form_deleted,
      AS_SET.type as form_type,
      AT.id as field_id,
      AT.name as field_name,
      AT.dataType,
      AT.isDeleted as field_deleted,
      AT.isVisible,
      AT.serverChangeDate as field_change_date,
      COUNT(AL.id) as option_count
    FROM dbo.AttributeType AT
    JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
    LEFT JOIN dbo.AttributeLookup AL ON AT.id = AL.attributeTypeFk AND AL.isDeleted = 0
    WHERE AT.name = 'Treatment Applied'
    GROUP BY
      AS_SET.id,
      AS_SET.name,
      AS_SET.attributeSetKey,
      AS_SET.isDeleted,
      AS_SET.type,
      AT.id,
      AT.name,
      AT.dataType,
      AT.isDeleted,
      AT.isVisible,
      AT.serverChangeDate
  `);

  if (treatmentFieldConfig.recordset.length === 0) {
    console.log('❌ "Treatment Applied" field NOT FOUND in SQL Server');
  } else {
    console.table(treatmentFieldConfig.recordset);

    const config = treatmentFieldConfig.recordset[0];
    console.log('');
    console.log('📋 Analysis:');
    console.log('  Form Name:', config.form_name);
    console.log('  Form Type:', config.form_type);
    console.log('  Form Deleted:', config.form_deleted ? '❌ YES (This is the problem!)' : '✅ No');
    console.log('  Field Deleted:', config.field_deleted ? '❌ YES (This is the problem!)' : '✅ No');
    console.log('  Field Visible:', config.isVisible ? '✅ Yes' : '❌ NO (This might be the problem!)');
    console.log('  Data Type:', config.dataType, '(1000 = SingleSelectList)');
    console.log('  Options Count:', config.option_count);
    console.log('  Last Modified:', config.field_change_date);
  }
  console.log('');

  // Check if this form is in the discovered forms list
  if (treatmentFieldConfig.recordset.length > 0) {
    const formName = treatmentFieldConfig.recordset[0].form_name;
    const isDiscovered = formsResult.rows.some(row => row.form_name === formName);

    console.log('🔍 Query 5: Is this form in the discovered list?');
    if (isDiscovered) {
      console.log(`✅ YES - Form "${formName}" WAS discovered`);
      console.log('❓ But "Treatment Applied" field is missing from it');
      console.log('   → Possible issue: Field was added AFTER discovery ran');
      console.log('   → Or field filtering excluded it');
    } else {
      console.log(`❌ NO - Form "${formName}" was NOT discovered`);
      console.log('   → This is why "Treatment Applied" field is missing');
      console.log('   → Check form configuration (type, deleted status, etc.)');
    }
  }
  console.log('');

  // Check all forms in SQL Server vs discovered forms
  console.log('🔍 Query 6: All forms in SQL Server');
  const allFormsResult = await sqlServerPool.request().query(`
    SELECT
      name as form_name,
      attributeSetKey,
      type as form_type,
      isDeleted,
      (SELECT COUNT(*) FROM dbo.AttributeType WHERE attributeSetFk = dbo.AttributeSet.id AND isDeleted = 0) as field_count
    FROM dbo.AttributeSet
    WHERE isDeleted = 0
    ORDER BY name
  `);

  console.log('Total forms in SQL Server:', allFormsResult.recordset.length);
  console.log('Total forms discovered:', formsResult.rows.length);
  console.log('');

  // Find missing forms
  const sqlServerFormNames = new Set(allFormsResult.recordset.map(r => r.form_name));
  const discoveredFormNames = new Set(formsResult.rows.map(r => r.form_name));

  const missingForms = Array.from(sqlServerFormNames).filter(name => !discoveredFormNames.has(name));

  if (missingForms.length > 0) {
    console.log('❌ Forms in SQL Server but NOT discovered:');
    missingForms.forEach(name => {
      const formInfo = allFormsResult.recordset.find(r => r.form_name === name);
      console.log(`   - ${name} (type: ${formInfo?.form_type}, fields: ${formInfo?.field_count})`);
    });
  } else {
    console.log('✅ All forms from SQL Server were discovered');
  }
  console.log('');

  // ============================================
  // PART 3: Recommendations
  // ============================================
  console.log('='.repeat(80));
  console.log('📋 RECOMMENDATIONS');
  console.log('='.repeat(80));

  if (treatmentFieldConfig.recordset.length === 0) {
    console.log('❌ "Treatment Applied" field does not exist in the customer database');
    console.log('   → Verify the field name is correct');
  } else {
    const config = treatmentFieldConfig.recordset[0];

    if (config.form_deleted) {
      console.log('❌ The form is marked as DELETED');
      console.log('   → Restore the form or re-run discovery after restoration');
    } else if (config.field_deleted) {
      console.log('❌ The field is marked as DELETED');
      console.log('   → Restore the field or re-run discovery after restoration');
    } else if (!config.isVisible) {
      console.log('⚠️  The field is marked as NOT VISIBLE');
      console.log('   → Check if form discovery filters out invisible fields');
      console.log('   → Make field visible or update discovery logic');
    } else if (missingForms.includes(config.form_name)) {
      console.log(`❌ Form "${config.form_name}" exists but was NOT discovered`);
      console.log('   → Check form type filtering in discovery service');
      console.log('   → Re-run form discovery to include this form');
    } else {
      console.log(`⚠️  Form "${config.form_name}" WAS discovered but field is missing`);
      console.log('   → Field may have been added after last discovery run');
      console.log('   → Check field modification date vs last discovery run date');
      console.log('   → Solution: RE-RUN form discovery');
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('✅ Diagnostic complete');
  console.log('='.repeat(80));
}

// Run the diagnostic
diagnoseSimpleBandage().catch(error => {
  console.error('❌ Error running diagnostic:', error);
  process.exit(1);
});
