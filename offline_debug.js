var instruments = require('./lib/instruments'),
  Module    = require('module').Module,
  path        = require('path'),
  read        = require('fs').readFileSync,
  EE          = require('events').EventEmitter,
  falafel     = require('falafel'),
  util        = require('util'),
  strings     = require('./lib/strings'),
  callsite    = require('callsite'),
  assert      = require('assert'),
  //logger      = require('./lib/logger'),
  map         = require('./lib/map');
  //, burrito = require('burrito')

var first = 5;

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

var cache = function(fn) {
  var ret = function() {
    this.__cache__ = this.__cache__ || {};
    return this.__cache__[fn] ?
           (this.__cache__[fn]) :
           (this.__cache__[fn] = fn.call(this));
  };
  return ret;
};

// function transformNodeSource(src, node) {
//   //var data = read(__filename, 'utf8').split('\n');
//   src = src.replace('{', '{ var __callop__ = __start(arguments.callee, arguments, __filename, ' + node.loc.start.line + '); try {');
//   // covers both functions ending with }) and just }
//   src = src.replace(/\}\)$/, ';} finally { __callop__.end() } })');
//   src = src.replace(/\}$/, ';} finally { __callop__.end() } }');

//   //return '__decl('+str+', __filename, '+node.node[0].start.line+')';
//   return src;
// }

function transformNodeArgs(fn_signature, args, _args) {
  fn_signature = fn_signature.replace(/\(.*\)/,'('+_args.join(',')+')');
  return fn_signature;
}

function transformNodeSource(src, args, _args, node) {
  // split at first {, replace the signature and re-combine at the end
  var fn_signature ='';
  if (args.length > 0) {
    var indexOfBracket = src.indexOf('{');
    fn_signature = src.substring(0,indexOfBracket);
    src = src.substring(indexOfBracket);
    //console.log('src after src split: '+src+'\n');
    //console.log('fn_signature after src split: '+fn_signature+'\n');

    fn_signature = transformNodeArgs(fn_signature, args, _args);
  }

  src = src.replace('{',
    '{ var __callop__ = __start(arguments.callee, arguments, __filename, ' + node.loc.start.line + ');'+
    'var retVal; try {'+
    'retVal = (function('+args.join(',')+'){');

  // covers both functions ending with }) and just }
  // TODO: If we get a global object "this" problem in strict mode consider using undefined
  var call_arguments = 'this';
  if (_args.length > 0)
    call_arguments = call_arguments +', '+ _args.join(', ');
  src = src.replace(/\}\)$/, '}).call('+call_arguments+');return retVal;} finally { __callop__.end(retVal) } })');
  src = src.replace(/\}$/, '}).call('+call_arguments+');return retVal;} finally { __callop__.end(retVal) } }');
  //return '__decl('+str+', __filename, '+node.node[0].start.line+')';
  return fn_signature + src;
}


var wrap_code = function(src, filename) {
  if (instruments.isActive()) {
    if (instruments.isModuleIncluded(filename)) {
      return falafel(src, { 'loc': true } ,function(node) {
        switch(node.type) { // falafel
          case 'FunctionDeclaration':
          case 'FunctionExpression':
            var src = node.source();
            var args = [], _args = [];

            for (var i = 0; i < node.params.length; ++i) {
              args.push(node.params[i].name);
              _args.push('__'+node.params[i].name);
            }

            if (false && first && args.length == 1 && args[0] == 'k') { //node.id && (node.id.name.indexOf('capitalize') >= 0))
              // logger.info('function source:\n' + src + '\n');
              // logger.info('function params:\n' + args.join(',') + '\n');
              // logger.info('\n\n');
              // logger.info('function new source:\n' + transformNodeSource(src, args, _args) + '\n');
              log.console('function source:\n' + src + '\n');
              log.console('function params:\n' + args.join(',') + '\n');
              log.console('\n\n');
              log.console('function new source:\n' + transformNodeSource(src, args, _args) + '\n');
              first--;
            }

            //node.wrap(transformNodeSource); // burrito
            node.update(transformNodeSource(src, args, _args, node)); // falafel
            // var src = node.source();
            // node.update(transformNodeSource(src, node)); // falafel
            // break;
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
      //logger.remote(message);
      console.error(message);
      // Prepare and push
      var method = instruments.prepareLogObject();

      method.debugData.push(instruments.prepareLogFunction(log));

      inProcess.put(methodId, method);
    }

    return {
      end: function() {
        var fixArgs = Array.prototype.slice.call(args);
        var log = instruments.prepareLogTexts(fn.name, fixArgs, filename, lineno, start);

        var message = instruments.prepareLogMessage(log, 'outgoing');

        if (message.length > 0) {

          var stackLines = [];

          callsite().forEach(function(site){
            var stackLine = [
              site.getFunctionName() || 'anonymous' + " ",
              site.getFileName() + " ",
              site.getLineNumber() + " "
            ].join();

            stackLines.push(stackLine);
          });

          if (stackLines) {
            stackLines.shift();

            //logger.verbose(stackLines.join("\n at "));
            console.log(stackLines.join("\n at "));
          }

          //logger.debug('function return: '+fn.name+' with return value: '+retVal+'\n');
          //logger.remote(message);
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
        wrapper = function(s) {
          return 'return (function(ctxt) { return (function(__start, __decl) { return ' + s + '; })(ctxt.__start, ctxt.__decl); })';
        };

        src = wrap_code(src, filename);

        node_environment(module_context, module, filename);

        console.log(filename);
        //logger.warning(filename);

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