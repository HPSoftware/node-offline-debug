var config = require('./lib/config'),
  debugOffline = require('./offline_debug'),
  logger = require('./lib/logger'),
  _instruments = require('./lib/instruments.js');

// initialization code, run once when module is loaded
//config.reload();

debugOffline(); // override module load

var waitForConfigReload = setInterval(function () {
    if (config.status === "done") {
      logger.info('Instrumentation configuration is loaded');
      config.initIntervaling();
      clearInterval(waitForConfigReload);
    } else {
        config.reload();
    }
}, 1000);
// end initilization

// export the helper functions so that instrumented code can report events
module.exports = _instruments;
