const amqp = require('amqplib')
const serializer = require('../serializer')
const events = require('events')
const _ = require('lodash')
const emitter = new events.EventEmitter()

let connection
let channel
let pubChannel

let config = {
	publishOptions: {
		deliveryMode: 2,
		headers: {
			'Content-Type': 'application/vnd.masstransit+json'
		}
	},
	defaultQueue: {
		options: {
			exclusive: false,
			durable: true,
			autoDelete: false
		}
	},
	defaultExchange: {
		options: {
			durable: true,
			autoDelete: false,
			internal: false,
			type: 'fanout'
		}
	},
	queueOptions: {
		exclusive: false,
		durable: true,
		autoDelete: false
	},
	exchangeOptions: {
		durable: true,
		autoDelete: false,
		internal: false,
		type: 'fanout'
	},
	heartbeat: 1
}

const initChannel = () => {
	startPublisher()
	startReceiver()
}

const startPublisher = () => {
	connection.createConfirmChannel().then(ch => {
		pubChannel = ch
	})
}

const startReceiver = () => {
	connection.createChannel().then(ch => {
		channel = ch

		// transport ready
		emitter.emit('ready')
	})
}

const bind = (subscription, exchangeOptions) => {
	const myExchangeOptions = {}
	_.merge(myExchangeOptions, config.exchangeOptions)
	_.merge(myExchangeOptions, exchangeOptions)

	channel.assertExchange(subscription.messageType, myExchangeOptions.type, myExchangeOptions).then(() => {
		return channel.assertQueue(subscription.queueName).then(queueOk => {
			channel.bindQueue(queueOk.queue, subscription.messageType, '').then(() => {
				emitter.emit(subscription.messageType + '.' + subscription.queueName + '.bound')
				return queueOk.queue
			}).then(queue => {
				channel.consume(queue, message => {
					// trasnsport queue message
					emitter.emit(queue + '.message', queue, serializer.deserialize(message.content.toString()))
				})
			})
		})
	})
}

const close = () => {
	connection.close()
}

const init = (options) => {
	_.merge(config, options)
	let connectString = config
	if (config.url) {
		connectString = config.url
	}

	amqp.connect(connectString, config).then(conn => {
		conn.on('error', function(err) {
      if (err.message !== 'Connection closing') {
        emitter.emit('error', err.message)
      }
    })

		conn.on('close', () => {
			// Reconnect if we lose the connection for whatever reason
			emitter.emit('error', 'connection closed')
			setTimeout(() => init(options), 1000)
		})

		connection = conn

		initChannel()
	})
	.catch(err => {
		emitter.emit('error', err.stack)
	})
}

const publish = (messageType, queue, message) => {
	pubChannel.publish(messageType, queue, message, config.publishOptions)
}

emitter.bind = bind
emitter.close = close
emitter.init = init
emitter.publish = publish

module.exports = emitter
