var instruments = require('./lib/instruments'),
    Module = require('module').Module,
    path = require('path'),
    read = require('fs').readFileSync,
    EE = require('events').EventEmitter,
    falafel = require('falafel'),
    util = require('util'),
    strings = require('./lib/strings'),
    callsite = require('callsite'),
    assert = require('assert'),
    logger = require('./lib/logger'),
    map = require('./lib/map'),
    mkdirp = require('mkdirp'),
    identifier = require('identifier'),
    os = require('os'),
    write = require('fs').writeFileSync;

var instruments_require_string = 'var __instruments = require(\'node_offline_debug\');\n';

function injectNameToFunction(src, fn_name) {
    if (src.lastIndexOf('function(', 0) === 0) // check if there is a whitespace after 'function'
        src = src.replace('(', ' ' + fn_name + '(');
    else
        src = src.replace('(', fn_name + '(');
    return src;
}

function transformNodeSource(src, filename, fn_name, line_number) {
    src = src.replace('{',
        '{\n' +
        'var start = new Date();\n' +
        'var methodId = start.getTime();\n' +
        '__instruments.handlePreMessage(\'' + fn_name +'\', [].slice.call(arguments, 0), \'' + filename + '\', start, methodId, \'' + line_number + '\');\n' +
        'var retVal;\n' +
        ' try {\n');
    // covers both functions ending with }) and just }
    // TODO: performance efficient replacing
    var finally_string = '} finally {\n' +
        '__instruments.handlePostMessage(\'' + fn_name + '\',retVal, \'' + filename + '\', methodId);\n' +
        ' }\n' +
        '}'; // the last curly { is for the function itself
    src = src.replace(/\}\)$/, finally_string + ')');
    src = src.replace(/\}$/, finally_string);

    return src;
}

function transformReturnSource(src)
{
  // use paranthesis and comma (,) to asign the return value to retVal and then return it
  src = src.replace('return ','return (retval=(\n');
  src = src + '\n), retVal);\n';

  return src;
}

var wrap_code = function(src, filename) {
    if (instruments.isActive()) {
        if (instruments.isModuleIncluded(filename)) {
            return falafel(src, {
                'loc': true
            }, function(node) {
                switch (node.type) {
                    case 'FunctionDeclaration':
                    case 'FunctionExpression':
                        var src = node.source();
                        var fn_name;
                        var args = [];
                        var fn_start_line = node.loc.start.line;

                        for (var i = 0; i < node.params.length; ++i) {
                            args.push(node.params[i].name);
                        }

                        if (node.id) {
                            fn_name = node.id.name;
                        } else {
                            fn_name = identifier(6);
                            // inject generated name to an anon function
                            src = injectNameToFunction(src, fn_name);
                        }

                        // TODO: use full filenames, like in filenameForCache
                        //     - need to change every other lookup as well, including config
                        var filename_lookup = instruments.shortenFileName(filename);

                        src = transformNodeSource(src, filename_lookup, fn_name, fn_start_line);

                        node.update(src);

                        break;
                    case 'ReturnStatement':
                        // TODO: encapsulate return statement with paranthesis
                        //    and comma (orginal,set retVal)
                        var src = node.source();
                        src = transformReturnSource(src);
                        node.update(src);
                        break;
                }
            });
        }
    }
    return src;
};

module.exports = function(match) {
    var original_require = require.extensions['.js']; //,
    //execution_context   = new ExecutionContext(),
    //context             = contribute_to_context({}, execution_context);

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

        // inject a reference to instruments, so we can later use it to record function calls
        if (instruments.isModuleIncluded(filename)) {
            src = instruments_require_string + src;
            src = wrap_code(src, filename).toString();

            logger.warn(filename);
        }

        /* save instrumented code for instrumentation research */
        if (instruments.shouldCreateTempCopy()) {
            var isWin = /^win/.test(process.platform),
                tmp_file = '', tmp_file_path = '';
            if (isWin) {
                tmp_file = "./tmp/" + filename.replace(':\\', '');
                tmp_file_path = tmp_file.substring(0, tmp_file.lastIndexOf('\\'));
            } else {

            }

            if (tmp.length > 0) {
                mkdirp.sync(tmp_file_path);
                write(tmp_file, src);
            }
        }
        /* end saving instrumented code */

        return module._compile(src, filename);
    };
};
