var envelope = require('./envelope'),
		Emitter = require('events').EventEmitter,
		Guid = require('guid'),
		_ = require('lodash'),
		os = require('os'),
		Promise = require('promise'),
		localBus = new Emitter(),
		delayedCommands = [],
		readyTransport,
		transport;

var defaultQueueAndExchangeName = os.hostname() + '-' + Guid.raw();

//default config, overridable by init options
var config = {
	transport: 'amqp',
	host: 'localhost',
	queueNames: [],
	defaultQueue: {
		name: defaultQueueAndExchangeName
	},
	defaultExchange: {
		name: defaultQueueAndExchangeName
	},
	queueOptions: {},
	exchangeOptions: {},
	requestTimeout: 30000
};

var deliver = function busDeliver(queueName, env) {
	env = envelope.unwrap(env);
	_.map(env.messageType, function(mt) {
		if(env.requestId) {
			localBus.emit(env.requestId, env.message, env, queueName);
		}
		localBus.emit(queueName + '.' + mt, env.message, env, queueName);
	});
};

var getTransport = function busGetTransport(transportName) {
  if(transportName.indexOf('/') === 0) {
    return require(transportName);
  }
  return require('./transports/' + transportName);
};

var init = function busInit(options) {
	_.merge(config, options);

  transport = getTransport(config.transport);

  transport.on(config.defaultQueue.name + '.message', deliver);
	transport.on(config.defaultQueue.name + '.ready', function() {});

	config.queueNames.forEach(function(queueName){

		transport.on(queueName + '.ready', function() {}); // no op right now

		transport.on(queueName +'.message', deliver);

	});

	transport.on('ready',function(){
		readyTransport = transport;

    while(delayedCommands.length > 0) {
      var command = delayedCommands.shift();
      command();
    }

		localBus.emit('ready');
	});

  transport.init(config);
};

var publish = function busPublish(messageType, message) {
	whenTransportReady(function() {
		var messageTypes = config.publishMessageTypes[messageType] || [messageType];
    transport.publish(messageType, envelope.wrap(messageTypes, message));
	});
};

var ready = function busReady(callback) {
  localBus.on('ready', callback);
};

var subscribe = function busSubscribe(subscription, callback) {

	if(typeof subscription === 'string')
	{
		subscription = {messageType:subscription}
	}
	if(!subscription.queueName)
	{
		subscription.queueName = config.defaultQueue.name;
	}

	localBus.on(subscription.queueName + '.' + subscription.messageType, function(message, envelope, queueName) {
		process(callback, message, envelope, queueName);
	});

  whenTransportReady(function() {
    transport.bind(subscription, config.exchangeOptions);
  });
};

var process = function(callback, message, envelope, queueName, clientError){

	//reject a message because of an error, passed to callback for explicit reject
	var reject = function(e) {
		moveToError(message, envelope, queueName, e);
	};

	try {
		//response to a request
		if(envelope.requestId) {
			Promise.resolve(callback(clientError, envelope)).catch(reject);
		} else { //regular callback signature
			Promise.resolve(callback(message, envelope, queueName)).catch(reject);
		}
	}
	catch (e) { //synchronous exception handler
		reject(e);
	}
};

var moveToError = function(message, envelope, queueName, error)
{
	var errorQueueName = queueName + '_error';
	var errorDate = new Date().toString();
	console.log(
		errorDate.toString(),
		'masstransit: Error processing inbound message.\n',
		error.stack, '\n',
		'[Inbound Context]\n', envelope, '\n',
		'Moving message to queue [' + errorQueueName + ']\n',
		'End error report'
	);

	var headers = {
		errorDate: errorDate,
		errorMessage: error.stack
	};

	var exchange = transport.pushToQueue(envelope, errorQueueName, headers);
};

var whenTransportReady = function busWhenTransportReady(command) {
	if(readyTransport) {
    command();
  } else {
    delayedCommands.push(command);
  }
};

var request = function busRequest(requestExchange, messageType, message, callback, timeout) {
	var requestGuid = Guid.raw();
	var destinationAddress = 'rabbitmq://' + config.host + '/' + requestExchange;
	var responseAddress = 'rabbitmq://' + config.host + ':5672/' + config.defaultQueue.name + '?durable=false&autodelete=true';

	var env = envelope.wrap([messageType], message, requestGuid, destinationAddress, responseAddress);

	var timeoutObj = setTimeout(function() {
		localBus.removeAllListeners(requestGuid);
		process(callback, {}, {requestId: requestGuid}, {}, 'timeout');
	}, timeout || config.requestTimeout);

	localBus.once(requestGuid, function(message, envelope, queueName) {
		clearTimeout(timeoutObj);
		process(callback, message, envelope, queueName);
	});

	whenTransportReady(function() {
		transport.directPublish(requestExchange, env);
  });

	return requestGuid;
}

exports.init = init;
exports.publish = publish;
exports.ready = ready;
exports.subscribe = subscribe;
exports.request = request;
exports.config = config;
