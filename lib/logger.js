var winston = require('winston'),
  path = require('path'),
  config = require('./config');

var transports = [], exceptionHandlers = [];

transports.push(new winston.transports.Console({
  json: false, timestamp: true, colorize: true
}));

exceptionHandlers.push(new (winston.transports.Console)({ json: false, timestamp: true, colorize: true }));

var logger = new winston.Logger({
  "transports": transports,
  "exceptionHandlers" : exceptionHandlers,
  "levels": { 'info': 0, 'ok': 1, 'error': 2 },
  "exitOnError": true
});

logger.initialized = false;

module.exports = logger;