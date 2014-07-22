var config          = require('./lib/config'),
  debugOffline    = require('./offline_debug_hooks');

module.exports = function () {
    var waiting = true;

    debugOffline();

    var waitForConfigReload = setInterval(function () {
        if (config.status === "done") {
          waiting = false;
          console.log('Done!');
          config.initIntervaling();
          clearInterval(waitForConfigReload);
        }
    }, 1000);
};