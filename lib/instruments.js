var config = require('./config'),
    logger = require('./logger'),
    http = require('https'),
    map = require('./map'),
    traceback = require('traceback'),
    path = require('path'),
    util = require('util'),
    net = require('net'),
    array = require('./array');

var inProcess = new map();

var instruments = {
    // Start configuration helpers
    fnNameAndFilename: new map(),

    config: {
        exclude: config.exclude || [],
        lookup: config.lookup,
        logAnonymousFunctions: config.logAnonymousFunctions || false,
        nameAnonymousFunctions: config.nameAnonymousFunctions || false,
        useGivenNames: config.useGivenNames || false,
        globalLogLevel: config.logging.globalLogLevel || 'info'
    },

    setLoggerLevel: function (level) {
        logger.transports.console.level = level;
    },

    isActive: function() {
        return config.active || true;
    },

    shouldCreateTempCopy: function() {
        return config.createTempCopyOfInstrumention || false;
    },

    getFunctionGivenName: function (filename, lineNumber) {
        var func = this.shouldWrapFunction(filename, lineNumber);
        if (func.exists === true) {
            return func.module.functionName;
        }
    },

    // End configuration helpers

    // Start handle creating and populating objects
    objToJSON: function(obj) {
        var circularPropertiesSet = Object.create(null);

        function findAndMarkCriculars(obj) {
            var inspectedObj = util.inspect(obj);

            // Lookup circular refereces and mark it
            var circulars = inspectedObj.getIndicesOf('[Circular]');

            for (var i = 0; i < circulars.length; i++) {
                // "Look back" from the point we found the [Circular] keyword
                var keywordIndex = inspectedObj.lastIndexOf('\n', circulars[i]);
                var keyword = inspectedObj.substring(keywordIndex, circulars[i]).fulltrim();
                var keywordParts = keyword.split(':');
                keyword = keywordParts[0];

                if (!circularPropertiesSet[keyword]) {
                    circularPropertiesSet[keyword] = true;
                }
            }
        }

        if (typeof obj === "object") {
            if (obj === null)
                return 'null';
            else if (obj.length === 1) {
                return obj.toString();
            } else {
                findAndMarkCriculars(obj);

                // Run my own JSON stringify to avoid circular references
                var ret = JSON.stringify( obj, function( key, value) {
                    if (Object.prototype.toString.call(value) === '[object Object]') {
                        findAndMarkCriculars(value);
                    }

                    if (circularPropertiesSet[key] === true) { return value.id;}
                    else {return value;}
                });
                return ret;
            }
        } else {
            return obj;
        }
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
            "parameters": JSON.stringify(log.argsParsed),
            "returnValue": "",
            "flowId": "",
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

    prepareLogTexts: function(signature, argsNames, args, filename, lineNumber, timestamp, flowId) {
        var that = this,
            formattedArgs = '',
            argsNamesApart = argsNames.split(',') || [],
            argsParsed = [];

        function parseArg (arg) {
            if (arg !== undefined) {
                if ((Object.prototype.toString.call(arg) === '[object Array]') ||
                    (Object.prototype.toString.call(arg) === '[object Object]')) {
                    return that.objToJSON(arg);
                } else {
                    return arg;
                }
            }
        }

        for (var i = 0; i < argsNamesApart.length; i++) {
            if (argsNamesApart[i].length > 0) {
                argsParsed.push({ 'name': argsNamesApart[i], 'value': parseArg(args[i]) });
            }
        }

        formattedArgs = parseArg(args);

        filenameOnly = path.basename(filename).toString();

        var result = {
            startTimestamps: this.getDateTime(timestamp),
            funcText: ((signature === '') ? 'An anonymous function ' : signature),
            argsNames: argsNames,
            argsText: ' (' + formattedArgs + ')',
            argsParsed: argsParsed,
            filename: filenameOnly.toString(),
            lineNumber: lineNumber
        };

        if (flowId) {
            result.flowId = flowId;
        }

        return result;
    },


    // Format output
    prepareLogMessage: function(logObject, direction) {

        var that = this;

        function formatMessage(filename, funcText, argsNames, argsText, lineno, direction, flowId) {
            if (direction === 'incoming') {
                return filename + ' call ' + funcText + '(' + argsNames + ') -> ' + argsText + ' line#: ' + lineno + ', flowId: ' + flowId;
            } else {
                return filename + ' return ' + funcText + argsText;
            }
        }

        var formattedMessage = '';

        if ((logObject.funcText !== 'An anonymous function ') && (logObject.funcText !== 'anonymous_function')) {
            if (that.shouldWrapFunction(logObject.filename, logObject.lineNumber).exists === true) {
                formattedMessage = formatMessage(logObject.filename,
                    logObject.funcText, logObject.argsNames, logObject.argsText, logObject.lineNumber, direction, logObject.flowId);
            }
        } else {
            if (that.config.logAnonumousFunctions) {
                formattedMessage = formatMessage(logObject.filename,
                    logObject.funcText, logObject.argsNames, logObject.argsText, logObject.lineNumber, direction);
            }
        }

        return formattedMessage;
    },

    // Start filtering helpers
    shouldWrapFunction: function(filename, lineNumber) {
        lookingFor = this.shortenFileName(filename);
        var wrapFunction = {
            'exists': false,
            'module': undefined
        };

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
                    wrapFunction.exists = true;
                    wrapFunction.module = module[0];
                }
            }
        }

        return wrapFunction;

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
                    JSON.parse(logObjectString).debugData[0].functionFile +
                    ' with response code: '+ response.statusCode);
            });
        });

        request.on('error', function(e) {
            logger.error("An error has occured, " + e.message);
        });

        request.write(logObjectString);
        request.end();
    },

    // This methid currently handles only 1 level up
    // TODO: extend it to look up the process tree to find oldest parent
    lookupFunctionCallerCode: function (code) {
        var item = inProcess.current;
        for (var i = 0; i < inProcess.size; i++) {
            if (i === (inProcess.size - 1)) {
                if (item.value.flowId === code) {
                    return true;
                }
            }
            inProcess.next();
        }

        return false;
    },

    getCaller: function (name, filename, stack) {
        var method = '';

        for(var i = 1; i < stack.length; i++) {
            if ((stack[i].name === name) && (stack[i].file === filename)) {
                method = stack[i].fun.caller.name;
                break;
            }
        }

      return method; // changed 'debug' to canonical npmlog 'info'
    },

    handlePreMessage: function(name, argsNames, args, moduleName, start, methodId, lineNumber, isAnonymous) {
        if (this.shouldWrapFunction(moduleName, lineNumber).exists === true) {
            var flowId = name;  // Preserve name as potential flowId
            var callerFlowId = this.getCaller(name, moduleName, traceback());

            // Check if the caller flow id is the last function that was pushed into the
            // process stask, if so use the caller flowId
            if (this.lookupFunctionCallerCode(callerFlowId)) {
                flowId = callerFlowId;
            }

            if (config.useGivenNames) {
                name = this.getFunctionGivenName(moduleName, lineNumber);
            } else {
                if (isAnonymous) {
                    if (!config.nameAnonymousFunctions) {
                        name = 'anonymous function';
                    }
                }
            }
            var log = this.prepareLogTexts(name, argsNames ,args, moduleName, lineNumber, start, flowId);

            var message = this.prepareLogMessage(log, 'incoming');

            logger.remote(message);

            // Prepare and push
            var method = this.prepareLogObject();

            method.debugData.push(this.prepareLogFunction(log));
            method.flowId = flowId;

            inProcess.put(methodId, method);
        }
    },

    handlePostMessage: function(name, result, moduleName, lineNumber, methodId) {
        if (this.shouldWrapFunction(moduleName, lineNumber).exists === true) {
            var givenName = name;

            if (config.useGivenNames) {
                givenName = this.getFunctionGivenName(moduleName, lineNumber);
            }
            var log = this.prepareLogTexts(givenName, '', result, moduleName);

            var message = this.prepareLogMessage(log, 'outgoing');

            var method = inProcess.get(methodId) || null;

            if (method !== null) {

                logger.remote(message);

                var stackLines = this.getStackTrace(name, moduleName);

                logger.info(stackLines.join("\n at "));

                method.debugData[0].endTimestamps = this.getDateTime(new Date());
                method.debugData[0].returnValue = JSON.stringify(result);
                method.debugData[0].message = stackLines.join(' at ');

                this.postBackLog(method);

                inProcess.remove(methodId);
            }
        }
    },

    getStackTrace: function (name, filename) {
        var stackLines = [],
            stack = traceback(),
            logStack = false;

        for(var i = 1; i < stack.length; i++) {
            if (logStack === false) {
                if ((stack[i].name === name) && (stack[i].file === filename)) {
                    logStack = true;
                    i = i - 1;
                }
            } else {
                var stackLine = [
                    stack[i].name || 'anonymous' + " ",
                    ' (' + stack[i].path + ":",
                    stack[i].line + ":",
                    stack[i].col + ")"
                ].join('');

                stackLines.push(stackLine);
            }
        }

        return stackLines;
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
