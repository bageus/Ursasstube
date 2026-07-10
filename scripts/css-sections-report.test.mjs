import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeCssSections,
  getSectionMarkers,
  normalizeSectionTitle,
} from './report-css-sections.mjs';

test('CSS section report groups comment sections', () => {
  const source = `/* Alpha */
.a {
  display: grid;
}
.b {
  color: white;
}

/* Beta */
.c {
  display: flex;
}
.d {
  width: 64px;
}
.e {
  font-weight: 700;
}
`;

  const report = analyzeCssSections(source, { filePath: 'fixture.css' });

  assert.equal(report.sectionCount, 2);
  assert.equal(report.sections[0].title, 'Alpha');
  assert.equal(report.sections[1].title, 'Beta');
  assert.equal(report.sections[0].rules, 2);
  assert.equal(report.sections[1].rules, 3);
  assert.equal(report.topSections[0].title, 'Beta');
});

test('CSS section report falls back to root section', () => {
  const report = analyzeCssSections('.a { color: red; }\n.b { color: blue; }', { filePath: 'plain.css' });

  assert.equal(report.sectionCount, 1);
  assert.equal(report.sections[0].title, 'plain.css root');
  assert.equal(report.sections[0].rules, 2);
});

test('CSS section titles are normalized', () => {
  const markers = getSectionMarkers(['/* ---- Beta ---- */', '.x {}']);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].title, 'Beta');
  assert.equal(normalizeSectionTitle('*** Alpha ***'), 'Alpha');
});
