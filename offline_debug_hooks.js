var instruments     = require('./lib/instruments'),
  Module            = require('module').Module,
  path              = require('path'),
  read              = require('fs').readFileSync,
  EE                = require('events').EventEmitter,
  falafel           = require('falafel'),
  util              = require('util'),
  strings           = require('./lib/strings'),
  map               = require('./lib/map'),
  identifier        = require('identifier'),
  mkdirp            = require('mkdirp'),
  write             = require('fs').writeFileSync,
  logger            = require('./lib/logger');

// Code taken from HP/Piano
var ExecutionContext = function() {
  this.functions  = [];
  this.guids      = {};
  this.stackDepth = 0;
  EE.call(this);
};

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

function injectNameToFunction(src, fn_name) {
  if (src.lastIndexOf('function(',0) === 0) // check if there is a whitespace after 'function' 
    src = src.replace('(',' '+fn_name+'(');
  else
    src = src.replace('(',fn_name+'(');
  return src;
}

var analyzeCode = function(src, filename) {
  if (instruments.isActive()) {
    if (instruments.isModuleIncluded(filename)) {
      return falafel(src, { 'loc': true }, function(node) {
        switch(node.type) { // falafel
          case 'FunctionDeclaration':
          case 'FunctionExpression':
            // The following code analyzes the anonymous functions and
            // does two things:
            // * Generate a random leagal javascript id and store it with the matching line number so we can try
            //   and get it later and hook it if we need to
            // * Do some code changes to similar to AST based version to invoke the start/end and get the
            //   unique id back

            // This is still work in progress and this code still doesn't work

            var src = node.source(),
              fn_name,
              key = instruments.createGuid(),
              fn_start_line = node.loc.start.line,
              shortenFilename = instruments.shortenFileName(filename),
              args = [], id;

            for (var i = 0; i < node.params.length; ++i) {
              args.push(node.params[i].name);
            }

            if (node.id) {
              fn_name = node.id.name;
            } else {
              fn_name = identifier(6);
              node.update(injectNameToFunction(src, fn_name)); // inject generated name
            }

            var module = instruments.alreadyHooked.get(shortenFilename);
            if (module === undefined) {
              module = { 'scanned': false, 'functions': new map() };
              instruments.alreadyHooked.put(shortenFilename, module);
            }

            module.functions.put(fn_name, {
              "line": fn_start_line,
              "signature": "function " + fn_name + " (" + args.join(',') + ")"
            });
          }
      });
    }
  }
  return src;
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
    context             = execution_context;

  match = typeof match === 'string' ?
    new RegExp(match.replace(/\//g, '\\/').replace(/\./g, '\\.')) :
        match === undefined ?
            /.*/g : match;

  require.extensions['.js'] = function(module, filename) {
    if (!match.test(filename)) {
      return original_require(module, filename);
    }

    var module_context = {},
    src = read(filename, 'utf8');

    wrapper = function(s) {
        //return 'return (function(ctxt) { return (function(__start, __decl) { return '+s+'; })(ctxt.__start, ctxt.__decl); })';
        return 'return (function(ctxt) { return (function() { return '+s+'; })(); })';
    };

    node_environment(module_context, module, filename);

    if (instruments.isModuleIncluded(filename)) {

      src = analyzeCode(src, filename);

      /* save instrumented code for instrumentation research */
      if (instruments.shouldCreateTempCopy)
      {
        var tmp_file = "./tmp/"+filename.replace(':\\','');
        var tmp_file_path = tmp_file.substring(0,tmp_file.lastIndexOf('\\'));

        mkdirp.sync(tmp_file_path);
        write(tmp_file, src);          
      }
      /* END save instrumneted */

      //logger.warn(filename);
    }

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

    if (instruments.isModuleIncluded(filename)) {
      instruments.objects.push({
        'name': instruments.getModuleNameFromFilename(filename),
        'filename': filename,
        'module': args });
    }

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

  complete.connectHooks = function () {
    instruments.connectHooks();
  };

  return complete;
};

// End of Code taken from HP/Piano