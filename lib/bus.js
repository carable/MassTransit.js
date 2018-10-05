const envelope = require('./envelope')
const Emitter = require('events').EventEmitter
const Guid = require('guid')
const _ = require('lodash')
const os = require('os')
const Promise = require('promise')
const localBus = new Emitter()
const delayedCommands = []
let readyTransport
let transport

const defaultQueueAndExchangeName = os.hostname() + '-' + Guid.raw();

// default config, overridable by init options
let config = {
	transport: 'amqp',
	queueNames: [],
	defaultQueue: {
		name: defaultQueueAndExchangeName
	},
	defaultExchange: {
		name: defaultQueueAndExchangeName
	},
	queueOptions: {},
	exchangeOptions: {},
	requestTimeout: 30000,
  publishMessageTypes: {}
};

const deliver = function busDeliver(queueName, env) {
	env = envelope.unwrap(env);
	_.map(env.messageType, function(mt) {
		if (env.requestId) {
			localBus.emit(env.requestId, env.message, env, queueName);
		}
		localBus.emit(queueName + '.' + mt, env.message, env, queueName);
	});
};

const getTransport = function busGetTransport(transportName) {
  if (transportName.indexOf('/') === 0) {
    return require(transportName);
  }
  return require('./transports/' + transportName);
};

const init = function busInit(options) {
	_.merge(config, options);

  transport = getTransport(config.transport);

  transport.on(config.defaultQueue.name + '.message', deliver);
	transport.on(config.defaultQueue.name + '.ready', function() {});

	config.queueNames.forEach(function(queueName) {
		transport.on(queueName + '.ready', function() {}); // no op right now
		transport.on(queueName + '.message', deliver);
	});

	transport.on('ready', function() {
		readyTransport = transport;

    while (delayedCommands.length > 0) {
      var command = delayedCommands.shift();
      command();
    }

		localBus.emit('ready');
	});

  transport.on('error', function(err) {
    localBus.emit('error', err);
  });

  transport.init(config);
};

const publish = function busPublish(messageType, message) {
	whenTransportReady(function() {
		const messageTypes = config.publishMessageTypes[messageType] || [messageType];
		const wrapped = envelope.wrap(messageTypes, message)
    transport.publish(messageType, wrapped);
	});
};

const send = (queue, messageType, message, queueArguments) => {
	whenTransportReady(() => {
		const messageTypes = config.publishMessageTypes[messageType] || [messageType];
		const wrapped = envelope.wrap(messageTypes, message)
		transport.send(queue, wrapped, queueArguments)
	})
}

const ready = function busReady(callback) {
  localBus.on('ready', callback);
};

const error = function busError(callback) {
  localBus.on('error', callback);
};

const subscribe = function busSubscribe(subscription, callback) {
	if (typeof subscription === 'string') {
		subscription = { messageType: subscription }
	}

	if (!subscription.queueName) {
		subscription.queueName = config.defaultQueue.name;
	}

	localBus.on(subscription.queueName + '.' + subscription.messageType, function(message, envelope, queueName) {
		process(callback, message, envelope, queueName);
	});

  whenTransportReady(function() {
    transport.bind(subscription, config.exchangeOptions);
  });
};

const process = function(callback, message, envelope, queueName, clientError) {
	// reject a message because of an error, passed to callback for explicit reject
	const reject = function(e) {
		moveToError(message, envelope, queueName, e);
	};

	try {
		// response to a request
		if (envelope.requestId) {
			Promise.resolve(callback(clientError, envelope)).catch(reject);
		} else { // regular callback signature
			Promise.resolve(callback(message, envelope, queueName)).catch(reject);
		}
	} catch (e) { // synchronous exception handler
		reject(e);
	}
};

const moveToError = function(message, envelope, queueName, error) {
	const errorQueueName = queueName + '_error';
	const errorDate = new Date().toString();
	console.log(
		errorDate.toString(),
		'masstransit: Error processing inbound message.\n',
		error.stack, '\n',
		'[Inbound Context]\n', envelope, '\n',
		'Moving message to queue [' + errorQueueName + ']\n',
		'End error report'
	);

	const headers = {
		errorDate: errorDate,
		errorMessage: error.stack
	};

	transport.send(errorQueueName, envelope, headers);
};

const whenTransportReady = function busWhenTransportReady(command) {
	if (readyTransport) {
    command();
  } else {
    delayedCommands.push(command);
  }
};

const request = function busRequest(requestExchange, messageType, message, callback, timeout) {
	const requestGuid = Guid.raw();
	const destinationAddress = 'rabbitmq://' + config.host + '/' + requestExchange;
	const responseAddress = 'rabbitmq://' + config.host + ':5672/' + config.defaultQueue.name + '?durable=false&autodelete=true';
	const env = envelope.wrap([messageType], message, requestGuid, destinationAddress, responseAddress);

	const timeoutObj = setTimeout(function() {
		localBus.removeAllListeners(requestGuid);
		process(callback, {}, { requestId: requestGuid }, {}, 'timeout');
	}, timeout || config.requestTimeout);

	localBus.once(requestGuid, function(message, envelope, queueName) {
		clearTimeout(timeoutObj);
		process(callback, message, envelope, queueName);
	});

	whenTransportReady(function() {
		transport.directPublish(requestExchange, env);
  });

	return requestGuid;
}

module.exports.init = init;
module.exports.publish = publish;
module.exports.send = send
module.exports.ready = ready;
module.exports.error = error;
module.exports.subscribe = subscribe;
module.exports.request = request;
module.exports.config = config;
