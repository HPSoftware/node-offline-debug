var timers = require('timers'),
    http = require('http'),
    timeLoop = require('./timers'),
    logger = require('./logger'),
    network = require('./network');

process.on('message', function (msg) {
    this._updateConfig = function (data){
        var response = [];

        response.push(network.updateConfig(data));
        // Send the results back to index.js
        if (response !== []) {
            var returnData = {
                "error": null,
                "content": response
            };

            try {
                process.send(returnData);
            } catch (err) {
                logger.error("Server update error: Problem with process.send " + err.message + ", " + err.stack);
            }
        } else {
            logger.info("Server update message: No data processed");
        }
    };

    this._postData = function (data) {
        var response = [];
        response.push(network.postLog(data));

        // Send the results back to index.js
        if (response !== []) {
            var returnData = {
                "error": null,
                "content": response
            };

            try {
                process.send(returnData);
            } catch (err) {
                logger.error("Server update error: Problem with process.send " + err.message + ", " + err.stack);
            }
        } else {
            logger.info("Server update message: No data processed");
        }
    };

    this._init = function () {
        if ((msg.content !== null) || (msg.content !== "") || (msg.start === true)) {
            switch (msg.type) {
                case 'postData':
                    this._postData(msg.content);
                    break;
                case 'updateConfig':
                    this._updateConfig(msg.content);
                    break;
            }
        } else {
            logger.error("Server error: Received empty content");
        }
    }.bind(this)();
});

process.on('uncaughtException', function (err) {
    logger.error('Server update: Error: ' + err.message + "\n" + err.stack);
    clearInterval(__backgroundTimer);
});