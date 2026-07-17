import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  analyzeApiDomainSizeBudget,
  countSourceLines
} from './check-api-domain-size-budget.mjs';

function sourceWithLines(lines) {
  return Array.from({ length: lines }, (_, index) => `line-${index + 1}`).join('\n');
}

test('countSourceLines handles LF and CRLF consistently', () => {
  assert.equal(countSourceLines('a\nb\nc'), 3);
  assert.equal(countSourceLines('a\r\nb\r\nc'), 3);
});

test('accepts a split API domain within aggregate and module budgets', () => {
  const result = analyzeApiDomainSizeBudget({
    sources: {
      'js/api.js': sourceWithLines(480),
      'js/api/account-share.js': sourceWithLines(170),
      'js/api/leaderboard.js': sourceWithLines(180)
    },
    maxTotalLines: 850,
    maxDomainModuleLines: 300
  });

  assert.equal(result.fileCount, 3);
  assert.equal(result.totalLines, 830);
  assert.equal(result.remainingLines, 20);
});

test('rejects aggregate growth hidden behind additional domain files', () => {
  assert.throws(() => analyzeApiDomainSizeBudget({
    sources: {
      'js/api.js': sourceWithLines(480),
      'js/api/account-share.js': sourceWithLines(200),
      'js/api/leaderboard.js': sourceWithLines(200)
    },
    maxTotalLines: 850,
    maxDomainModuleLines: 300
  }), /API domain total exceeds 850 lines: 880/);
});

test('rejects a new oversized API domain module', () => {
  assert.throws(() => analyzeApiDomainSizeBudget({
    sources: {
      'js/api.js': sourceWithLines(400),
      'js/api/account-share.js': sourceWithLines(301)
    },
    maxTotalLines: 850,
    maxDomainModuleLines: 300
  }), /account-share\.js \(301\)/);
});

test('requires the stable API facade in the inventory', () => {
  assert.throws(() => analyzeApiDomainSizeBudget({
    sources: {
      'js/api/account-share.js': sourceWithLines(100)
    }
  }), /js\/api\.js is required/);
});
