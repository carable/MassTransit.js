var amqp = require('amqp'),
		serializer = require('../serializer'),
		events = require('events'),
		emitter = new events.EventEmitter(),
		con,
		queues={},
		exchanges = {};

var publishOptions = {
	deliveryMode: 2,
	headers: { 'Content-Type': 'application/vnd.masstransit+json' }
};


//builds up an exchange
var createPendingExchange = function(exchangeName) {

	var exchange = con.exchange(exchangeName, { durable: false, autoDelete: true, type: 'fanout' }),
			waitingMessages = [],
			that = new events.EventEmitter();
	//that is the event Emitter that will returned in place of the actual exchange

  //a temporary publish queue while the exchange is getting built up
	// see publish function at the bottom of this file
	var publish = function(route, message) {
		waitingMessages.push({
			route: route,
			message: message
		});
	};

	//when the exchange is open we also rebroadcast that fact on the returned emitter;
	//and publish any pending messages
	exchange.on('open', function() {
		that.emit('open');
		exchanges[exchangeName] = exchange;
		waitingMessages.forEach(function(m) {
			exchange.publish(m.route, m.message, publishOptions);
		});
	});

	that.publish = publish;

	return that;
};

var bind = function(subscription) {
	exchanges[subscription.messageType] = exchanges[subscription.messageType] || createPendingExchange(subscription.messageType);

	//this is fired after the exchange is created and opened -> see createPendingExchange
	exchanges[subscription.messageType].on('open', function() {
		queues[subscription.queueName].bind(subscription.messageType, '');
	});
};

var close = function() {
	con.close();
};

var init = function amqpInit(config,defaultQueueName) {
	con = amqp.createConnection({ host: config.host });
	con.on('ready', function() {

		initRPC(defaultQueueName);
		createQueue(defaultQueueName,{durable: false})

		config.queueNames.forEach(function(queueName){
			createQueue(queueName,{durable: true, autoDelete:false});
		});
		emitter.emit('ready');  //transport ready
	});
};


var createQueue = function(queueName,options)
{
	queues[queueName] = con.queue(queueName, options, function(queue) {
			queues[queueName].subscribe(function(message) {
			emitter.emit(queueName + '.message', queueName,serializer.deserialize(message.data)); //trasnsport queue message
		});
		emitter.emit(queueName + '.ready'); //transport queue is ready
	});
}

var publish = function(messageType, message) {

	var exchangeName = messageType;
	exchanges[exchangeName] = exchanges[exchangeName] || createPendingExchange(exchangeName);
	var namedExchange = exchanges[exchangeName];

	namedExchange.publish('', message, publishOptions);
};

/*
var getErrorQueue = function(errorQueueName,callback)
{

	exchanges[errorQueueName] = exchanges[errorQueueName] || createPendingExchange(errorQueueName);

	exchanges[errorQueueName].on('open', function() {
		createQueue(errorQueueName,{durable:true,autoDelete:false});
			emitter.once(errorQueueName + '.ready',function(){
				queues[errorQueueName].bind(errorQueueName,'');
			});
	});

	return exchanges[errorQueueName];
}
*/


//Publish a message to the specified exchange
var directPublish = function(exchange, message) {
	con.publish(exchange, message);
};

//Make an exchange and queue for rpc responses
var initRPC = function(queueName) {
	//Call it myqueue-rpc
	var rpcQueueName = queueName + '-rpc';
	var queue = con.queue(rpcQueueName, function() {
		//After the queue is created, build an exchange to bind to it
		var exchange = con.exchange(rpcQueueName, { durable: false, autoDelete: true, type: 'fanout' });
		//Once the exchange is created
		exchange.addListener('open', function() {
			//bind it to our rpc queue
			queue.bind(rpcQueueName, '');
			//subscribe to all messages that arrive on this queue
			queue.subscribe(function(message) {
				//deserialize the incoming data into an object
				var envelope = JSON.parse(message.data);
				emitter.emit(rpcQueueName + '.message', envelope);

				//console.log('response received for request [', envelope.requestId, ']');
				//look up the original request by request id on the envelope
				//and call the associated callback passing along the response
				///requests[envelope.requestId].callback(envelope);
      });
	 	});
	});
};

emitter.bind = bind;
emitter.close = close;
emitter.init = init;
emitter.publish = publish;
//emitter.getErrorQueue = getErrorQueue;
emitter.directPublish = directPublish



module.exports = emitter;
