/* ===== LOGGER ===== */
(function initLogger() {
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

  const defaultLevel = (() => {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return isLocalHost ? 'debug' : 'warn';
  })();

  const params = new URLSearchParams(window.location.search);
  const queryLevel = normalizeLevel(params.get('logLevel'));
  const localStorageLevel = normalizeLevel(localStorage.getItem('ursass.logLevel'));
  let currentLevel = queryLevel || localStorageLevel || defaultLevel;

  if (queryLevel) {
    localStorage.setItem('ursass.logLevel', queryLevel);
  }

  const shouldLog = (level) => LEVELS[level] >= LEVELS[currentLevel];

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
      if (shouldLog('debug')) originalConsole.debug(...args);
    },
    info(...args) {
      if (shouldLog('info')) originalConsole.info(...args);
    },
    warn(...args) {
      if (shouldLog('warn')) originalConsole.warn(...args);
    },
    error(...args) {
      if (shouldLog('error')) originalConsole.error(...args);
    }
  };

  window.LOG_LEVELS = Object.freeze({ ...LEVELS });
  window.logger = logger;

  console.debug = (...args) => logger.debug(...args);
  console.info = (...args) => logger.info(...args);
  console.log = (...args) => logger.info(...args);
  console.warn = (...args) => logger.warn(...args);
  console.error = (...args) => logger.error(...args);

  logger.info(`🧾 Log level: ${currentLevel}`);
})();
