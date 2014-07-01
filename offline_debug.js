var instruments = require('./lib/instruments'),
  Module    = require('module').Module,
  path        = require('path'),
  read        = require('fs').readFileSync,
  EE          = require('events').EventEmitter,
  falafel     = require('falafel'),
  strings     = require('./lib/strings'),
  map         = require('./lib/map');
  //, burrito = require('burrito')

var ExecutionContext = function() {
  this.functions  = [];
  this.guids      = {};
  this.stackDepth = 0;
  EE.call(this);
};

var inProcess = new map();
var stream = [];

ExecutionContext.prototype = new EE();

ExecutionContext.prototype.store = function(fn, start, end) {
  fn.__guid &&
  this.functions[fn.__guid] &&
    this.functions[fn.__guid].invoke(start, end);
};

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
  if (instruments.config.active) {
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
    var start = new Date().getTime() / 1000;

    var log = instruments.prepareLogTexts(fn.name, args, filename, lineno, start);

    var message = instruments.prepareLogMessage(log, 'incoming');
    // turn arguments into a true array
    args = Array.prototype.slice.call(args);

    if (message.length > 0) {
      console.error(message);
      // Prepare and push
      var method = instruments.prepareLogObject();

      method.debugData.push(instruments.prepareLogFunction(log));

      inProcess.put(start, method);
    }

    return {
      'end':function() {

        var log = instruments.prepareLogTexts(fn.name, Array.prototype.slice.call(args), filename, lineno, start);

        var message = instruments.prepareLogMessage(log, 'outgoing');

        if (message.length > 0) {
          console.error(message);
          var method = inProcess.get(start) || null;

          if (method !== null) {
            method.debugData[0].end = new Date().getTime() / 1000;
            method.debugData[0].returnValue = log.argsText;
            stream.push(method);
            inProcess.remove(start);
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
            module_context.__dirname
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