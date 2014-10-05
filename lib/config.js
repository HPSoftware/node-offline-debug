var path            = require('path'),
    http            = require('https'),
    fs              = require('fs'),
    timeLoop        = require('./timers'),
    network,
    instruments;

var env = process.env.NODE_ENV || 'development';
var appDir = path.dirname(require.main.filename);

var app_json_path = path.join(appDir, 'node-offline-debug-' + env + '.json');
var package_json_path = path.join(__dirname, '../config', env + '.json');

var config = JSON.parse(fs.readFileSync(package_json_path));
// copy app_config configurations over package configurations
function merge_config(top_config, base_config)
{
    console.log('merge '+top_config+' and '+base_config+'\n');
    for (var option in top_config)
    {
        console.log('merge '+option+'\n');
        if (Array.isArray(top_config[option])) // handle array elements in the same order
        {
            if (!Array.isArray(base_config[option]))
                base_config[option] = top_config[option];
            else
            {
                for(var i=0;i<top_config[option].length;i++)
                {
                    if (base_config[option].length <= i)
                        base_config[option].push(top_config[option][i]);
                    else
                        merge_config(top_config[option][i],base_config[option][i]);
                }
            } 
        }
        else if (typeof top_config[option] === "Object") // recurseively handle complex configurations
        {
            if (base_config[option] === undefined)
                base_config[option] = top_config[option];
            else
                merge_config(top_config[option], base_config[option]);
        }
        else
            base_config[option] = top_config[option];
    }

}
if (fs.existsSync(app_json_path))
{
    var app_config = JSON.parse(fs.readFileSync(app_json_path));
    if (app_config && Object.keys(app_config))
        merge_config(app_config,config);
    console.log('config after merge:\n'+require('util').inspect(config)+'\n');
}



config.reloadPublicConfigDataEvery = 60000; // Reload public config file every 60 seconds

config.public_configuration_file = config.public_configuration_file || '';

// These two methods must reside here to enable loading configuration
config.refreshPublicConfig = function (values) {
    var hasAutoCheckConfigurationChanged = false;

    config.useGivenNames = values.useGivenNames;
    if (!config.autoCheckConfiguration) {
        config.autoCheckConfiguration = {};
    } else {
        hasAutoCheckConfigurationChanged = (config.autoCheckConfiguration.once !== values.autoCheckConfiguration.once);
    }
    config.autoCheckConfiguration.once = values.autoCheckConfiguration.once;
    config.autoCheckConfiguration.every = values.autoCheckConfiguration.every;

    // If the configuration should be loaded ensure it is restarted
    if (hasAutoCheckConfigurationChanged) {
        if (config.autoCheckConfiguration.once === true) {
            timeLoop.logic(function() { return; }, this);
        } else {
            if ((config.autoCheckConfiguration.once === false) && (config.autoCheckConfiguration.every > 0)) {
                config.initIntervaling();
            }
        }
    }
};

config.public_configuration_file_reload = function () {
    var publicConfigFile = path.join(__dirname, config.public_configuration_file);
    var publicConfig = JSON.parse(fs.readFileSync(publicConfigFile));
    config.refreshPublicConfig(publicConfig);
};

config.public_configuration_file_loop = function () {
    var configReload = setInterval(config.public_configuration_file_reload, config.reloadPublicConfigDataEvery);
};

config.public_configuration_file_loop();
/* START default values of configuration */

config.status = "init";

config.exclude = config.exclude || [];

config.useGivenNames = config.useGivenNames || false;

if (config.logging)
    config.globalLogLevel = config.logging.globalLogLevel;

config.globalLogLevel = config.globalLogLevel || 'info';

config.createTempCopyOfInstrumention = config.createTempCopyOfInstrumention || false;

config.methodSignatureSeparator = '&&~\%\%';

config.compressPosts = config.compressPosts || false;

config.active_debug_service_type = config.active_debug_service_type || 'file';

config.public_configuration_file_reload();

config.debug_services = config.debug_services;

if (config.debug_services && config.debug_services.length > 0) {
    for(var i = 0; i < config.debug_services.length; i++) {
        if (config.debug_services[i].type === config.active_debug_service_type)
            config.debug_service = config.debug_services[i];
    }
}

config.debug_service = config.debug_service ||
    JSON.parse('{"type": "file","path": "../config/debug_configuration.json","outputLog": "debug"}');

if (config.debug_service.type === 'service') {
    config.debug_service.username = process.env.HPAPPDEBUG_USERNAME || config.debug_service.username;

    config.debug_service.password = process.env.HPAPPDEBUG_PASSWORD || config.debug_service.password;
}


/* END default values of configuration */

config.initIntervaling = function () {
    if (config.autoCheckConfiguration) {
        if (config.autoCheckConfiguration.once === false) {
            timeLoop.logic(config.reload, this);
            if (!instruments) { instruments = require('./instruments'); }
            if (config.debug_service.type === 'file') {
                if (instruments.isLoggerSet() === false) {
                    instruments.setLoggerWithConfiguration();
                }
                if (config.logging.debug.logToConsole === true) {
                    instruments.setLoggerLevel(config.logging.globalLogLevel);
                }
            }
            timeLoop.interval(config.autoCheckConfiguration.every);
            timeLoop();
        }
    }
};


config.reload = function (){
    if (this.debug_service && this.debug_service.type)
    {
        config.status = "loading";
        if (this.debug_service.type === 'file') {
            this.debug_configuration_file_reload();
            this.public_configuration_file_reload();
        } else if (this.debug_service.type === 'service') {
            this.debug_configuration_service_reload();
        }
    }
};

config.debug_configuration_file_reload = function (){
    var debug_config = path.join(__dirname, this.debug_service.path);
    this.lookup = JSON.parse(fs.readFileSync(debug_config)).functionList;
    this.refreshLookupSet();
    config.status = "done";
};

config.debug_configuration_service_reload = function () {
    if (!network) {
        network = require('./network');
        network.setSettings(config);
    }

    network.updateLookup(config, true);
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

config.env = env;

module.exports = config;
