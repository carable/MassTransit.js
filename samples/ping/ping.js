var bus = require('../../lib').create();

bus.ready(function() {
	bus.subscribe({queueName:'ping-test',messageType:'PingMassTransit:Pong'}, function(msg) {
		console.log('pong received on ping-test');
		console.log(msg);
		//process.exit();
	});

	bus.subscribe('PingMassTransit:Pong', function(msg) {
		console.log('pong received on default queue');
		console.log(msg);
	  throw "Consumer Error";
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
  queueNames: ['ping-test','ping-test2'],
  transport: 'amqp'
});
