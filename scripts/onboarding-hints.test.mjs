import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInputProfile,
  getOnboardingHintTimeline,
  getOnboardingHintTimelineByProfile,
  markFirstRunHintShown,
  shouldShowFirstRunHint
} from '../js/game/onboarding-hints.js';

function createStorageMock() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test('first-run hint is shown once per storage key', () => {
  const storage = createStorageMock();

  assert.equal(shouldShowFirstRunHint(storage), true);
  markFirstRunHintShown(storage);
  assert.equal(shouldShowFirstRunHint(storage), false);
});

test('timeline contains user guidance messages with positive delays', () => {
  const timeline = getOnboardingHintTimeline();

  assert.ok(Array.isArray(timeline));
  assert.ok(timeline.length >= 2);
  for (const step of timeline) {
    assert.ok(Number(step.delayMs) >= 0);
    assert.ok(String(step.text).trim().length > 0);
  }
});

test('profile-aware timeline uses keyboard hint copy for non-touch devices', () => {
  const profile = getInputProfile({ navigator: { maxTouchPoints: 0 } });
  const timeline = getOnboardingHintTimelineByProfile(profile);

  assert.equal(profile, 'keyboard');
  assert.match(timeline[0].text, /A\/D|←\/→/);
});

test('profile-aware timeline uses swipe hint copy for touch devices', () => {
  const profile = getInputProfile({ navigator: { maxTouchPoints: 5 } });
  const timeline = getOnboardingHintTimelineByProfile(profile);

  assert.equal(profile, 'touch');
  assert.match(timeline[0].text, /Swipe/);
});
