var bus = require('../../lib').create();

bus.ready(function() {

	bus.subscribe({
		queueName: 'ping-test',
		messageType: 'PingMassTransit:IPong'
	}, function(message, context, queueName) {
		console.log('message destined for [' + context.destinationAddress + '] received on queue [' + queueName + ']');
		console.log(message);
	});

	bus.subscribe({
		queueName: 'ping-test2',
		messageType: 'PingMassTransit:Pong2'
	}, function(message, context, queueName) {
		console.log('message destined for [' + context.destinationAddress + '] received on queue [' + queueName + ']');
		console.log(message);
	});

	bus.publish('PingMassTransit:Ping', {
		SomeString: 'yo',
		SomeInteger: 123,
		SomeDecimal: 1.23,
		SomeDate: new Date().toISOString(),
		PingField: 'PING'
	});

});

bus.init({
  host: 'rabbitmq-test',
  queueNames: ['ping-test','ping-test2'],
	publishMessageTypes: {
		"PingMassTransit:Ping": [
			'PingMassTransit:Ping',
			'PingMassTransit:IPing'
		]
	}
});
