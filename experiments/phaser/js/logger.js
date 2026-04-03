/* ===== LOGGER ===== */
const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

const normalizeLevel = (value) => {
  if (!value) return null;
  const level = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : null;
};

let initialized = false;
let currentLevel = 'warn';

const logger = {
  getLevel() {
    return currentLevel;
  },
  setLevel(level) {
    const normalized = normalizeLevel(level);
    if (!normalized) {
      originalConsole.warn(`⚠️ Unknown log level: ${level}`);
      return currentLevel;
    }
    currentLevel = normalized;
    localStorage.setItem('ursass.logLevel', normalized);
    originalConsole.info(`🔧 Log level set to: ${normalized}`);
    return currentLevel;
  },
  debug(...args) {
    if (LEVELS.debug >= LEVELS[currentLevel]) originalConsole.debug(...args);
  },
  info(...args) {
    if (LEVELS.info >= LEVELS[currentLevel]) originalConsole.info(...args);
  },
  warn(...args) {
    if (LEVELS.warn >= LEVELS[currentLevel]) originalConsole.warn(...args);
  },
  error(...args) {
    if (LEVELS.error >= LEVELS[currentLevel]) originalConsole.error(...args);
  }
};

function initLogger() {
  if (initialized) return logger;

  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const defaultLevel = isLocalHost ? 'debug' : 'warn';

  const params = new URLSearchParams(window.location.search);
  const queryLevel = normalizeLevel(params.get('logLevel'));
  const localStorageLevel = normalizeLevel(localStorage.getItem('ursass.logLevel'));
  currentLevel = queryLevel || localStorageLevel || defaultLevel;

  if (queryLevel) {
    localStorage.setItem('ursass.logLevel', queryLevel);
  }

  window.LOG_LEVELS = Object.freeze({ ...LEVELS });
  window.logger = logger;

  console.debug = (...args) => logger.debug(...args);
  console.info = (...args) => logger.info(...args);
  console.log = (...args) => logger.info(...args);
  console.warn = (...args) => logger.warn(...args);
  console.error = (...args) => logger.error(...args);

  initialized = true;
  logger.info(`🧾 Log level: ${currentLevel}`);
  return logger;
}

export { LEVELS, logger, initLogger };
