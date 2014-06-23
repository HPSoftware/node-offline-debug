var 
  Module  = require('module').Module
  , path    = require('path')
  , read    = require('fs').readFileSync
  , EE      = require('events').EventEmitter
  , falafel = require('falafel')
  //, burrito = require('burrito')

var ExecutionContext = function() {
  this.functions  = []
  this.guids      = {}
  this.stackDepth = 0
  EE.call(this)
}

ExecutionContext.prototype = new EE

ExecutionContext.prototype.store = function(fn, start, end) {
  fn.__guid &&
  this.functions[fn.__guid] &&
    this.functions[fn.__guid].invoke(start, end)
}

var Tap = function(fn, filename, line) {
  this.tapped_function  = fn
  this.calls            = []
  this.filename         = filename
  this.line             = line
}

var cache = function(fn) {
  var ret = function() {
    this.__cache__ = this.__cache__ || {}
    return this.__cache__[fn] ?
           (this.__cache__[fn]) :
           (this.__cache__[fn] = fn.call(this));
  }
  return ret;
}

Tap.prototype.invoke = function(start, end) {
  this.calls.push({start:start, end:end})
}

Tap.prototype.min = cache(function() {
  return Math.min.apply(Math, this.calls.map(function(call) {
    return call.end-call.start      
  }))
})

Tap.prototype.max = cache(function() {
  return Math.max.apply(Math, this.calls.map(function(call) {
    return call.end-call.start 
  }))
})

Tap.prototype.total = cache(function() {
  return this.calls.length ?
      this.calls
        .map(function(call) { return call.end-call.start })
        .reduce(function(lhs, rhs) { return lhs + rhs }, 0) :
      0
})

Tap.prototype.avg = cache(function() {
  return this.calls.length ?
    this.total() / this.calls.length    : 
    -Infinity
})

Tap.prototype.source = cache(function() {
  var data = read(this.filename, 'utf8').split('\n')
  return data[this.line]
});

function transformNodeSource(src) {
          src = src.replace('{', '{ var __callop__ = __start(arguments.callee, arguments); try {');
          // covers both functions ending with }) and just }
          src = src.replace(/\}\)$/, ';} finally { __callop__.end() } })');
          src = src.replace(/\}$/, ';} finally { __callop__.end() } }');
          //return '__decl('+str+', __filename, '+node.node[0].start.line+')';
          return src;
        };

var wrap_code = function(src) {
  return falafel(src, function(node) {
    switch(node.type){ // falafel
      case 'FunctionDeclaration':
      case 'FunctionExpression':
    /*switch(node.name) { // burrito
      //case 'function':
      //case 'defun':
      case 'never':*/
        var src = node.source();
        //console.log('instrument function: '+node.id);
        //node.wrap(transformNodeSource); // burrito
        node.update(transformNodeSource(src)); // falafel
      break;
      default: 
      /*
        var src = node.source();
        console.log('instrument type: '+node.type+' with src: '+src);
      */
      break;
    }
  })
}

var contribute_to_context = function(context, executionContext) {

  context.__start = function(fn, args) {
    var start = Date.now()
    // turn arguments into a true array
    args = Array.prototype.slice.call(args);
    console.error('function called: '+fn.name+' with args: '+args);
    executionContext.stackDepth++

    executionContext.functions[fn.__guid] &&
    executionContext.emit('tap', executionContext.functions[fn.__guid], executionContext)

    return {
      'end':function() {
        // turn arguments into a true array
        args = Array.prototype.slice.call(args);        
        console.error('function return: '+fn.name+' with args: '+args);
        executionContext.store(fn, start, Date.now())
        executionContext.stackDepth--
      }
    }
  }

  context.__decl = function(fn, filename, lineno) {
    var key = fn+''+filename+lineno;
    if(!executionContext.guids[key]) {
      executionContext.guids[key] = fn.__guid = executionContext.functions.push(new Tap(fn, filename, lineno))
    } else {
      fn.__guid = executionContext.guids[key]
    }
    return fn
  }

  return context
}

var node_environment = function(context, module, filename) {
    var req = function(path) {
      return Module._load(path, module);
    };
    req.resolve = function(request) {
      return Module._resolveFilename(request, module)[1];
    }
    req.paths = Module._paths;
    req.main = process.mainModule;
    req.extensions = Module._extensions;
    req.registerExtension = function() {
      throw new Error('require.registerExtension() removed. Use ' +
                      'require.extensions instead.');
    }
    require.cache = Module._cache;

    for(var k in global)
      context[k] = global[k];

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

var helpers = {
    calls:function(lhs, rhs) {
      if(lhs.calls.length < rhs.calls.length) return 1;
      if(lhs.calls.length > rhs.calls.length) return -1;
      return 0
    }
  , min:function(lhs, rhs) {
      if(lhs.min() < rhs.min()) return 1;
      if(lhs.min() > rhs.min()) return -1;
      return 0
    }
  , max:function(lhs, rhs) {
      if(lhs.max() < rhs.max()) return 1;
      if(lhs.max() > rhs.max()) return -1;
      return 0
    }
  , avg:function(lhs, rhs) {
      if(lhs.avg() < rhs.avg()) return 1;
      if(lhs.avg() > rhs.avg()) return -1;
      return 0
    }
  , total:function(lhs, rhs) {
      if(lhs.total() < rhs.total()) return 1;
      if(lhs.total() > rhs.total()) return -1;
      return 0
    }
}

module.exports = function(match) {
  var original_require  = require.extensions['.js']
    , execution_context = new ExecutionContext
    , context           = contribute_to_context({}, execution_context)

  match = typeof match === 'string' ?
            new RegExp(match.replace(/\//g, '\\/').replace(/\./g, '\\.')) :
          match === undefined ?
            /.*/g                                                         :
            match

  require.extensions['.js'] = function(module, filename) {
    if(!match.test(filename))
      return original_require(module, filename)

    var module_context = {}
      , src            = wrap_code(read(filename, 'utf8'))
      , wrapper        = function(s) { 
        return 'return (function(ctxt) { return (function(__start, __decl) { return '+s+'; })(ctxt.__start, ctxt.__decl); })' 
      };

    node_environment(module_context, module, filename)

    var apply_execution_context = module._compile(wrapper(Module.wrap(src)), filename)
      , execute_module          = apply_execution_context(context)
      , args

    args = [
        module_context.exports
      , module_context.require
      , module
      , filename
      , module_context.__dirname
    ]

    return execute_module.apply(module.exports, args)
  }

  var complete = function(fn) {
    fn(execution_context.functions.slice(), helpers)
  }
  complete.release = function() {
    require.extensions['.js'] = original_require
  }
  complete.on   = function(what, fn) {
    execution_context.on(what, fn)
  }
  return complete
}

