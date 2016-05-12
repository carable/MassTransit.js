var bus = require('../../lib').create();

var hasRun = false;

var req = function(customerId) {
	var dt = new Date();
	var dtStr = dt.toISOString();

	var req = {
		requestExchange: 'request-service',
		messageType: 'Sample.MessageTypes:ISimpleRequest',
		message: {
			timestamp: dtStr,
			customerId: customerId
		}
	};

	//console.log('request sent at', dtStr);
	bus.request(req, function(response, error) {
		if(error) {
			console.log('error!', error);
		} else {
			var recDt = new Date();
			console.log(response.message.cusomerName ,'received at', recDt.toISOString(), ' | ', new Date() - dt, 'ms');
			//console.log(response);
		}
	});
}

var run = function(i) {
	req(i);

	setTimeout(function() {
		run(++i);
	}, 1000);
}

bus.ready(function() {
	if(!hasRun) {
		hasRun = true;
		run(1);
	}
});

bus.init({
  host: 'rabbitmq-test',
  queueNames: [],
  transport: 'amqp'
});
