var envelope = require('./envelope'),
		Emitter = require('events').EventEmitter,
		Guid = require('guid'),
		localBus = new Emitter(),
		delayedCommands = [],
		readyTransport,
		transport;

var host;
var myQueue;
var requests = {};

var deliver = function busDeliver(env) {
	var message = envelope.unwrap(env);
  localBus.emit(message.messageType, message.message);
};

var getTransport = function busGetTransport(transportName) {
  if(transportName.indexOf('/') === 0) {
    return require(transportName);
  }
  return require('./transports/' + transportName);
};

var init = function busInit(config) {
	host = config.host;
	myQueue = config.queueName;

  transport = getTransport(config.transport);
  transport.on('ready', function() {
    readyTransport = transport;
    delayedCommands.forEach(function(command) {
      command();
    });
    localBus.emit('ready');
  });
  transport.on('message', deliver);
  transport.init(config, requests);
};

var publish = function busPublish(messageType, message) {
	whenTransportReady(function() {
    transport.publish(messageType, envelope.wrap(messageType, message));
	});
};

var ready = function busReady(callback) {
  localBus.on('ready', callback);
};

var subscribe = function busSubscribe(messageName, callback) {
  localBus.on(messageName, callback);
  whenTransportReady(function() {
    transport.bind(messageName);
  });
};

var whenTransportReady = function busWhenTransportReady(command) {
	if(readyTransport) {
    command();
  } else {
    delayedCommands.push(command);
  }
};

var request = function busRequest(request, callback) {
	var requestExchange = request.requestExchange;
	var messageType = request.messageType;
	var responseType = request.responseType;
	var message = request.message;

	var requestGuid = Guid.raw();

	var responseExchange = messageType + '-' + requestGuid;

	var env = {
		"messageId": Guid.raw(),
		"requestId": requestGuid,
		"conversationId": requestGuid,
		"sourceAddress": "rabbitmq://" + host + ":5672/" + myQueue + "-rpc?durable=false&autodelete=true&prefetch=16",
		"destinationAddress": "rabbitmq://" + host + "/" + requestExchange,
		"responseAddress": "rabbitmq://" + host + ":5672/" + myQueue + "-rpc?durable=false&autodelete=true&prefetch=16",
		"messageType": [
			"urn:message:" + messageType
		],
		"message": message,
	};

	//store message and callback for lookup during response
	requests[requestGuid] = {
		envelope: env,
		callback: function(responseEnvelope) {
			callback(envelope.unwrap(responseEnvelope));
		}
	}

	whenTransportReady(function() {
		transport.directPublish(requestExchange, env);
  });
}

exports.init = init;
exports.publish = publish;
exports.ready = ready;
exports.subscribe = subscribe;
exports.request = request;
