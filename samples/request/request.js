var bus = require('../../lib').create();
var _ = require('lodash');

var hasRun = false;

var req = function(customerId) {

	var msg = {
		timestamp: new Date().toISOString(),
		customerId: customerId
	};

	bus.request('request-service', 'Sample.MessageTypes:ISimpleRequest', msg, function(clientError, response) {
		if(clientError) {
			console.log('client error!', msg, clientError);
		} else {
			if(!_.includes(response.messageType, 'urn:message:RequestService:RequestConsumer+SimpleResponse')) {
				console.log('server error!', msg, response.messageType, response.message);
			} else {
				console.log('success!', response.message);
			}
		}
	});
	//, 5000);

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
	//requestTimeout: 3000
});
