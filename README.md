Node offline debug
===============================

This package can instrument your node.js application so you can track functions execution in real-time.
Instrumentation configuration can be set via configuration file or via an external service, such as HP AppDebug. Such a service allows for dynamic changes to what is being tracked, so the application doesn't need to be restarted (as opposed to printing console messages).

## Example

To instrument your package, simply reference node_offline_debug in your package.json, and then require the package first thing in your app. All the packages that are loaded afterwards will be instrumented.

	// load the instrumentation
	var instrument = require('node_offline_debug');

	// All required module below are analyzed
	var server = require('./server.js');


## How it works

node_offline_debug replaces the require handler for .js files.
When a file is loaded, it injects code into every function (including annonymous functions) to report upon function call and return. The injected code first checks if the function is tracked, to avoid additional overhead if it is not. Tracked functions are reported on every invocation completion, with the values of incoming arguments as well as the return value.

## Configuration options

Configuration can be specified in a json file under config folder, named according to NODE_ENV variable. If no configuration file is set, defaults are loaded by code. If an AppDebug server is specified, some configuration options are loaded from it.

1. "exclude": ["express", "elasticsearch", "node_modules", "monitor"]
	List of instrumentation exclusions. Files which has any of these strings in their path when loaded will not be instrumented at all.
2.  "nameAnonymousFunctions": false
	This option allows for generating random names for anonymous functions, for clarity in reporting function invocation.
3. "compressPosts": true
	Set to 'true' to compress outgoing traffic (tracked functions reports) from the instrumentation. Can be used to minimize network overhead. 
4. "url": "server.com"
	Base URL for the AppDebug service.
5. "username": "seffy",
   "password": "seffy"
   Username and password to access AppDebug service.
6. "autoCheckConfiguration" : {
        "once": false,
        "every": 10000
    }
    If set, determines how function instrumentation setup is retrieved from the AppDebug service. If 'once' is set to 'true', function tracking will only be checked once when node_offline_debug is loaded, otherwise it will be retrieved routinely, according to the 'every' miliseconds setting.


## License

Creative Commons Attribution NonCommercial (CC-BY-NC)