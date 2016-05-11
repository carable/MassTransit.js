var serializer = require('./serializer');

var unwrap = function(envelope) {
	return {
		message: envelope.message,
		messageType: envelope.messageType[0].replace('urn:message:', '')
	};
};

var wrap = function(messageType, message) {
	return {
 		message: message,
		messageType: 'urn:message:' + messageType
	};
};


module.exports.unwrap = unwrap;
module.exports.wrap = wrap;
