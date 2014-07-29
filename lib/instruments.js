var config  = require('./config'),
  logger    = require('./logger'),
  http      = require('https'),
  map       = require('./map'),
  callsite  = require('callsite'),
  array     = require('./array'),
  path      = require('path'),
  hooker    = require('hooker');

var inProcess = new map();


var instruments = {
    alreadyHooked: new map(),
    objects: [],

    // Start configuration helpers
    config: {
      exclude: config.exclude || [],
      lookup: config.lookup,
      logAnonumousFunctions: config.logAnonumousFunctions || false
    },


    isActive: function () {
      return config.active || true;
    },

    shouldCreateTempCopy: function (){
      return config.createTempCopyOfInstrumention || false;
    },

    // End configuration helpers

    // Start handle creating and populating objects
    prepareLogObject: function () {
      var logObject = {
        "debugData": []
      };

      return logObject;
    },

    prepareLogFunction: function (log) {
      var logObj = {
          "startTimestamps": log.startTimestamps,
          "functionName": log.funcText || "anonymous",
          "functionFile": log.filename,
          "parameters": log.argsText,
          "returnValue": "",
          "flowId": "", // ??
          "message": "Start function",
          "endTimestamps": ""
      };

      return logObj;
    },

    prepareLogTexts: function (signature, args, filename, lineno, timestamp) {
      if ((args === undefined) || (args === null)) { args = []; }
      var result = {
        startTimestamps: (timestamp ? this.getDateTime(timestamp) : ''),
        funcText: ((signature === '') ? 'An anonymous function ' : signature),
        argsText: ((args.length === 0) ? ', no arguments' : ' (' +  JSON.stringify(args)+ ')'),
        filename: path.basename(filename).toString()
      };

      if (lineno) {
        result.lineNumber = lineno;
      }

      return result;
    },

  // Format output
  prepareLogMessage: function (logText, direction) {

    var that = this;

    function formatMessage (filename, funcText, argsText, lineno, direction) {
        if (direction === 'incoming') {
          return filename + ' => ' + funcText + argsText + ' line#: ' + lineno;
        } else {
           return filename + ' <= ' + funcText + argsText;
        }
    }

    var formattedMessage = '';

    if (logText.funcText !== 'An anonymous function ') {
      if (that.shouldWrapFunction(logText.filename, logText.funcText)) {
        formattedMessage = formatMessage(logText.filename,
          logText.funcText, logText.argsText, logText.lineNumber, direction);
      }
    } else {
      if (that.config.logAnonumousFunctions) {
        formattedMessage = formatMessage(logText.filename,
          logText.funcText, logText.argsText, logText.lineNumber, direction);
      }
    }

    return formattedMessage;
  },

  shouldWrapFunction: function (filename, signature) {
    filename = this.shortenFileName(filename).toString();

    var module = config.lookup.filter(function (item) {
        return (item.sourceFile === filename);
    });

    if (module.length === 1) {
        if (module[0].selected === true) {
            return true;
        }
    }
    return false;
  },

  shortenFileName: function (filename) {
    return path.basename(filename);
  },

  filenameForCache: function(filename){
    // normalize and replace '\' with '|' if needed
    if (path.sep === '\\')
      return path.normalize(filename).replace(/\\/g, '|');
    else
      return path.normalize(filename);
  },

  getModuleNameFromFilename: function (filename) {
    return path.basename(filename,path.extname(filename));
  },

  isModuleIncluded: function (filename) {
    var moduleName = this.getModuleNameFromFilename(filename),
      pathInParts = filename.split(path.sep),
      that = this,
      excludeComponent = true;

    for (var index = 0; index < that.config.exclude.length; index++) {
      if (pathInParts.contains(that.config.exclude[index])) {
        excludeComponent = false;
        break;
      }
    }

    return (excludeComponent);
  },

  getModule: function (filename) {
    var that = this;

    return (that.objects.filter(function (module) {
      return (that.shortenFileName(module.filename) === filename);
    }));
  },

  // End filtering helpers
  postBackLog: function (logObject) {
    var logObjectString = JSON.stringify(logObject);

    var auth = 'Basic ' + new Buffer(config.username + ":" + config.password).toString('base64'),
        rawConfig = '',
        loadedConfig = {},
        options = {
            "port": 443, // SSL
            "host": config.url,
            "path": "/OfflineDebugger/DebugData/Data",
            "headers": {
                "Authorization": auth,
                'Content-Type': 'application/json',
                'Content-Length': logObjectString.length
            },
            "rejectUnauthorized": false,
            "requestCert": true,
            "agent": false,
            "method": "POST"
        };

    var request = http.request(options, function (response) {
      response.setEncoding('utf-8');

      var responseString = '';

      response.on('data', function(data) {
        responseString += data;
      });

      response.on('end', function() {
        logger.info('Sent data to server, ' +
          JSON.parse(logObjectString).debugData[0].functionName + ', ' +
          JSON.parse(logObjectString).debugData[0].functionFile);
      });
    });

    request.on('error', function (e) {
      logger.error("An error has occured, " + e.message);
    });

    request.write(logObjectString);
    request.end();
  },

  handlePreMessage: function (args, name, moduleName, start, methodId) {
    var lineno = -1,
      module = instruments.alreadyHooked.get(moduleName).functions;

    if (module) {
      lineno = module.get(name).line;
    }

    var log = this.prepareLogTexts(name, args, moduleName, lineno, start);

    var message = this.prepareLogMessage(log, 'incoming');

    if (message.length > 0) {

      logger.remote(message);

      // Prepare and push
      var method = this.prepareLogObject();

      method.debugData.push(this.prepareLogFunction(log));

      inProcess.put(methodId, method);
    }
  },

  handlePostMessate: function (result, name, moduleName, methodId) {
    var log = this.prepareLogTexts(name, result, moduleName);

    var message = this.prepareLogMessage(log, 'outgoing');

    if (message.length > 0) {
      logger.remote(message);

      var stackLines = [];

      callsite().forEach(function(site) {
        var stackLine = [
            site.getFunctionName() || 'anonymous' + " ",
            site.getFileName() + " ",
            site.getLineNumber() + " "
          ].join();

          stackLines.push(stackLine);
        });

        if (stackLines) {
          stackLines.shift();
          stackLines.shift();
          stackLines.shift();
          logger.info(stackLines.join("\n at "));
        }

        var method = inProcess.get(methodId) || null;

        if (method !== null) {
          method.debugData[0].endTimestamps = this.getDateTime(new Date());
          method.debugData[0].returnValue = JSON.stringify(result);
          method.debugData[0].message = stackLines.join(' at ');

          this.postBackLog(method);

          inProcess.remove(methodId);
        }
    }
  },

  // TODO: Must replace this
  getDateTime: function (value) {
    var now = new Date(value);
    var hour = now.getHours();
    var minute = now.getMinutes();
    var second = now.getSeconds();

    if (second < 0) {
      second = second + 60;
      minute = minute - 1;
    }
    if (minute < 0) {
      minute = minute + 60;
      hour = hour - 1;
    }
    if (hour <= 0) {
      hour = hour + 24;
      now.setDate(now.getDate() - 1);
    }

    var year = now.getFullYear();
    var month = now.getMonth() + 1;
    var day = now.getDate();

    if (month.toString().length == 1) {
      month = '0' + month;
    }
    if (day.toString().length == 1) {
      day = '0' + day;
    }
    if (hour.toString().length == 1) {
      hour = '0' + hour;
    }
    if (minute.toString().length == 1) {
      minute = '0' + minute;
    }
    if (second.toString().length == 1) {
      second = '0' + second;
    }

    var dateTime = year + '.' + month + '.' + day + '.' + hour + '.' + minute + '.' + second;

    return dateTime;
  },

  createGuid: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
  },

  // End general utils
  connectHooks: function () {
    var that = this;

    function hook(obj, moduleName) {
        var methodId = null;
        // Hook every obj method. Note: if obj's methods were enumerable, the second
        // argument could be omitted. Since they aren't, an array of properties to hook
        // must be explicitly passed. Non-method properties will be skipped.
        // See a more generic example here: http://bit.ly/vvJlrS
        hooker.hook(obj, Object.getOwnPropertyNames(obj), {
            passName: true,
            pre: function(name) {
              var start = new Date();
              methodId = start.getTime();

              instruments.handlePreMessage([].slice.call(arguments, 1), name, moduleName, start, methodId);
            },
            post: function(result, name) {
              instruments.handlePostMessate(result, name, moduleName, methodId);
            }
        });
    }

    config.lookup.forEach(function (module, index) {
      if (module.selected === true) {
        var moduleToHook = instruments.getModule(module.sourceFile);

        if (moduleToHook.length > 0) {
          if (instruments.alreadyHooked.get(module.sourceFile) !== undefined) {
            // TODO: Don't forget to fix that
            // The scanned flag rendres the updatable configuration useless
            if (instruments.alreadyHooked.get(module.sourceFile).scanned === false) {
              hook(moduleToHook[0].module[0], module.sourceFile);
              instruments.alreadyHooked.get(module.sourceFile).scanned = true;
            }
          }
        }
      }
    });
  }
};

module.exports = instruments;