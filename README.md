node_offline_debug would enable debugging with not interruption for node.js applications.

Changes/Development log:

26/06/2014

Dror:
1. Started breaking main module into pieces
2. Added line number to every log line
3. Re-formatted line to include the following:
   * calling a function
    [filename] => [method_name]([arguments]) line#: [line_number]
   * function return
    [filename] <= [method_name]([arguments]) line#: [line_number]

   In case of an anonymous function, add a notification: An anonymous function

27/06/2014

Dror:
1. Added a config module and corresponding files
2. Added a mock.json based on the current REST get result
3. Added a new "instruments" module to handle instrument activities besides core functionality. Message formatting, module/function exclude/include are all handled there.
4. Implemented functionality to log only selected functions and ignore others
5. Implemented partial module exclusion