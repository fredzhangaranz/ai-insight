/**
 * Test script for Fix 1: Simple Query Handling
 *
 * Tests that "how many patients" generates correct SQL with empty semantic context
 */

import { generateSQLWithLLM } from '../lib/services/semantic/llm-sql-generator.service';
import type { ContextBundle } from '../lib/services/context-discovery/types';

async function testSimpleQuery() {
  console.log('\n' + '='.repeat(80));
  console.log('Testing Fix 1: Simple Query Handling');
  console.log('='.repeat(80) + '\n');

  // Simulate the context that would be generated for "how many patients"
  // with empty semantic context (no forms, fields, terminology)
  const context: ContextBundle = {
    customerId: 'test-customer',
    question: 'how many patients',
    intent: {
      type: 'outcome_analysis',
      scope: 'aggregate',
      metrics: ['patient_count'],
      filters: [],
      confidence: 0.95,
      reasoning: 'Simple patient count query',
    },
    forms: [], // Empty for simple queries
    terminology: [], // Empty for simple queries
    joinPaths: [], // Empty for simple queries
    overallConfidence: 0.95,
    metadata: {
      discoveryRunId: 'test-run-1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      version: '1.0',
    },
  };

  console.log('📋 Test Context:');
  console.log('  Question:', context.question);
  console.log('  Intent Type:', context.intent.type);
  console.log('  Metrics:', context.intent.metrics);
  console.log('  Forms:', context.forms.length);
  console.log('  Fields:', 0);
  console.log('  Terminology:', context.terminology.length);
  console.log('  Join Paths:', context.joinPaths.length);
  console.log('');

  try {
    console.log('🤖 Calling LLM SQL Generator...\n');
    const result = await generateSQLWithLLM(context, 'test-customer-id');

    if (result.responseType === 'clarification') {
      console.log('❌ FAIL: LLM requested clarification instead of generating SQL');
      console.log('Reasoning:', result.reasoning);
      console.log('Clarifications:', JSON.stringify(result.clarifications, null, 2));
      process.exit(1);
    }

    console.log('✅ LLM generated SQL response');
    console.log('');
    console.log('Generated SQL:');
    console.log('-'.repeat(80));
    console.log(result.generatedSql);
    console.log('-'.repeat(80));
    console.log('');
    console.log('Explanation:', result.explanation);
    console.log('Confidence:', result.confidence);
    if (result.assumptions && result.assumptions.length > 0) {
      console.log('Assumptions:', result.assumptions.length);
      result.assumptions.forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.term}: ${a.assumedValue} (${a.reasoning})`);
      });
    }
    console.log('');

    // Validation checks
    const sql = result.generatedSql.toLowerCase();
    const checks = {
      hasSelect: sql.includes('select'),
      hasCount: sql.includes('count'),
      hasPatientTable: sql.includes('rpt.patient'),
      hasNoteTable: sql.includes('rpt.note'),
      hasWoundRelease: sql.includes('wound release'),
      hasAttributeType: sql.includes('attributetype'),
      hasWhere: sql.includes('where'),
    };

    console.log('🔍 Validation Checks:');
    console.log(`  ✓ Contains SELECT: ${checks.hasSelect ? '✅' : '❌'}`);
    console.log(`  ✓ Contains COUNT: ${checks.hasCount ? '✅' : '❌'}`);
    console.log(`  ✓ Queries rpt.Patient: ${checks.hasPatientTable ? '✅' : '❌'}`);
    console.log(`  ✓ Does NOT query rpt.Note: ${!checks.hasNoteTable ? '✅' : '❌'}`);
    console.log(`  ✓ No "Wound release" pollution: ${!checks.hasWoundRelease ? '✅' : '❌'}`);
    console.log(`  ✓ No AttributeType join: ${!checks.hasAttributeType ? '✅' : '❌'}`);
    console.log(`  ✓ No invented WHERE clauses: ${!checks.hasWhere ? '✅' : '❌'}`);
    console.log('');

    const allPassed =
      checks.hasSelect &&
      checks.hasCount &&
      checks.hasPatientTable &&
      !checks.hasNoteTable &&
      !checks.hasWoundRelease &&
      !checks.hasAttributeType &&
      !checks.hasWhere;

    if (allPassed) {
      console.log('✅ ALL CHECKS PASSED - Fix 1 is working correctly!');
      console.log('');
      process.exit(0);
    } else {
      console.log('❌ SOME CHECKS FAILED - Fix 1 needs adjustment');
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testSimpleQuery();
