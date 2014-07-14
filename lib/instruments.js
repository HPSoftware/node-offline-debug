var config = require('./config'),
  logger = require('./logger'),
  http = require('https');

var instruments = {
    // Start configuration helpers
    config: {
      exclude: config.exclude || [],
      lookup: config.lookup,
      logAnonumousFunctions: config.logAnonumousFunctions || false
    },


    isActive: function () {
      return config.active || true;
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
      var result = {
        startTimestamps: this.getDateTime(timestamp),
        funcText: ((signature === '') ? 'An anonymous function ' : signature),
        argsText: ((args.length === 0) ? ', no arguments' : ' (' +  args + ')'),
        filename: filename.cutFromLastIndexOf('/'),
        lineNumber: lineno
      };

      return result;
    },

  // Format output
  prepareLogMessage: function (logText, direction) {

    var that = this;

    function formatMessage (filename, funcText, argsText, lineno, direction) {
        if (direction === 'incoming') {
          return filename + ' => ' + funcText + argsText + ' line#: ' + lineno;
        } else {
           return filename + ' <= ' + funcText + argsText + ' line#: ' + lineno;
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

  // End handle creating and populating objects

  // Start filtering helpers
  shouldWrapFunction: function (filename, signature) {
    lookingFor = this.shortenFileName(filename);

    // If we have no filter loaded return false
    if (config.lookup) {
      var module = config.lookup.filter(function (item) {
          return (item.sourceFile === lookingFor);
      });

      if (module.length === 1) {
          if (module[0].selected === true) {
              return true;
          }
      }
    }

    return false;
  },

  isModuleIncluded: function (filename) {
    var moduleName = this.getModuleNameFromFilename(filename);

    return (config.exclude.indexOf(moduleName) === -1);
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

  // Start general utils
  shortenFileName: function (filename) {
    return filename.cutFromLastIndexOf('/').toString();
  },

  getModuleNameFromFilename: function (filename) {
    return this.shortenFileName(filename).cutUpToLastIndexOf('.');
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
  }
  // End general utils
};

module.exports = instruments;