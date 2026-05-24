type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
    private readonly scope: string;

    constructor(scope: string) {
        this.scope = scope;
    }

    public info(message: string, meta?: Record<string, unknown>): void {
        this.write('info', message, meta);
    }

    public warn(message: string, meta?: Record<string, unknown>): void {
        this.write('warn', message, meta);
    }

    public error(message: string, meta?: Record<string, unknown>): void {
        this.write('error', message, meta);
    }

    public debug(message: string, meta?: Record<string, unknown>): void {
        this.write('debug', message, meta);
    }

    private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
        const payload = {
            scope: this.scope,
            level,
            message,
            ...(meta ?? {})
        };

        console.log(JSON.stringify(payload));
    }
}
