node_offline_debug would enable debugging with not interruption for node.js applications.


Changes/Development log:

26/06/2014

Dror:

1. Started breaking main module into pieces
2. Added line number to every log line
3. Re-formatted line to include the following:
    * calling a function [filename] => [method_name]([arguments]) line#: [line_number]
    * function return [filename] <= [method_name]([arguments]) line#: [line_number]

   In case of an anonymous function, add a notification: An anonymous function

29/06/2014

Dror:

1. Added a config module and corresponding files
2. Added a mock.json based on the current REST get result
3. Added a new "instruments" module to handle instrument activities besides core functionality. Message formatting, module/function exclude/include are all handled there.
4. Implemented functionality to log only selected functions and ignore others
5. Implemented partial module exclusion

30/06/2014

Dror:

1. Added handling to results data preparing it for sending back to server
2. Added some helpers such as Map to handle matching of incoming and outgoing messages - pending tests
3. Added initial call to the server to pull configuration

29/07/2014
1. Fixed arguments formatting for log and messaging
2. Remove the offline_debug_hooks.js
3. In Logger.js changed Winston "exitOnError" value to true so an unhandled exception would stop the application
4. In "offline_debug.js" merged Inbar changes, add the path library, added parameters like 'start_line'
5. Removed some debugging code
6. Removed "hooking" code from "instruments.js" file
