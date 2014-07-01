
var config          = require('./lib/config');
var debugOffline    = require('./offline_debug');

module.exports = function () {
    var waiting = true;

    // Check if we must run this to have full coverage
    debugOffline();

    var waitForConfigReload = setInterval(function () {
        if (config.status === "done") {
          waiting = false;
          console.log('Done!');
          clearInterval(waitForConfigReload);
        }
    }, 1000);
};