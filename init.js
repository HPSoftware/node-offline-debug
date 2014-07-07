
var config          = require('./lib/config');
var debugOffline    = require('./offline_debug');

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