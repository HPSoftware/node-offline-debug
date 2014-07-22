var winston = require('winston'),
  path = require('path'),
  config = require('./config');

var transports = [], exceptionHandlers = [];

var logger = new (winston.Logger)();

if (config.logging.debug.log === true) {
  if (config.logging.debug.logToConsole === true) {
    transports.push(new winston.transports.Console({
      json: false, timestamp: true, colorize: true
    }));
  }
  if (config.logging.debug.logToFile === true) {
    transports.push(new (winston.transports.DailyRotateFile)({
      name: 'file',
      datePattern: '.yyyy-MM-ddTHH',
      filename: path.join(__dirname, "/" + config.logging.debug.filename + ".log")
    }));
  }
}


if (config.logging.exceptions.log === true) {
  if (config.logging.exceptions.logToConsole === true) {
    exceptionHandlers.push(new (winston.transports.Console)({ json: false, timestamp: true, colorize: true }));
  }
  if (config.logging.exceptions.logToFile === true) {
    exceptionHandlers.push(new (winston.transports.DailyRotateFile)({
      name: 'file',
      datePattern: '.yyyy-MM-ddTHH',
      filename: path.join(__dirname, "/" + config.logging.exceptions.filename + ".log")
    }));
  }
}

logger = new winston.Logger({
  "transports": transports,
  "exceptionHandlers" : exceptionHandlers,
  "levels": config.logging.levels,
  "colors": config.logging.colors,
  "exitOnError": false
});

module.exports = logger;