var winston = require('winston'),
    config = require('./config'),
    logger = require('./logger'),
    map = require('./map'),
    traceback = require('traceback'),
    path = require('path'),
    util = require('util'),
    strings = require('./strings'), // changes the prototype of strings, don't remove
    network = require('./network'),
    fileLoad = require('./file'),
    array = require('./array');

var inProcess = new map();

var instruments = {
    // Start configuration helpers
    lookupMap: {},
    instrumentedFunctionsID: {},
    instrumentedFunctionsIDCounter: 0,

    getFunctionUniqueID: function(filename, lineNumber) {
        var methodMark = filename + config.methodSignatureSeparator + lineNumber;
        var methodUID = this.instrumentedFunctionsID[methodMark];
        if (methodUID === undefined) {
            methodUID = this.instrumentedFunctionsIDCounter = this.instrumentedFunctionsIDCounter + 1;
            this.instrumentedFunctionsID[methodMark] = methodUID;
        }
        return methodUID;
    },

    isLoggerSet: function() {
        return (logger.initialized);
    },

    setLoggerWithConfiguration: function() {
        var transports = [],
            exceptionHandlers = [];
        var configured = {};

        if (config.logging.debug.log === true) {
            if (config.logging.debug.logToConsole === true) {
                transports.push(new winston.transports.Console({
                    json: false,
                    timestamp: true,
                    colorize: true
                }));
            }
            if (config.logging.debug.logToFile === true) {
                transports.push(new(winston.transports.DailyRotateFile)({
                    name: 'file',
                    datePattern: '.yyyy-MM-ddTHH',
                    filename: path.join(__dirname, "/" + config.logging.debug.filename + ".log")
                }));
            }
            configured.logging = true;
        }

        if (config.logging.exceptions.log === true) {
            if (config.logging.exceptions.logToConsole === true) {
                exceptionHandlers.push(new(winston.transports.Console)({
                    json: false,
                    timestamp: true,
                    colorize: true
                }));
            }
            if (config.logging.exceptions.logToFile === true) {
                exceptionHandlers.push(new(winston.transports.DailyRotateFile)({
                    name: 'file',
                    datePattern: '.yyyy-MM-ddTHH',
                    filename: path.join(__dirname, "/" + config.logging.exceptions.filename + ".log")
                }));
            }
            configured.exceptions = true;
        }

        if ((configured.logging) && (configured.exceptions)) {
            logger = new winston.Logger({
                "transports": transports,
                "exceptionHandlers": exceptionHandlers,
                "levels": config.logging.levels,
                "colors": config.logging.colors
            });
        } else {
            if (configured.logging) {
                logger = new winston.Logger({
                    "transports": transports,
                    "levels": config.logging.levels,
                    "colors": config.logging.colors
                });
            } else {
                if (configured.exceptions) {
                    logger = new winston.Logger({
                        "exceptionHandlers": exceptionHandlers,
                        "levels": config.logging.levels,
                        "colors": config.logging.colors
                    });
                } else {
                    return;
                }
            }
        }

        logger.initialized = true;
        logger.exitOnerror = true;
    },

    setLoggerLevel: function(level) {
        logger.transports.console.level = level;
    },

    shouldCreateTempCopy: function() {
        return config.createTempCopyOfInstrumention;
    },

    getFunctionGivenName: function(filename, lineNumber) {
        var methodLookup = this.getFunctionUniqueID(filename, lineNumber);
        var func = this.lookupMap[methodLookup];
        if (func !== undefined && func.selected === true) {
            return func.functionName;
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
                var ret = JSON.stringify(obj, function(key, value) {
                    if (Object.prototype.toString.call(value) === '[object Object]') {
                        findAndMarkCriculars(value);
                    }

                    if (circularPropertiesSet[key] === true) {
                        return value.id;
                    } else {
                        return value;
                    }
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

    prepareLogTexts: function(name, argsNames, args, filename, timestamp, flowId) {
        var that = this,
            argsNamesApart = argsNames.split(',') || [],
            argsParsed = [];

        function parseArg(arg) {
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
                argsParsed.push({
                    'name': argsNamesApart[i],
                    'value': parseArg(args[i])
                });
            }
        }

        filenameOnly = path.basename(filename).toString();

        var result = {
            startTimestamps: this.getDateTime(timestamp),
            functionName: name,
            functionFile: filenameOnly.toString(),
            parameters: JSON.stringify(argsParsed),
            flowId: '',
        };

        if (flowId) {
            result.flowId = flowId;
        }

        return result;
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
            //that = this,
            excludeComponent = true;

        for (var index = 0; index < config.exclude.length; index++) {
            if (pathInParts.contains(config.exclude[index])) {
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

    getFlowId: function(name, filename, stack) {
        return null;

        // var caller = '';
        //
        // // Lookup the first 'callbacks' in the stack
        // // The first method before that call is the flowId
        // for (var i = 1; i < stack.length; i++) {
        //     if (stack[i].fun.caller.name.toLowerCase() === 'callbacks') {
        //         caller = stack[i].name;
        //         break;
        //     }
        // }
        //
        // return caller;

    },

    handlePreMessage: function(name, argsNames, args, moduleName, methodId, lineNumber) {
        var flowId = this.getFlowId(name, moduleName, traceback()) || '';
        var start = new Date(methodId);

        if (config.useGivenNames) {
            name = this.getFunctionGivenName(moduleName, lineNumber);
        } else {
            if ((typeof(name) === "string") && (name.length == 0)) {
                name = 'anonymous function';
            }
        }

        // Prepare and push
        var log = this.prepareLogTexts(name, argsNames, args, moduleName, start, flowId);

        var method = this.prepareLogObject();
        method.debugData.push(log);

        inProcess.put(methodId, method);
    },

    handlePostMessage: function(name, result, moduleName, lineNumber, methodId) {
        var method = inProcess.get(methodId) || null;

        if (method !== null) {
            var stackLines = this.getStackTrace(name, moduleName);

            method.debugData[0].endTimestamps = this.getDateTime(new Date());
            method.debugData[0].returnValue = JSON.stringify(result);
            method.debugData[0].message = stackLines.join(' at ');

            if (config.debug_service.type === 'service') {
                if (this.shouldPostToServer()) { // Prevent posting if no methods are selected (meaning there's no session in progress)
                    network.postLog(method, config.compressPosts);
                }
            } else if (config.debug_service.type === 'file') {
                logger.log(config.debug_service.outputLog, method);
            }

            inProcess.remove(methodId);
        }
    },

    shouldPostToServer: function () {
        var post = false;

        for (var i = 0; i < config.lookup.length; i++) {
            if (config.lookup[i].selected) {
                post = true;
                break;
            }
        }

        return post;
    },

    getStackTrace: function(name, filename) {
        var stackLines = [],
            stack = traceback(),
            logStack = false;

        for (var i = 2; i < stack.length; i++) {
            // Log the stack trace but drop the first line which is the instrumentation
            // Code below is too defensive
            // if (logStack === false) {
            //     if ((stack[i].name === name) && (stack[i].file === filename)) {
            //         logStack = true;
            //         i = i - 1;
            //     }
            // } else {
            var stackLine = [
                stack[i].name || 'anonymous' + " ",
                ' (' + stack[i].path + ":",
                stack[i].line + ":",
                stack[i].col + ")"
            ].join('');

            stackLines.push(stackLine);
            //}
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
    }

    // End general utils
};

module.exports = instruments;
