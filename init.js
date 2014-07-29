var config          = require('./lib/config'),
  debugOffline    = require('./offline_debug'),
  _instruments     = require('./lib/instruments.js');

// initialization code, run once when module is loaded
var waiting = true;

debugOffline(); // override module load

var waitForConfigReload = setInterval(function () {
    if (config.status === "done") {
      waiting = false;
      console.log('Done!');
      config.initIntervaling();
      clearInterval(waitForConfigReload);
    }
}, 1000);
// end initilization

// export the helper functions so that instrumented code can report events
module.exports = _instruments;
