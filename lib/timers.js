var tickLengthMs = 1000;
var runLogic = null;
var actualTick = 1000;  // Default

/* gameLoop related variables */
// timestamp of each loop
var previousTick = Date.now();

// number of times gameLoop gets called
var actualTicks = 0;

var timeLoop = function () {
  var now = Date.now();

  actualTicks++;
  if (previousTick + actualTick <= now) {
    var delta = (now - previousTick) / 1000;
    previousTick = now;

    runLogic.call();

    actualTicks = 0;
  }

  if (Date.now() - previousTick < actualTick - 16) {
    setTimeout(timeLoop);
  } else {
    setImmediate(timeLoop);
  }
};

timeLoop.logic = function (funcToRun) {
    runLogic = funcToRun;
};

timeLoop.interval = function (value) {
    actualTick = value || tickLengthMs;
};

module.exports = timeLoop;
