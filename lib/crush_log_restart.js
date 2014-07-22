var config  = require('./config'),
  logger    = require('./logger'),
  cluster   = require('cluster');

var workers = process.env.WORKERS || require('os').cpus().length;

if (cluster.isMaster) {

  logger.info('start cluster with %s workers', workers);

  for (var i = 0; i < workers; ++i) {
    var worker = cluster.fork().process;
    logger.info('worker %s started.', worker.pid);
  }

  cluster.on('exit', function(worker) {
    logger.error('worker %s died. restart...', worker.process.pid);
    cluster.fork();
  });

} else {

  var http = require('http');
  http.createServer(function (req, res) {
    res.end("Look Mum! I'm a server!\n");
  }).listen(config.server.port, config.server.url);

}

process.on('uncaughtException', function (err) {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
  console.error(err.stack);
  process.exit(1);
});