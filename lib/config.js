var path        = require('path'),
    http        = require('https'),
    fs          = require('fs'),
    timeLoop    = require('./timers'),
    set         = require('./set'),
    instruments;

var env = process.env['NODE_ENV'] || 'development';
var json_path = path.join(__dirname, '../config', env + '.json');

var config = JSON.parse(fs.readFileSync(json_path));

function loadMock() {
    var json_mock = path.join(__dirname, config.mock_file);
    config.lookup = JSON.parse(fs.readFileSync(json_mock)).functionList;
    config.refreshLookupSet();
}

config.initIntervaling = function () {
    if (config.autoCheckConfiguration) {
        if (config.autoCheckConfiguration.once === false) {
            if (config.useMock === true) {
                timeLoop.logic(loadMock);
            } else {
                timeLoop.logic(config.reload, this);
                instruments = require('./instruments');
                if (config.logging.debug.log === true) {
                    if (config.logging.debug.logToConsole === true) {
                        instruments.setLoggerLevel(config.logging.globalLogLevel);
                    }
                }
            }
            timeLoop.interval(config.autoCheckConfiguration.every);
            timeLoop();
        }
    }
};

config.reload = function () {
    var auth = 'Basic ' + new Buffer(config.username + ":" + config.password).toString('base64'),
        rawConfig = '',
        loadedConfig = {},
        options = {
            "port": 443, // SSL
            "host": config.url,
            "path": "/OfflineDebugger/CodeSelection/Functions",
            "headers": {
                "Authorization": auth
            },
            "rejectUnauthorized": false,
            "requestCert": true,
            "agent": false
        };

    config.status = "loading";

    callback = function (response) {
        response.on('data', function (chunk) {
            rawConfig += chunk.toString('utf-8');
        });

        response.on('end', function () {
            var validConfig = false;

            if (config.isValidJSON(rawConfig)) {
                loadedConfig = JSON.parse(rawConfig);
                if (loadedConfig.functionList) {
                    validConfig = true;
                    config.lookup = loadedConfig.functionList;
                    config.refreshLookupSet();
                }
            }

            if (!validConfig) {
                console.error("An error has occured, couldn't get configuration from server, falling back to mock config");
                loadMock();
            }

            config.status = "done";
        });
    };

    http.request(options, callback).end();
};

  // Validate if received a valid JSON without using try catch
config.isValidJSON = function (text) {
    if (/^[\],:{}\s]*$/.test(text.replace(/\\["\\\/bfnrtu]/g, '@').
      replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
      replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

      return true;
    }

    return false;
};

config.refreshLookupSet = function () {
    if (config.lookup) {
        if (!instruments) {
            instruments = require('./instruments');
        }

        config.lookup.forEach(function (trackedMethod) {
            var trackedMethodString = trackedMethod.sourceFile + '&&~%%' + trackedMethod.line;
            if (instruments.lookupSet.contains(trackedMethodString)) {
                if (trackedMethod.selected === false) {
                    instruments.lookupMap.remove(trackedMethodString);
                    instruments.lookupSet.remove(trackedMethodString);
                }
            } else {
                if (trackedMethod.selected === true) {
                    instruments.lookupMap.put(trackedMethodString, trackedMethod);
                    instruments.lookupSet.add(trackedMethodString);
                } else {
                    instruments.lookupMap.remove(trackedMethodString);
                    instruments.lookupSet.remove(trackedMethodString);
                }
            }
        });
    }
};

if (config.useMock) {
    loadMock();
    config.status = "done";
} else {
    config.reload();
}

config.env = env;

module.exports = config;