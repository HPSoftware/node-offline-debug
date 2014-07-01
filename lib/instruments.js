var config = require('./config');

var instruments = {
    config: {
      active: config.active || true,
      exclude: config.exclude || [],
      lookup: config.lookup,
      logAnonumousFunctions: config.logAnonumousFunctions || false
    },


    isActive: function () {

    },

    prepareLogObject: function () {
      var logObject = {
        "debugData": []
      };

      return logObject;
    },

    prepareLogFunction: function (log) {
      var logObj = {
          "start": log.timestamp,
          "functionName": log.funcName || "anonymous",
          "functionFile": log.filename,
          "parameters": log.argsText,
          "returnValue": null,  // ???
          "flowId": null, // ??
          "message": "Start function",
          "end": null
      };

      return logObj;
    },

    prepareLogTexts: function (signature, args, filename, lineno, timestamp) {
      var result = {
        timestamp: timestamp,
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

    if (logText.funcText !== '') {
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
    lookingFor = this.shortenFileName(filename);

    // If we have no filter loaded return false
    if (config.lookup) {
      var module = config.lookup.filter(function (item) {
          return (item.sourceFile === lookingFor.toString());
      });

      if (module.length === 1) {
          if (module[0].selected === true) {
              return true;
          }
      }
    }

    return false;
  },

  shortenFileName: function (filename) {
    return filename.cutFromLastIndexOf('/');
  },

  getModuleNameFromFilename: function (filename) {
    return this.shortenFileName(filename).cutUpToLastIndexOf('.');
  },

  // Need to extend this one to include module sub pathes
  isModuleIncluded: function (filename) {
    var moduleName = this.getModuleNameFromFilename(filename);

    return (config.exclude.indexOf(moduleName) === -1);
  }
};


module.exports = instruments;