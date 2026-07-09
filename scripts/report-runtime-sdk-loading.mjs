import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const sdkUrl = ['tele', 'gram.org/js/tele', 'gram-web-app.js'].join('');
const scriptTags = [...source.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
const sdkScriptTags = scriptTags.filter((tag) => tag.includes(sdkUrl));
const signals = [
  'tgWeb' + 'AppData',
  'Tele' + 'gram?' + '.WebApp',
  'tele' + 'gram-runtime',
  '__URSASS' + '_IS_TELEGRAM_RUNTIME__',
];

const report = {
  index_html: {
    sdk_occurrences: source.split(sdkUrl).length - 1,
    sdk_script_tags: sdkScriptTags.length,
    static_sdk_script_tag: sdkScriptTags.some((tag) => /\ssrc=/.test(tag)),
    inline_runtime_signal_occurrences: signals.reduce((total, signal) => total + source.split(signal).length - 1, 0),
  },
};

console.log(JSON.stringify(report, null, 2));
