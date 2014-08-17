var path = require('path'),
    http = require('https'),
    fs = require('fs'),
    timeLoop = require('./timers'),
    instruments;

var env = process.env['NODE_ENV'] || 'development';
var json_path = path.join(__dirname, '../config', env + '.json');

var config = JSON.parse(fs.readFileSync(json_path));

function loadMock() {
    var json_mock = path.join(__dirname, config.mock_file);
    config.lookup = JSON.parse(fs.readFileSync(json_mock)).functionList;
}

config.initIntervaling = function() {
    if (config.autoCheckConfiguration) {
        if (config.autoCheckConfiguration.once === false) {
            if (config.useMock === true) {
                timeLoop.logic(loadMock);
            } else {
                timeLoop.logic(config.reload);
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

config.reload = function() {
    var match;
    var proxy = process.env.https_proxy;
    var port = 443, /* default to SSL, may be replace by proxy port */
        host = config.url, /* default to server, may be replaced by proxy url */
        path = config.url_path, /* default to server path, may be replaced by full server url */
        auth = 'Basic ' + new Buffer(config.username + ":" + config.password).toString('base64'),
        headers = {
                "Authorization": auth
        }; /* defaults to just auth header, if proxy set then Host should be as well */

    if (proxy != null) 
    {
        match = proxy.match(/^(https:\/\/)?([^:\/]+)(:([0-9]+))?/i);
        if (match) {
                host = match[2];
                port = (match[4] != null ? match[4] : 80);
                path = "https://" + config.url + config.url_path;
                headers = {
                    "Authorization": auth,
                    "Host": config.url
                };
        }
    }

    var auth = 'Basic ' + new Buffer(config.username + ":" + config.password).toString('base64'),
        rawConfig = '',
        loadedConfig = {},
        options = {
            "port": port, 
            "host": host,
            "path": path,
            "method": "GET",
            "headers": headers,
            "rejectUnauthorized": false,
            "requestCert": true,
            "agent": false
        };

    console.log(require('util').inspect(options));

    config.status = "loading";

    callback = function(response) {
        response.on('data', function(chunk) {
            rawConfig += chunk.toString('utf-8');
        });

        response.on('end', function() {
            var validConfig = false;

            if (config.isValidJSON(rawConfig)) {
                loadedConfig = JSON.parse(rawConfig);
                if (loadedConfig.functionList) {
                    validConfig = true;
                    config.lookup = loadedConfig.functionList;
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
config.isValidJSON = function(text) {
    if (/^[\],:{}\s]*$/.test(text.replace(/\\["\\\/bfnrtu]/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

        return true;
    }

    return false;
};

if (config.useMock) {
    loadMock();
    config.status = "done";
} else {
    config.reload();
}

config.env = env;

module.exports = config;
