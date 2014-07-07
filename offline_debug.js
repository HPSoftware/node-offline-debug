var instruments = require('./lib/instruments'),
  Module    = require('module').Module,
  path        = require('path'),
  read        = require('fs').readFileSync,
  EE          = require('events').EventEmitter,
  falafel     = require('falafel'),
  util        = require('util'),
  strings     = require('./lib/strings'),
  map         = require('./lib/map');
  //, burrito = require('burrito')

var ExecutionContext = function() {
  this.functions  = [];
  this.guids      = {};
  this.stackDepth = 0;
  EE.call(this);
};

var inProcess = new map(),
  functionHasEnded = false;

ExecutionContext.prototype = new EE();

ExecutionContext.prototype.store = function(fn, start, end) {
  fn.__guid &&
  this.functions[fn.__guid] &&
    this.functions[fn.__guid].invoke(start, end);
};

function CustomError (msg) {
  Error.call(this);

  // By default, V8 limits the stack trace size to 10 frames.
  Error.stackTraceLimit = 10;

  // Customizing stack traces
  Error.prepareStackTrace = function (err, stack) {
    return stack;
  };

  Error.captureStackTrace(this, arguments.callee);

  this.message = msg;
  this.name = 'CustomError';
}

CustomError.prototype.__proto__ = Error.prototype;

var cache = function(fn) {
  var ret = function() {
    this.__cache__ = this.__cache__ || {};
    return this.__cache__[fn] ?
           (this.__cache__[fn]) :
           (this.__cache__[fn] = fn.call(this));
  };
  return ret;
};

function transformNodeSource(src, node) {
  //var data = read(__filename, 'utf8').split('\n');
  src = src.replace('{', '{ var __callop__ = __start(arguments.callee, arguments, __filename, ' + node.loc.start.line + '); try {');
  // covers both functions ending with }) and just }
  src = src.replace(/\}\)$/, ';} finally { __callop__.end() } })');
  src = src.replace(/\}$/, ';} finally { __callop__.end() } }');

  //return '__decl('+str+', __filename, '+node.node[0].start.line+')';
  return src;
}

var wrap_code = function(src, filename) {
  if (instruments.isActive()) {
    if (instruments.isModuleIncluded(filename)) {
      return falafel(src, { 'loc': true } ,function(node) {
        switch(node.type) { // falafel
          case 'FunctionDeclaration':
          case 'FunctionExpression':
            var src = node.source();
            node.update(transformNodeSource(src, node, filename)); // falafel
            break;
        }
      });
    }
  }
  return src;
};

var contribute_to_context = function(context, executionContext) {

  context.__start = function(fn, args, filename, lineno) {
    var start = new Date();
    var methodId = start.getTime();

    // turn arguments into a true array
    args = Array.prototype.slice.call(args);

    var log = instruments.prepareLogTexts(fn.name, args, filename, lineno, start);

    var message = instruments.prepareLogMessage(log, 'incoming');

    if (message.length > 0) {
      console.error(message);
      // Prepare and push
      var method = instruments.prepareLogObject();

      method.debugData.push(instruments.prepareLogFunction(log));

      inProcess.put(methodId, method);
    }

    return {
      end: function() {
        var log = instruments.prepareLogTexts(fn.name, Array.prototype.slice.call(args), filename, lineno, start);

        var message = instruments.prepareLogMessage(log, 'outgoing');

        if (message.length > 0) {

          var error = new Error();
          var stack = JSON.stringify(error, ['stack'], 2) || null,
            stackLines = [];

          if (stack) {
            stack = stack.replace('{', '').replace('}', '');

            stackLines = stack.split(" at ");
            stackLines.shift();
            stackLines.shift();

            console.error(stackLines.join(" at "));
          }

        // var stack1 = stackTrace.get();
        // var err = new Error('something went wrong');
        // var trace = stackTrace.parse(err);

        // console.error(trace);

        // var config = {
        //   configurable: true,
        //   value: function() {
        //     var alt = {};
        //     var storeKey = function(key) {
        //       alt[key] = this[key];
        //     };
        //     Object.getOwnPropertyNames(this).forEach(storeKey, this);
        //     return alt;
        //   }
        // };

        // Object.defineProperty(Error.prototype, 'toJSON', config);
        // var error = new Error('something broke');
        // error.inner = new Error('some inner thing broke');
        // error.code = '500c';
        // error.severity = 'high';
        // var simpleError = JSON.parse(JSON.stringify(error));
        // var msg1 = prettyjson.render(simpleError);

        // console.error(msg1);

        // var ce = new CustomError('`foo` has been removed in favorof `bar`');
          // }

          console.error(message);
          var method = inProcess.get(methodId) || null;

          if (method !== null) {
            method.debugData[0].endTimestamps = instruments.getDateTime(new Date());
            //method.debugData[0].returnValue = JSON.stringify(log.argsText);
            method.debugData[0].message = stackLines.join(' at ');
            instruments.postBackLog(method);
            inProcess.remove(methodId);
          }
        }
      }
    };
  };

  return context;
};

var node_environment = function(context, module, filename) {
    var req = function(path) {
      return Module._load(path, module);
    };
    req.resolve = function(request) {
      return Module._resolveFilename(request, module)[1];
    };
    req.paths = Module._paths;
    req.main = process.mainModule;
    req.extensions = Module._extensions;
    req.registerExtension = function() {
      throw new Error('require.registerExtension() removed. Use ' +
                      'require.extensions instead.');
    };
    require.cache = Module._cache;

    for(var k in global) {
      context[k] = global[k];
    }

    context.require = req;
    context.exports = module.exports;
    context.__filename = filename;
    context.__dirname = path.dirname(filename);
    context.process = process;
    context.console = console;
    context.module = module;
    context.global = context;

    return context;
};

module.exports = function(match) {
  var original_require  = require.extensions['.js'],
    execution_context   = new ExecutionContext(),
    context             = contribute_to_context({}, execution_context);

    match = typeof match === 'string' ?
      new RegExp(match.replace(/\//g, '\\/').replace(/\./g, '\\.')) :
          match === undefined ?
              /.*/g : match;

    require.extensions['.js'] = function(module, filename) {
      if (!match.test(filename)) {
        return original_require(module, filename);
      }

      var module_context = {},
        src = read(filename, 'utf8'),
        orig = src,
        wrapper = function(s) {
          return 'return (function(ctxt) { return (function(__start, __decl) { return '+s+'; })(ctxt.__start, ctxt.__decl); })';
        };

        src = wrap_code(src, filename);

        node_environment(module_context, module, filename);

        var apply_execution_context = module._compile(wrapper(Module.wrap(src)), filename),
          execute_module = apply_execution_context(context),
          args;

        args = [
            module_context.exports,
            module_context.require,
            module,
            filename,
            module_context.__dirname,
            orig
          ];

        return execute_module.apply(module.exports, args);
    };

    var complete = function (fn) {
      fn(execution_context.functions.slice(), helpers);
    };

    complete.release = function () {
      require.extensions['.js'] = original_require;
    };

    complete.on = function (what, fn) {
      execution_context.on(what, fn);
    };
    return complete;
};