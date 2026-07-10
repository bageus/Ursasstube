import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CSS_PATH = 'css/style.css';

function normalizeSectionTitle(rawTitle) {
  return String(rawTitle || '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/[-=]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    || 'unnamed section';
}

function getSectionMarkers(lines) {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\/\*[^*].*\*\/$/.test(line.trim()))
    .map(({ line, index }) => ({
      lineNumber: index + 1,
      title: normalizeSectionTitle(line.trim().replace(/^\/\*/, '').replace(/\*\/$/, '')),
    }));
}

function countCssRules(sectionSource) {
  const withoutComments = sectionSource.replace(/\/\*[\s\S]*?\*\//g, '');
  return (withoutComments.match(/\{/g) || []).length;
}

function analyzeCssSections(source, { filePath = DEFAULT_CSS_PATH } = {}) {
  const lines = String(source || '').split('\n');
  const markers = getSectionMarkers(lines);
  const boundaries = markers.length > 0
    ? markers
    : [{ lineNumber: 1, title: `${basename(filePath)} root` }];

  const sections = boundaries.map((marker, index) => {
    const nextMarker = boundaries[index + 1];
    const startLine = marker.lineNumber;
    const endLine = nextMarker ? nextMarker.lineNumber - 1 : lines.length;
    const sectionLines = lines.slice(startLine - 1, endLine);
    const sourceText = sectionLines.join('\n');
    return {
      title: marker.title,
      startLine,
      endLine,
      lines: sectionLines.length,
      nonEmptyLines: sectionLines.filter((line) => line.trim()).length,
      rules: countCssRules(sourceText),
      bytes: Buffer.byteLength(sourceText, 'utf8'),
    };
  });

  const topSections = [...sections]
    .sort((left, right) => right.nonEmptyLines - left.nonEmptyLines || right.rules - left.rules)
    .slice(0, 12);

  return {
    filePath,
    totalLines: lines.length,
    totalNonEmptyLines: lines.filter((line) => line.trim()).length,
    totalBytes: Buffer.byteLength(String(source || ''), 'utf8'),
    sectionCount: sections.length,
    topSections,
    sections,
  };
}

function printCssSectionReport(report) {
  console.log('CSS section inventory');
  console.log(`- file: ${report.filePath}`);
  console.log(`- lines: ${report.totalLines}`);
  console.log(`- non-empty lines: ${report.totalNonEmptyLines}`);
  console.log(`- bytes: ${report.totalBytes}`);
  console.log(`- sections: ${report.sectionCount}`);
  console.log('\nLargest sections:');
  for (const section of report.topSections) {
    console.log(`- ${section.title}: ${section.nonEmptyLines} non-empty lines, ${section.rules} rules, lines ${section.startLine}-${section.endLine}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const filePath = argv[0] || DEFAULT_CSS_PATH;
  const source = readFileSync(filePath, 'utf8');
  const report = analyzeCssSections(source, { filePath });
  printCssSectionReport(report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  analyzeCssSections,
  getSectionMarkers,
  normalizeSectionTitle,
  printCssSectionReport,
};
