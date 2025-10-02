    import pino from 'pino';
    export { default as serverLogger } from 'pino-http'

    const config = {
        serverUrl: process.env.REACT_APP_API_PATH || 'http://localhost:3000',
        env: process.env.NODE_ENV,
        publicUrl: process.env.PUBLIC_URL,
    }

    const pinoConfig: any = {
        browser: {
          asObject: true
        },
        formatters: {
            level: (label) => ({ level: label }),
        },
        // Add transports for production, e.g., to a log management service
        // transports: {
        //   target: 'pino-pretty', // For local development
        //   options: {
        //     colorize: true,
        //   },
        // },
    }

    if (config.serverUrl) {
        pinoConfig.browser.transmit = {
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          send: (level, logEvent) => {
            const msg = logEvent.messages[0]
      
            const headers = {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
              type: 'application/json'
            }
            let blob = new Blob([JSON.stringify({ msg, level })], headers)
            navigator.sendBeacon(`${config.serverUrl}/log`, blob)
          }
        }
      }
      
    const logger = pino(pinoConfig);

    // Create a browser-compatible logger for client-side
    const createBrowserLogger = () => {
      const browserLogger = {
        info: (...args: any[]) => {
          if (process.env.NODE_ENV !== 'production') {
            console.info('[INFO]', ...args);
          }
        },
        warn: (...args: any[]) => {
          console.warn('[WARN]', ...args);
        },
        error: (...args: any[]) => {
          console.error('[ERROR]', ...args);
        },
        debug: (...args: any[]) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[DEBUG]', ...args);
          }
        },
      };
      return browserLogger;
    };

    // Override global console to use pino logger
    export const setupGlobalLogger = () => {
      const originalConsole = { ...console };
      
      if (typeof window === 'undefined') {
        // Server-side: use pino logger
        console.log = (...args: any[]) => logger.info(...args);
        console.info = (...args: any[]) => logger.info(...args);
        console.warn = (...args: any[]) => logger.warn(...args);
        console.error = (...args: any[]) => logger.error(...args);
        console.debug = (...args: any[]) => logger.debug(...args);
      } else {
        // Client-side: use browser-compatible logger
        const browserLogger = createBrowserLogger();
        
        console.log = (...args: any[]) => browserLogger.info(...args);
        console.info = (...args: any[]) => browserLogger.info(...args);
        console.warn = (...args: any[]) => browserLogger.warn(...args);
        console.error = (...args: any[]) => browserLogger.error(...args);
        console.debug = (...args: any[]) => browserLogger.debug(...args);
      }
      
      // Keep trace and other methods as they are
      console.trace = originalConsole.trace;
      console.table = originalConsole.table;
      console.time = originalConsole.time;
      console.timeEnd = originalConsole.timeEnd;
    };

    export default logger;