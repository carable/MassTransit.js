var amqp = require('amqp'),
		serializer = require('../serializer'),
		events = require('events'),
		emitter = new events.EventEmitter(),
		con,
		queue,
		exchanges = {};

var publishOptions = {
	deliveryMode: 2,
	headers: { 'Content-Type': 'application/vnd.masstransit+json' }
};

var createPendingExchange = function(exchangeName) {
	var exchange = con.exchange(exchangeName, { durable: false, autoDelete: true, type: 'fanout' }),
			waitingMessages = [],
			that = new events.EventEmitter();

	var publish = function(route, message) {
		waitingMessages.push({
			route: route,
			message: message
		});
	};

	exchange.addListener('open', function() {
		that.emit('open');
		exchanges[exchangeName] = exchange;
		waitingMessages.forEach(function(m) {
			exchange.publish(m.route, m.message, publishOptions);
		});
	});

	that.publish = publish;

	return that;
};

var bind = function(exchangeName) {
	exchanges[exchangeName] = exchanges[exchangeName] || createPendingExchange(exchangeName);
	exchanges[exchangeName].addListener('open', function() {
		queue.bind(exchangeName, '');
	});
};

var close = function() {
	con.close();
};

var init = function amqpInit(config, requests) {
	con = amqp.createConnection({ host: config.host });
	con.addListener('ready', function() {
		initRPC(config.queueName, requests);
		queue = con.queue(config.queueName, { durable: true }, function() {
			emitter.emit('ready');
			queue.subscribe(function(message) {
				emitter.emit('message', serializer.deserialize(message.data));
			});
		});
	});
};

var publish = function(messageType, message) {
	var exchangeName = messageType;
	exchanges[exchangeName] = exchanges[exchangeName] || createPendingExchange(exchangeName);
	var namedExchange = exchanges[exchangeName];

	namedExchange.publish('', message, publishOptions);
};

//Publish a message to the specified exchange
var directPublish = function(exchange, message) {
	con.publish(exchange, message);
};

//Make an exchange and queue for rpc responses
var initRPC = function(queueName, requests) {
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
				//console.log('response received for request [', envelope.requestId, ']');
				//look up the original request by request id on the envelope
				//and call the associated callback passing along the response
				requests[envelope.requestId].callback(envelope);
      });
	 	});
	});
};

emitter.bind = bind;
emitter.close = close;
emitter.init = init;
emitter.publish = publish;
emitter.directPublish = directPublish

module.exports = emitter;
