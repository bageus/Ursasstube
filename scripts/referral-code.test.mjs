import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeReferralCode,
  readReferralCodeFromLocation,
  readReferralCodeFromTelegram
} from '../js/referral/referralCode.js';

test('normalizeReferralCode accepts URL query ref values', () => {
  assert.equal(normalizeReferralCode('ABC123'), 'ABC123');
  assert.equal(readReferralCodeFromLocation('?ref=ABC123'), 'ABC123');
});

test('normalizeReferralCode supports Telegram ref_ prefix', () => {
  assert.equal(normalizeReferralCode('ref_ABC123'), 'ABC123');
});

test('readReferralCodeFromTelegram parses start_param', () => {
  global.window = {
    Telegram: {
      WebApp: {
        initDataUnsafe: { start_param: 'ref_ABC123' }
      }
    }
  };
  assert.equal(readReferralCodeFromTelegram(), 'ABC123');
});

test('normalizeReferralCode rejects unsafe values', () => {
  assert.equal(normalizeReferralCode('../../etc/passwd'), '');
  assert.equal(normalizeReferralCode('a'.repeat(65)), '');
});


test('readReferralCodeFromLocation supports ref_hint and uppercase normalization', () => {
  assert.equal(readReferralCodeFromLocation('?ref_hint=abc-12'), 'ABC-12');
});

test('readReferralCodeFromTelegram parses startapp', () => {
  global.window = { Telegram: { WebApp: { initDataUnsafe: { startapp: 'ref_abc123' } } } };
  assert.equal(readReferralCodeFromTelegram(), 'ABC123');
});
