var assert = require("assert"),
    expect = require("expect.js"),
    net = require("net"),
    instruments = require("./../lib/instruments");

function CircularFunc() {
    this.hello = "Hello";
    this.someClass = {
        'world': 'world',
        'more': 'more'
    };
    this.circular = this;
}

describe('Instruments', function () {
    describe("instruments, throw exception when 'circular reference' is used", function () {
        it ('should throw a "circular strature" excpetion - catch exception', function () {
            function JSON_parse() {
                JSON.parse(cf);
            }

            var cf = new CircularFunc();

            assert.throws(JSON_parse,
                Error, 'TypeError: Converting circular structure to JSON');
        });
    });

    describe("instruments, parse an object with circular reference", function () {
        it ('should parse an object with "circular strature"', function () {
            function JSON_parse_objToJSON() {
                return instruments.objToJSON(socket).toString();
            }

            var socket = new net.Socket();
            var text = '"{"_connecting":false,"_handle":null,"_readableState":{"highWaterMark":16384,"buffer":[],"length":0,"pipes":null,"pipesCount":0,"flowing":false,"ended":false,"endEmitted":false,"reading":false,"calledRead":false,"sync":true,"needReadable":false,"emittedReadable":false,"readableListening":false,"objectMode":false,"defaultEncoding":"utf8","ranOut":false,"awaitDrain":0,"readingMore":false,"oldMode":false,"decoder":null,"encoding":null},"readable":false,"domain":null,"_events":{},"_maxListeners":10,"_writableState":{"highWaterMark":16384,"objectMode":false,"needDrain":false,"ending":false,"ended":false,"finished":false,"decodeStrings":false,"defaultEncoding":"utf8","length":0,"writing":false,"sync":true,"bufferProcessing":false,"writecb":null,"writelen":0,"buffer":[],"errorEmitted":false},"writable":false,"allowHalfOpen":false,"onend":null,"destroyed":false,"bytesRead":0,"_bytesDispatched":0,"_pendingData":null,"_pendingEncoding":""}"';

            assert(text, JSON_parse_objToJSON);
        });
    });

    describe("instruments, test preparing a log object", function () {
      it ('should reutrn an object with a debugData array', function () {
        var expected = {
            "debugData": []
        };

        assert(expected, instruments.prepareLogObject());

      });
    });


});