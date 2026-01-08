type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  constructor(level: LogLevel = 'info') { this.level = level; }

  private shouldLog(l: LogLevel): boolean {
    return ['debug', 'info', 'warn', 'error'].indexOf(l) >= ['debug', 'info', 'warn', 'error'].indexOf(this.level);
  }

  private log(level: LogLevel, data: object, msg?: string): void {
    if (!this.shouldLog(level)) return;
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message: msg, ...data }));
  }

  debug(data: object, msg?: string) { this.log('debug', data, msg); }
  info(data: object, msg?: string) { this.log('info', data, msg); }
  warn(data: object, msg?: string) { this.log('warn', data, msg); }
  error(data: object, msg?: string) { this.log('error', data, msg); }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || 'info');
