Node-offline-debug
===============================

<p>This package can instrument your node.js application so you can track function execution in real-time.</p>
<p>Instrumentation configuration can be set through a configuration file or an external service, such as HP AppDebug. Such a service allows dynamic changes in what is being tracked, so that the application does not need to be restarted. This is in contrast to printing console messages, which does require you to restart the application.</p>
<p>The output is sent to an external service if it exists. Otherwise, it is sent to the console or a log file, as specified by the configuration.</p>

## Install

To install the node-offline-debug package, follow [npm](https://www.npmjs.org) guidelines: add it to your package.json or install it manually with 'npm install':

	npm install node-offline-debug

## Example

To instrument your code, 'require' the package as a first step in your app. All the packages that are subsequently loaded will be instrumented.

NOTE: in order to have your packages instrumented you must load them using 'require(<package_name>)'. You cannot instrumrent packages that are "required" during runtime in a general fashion, such as loading all *.js files from a folder.

The following code samples are instrumenting the [word-finder application](https://github.com/amirrajan/word-finder). The application's main file is 'server.js'. However in order to instrument it as well, we added a new 'init.js' file which require 'node-offline-debug' and then 'server.js':

	// Load the instrumentation
	// All 'required' modules afterwards are analyzed
	require('node-offline-debug');

	// This module is now analyzed and instrumented
	var server = require('./server.js');

The interesting function in word-finder is 'search(word)' in the words.js file. In order to track it we define in the configuration a debug_service of type 'file', which loads functions to track from the package's 'config/debug_configuration_word_finder.json' file:

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

This configuration will track 'search(word)'. Note that the second entry for tracking the 'express' handler for '/' is disabled ('selected' is set to false).<p/>
The output is dependent on the definition of the debug_service (see the configuration section). If, however, you are using a debug_service of type 'file', you can direct the output to the console. After the function invocation is completed, debug data is printed out as a structured json. 

## How it works

<p>node-offline-debug replaces the 'require' handler for .js files.</p>
<p>When a file is loaded, it injects code into every function (including annonymous ones) to report on function calls and returns. The injected code first checks if the function is tracked, to avoid additional overhead. Tracked functions are reported on every invocation completion (even if an exception is thrown), with the values of incoming arguments, and the return value.</p>
The instrumentation code is injected using [Falafel](https://github.com/substack/node-falafel) parsing (based on [Esprima](http://esprima.org/)). node-offline-debug wraps every instrumented function with an initial check to see if the function should be tracked, and then with a try/finally block to make sure tracking is reported. Return statements are also replaced, to capture return value (if any).

## Configuration options

<p>Configuration options determine the source for function tracking settings. Additionaly, configuraiton options determine general instrumentation settings. Configuration can be specified in a json file in the following locations:</p>
<ul>
	<li>Application root directory, in a file named 'node-offline-debug-<i>ENV</i>.json, where ENV is replaced in runtime with the NODE_ENV variable value (e.g. 'node-offline-debug-development.json'). You don't need to set all the configuration options in this file, and any configuration option that will be set will take priority over the package configuration file (see next).</li>
	<li>Under the package config folder, named according to NODE_ENV variable (e.g. 'development.json'). Note that such configuration files are part of the repository and most likely with the npm package as well.</li>
</ul>
<p>If no configuration file is set, the code loades the defaults. If an AppDebug service is set as a source for debug configuration, some configuration options may be overridden by values retrieved from the service.</p>
<p/>
<p>The setting of <b>'debug_services'</b> defines the possible sources for function tracking settings. Current support is for HP AppDebug service, and for a file source, by default 'debug_configuration.json' under the package’s config folder.<br/>
The active source is set by <b>'active_debug_service_type'</b>, by default the 'file' source.</p>
<p>Additional instrumentation settings determine exclusion of code paths, the frequency of re-checking function tracking settings and other options. Some of these settings are defined in a second file, by default 'public_development_configuration.json'.</p>


1. "exclude": ["express", "elasticsearch", "node_modules", "monitor"]

	List of instrumentation exclusions. Files which have any of these strings in their path will not be instrumented.
2. "url": "server.com" (for the 'debug_service' of type 'service')

	The base URL for the AppDebug service.
3. "username": "admin",
   "password": "pwd" (for the 'debug_service' of type 'service')

   Username and password to access the AppDebug service.
4. "path": "../config/debug_configuration.json",
   "outputLog": "debug" (for the 'debug_service' of type 'file')

   Set the file which stores function debug configuration, and the log level/type which tracking data will be sent to.
5. "autoCheckConfiguration" : {
        "once": false,
        "every": 10000
    }
    
    Applies to all debug services (including 'file'). Determines how function tracking settings are retrieved from the debug service. If 'once' is set to 'true', function tracking settings will only be checked once when node-offline-debug is loaded. If set to ‘false’, it will be retrieved at time intervals, indicated by the 'every' milliseconds setting.

## Contributing

We will be happy to improve this library, and we encourage you to submit fixes for defects, new features and performance improvements. To contribute to node-offline-debug, please use GitHub pull requests:
* You MUST write a clear title and description of your change.
* You SHOULD have descriptive commit comments, and you are encouraged to rebase and squash commits.
* As with most instrumentation, performance overhead on the instrumented application should be minimized at all costs. Please test and make sure that your changes did not increase the overhead, by running a few simple scenarios of the instrumented application and comparing their single user performance: without 'requiring' node-offline-debug, with 'require' but with no function tracking, with a single function tracked and with many functions tracked.

## Credits

node-offline-debug is using the following Third party sources:
* [falafel](https://github.com/substack/node-falafel)
* [espirma](http://esprima.org/)
* [traceback](https://www.npmjs.org/package/traceback)
* [winston](https://www.npmjs.org/package/winston)
* [identifier](https://www.npmjs.org/package/identifier)
* [mkdirp](https://github.com/substack/node-mkdirp)

## Authors

node-offline-debug was written by HP Software, with special thanks to [Dror Avidov](https://github.com/just2click). 

## License

MIT License