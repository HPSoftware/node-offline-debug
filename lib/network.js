var tunnel = require('tunnel'),
    http = require('https');

var network = {
    settings: {},

    setSettings: function (config) {
        this.settings['host'] = config.debug_service.url;
        this.settings['url_getConfig'] = config.debug_service.url_getFunctions;
        this.settings['url_postResults'] = config.debug_service.url_postData;
        this.settings['username'] = config.debug_service.username;
        this.settings['password'] = config.debug_service.password;
    },

    updateConfig: function (config, doUpdate) {
        var rawConfig = '',
            loadedConfig = {},
            that = this,
            options = network.createHttpOptions("GET", this.settings.host,
                this.settings.url_getConfig);

        config.status = "loading";

        callback = function (response) {
            response.on('data', function (chunk) {
                rawConfig += chunk.toString('utf-8');
            });

            response.on('end', function () {
                var tmp = rawConfig;
                var loadedConfig = JSON.parse(tmp);

                if (network.isValidJSON(tmp)) {
                    if (doUpdate) {
                        if (loadedConfig.functionList) {
                            config.lookup = loadedConfig.functionList;
                            config.refreshLookupSet();
                        }
                    } else {
                        return loadedConfig;
                    }
                } else {
                    console.error("An error has occured, couldn't get configuration from server, falling back to mock config");
                }

                config.status = "done";
            });
        };

        rawConfig = '';

        http.request(options, callback).end();
    },

    postLog: function(logObject) {
        var logObjectString = JSON.stringify(logObject),
            that = this;

        var rawConfig = '',
            loadedConfig = {},
            returnMessage = '',
            additionalHeaders = {
                'Content-Type': 'application/json',
                'Content-Length': logObjectString.length
            },
            options = network.createHttpOptions("POST",
                that.settings.host, that.settings.url_postResults, additionalHeaders);

        var request = http.request(options, function(response) {
            response.setEncoding('utf-8');

            var responseString = '';

            response.on('data', function(data) {
                responseString += data;
            });

            response.on('end', function() {
                returnMessage = 'Sent data to server, ' +
                    JSON.parse(logObjectString).debugData[0].functionName + ', ' +
                    JSON.parse(logObjectString).debugData[0].functionFile +
                    ' with response code: ' + response.statusCode;

                console.log(returnMessage);
            });
        });

        request.on('error', function(e) {
            retrurnMessage = "An error has occured, " + e.message;
            console.error(returnMessage);
        });

        request.write(logObjectString);
        request.end();
        return returnMessage;
    },

    createHttpOptions: function (method, p_host, p_path, optionalHeaders) {
        var match;
        var proxy = process.env.http_proxy;
        var port = 443, /* default to SSL, may be replace by proxy port */
            host = p_host, /* default to server, may be replaced by proxy url */
            path = p_path, /* default to server path, may be replaced by full server url */
            auth = 'Basic ' + new Buffer(this.settings.username + ":" + this.settings.password).toString('base64');
            tunnelingAgent = null;

        var headers = (optionalHeaders != null ? optionalHeaders : {});
        headers.Authorization = auth;

        if (proxy != null)
        {
            match = proxy.match(/^(http:\/\/)?([^:\/]+)(:([0-9]+))?/i);
            /*
            if (match) {
                    host = match[2];
                    port = (match[4] != null ? match[4] : 80);
                    path = "https://" + config.url + url;
                    headers.Host = config.url;
            }
            */
            tunnelingAgent = tunnel.httpsOverHttp({
              proxy: { // Proxy settings
                host: match[2],
                port: (match[4] != null ? match[4] : 80),
                rejectUnauthorized : false
              }
            });

        }

        var options = {
            "port": port,
            "host": host,
            "path": path,
            "method": method,
            "headers": headers,
            "rejectUnauthorized": false,
            "requestCert": true,
            "agent": (proxy !== null ? tunnelingAgent : false)
        };

        return options;
    },

    // Validate if received a valid JSON without using try catch
    isValidJSON: function (text) {
        if (/^[\],:{}\s]*$/.test(text.replace(/\\["\\\/bfnrtu]/g, '@').
          replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
          replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

          return true;
        }

        return false;
    }
};

module.exports = network;