var path = require('path'),
    http = require('https'),
    fs = require('fs'),
    timeLoop = require('./timers'),
    net = require('net'),
    network,
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

config.methodSignatureSeparator = '&&~\%\%';

config.postUsingChildProcess = config.postUsingChildProcess || false;

config.postChildProcessTimeout = config.postChildProcessTimeout || 30000;

config.username = process.env.DEBUGGER_USER || config.username;

config.password = process.env.DEBUGGER_PASSWORD || config.password;

config.url = process.env.BASEURL || config.url;

config.firstTime = true;

/* END default values of configuration */

config.loadMock = function() {
    var json_mock = path.join(__dirname, config.mock_file);
    config.lookup = JSON.parse(fs.readFileSync(json_mock)).functionList;
    config.refreshLookupSet();
};

config.initIntervaling = function () {
    if (config.autoCheckConfiguration) {
        if (config.autoCheckConfiguration.once === false) {
            if (config.useMock === true) {
                config.loadMock();
            } else {
                timeLoop.logic(config.reload, this);
                instruments = require('./instruments');
                if (config.logging.debug.log === true) {
                    if (instruments.isLoggerSet() === false) {
                        instruments.setLoggerWithConfiguration();
                    }
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
    //var currentConfig = this;

    if ((config.postUsingChildProcess) && (config.firstTime === false)) {
        if (!instruments) {
            instruments = require('./instruments');
        }
        instruments.reloadConfig();
    } else {
        network = require('./network');
        network.setSettings(config);
        network.updateConfig(config, true);
        config.status = 'done';
        config.firstTime = false;
    }
};

config.refreshLookupSet = function () {
    if (config.lookup) {
        if (!instruments) {
            instruments = require('./instruments');
        }

        config.lookup.forEach(function (trackedMethod) {
            var methodLookup = instruments.getFunctionUniqueID(trackedMethod.sourceFile, trackedMethod.line);
            if (typeof instruments.lookupMap[methodLookup] !== "undefined") {
                if (trackedMethod.selected === false) {
                    delete instruments.lookupMap[methodLookup];
                }
                else
                    instruments.lookupMap[methodLookup] = trackedMethod;
            }
            else // lookupMap doesn't have the trackedMethod
            {
                if (trackedMethod.selected === true)
                {
                    instruments.lookupMap[methodLookup] = trackedMethod;
                }
                // if the trackedMethod is not selected, there is no need to track it
                // and since it's also not in the lookupMap, all is well
            }
        });
    }
};

if (config.useMock) {
    config.loadMock();
    config.status = "done";
} else {
    config.reload();
}

config.env = env;

module.exports = config;