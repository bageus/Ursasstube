import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyLeaderboardSummary,
  fitConnectedAccountButton,
  initializePlayerSummaryPlaceholders,
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

test('static player-card demo values are replaced with loading placeholders', () => {
  const nodes = new Map([
    ['walletRank', { textContent: '#1' }],
    ['walletBest', { textContent: '150983' }]
  ]);
  const documentRef = { getElementById: (id) => nodes.get(id) || null };

  assert.equal(initializePlayerSummaryPlaceholders(documentRef), true);
  assert.equal(nodes.get('walletRank').textContent, '#—');
  assert.equal(nodes.get('walletBest').textContent, '…');
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

test('web player display select uses a dark native menu with readable text', () => {
  const css = readFileSync(new URL('../public/css/web-menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /#pmDisplaySelect\s*\{[\s\S]*color-scheme:\s*dark/);
  assert.match(css, /#pmDisplaySelect\s*\{[\s\S]*background-color:\s*#050507\s*!important[\s\S]*color:\s*#fff\s*!important/);
  assert.match(css, /#pmDisplaySelect option,[\s\S]*#pmDisplaySelect optgroup[\s\S]*background-color:\s*#050507[\s\S]*color:\s*#fff/);
});

test('compact web menu stays in document flow and only scrolls its own viewport when needed', () => {
  const css = readFileSync(new URL('../public/css/web-menu-layout.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width:\s*768px\)[\s\S]*html:not\(\.telegram-runtime\) body[\s\S]*overflow:\s*hidden/);
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart\s*\{[\s\S]*height:\s*100dvh[\s\S]*overflow-y:\s*auto[\s\S]*scrollbar-gutter:\s*auto/);
  assert.match(css, /#gameStart \.new-title\s*\{[\s\S]*position:\s*relative[\s\S]*margin:\s*clamp\(220px,\s*44vw,\s*330px\)/);
  assert.match(css, /#gameStart \.new-buttons\s*\{[\s\S]*position:\s*relative[\s\S]*inset:\s*auto/);
  assert.match(css, /#gameStart \.btn-new\.menu-hidden,[\s\S]*#ridesInfo:not\(\.visible\)[\s\S]*display:\s*none/);
});

test('web start screen keeps scrolling without exposing a flashing native scrollbar', () => {
  const css = readFileSync(new URL('../css/web-scrollbar-stability.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\.telegram-runtime\) #gameStart\s*\{[\s\S]*scrollbar-width:\s*none[\s\S]*overflow-anchor:\s*none/);
  assert.match(css, /#gameStart::\-webkit-scrollbar\s*\{[\s\S]*display:\s*none[\s\S]*width:\s*0[\s\S]*height:\s*0/);
  assert.match(main, /import '\.\.\/css\/web-scrollbar-stability\.css';/);
});