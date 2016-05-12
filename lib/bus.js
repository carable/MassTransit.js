var envelope = require('./envelope'),
		Emitter = require('events').EventEmitter,
		localBus = new Emitter(),
		delayedCommands = [],
		readyTransport,
		transport,
		defaultQueue = 'This-Host-01';

var deliver = function busDeliver(queueName, env) {
	var message = envelope.unwrap(env);
  localBus.emit(queueName + '.' + message.messageType, message.message, env, queueName);
};

var getTransport = function busGetTransport(transportName) {
  if(transportName.indexOf('/') === 0) {
    return require(transportName);
  }
  return require('./transports/' + transportName);
};

var init = function busInit(config) {
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
		localBus.emit('ready');
	});

  transport.init(config,defaultQueue);
};

var publish = function busPublish(messageType, message) {
	whenTransportReady(function() {
    transport.publish(messageType, envelope.wrap(messageType, message));
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


exports.init = init;
exports.publish = publish;
exports.ready = ready;
exports.subscribe = subscribe;
exports.defaultQueue = defaultQueue;
