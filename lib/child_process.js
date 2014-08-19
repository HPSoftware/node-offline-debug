var timers = require('timers'),
    http = require('http'),
    timeLoop = require('./timers'),
    logger = require('./logger'),
    network = require('./network'),
    __backgroundTimer;

process.on('message', function (msg) {
    this._updateConfig = function (data){

    };

    this._postData = function (data) {
        logger.info('Updating ...');
        var finalArray = [];
        finalArray.push(network.postLog(data));

        // Send the results back to index.js
        if (finalArray !== []) {
            var returnData = {
                "error": null,
                "content": finalArray
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

    this._startTimer = function () {
        var count = 0,
            that = this;

        __backgroundTimer = timers.setInterval(function () {
            try {
                logger.info("Server update: Datetime tick: " + Date.now());
                //that._postUpdate(msg.content);
            } catch (err) {
                count++;
                if (count === 3) {
                    logger.error("Server update: Shutting down timer ... too many errors " + err.message);
                    clearInterval(__backgroundTimer);
                    process.disconnect();
                } else {
                    logger.error("Server update: Error: " + err.message + "\n" + err.stack);
                }
            }
        }, msg.interval);
    };

    this._init = function () {
        if ((msg.content !== null) || (msg.content !== "") || (msg.start === true)) {
            switch (msg.type) {
                case 'postData':
                    this._postData(msg.content);
                    break;
                case 'updateConfig':
                    this._startTimer();
                    break;
            }
        } else {
            logger.error("Server update: Content empty. Unable to start timer");
        }
    }.bind(this)();

    this._pause = function () {
        clearInterval(__backgroundTimer);
        process.disconnect();
    };
});

process.on('uncaughtException', function (err) {
    logger.error('Server update: Error: ' + err.message + "\n" + err.stack);
    clearInterval(__backgroundTimer);
});