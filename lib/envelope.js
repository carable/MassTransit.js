var serializer = require('./serializer');
var _ = require('lodash');
var Guid = require('guid');

var wrap = function(messageTypes,
										message,
										requestId,
										destinationAddress,
										responseAddress) {

	var env = {
		messageId: Guid.raw(),
		message: message,
		messageType: _.map(messageTypes, function(mt) {
				return 'urn:message:' + mt;
			})
	};

	if(requestId) {
		env.requestId = requestId;
		env.conversationId = requestId;
	}

	if(destinationAddress) {
		env.destinationAddress = destinationAddress;
	}

	if(responseAddress) {
		env.sourceAddress = responseAddress;
		env.responseAddress = responseAddress;
	}

	return env;
};

module.exports.wrap = wrap;
