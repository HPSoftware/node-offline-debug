var config = require('./lib/config'),
    _instruments = require('./lib/instruments.js'),
    debugOffline = require('./offline_debug'),
    logger = require('./lib/logger'),
    network = require('./lib/network');

// initialization code, run once when module is loaded

debugOffline(); // override module load

var waitForConfigReload = setInterval(function () {
    if (config.status === "done") {
        logger.info('Instrumentation configuration is loaded');
        config.initIntervaling();
      clearInterval(waitForConfigReload);
    }
}, 1000);
// end initilization

// export the helper functions so that instrumented code can report events
module.exports = _instruments;
