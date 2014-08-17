var instruments = require('./lib/instruments'),
    Module = require('module').Module,
    path = require('path'),
    read = require('fs').readFileSync,
    EE = require('events').EventEmitter,
    falafel = require('falafel'),
    util = require('util'),
    strings = require('./lib/strings'),
    logger = require('./lib/logger'),
    map = require('./lib/map'),
    mkdirp = require('mkdirp'),
    identifier = require('identifier'),
    os = require('os'),
    set = require('./lib/set'),
    config = require('./lib/config'),
    write = require('fs').writeFileSync;

var instruments_require_string = 'var __instruments = require(\'node_offline_debug\');\n',
    tmpReturnValues = new map();

function getReturnCode(key) {
    var fn_retvalue = tmpReturnValues.get(key);

    if (fn_retvalue === undefined) {
        fn_retvalue = identifier(6);
        tmpReturnValues.put(key, fn_retvalue);
    }

    return fn_retvalue;
}

function lookupFunctionNode(node) {
    var returnNode = node;

    function goIn(node) {
        if ((node.type === "FunctionExpression") || (node.type === "FunctionDeclaration")) {
            returnNode = node;
            return;
        } else {
            goIn(node.parent);
        }
    }

    goIn(node);

    return returnNode;
}

function injectNameToFunction(src, fn_name) {
    if (src.lastIndexOf('function(', 0) === 0) // check if there is a whitespace after 'function'
        src = src.replace('(', ' ' + fn_name + '(');
    else
        src = src.replace('(', fn_name + '(');
    return src;
}

function transformNodeSource(src, filename, fn_name, args, line_number, fn_var, fn_isAnonymous) {
    line_number = line_number - 1;
    src = src.replace('{',
        '{\n ' +
            'var ' + fn_var + ';\n' +
            'var '+ fn_var+'_shouldInstrument = ' +
            '(__instruments.lookupSet.contains("' + filename + config.methodSignatureSeparator + line_number + '"));\n' +
            'if  ('+ fn_var+'_shouldInstrument) { ' +
                'var methodId = Date.now();\n' +
                '__instruments.handlePreMessage(\'' + fn_name +'\',\'' +  args + '\'  , [].slice.call(arguments, 0), \'' + filename + '\', methodId, \'' + line_number + '\', ' + fn_isAnonymous + ');\n' +
            ' }\n' +
            ' try {\n');

    // covers both functions ending with }) and just }
    // TODO: performance efficient replacing
    var finally_string = '} finally {\n' +
        'if  ('+ fn_var+'_shouldInstrument) { ' +
                '__instruments.handlePostMessage(\'' + fn_name + '\',' + fn_var + ', \'' + filename + '\', \'' + line_number + '\', methodId);\n' +
            ' }\n' +
        ' }\n' +
        '}'; // the last curly { is for the function itself
    src = src.replace(/\}\)$/, finally_string + ')');
    src = src.replace(/\}$/, finally_string);

    return src;
}

function transformReturnSource(src, fn_var) {
    var trimmedSrc = src.trim();

    // If we just get return or return; we shouldn't use the return value
    if ((trimmedSrc === 'return') && (trimmedSrc.length === 'return'.length) ||
        (trimmedSrc === 'return;') && (trimmedSrc.length === 'return;'.length)) {
        return src;
    }

    // use paranthesis and comma (,) to asign the return value to retVal and then return it
    src = src.replace('return ','return ((' + fn_var + '=(\n');
    // remove trailing semicolons
    src = src.replace(/;+$/, '');
    // wrap the end of the return statement
    src = src + '\n)), ' + fn_var + ');\n';

    return src;
}

var wrap_code = function(src, filename) {
    if (instruments.isActive()) {
        if (instruments.isModuleIncluded(filename)) {

            return falafel(src, {
                'loc': true
            }, function(node) {
                var src,
                    fn_name,
                    fn_start_line,
                    filename_lookup,
                    fn_retvalue,
                    fn_isAnonymous = false,
                    fn_shouldBeWrapped = false,
                    args = [];

                switch (node.type) {
                    case 'FunctionDeclaration':
                    case 'FunctionExpression':
                        src = node.source();
                        fn_start_line = node.loc.start.line;

                        if (node.id) {
                            fn_name = node.id.name;
                        } else {
                            fn_name = identifier(6);
                            // inject generated name to an anon function

                            src = injectNameToFunction(src, fn_name);
                            fn_isAnonymous = true;
                        }

                        for (var i = 0; i < node.params.length; ++i) {
                            args.push(node.params[i].name);
                        }

                        // TODO: use full filenames, like in filenameForCache
                        //     - need to change every other lookup as well, including config
                        filename_lookup = instruments.shortenFileName(filename);
                        fn_retvalue = getReturnCode(filename_lookup + '_' + fn_start_line);
                        instruments.fnNameAndFilename.put(fn_name, filename_lookup + '_' + fn_start_line);

                        src = transformNodeSource(src, filename_lookup, fn_name, args, fn_start_line, fn_retvalue, fn_isAnonymous);

                        node.update(src);

                        break;
                    case 'ReturnStatement':
                        // TODO: encapsulate return statement with paranthesis
                        //    and comma (orginal,set retVal)
                        src = node.source();
                        filename_lookup = instruments.shortenFileName(filename);

                        var functionNode = lookupFunctionNode(node);

                        if (functionNode !== undefined) {
                            var start_line = functionNode.loc.start.line;

                            fn_retvalue = getReturnCode(filename_lookup + '_' + start_line);
                        }

                        src = transformReturnSource(src, fn_retvalue);
                        node.update(src);
                        break;
                }
            });
        }
    }
    return src;
};

module.exports = function(match) {
    var original_require = require.extensions['.js'];

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

            logger.info(filename);
        }

        /* save instrumented code for instrumentation research */
        if (instruments.shouldCreateTempCopy()) {
            var isWin = /^win/.test(process.platform),
                tmp_file = '', tmp_file_path = '';
            if (isWin) {
                tmp_file = filename.replace(':\\', '');
            }
            else
              tmp_file = filename;

            tmp_file = '.'+path.sep+'tmp'+path.sep+tmp_file;
            tmp_file_path = path.dirname(tmp_file);

            if (tmp_file.length > 0) {
                mkdirp.sync(tmp_file_path);
                write(tmp_file, src);
            }
        }
        /* end saving instrumented code */

        return module._compile(src, filename);
    };
};
