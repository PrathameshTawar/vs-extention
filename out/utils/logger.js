"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    constructor(scope) {
        this.scope = scope;
    }
    info(message, meta) {
        this.write('info', message, meta);
    }
    warn(message, meta) {
        this.write('warn', message, meta);
    }
    error(message, meta) {
        this.write('error', message, meta);
    }
    debug(message, meta) {
        this.write('debug', message, meta);
    }
    write(level, message, meta) {
        const payload = {
            scope: this.scope,
            level,
            message,
            ...(meta ?? {})
        };
        console.log(JSON.stringify(payload));
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map