var config = require('./lib/config'),
  debugOffline = require('./offline_debug'),
  logger = require('./lib/logger'),
  _instruments = require('./lib/instruments.js');

// initialization code, run once when module is loaded

debugOffline(); // override module load handler

// this timer is used to ensure that first-time configuration load
// is perfromed in some delay (1 sec) after the rest of the code
// is loaded, to avoid issues with cicular dependencies
var waitForConfigReload = setInterval(function () {
    if (config.status === "done") {
      // after first-time configuraiton load, the responsibility
      // for subsequent loads is moved to the initIntervaling
      // function in config.js
      logger.info('Instrumentation configuration is loaded');
      config.initIntervaling();
      // clear the current timer
      clearInterval(waitForConfigReload);
    } else if (config.status === "init") {
      // if we got here it means the configuration has not loaded yet
      // init the first-time configuration load
        config.reload();
      // the time is still running, next iteration will be either 'loading'
      // or 'done'
    }
}, 1000);
// end initilization

// export the helper functions so that instrumented code can report events
module.exports = _instruments;
