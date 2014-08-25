var path = require('path'),
    logger = require('./logger'),
    fs = require('fs');

var SourceFile = {
    fileToText: [],
    status: 'loading',

    readFile: function (input, callback) {
        var remaining = '',
            that = this;

        input.on('data', function (data) {
            remaining += data;
            var index = remaining.indexOf('\n'),
                last = 0;

            while (index > -1) {
                var line = remaining.substring(last, index);
                last = index + 1;
                that.fileToText.push(line + '\n');
                index = remaining.indexOf('\n', last);
            }
        });

        input.on('end', function () {
            if (remaining.length > 0) {
                that.fileToText.push(remaining);
            }
            that.doneReading(callback);
        });
    },

    load: function (filepath, callback) {
        var input = fs.createReadStream(filepath);
        this.readFile(input, callback);
    },

    doneReading: function (callback) {
        callback(this.fileToText.join(''));
    }
};

module.exports = SourceFile;