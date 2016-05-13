var envelope = require('./envelope'),
		Emitter = require('events').EventEmitter,
		Guid = require('guid'),
		_ = require('lodash'),
		localBus = new Emitter(),
		delayedCommands = [],
		readyTransport,
		transport,
		defaultQueue = 'This-Host-01';

var host;
var requests = {};
var config = {};

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
	config = options;
	host = config.host;
	myQueue = config.queueName;

  transport = getTransport(config.transport);

  transport.on(defaultQueue + '.message', deliver);
	transport.on(defaultQueue + '.ready', function() {});

	config.queueNames.forEach(function(queueName){

		transport.on(queueName + '.ready', function() {}); // no op right now

		transport.on(queueName +'.message', deliver);

	});

	transport.on('ready',function(){
		readyTransport = transport;
		delayedCommands.forEach(function(command) {
			command();
		});

		transport.on(defaultQueue + '-rpc.message', function(envelope) {
			requests[envelope.requestId].callback(envelope);
		});

		localBus.emit('ready');
	});

  transport.init(config,defaultQueue);
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
		subscription.queueName = defaultQueue;
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
    transport.bind(subscription);
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
		"sourceAddress": "rabbitmq://" + host + ":5672/" + defaultQueue + "-rpc?durable=false&autodelete=true&prefetch=16",
		"destinationAddress": "rabbitmq://" + host + "/" + requestExchange,
		"responseAddress": "rabbitmq://" + host + ":5672/" + defaultQueue + "-rpc?durable=false&autodelete=true&prefetch=16",
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
exports.defaultQueue = defaultQueue;
