import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPECTED_EXTRACTED_COUNT,
  assertCssPostCutover,
} from './check-css-post-cutover.mjs';

function extractedResult() {
  return {
    stagedDuplicateCount: 0,
    extractedCount: EXPECTED_EXTRACTED_COUNT,
    sections: {
      background: { hasStyleDuplicate: false },
      hero: { hasStyleDuplicate: false },
      startScreen: { hasStyleDuplicate: false },
    },
  };
}

test('assertCssPostCutover accepts the fully extracted state', () => {
  assert.deepEqual(assertCssPostCutover(extractedResult()), {
    state: 'extracted',
    extractedCount: EXPECTED_EXTRACTED_COUNT,
    stagedDuplicateCount: 0,
  });
});

test('assertCssPostCutover rejects reintroduced staged duplicates', () => {
  const result = extractedResult();
  result.stagedDuplicateCount = 2;
  result.extractedCount -= 2;
  result.sections.background.hasStyleDuplicate = true;
  result.sections.hero.hasStyleDuplicate = true;

  assert.throws(
    () => assertCssPostCutover(result),
    /must not contain staged duplicates.*background, hero/,
  );
});

test('assertCssPostCutover rejects an incomplete ownership inventory', () => {
  const result = extractedResult();
  result.extractedCount -= 1;

  assert.throws(
    () => assertCssPostCutover(result),
    new RegExp(`Expected ${EXPECTED_EXTRACTED_COUNT} extracted CSS ownership sections`),
  );
});
