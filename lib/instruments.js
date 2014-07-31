var config = require('./config'),
    logger = require('./logger'),
    http = require('https'),
    map = require('./map'),
    callsite = require('callsite'),
    path = require('path'),
    util = require('util'),
    array = require('./array');

var inProcess = new map();


var instruments = {
    // Start configuration helpers
    config: {
        exclude: config.exclude || [],
        lookup: config.lookup,
        logAnonumousFunctions: config.logAnonumousFunctions || false
    },


    isActive: function() {
        return config.active || true;
    },

    shouldCreateTempCopy: function() {
        return config.createTempCopyOfInstrumention || false;
    },

    // End configuration helpers

    // Start handle creating and populating objects
    objToJSON: function(obj) {
        if (typeof obj === "object") {
            if (obj === null)
                return 'null';
            else if (obj.length === 1) {
                return obj.toString();
            } else {
                obj = util.inspect(obj);
                return JSON.stringify(obj);
            }
        } else {
            return obj;
        }
    },

    formatReturnValue: function(obj) {
        if (obj.arguments.length > 0) {
            if (obj.arguments.length === 1) {
                return obj.arguments[0];
            }
        }

        return null;
    },

    prepareLogObject: function() {
        var logObject = {
            "debugData": []
        };

        return logObject;
    },

    prepareLogFunction: function(log) {
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

    prepareLogTextsEnd: function(signature, returnValue, filename) {
        var formattedReturnValue = 'undefined';
        if (returnValue !== undefined)
            formattedReturnValue = this.objToJSON(returnValue);
        filenameOnly = path.basename(filename).toString();

        var result = {
            funcText: ((signature === '') ? 'An anonymous function ' : signature),
            argsText: ' ' + formattedReturnValue,
            filename: filenameOnly.toString()
        };

        return result;
    },

    prepareLogTexts: function(signature, args, filename, lineNumber, timestamp) {
        var formattedArgs = '';

        if (args !== undefined) {
            if ((Object.prototype.toString.call(args) === '[object Array]') ||
                (Object.prototype.toString.call(args) === '[object Object]')) {
                formattedArgs = this.objToJSON(args);
            } else {
                formattedArgs = args;
            }
        }

        filenameOnly = path.basename(filename).toString();

        var result = {
            startTimestamps: this.getDateTime(timestamp),
            funcText: ((signature === '') ? 'An anonymous function ' : signature),
            argsText: ' (' + formattedArgs + ')',
            filename: filenameOnly.toString(),
            lineNumber: lineNumber
        };

        return result;
    },


    // Format output
    prepareLogMessage: function(logText, direction) {

        var that = this;

        function formatMessage(filename, funcText, argsText, lineno, direction) {
            if (direction === 'incoming') {
                return filename + ' => ' + funcText + argsText + ' line#: ' + lineno;
            } else {
                return filename + ' <= ' + funcText + argsText;
            }
        }

        var formattedMessage = '';

        if ((logText.funcText !== 'An anonymous function ') && (logText.funcText !== 'anonymous_function')) {
            if (that.shouldWrapFunction(logText.filename, logText.funcText, logText.lineNumber)) {
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

    // Start filtering helpers
    shouldWrapFunction: function(filename, signature, lineNumber) {
        lookingFor = this.shortenFileName(filename);
        var foundIt = false;

        // If we have no filter loaded return false
        if (config.lookup) {
            var module = config.lookup.filter(function(item) {
                if (item.selected === true) {
                    if (lineNumber) {
                        // Must add this 1 to compensate for the addition of our own "require"
                        return ((item.sourceFile === lookingFor) && ((item.line + 1) == parseInt(lineNumber, 10)));
                    } else {
                        return (item.sourceFile === lookingFor);
                    }
                }

                return;
            });

            if (module.length === 1) {
                if (module[0].selected === true) {
                    foundIt = true;
                }
            }
        }

        return foundIt;

    },

    shortenFileName: function(filename) {
        return path.basename(filename);
    },

    filenameForCache: function(filename) {
        // normalize and replace '\' with '|' if needed
        if (path.sep === '\\')
            return path.normalize(filename).replace(/\\/g, '|');
        else
            return path.normalize(filename);
    },

    getModuleNameFromFilename: function(filename) {
        return path.basename(filename, path.extname(filename));
    },

    isModuleIncluded: function(filename) {
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

    getModule: function(filename) {
        var that = this;

        return (that.objects.filter(function(module) {
            return (that.shortenFileName(module.filename) === filename);
        }));
    },

    // End filtering helpers
    postBackLog: function(logObject) {
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

        var request = http.request(options, function(response) {
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

        request.on('error', function(e) {
            logger.error("An error has occured, " + e.message);
        });

        request.write(logObjectString);
        request.end();
    },

    handlePreMessage: function(name, args, moduleName, start, methodId, line_number) {
        if (this.shouldWrapFunction(moduleName, name ,line_number)) {
            var log = this.prepareLogTexts(name, args, moduleName, line_number, start);

            var message = this.prepareLogMessage(log, 'incoming');

            logger.remote(message);

            // Prepare and push
            var method = this.prepareLogObject();

            method.debugData.push(this.prepareLogFunction(log));

            inProcess.put(methodId, method);
        }
    },

    handlePostMessage: function(name, result, moduleName, line_number, methodId) {
        if (this.shouldWrapFunction(moduleName, name ,line_number)) {
            var log = this.prepareLogTexts(name, result, moduleName);

            var message = this.prepareLogMessage(log, 'outgoing');

            var method = inProcess.get(methodId) || null;

            if (method !== null) {

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

                method.debugData[0].endTimestamps = this.getDateTime(new Date());
                method.debugData[0].returnValue = JSON.stringify(result);
                method.debugData[0].message = stackLines.join(' at ');

                this.postBackLog(method);

                inProcess.remove(methodId);
            }
        }
    },

    // TODO: Must replace this
    getDateTime: function(value) {
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
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // End general utils
};

module.exports = instruments;