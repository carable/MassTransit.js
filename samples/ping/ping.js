var bus = require('../../lib').create();

bus.ready(function() {
	bus.subscribe('PingMassTransit:Pong', function(msg) {
		console.log('pong received');
		console.log(msg);
		process.exit();
	});

	bus.publish('PingMassTransit:Ping', {
		SomeString: 'yo',
		SomeInteger: 123,
		SomeDecimal: 1.23,
		SomeDate: new Date()
	});
});

bus.init({
  host: 'rabbitmq-test',
  queueName: 'ping-test',
  transport: 'amqp'
});
