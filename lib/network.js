var config = require('./config'),
    logger = require('./logger'),
    http = require('https');

var network = {
    postLog: function(logObject) {
        var logObjectString = JSON.stringify(logObject);

        var rawConfig = '',
            loadedConfig = {},
            returnMessage = '',
            additionalHeaders = {
                'Content-Type': 'application/json',
                'Content-Length': logObjectString.length
            },
            options = config.createHttpOptions("POST", config.url_postData, additionalHeaders);


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

                logger.info(returnMessage);
            });
        });

        request.on('error', function(e) {
            retrurnMessage = "An error has occured, " + e.message;
            logger.error(returnMessage);
        });

        request.write(logObjectString);
        request.end();
        return returnMessage;
    },
};

module.exports = network;