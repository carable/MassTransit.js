var serializer = require('./serializer');
var _ = require('lodash');

var wrap = function(messageTypes, message) {
	return {
 		message: message,
		messageType: _.map(messageTypes, function(mt) {
				return 'urn:message:' + mt;
			})
	};
};

module.exports.wrap = wrap;
