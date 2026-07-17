import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyLeaderboardSummary,
  fitConnectedAccountButton,
  parseDisplayInteger,
  readLeaderboardSummary,
  resolveTextFitMode
} from '../js/player-ui-consistency.js';

test('displayed leaderboard numbers are parsed despite locale separators', () => {
  assert.equal(parseDisplayInteger('196 307'), 196307);
  assert.equal(parseDisplayInteger('196,307'), 196307);
  assert.equal(parseDisplayInteger('#1'), 1);
  assert.equal(parseDisplayInteger('—'), null);
});

test('current leaderboard row becomes the canonical player summary', () => {
  const row = {
    querySelector(selector) {
      if (selector === '.lb-rank') return { textContent: '#1' };
      if (selector === '.lb-score') return { textContent: '196 307' };
      return null;
    }
  };
  const root = {
    querySelector(selector) {
      return selector === '.lb-row--me' ? row : null;
    }
  };

  assert.deepEqual(readLeaderboardSummary(root), { rank: 1, score: 196307 });
});

test('leaderboard summary synchronizes main card and open player menu', () => {
  const nodes = new Map([
    ['walletRank', { textContent: '#9' }],
    ['walletBest', { textContent: '150983' }],
    ['pmRankNumber', { textContent: '#9' }],
    ['pmBestScore', { textContent: '150983' }]
  ]);
  const documentRef = { getElementById: (id) => nodes.get(id) || null };

  assert.equal(applyLeaderboardSummary({ rank: 1, score: 196307 }, documentRef), true);
  assert.equal(nodes.get('walletRank').textContent, '#1');
  assert.equal(nodes.get('walletBest').textContent, '196307');
  assert.equal(nodes.get('pmRankNumber').textContent, '#1');
  assert.equal(nodes.get('pmBestScore').textContent, '196307');
});

test('connected X labels select progressively tighter font modes and preserve full title', () => {
  assert.equal(resolveTextFitMode('@shortname'), 'normal');
  assert.equal(resolveTextFitMode('@medium_connected_name'), 'compact');
  assert.equal(resolveTextFitMode('@very_long_connected_account_name'), 'tight');

  const button = {
    textContent: '@very_long_connected_account_name',
    dataset: {},
    title: ''
  };
  assert.equal(fitConnectedAccountButton(button), 'tight');
  assert.equal(button.dataset.textFit, 'tight');
  assert.equal(button.title, '@very_long_connected_account_name');
});

test('web overlay CSS fully isolates leaderboard and uses unified black player HUD', () => {
  const css = readFileSync(new URL('../public/css/web-menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /body\.leaderboard-overlay-open #playerCorner[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /body\.leaderboard-overlay-open #leaderboardScreen[\s\S]*background:\s*#000\s*!important/);
  assert.match(css, /leaderboard-overlay-title \.icon-atlas::before[\s\S]*content:\s*'🏆'/);
  assert.match(css, /#playerMenuOverlay[\s\S]*background:\s*#000/);
  assert.match(css, /#playerMenuOverlay \.pm-content[\s\S]*max-width:\s*640px[\s\S]*background:\s*#050507/);
  assert.match(css, /\.pm-content::before[\s\S]*content:\s*none/);
  assert.match(css, /#pmConnectXBtn\[data-text-fit="tight"\][\s\S]*font-size:\s*8px/);
});
