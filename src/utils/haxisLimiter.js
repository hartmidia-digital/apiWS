const rateLimit = require('express-rate-limit');

const sendLimiter = rateLimit({
    windowMs: parseInt(process.env.SEND_RATE_LIMIT_WINDOW_MS || 60000), // 1 minute
    max: parseInt(process.env.SEND_RATE_LIMIT_MAX_REQUESTS || 200),
    message: { status: 'error', message: 'Too many send requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }
});

module.exports = {
    sendLimiter
};
