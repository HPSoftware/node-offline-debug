Node offline debug
===============================

<p>This package can instrument your node.js application so you can track functions execution in real-time.</p>
<p>Instrumentation configuration can be set via configuration file or via an external service, such as HP AppDebug. Such a service allows for dynamic changes to what is being tracked, so the application doesn't need to be restarted (as opposed to printing console messages).</p>
<p>The output is sent to the external service if exist, otherwise sent to console or log file, as specified by the configuration.</p>

## Example

To install node_offline_debug package, simply follow [npm](https://www.npmjs.org) guidance (add it to your package.json or install it manually with 'mpm install').

To instrument your package, simply reference node_offline_debug in your package.json, and then 'require' the package first thing in your app. All the packages that are loaded afterwards will be instrumented.

The following code samples are instrumenting the [word-finder application](https://github.com/amirrajan/word-finder). The application main file is 'server.js', however in order to instrument it as well, we add a new 'init.js' file which simply require 'node_offline_debug' and then 'server.js':

	// Load the instrumentation
	// All 'required' modules afterwards are analyzed
	require('node_offline_debug');

	// This module is now analyzed and instrumented
	var server = require('./server.js');

The interesting function in word-finder is search(word) in the words.js file. In order to track it we define in the configuration a debug_service of type 'file', which loads functions to track from the package's 'config/debug_configuration_word_finder.json' file:

	{
	    "functionList": [{
	        "functionName": "search(word)",
	        "sourceFile": "words.js",
	        "line": 3,
	        "selected": true
	    }, {
	        "functionName": "function(req, res)",
	        "sourceFile": "server.js",
	        "line": 17,
	        "selected": false
	    }]
	}

This configuration will track 'search(word)'. Note that the second entry for tracking the 'express' handler for '/' is disabled ('selected' is set to false).

## How it works

<p>node_offline_debug replaces the 'require' handler for .js files.</p>
<p>When a file is loaded, it injects code into every function (including annonymous functions) to report upon function call and return. The injected code first checks if the function is tracked, to avoid additional overhead if it is not. Tracked functions are reported on every invocation completion (including if an exception is thrown), with the values of incoming arguments as well as the return value.</p>
The instrumentation code is injected using [Falafel](https://github.com/substack/node-falafel) parsing (based on [Esprima](http://esprima.org/)). node_offline_debug wraps every instrumented function with an initial check to see if the function should be tracked, and then with a try/finally block to make sure tracking is reported. Return statements are also replaced, to capture return value (if any).

## Configuration options

<p>Configuration can be specified in a json file under the package config folder, named according to NODE_ENV variable. If no configuration file is set, defaults are loaded by code. If an AppDebug service is set as a source for debug configuration, some configuration options may be overridden by values retrieved from the service.</p>
<p/>
<p>The setting of <b>'debug_services'</b> defines possible sources for configuration of which functions should be tracked. Current support is for HP AppDebug service, and for a file source, which defualts to 'debug_configuration.json' under the package config folder.<br/>
The active source is set by <b>'active_debug_service_type'</b> and defaults to the 'file' source.</p>


1. "exclude": ["express", "elasticsearch", "node_modules", "monitor"]

	List of instrumentation exclusions. Files which has any of these strings in their path will not be instrumented at all.
2. "compressPosts": true

	Set to 'true' to compress outgoing traffic (tracked functions reports) from the instrumentation. Can be used to minimize network overhead. 
3. "url": "server.com" (for the 'debug_service' of type 'service')

	Base URL for the AppDebug service.
4. "username": "admin",
   "password": "pwd" (for the 'debug_service' of type 'service')

   Username and password to access AppDebug service.
5. "path": "../config/debug_configuration.json",
   "outputLog": "debug" (for the 'debug_service' of type 'file')

   Set the file which stores function debug configuration, and the log level/type which tracking data will be sent to.
6. "autoCheckConfiguration" : {
        "once": false,
        "every": 10000
    }
    
    Applies to all debug services (including 'file'). Determines how function instrumentation setup is retrieved from the debug service. If 'once' is set to 'true', function debugging configuation will only be checked once when node_offline_debug is loaded, otherwise it will be retrieved routinely, according to the 'every' miliseconds setting.

## Contributing

We will be very glad of any imporovement to this library, and encourage you to submit defect fixes, new features and perfromance imporvements.
To contribute to node_offline_debug, please use GitHub pull requests:
* You MUST write a clear title and description of your change.
* You SHOULD have descriptive commit comments, and you are encouraged to rebase and squash commits.
* As with most instrumentation, perfromance overhead on the instrumented application should be minimized at all costs. Please test and make sure that your changes did not increase the overhead, by running a few simple scenarios of the instrumented application and comparing their single user performance: without 'requiring' node_offline_debig, with 'require' but with no function tracking, with a single function tracked and with many functions tracked.

## Credits

node_offline_debug is using the following 3rd parties:
* [falafel](https://github.com/substack/node-falafel)
* [espirma](http://esprima.org/)
* [traceback](https://www.npmjs.org/package/traceback)
* [winston](https://www.npmjs.org/package/winston)
* [identifier](https://www.npmjs.org/package/winston)
* [mkdirp](https://github.com/substack/node-mkdirp)

## Authors

node_offline_debug was written by HP Software, with special thanks to [Dror Avidov](https://github.com/just2click). 

## License

Creative Commons Attribution NonCommercial (CC-BY-NC)