var path        = require('path'),
    http        = require('https'),
    fs          = require('fs'),
    timeLoop    = require('./timers'),
    instruments;

var env = process.env['NODE_ENV'] || 'development';
var json_path = path.join(__dirname, '../config', env + '.json');

var config = JSON.parse(fs.readFileSync(json_path));

/* START default values of configuration */

config.exclude = config.exclude || [];

config.logAnonymousFunctions = config.logAnonymousFunctions || false;

config.nameAnonymousFunctions = config.nameAnonymousFunctions || false;

config.useGivenNames = config.useGivenNames || false;

config.globalLogLevel = config.logging.globalLogLevel || 'info';

config.active = config.active || false;

config.createTempCopyOfInstrumention = config.createTempCopyOfInstrumention || false;

config.methodSignatureSeparator = '&&~%%';

/* END default values of configuration */

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

config.createHttpOptions = function (method, optionalHeaders){
    var match;
    var proxy = process.env.https_proxy;
    var port = 443, /* default to SSL, may be replace by proxy port */
        host = config.url, /* default to server, may be replaced by proxy url */
        path = config.url_path, /* default to server path, may be replaced by full server url */
        auth = 'Basic ' + new Buffer(config.username + ":" + config.password).toString('base64');

    var headers = (optionalHeaders != null ? optionalHeaders : {});
    headers.Authorization = auth;

    if (proxy != null) 
    {
        match = proxy.match(/^(https:\/\/)?([^:\/]+)(:([0-9]+))?/i);
        if (match) {
                host = match[2];
                port = (match[4] != null ? match[4] : 80);
                path = "https://" + config.url + config.url_path;
                headers.Host = config.url;
        }
    }

    var options = {
            "port": port, 
            "host": host,
            "path": path,
            "method": method,
            "headers": headers,
            "rejectUnauthorized": false,
            "requestCert": true,
            "agent": false
        };

    return options;
};

config.reload = function () {
    var currentConfig = this;

    var rawConfig = '',
        loadedConfig = {},
        options = currentConfig.createHttpOptions("GET");

    currentConfig.status = "loading";

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
                    currentConfig.lookup = loadedConfig.functionList;
                    currentConfig.refreshLookupSet();
                }
            }

            if (!validConfig) {
                console.error("An error has occured, couldn't get configuration from server, falling back to mock config");
                loadMock();
            }

            currentConfig.status = "done";
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
            //console.log('tracked method update: '+require('util').inspect(trackedMethod)+'\n');
            var trackedMethodString = trackedMethod.sourceFile + 
                config.methodSignatureSeparator + trackedMethod.line;
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