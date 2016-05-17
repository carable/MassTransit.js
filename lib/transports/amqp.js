var amqp = require('amqp'),
		serializer = require('../serializer'),
		events = require('events'),
		envelope = require('../envelope'),
		_ = require('lodash'),
		emitter = new events.EventEmitter(),
		con,
		queues={},
		exchanges = {};

var config = {
	publishOptions: {
		deliveryMode: 2,
		headers: { 'Content-Type': 'application/vnd.masstransit+json' }
	},
	defaultQueue: {
		options: {
			durable: false,
			autoDelete: true
		}
	},
	defaultExchange: {
		options: {
			durable: false,
			autoDelete: true,
			type: 'fanout'
		}
	},
	queueOptions: {
		durable: true,
		autoDelete:false
	},
	exchangeOptions: {
		durable: true,
		autoDelete: false,
		type: 'fanout'
	}
}

//builds up an exchange
var createPendingExchange = function(exchangeName, exchangeOptions) {

	var exchange = con.exchange(exchangeName, exchangeOptions),
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
			exchange.publish(m.route, m.message, config.publishOptions);
		});
	});

	that.publish = publish;

	return that;
};

var bind = function(subscription, exchangeOptions) {
	var myExchangeOptions = {};
	_.merge(myExchangeOptions, config.exchangeOptions);
	_.merge(myExchangeOptions, exchangeOptions);
	exchanges[subscription.messageType] = exchanges[subscription.messageType] || createPendingExchange(subscription.messageType, myExchangeOptions);

	//this is fired after the exchange is created and opened -> see createPendingExchange
	exchanges[subscription.messageType].on('open', function() {
		queues[subscription.queueName].bind(subscription.messageType, '');
	});
};

var close = function() {
	con.close();
};

var init = function amqpInit(options) {
	_.merge(config, options);
	con = amqp.createConnection({ host: config.host });
	con.on('ready', function() {

		createQueue(config.defaultQueue.name, config.defaultQueue.options);
		bind({queueName: config.defaultQueue.name, messageType: config.defaultExchange.name}, config.defaultExchange.options);

		config.queueNames.forEach(function(queueName){
			createQueue(queueName, config.queueOptions);
		});
		emitter.emit('ready');  //transport ready
	});

	con.on('error', function(err) {
		console.log('connection error:', err);
	});
};

var createQueue = function(queueName, options)
{
	queues[queueName] = con.queue(queueName, options, function(queue) {
		queues[queueName].subscribe(function(message) {
			emitter.emit(queueName + '.message', queueName, serializer.deserialize(message.data)); //trasnsport queue message
		});
		emitter.emit(queueName + '.ready'); //transport queue is ready
	});
}

var publish = function(messageType, message) {

	var exchangeName = messageType;
	exchanges[exchangeName] = exchanges[exchangeName] || createPendingExchange(exchangeName, config.exchangeOptions);
	var namedExchange = exchanges[exchangeName];

	namedExchange.publish('', message, config.publishOptions);
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

emitter.bind = bind;
emitter.close = close;
emitter.init = init;
emitter.publish = publish;
//emitter.getErrorQueue = getErrorQueue;
emitter.directPublish = directPublish



module.exports = emitter;
