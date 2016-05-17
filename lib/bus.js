var envelope = require('./envelope'),
		Emitter = require('events').EventEmitter,
		Guid = require('guid'),
		_ = require('lodash'),
		os = require('os'),
		localBus = new Emitter(),
		delayedCommands = [],
		readyTransport,
		transport,
		requests = {};

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
	exchangeOptions: {}
};

var deliver = function busDeliver(queueName, env) {
	var message = env;
	_.map(env.messageType, function(mt) {
		localBus.emit(queueName + '.' + mt.replace('urn:message:',''), message.message, env, queueName);
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
		delayedCommands.forEach(function(command) {
			command();
		});

		transport.on(config.defaultQueue.name + '.message', function(queueName, envelope) {
			requests[envelope.requestId].callback(envelope);
		});

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

	localBus.on(subscription.queueName + '.' + subscription.messageType, function(message, envelope, queueName){
		try {
			callback(message,envelope,queueName);
		} catch (e) {
			moveToError(message,envelope,queueName);
		} finally {

		}
	});

  whenTransportReady(function() {
    transport.bind(subscription, config.exchangeOptions);
  });
};

var moveToError = function(message,envelope,queueName)
{
	console.log('should move To Error');

	 //chris-- this is broke still working on it
	 //var errorQueueName = queueName + '_error';
	 //var exchange = transport.getErrorQueue(errorQueueName);
	 //transport.publish(errorQueueName,envelope);
	 //queues[errorQueueName] = queues[errorQueueName] || createQueue(errorQueueName,{durable: true, autoDelete:false});

	 /*
	 emitter.on(errorQueueName + '.ready',function(){
		 bind({queueName:errorQueueName,messageType:errorQueueName});
	 })


	 publish(errorQueueName,envelope);
*/
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
		"sourceAddress": "rabbitmq://" + config.host + ":5672/" + config.defaultQueue.name + "?durable=false&autodelete=true",
		"destinationAddress": "rabbitmq://" + config.host + "/" + requestExchange,
		"responseAddress": "rabbitmq://" + config.host + ":5672/" + config.defaultQueue.name + "?durable=false&autodelete=true",
		"messageType": [
			"urn:message:" + messageType
		],
		"message": message,
	};

	//store message and callback for lookup during response
	requests[requestGuid] = {
		envelope: env,
		callback: callback
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
exports.config = config;
