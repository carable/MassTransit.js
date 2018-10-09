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

const initChannel = async () => {
	await startPublisher()
	await startReceiver()
}

const startPublisher = async () => {
	const ch = await connection.createConfirmChannel()
	pubChannel = ch
	return ch
}

const startReceiver = async () => {
	const ch = await connection.createChannel()
	channel = ch

	// transport ready
	emitter.emit('ready')

	return ch
}

const bind = async (subscription, exchangeOptions) => {
	const myExchangeOptions = {}
	_.merge(myExchangeOptions, config.exchangeOptions)
	_.merge(myExchangeOptions, exchangeOptions)

	if (subscription.messageType) {
		await channel.assertExchange(subscription.messageType, myExchangeOptions.type, myExchangeOptions)
	}

	const queueOk = await channel.assertQueue(subscription.queueName)
	const queue = queueOk.queue

	if (subscription.messageType) {
		await channel.bindQueue(queueOk.queue, subscription.messageType, '')
	}

	emitter.emit(subscription.messageType + '.' + subscription.queueName + '.bound')

	return channel.consume(queue, message => {
		// transport queue message
		emitter.emit(queue + '.message', queue, serializer.deserialize(message.content.toString()))

		channel.ack(message)
	})
}

const close = () => {
	connection.close()
}

const init = async (options) => {
	_.merge(config, options)
	let connectString = config
	if (config.url) {
		connectString = config.url
	}

	try {
		const conn = await amqp.connect(connectString, config)

		conn.on('error', (err) => {
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

		await initChannel(config)

		return conn
	} catch (err) {
		console.error("initChannel", err)
		emitter.emit('error', err)
	}
}

const publish = (messageType, message) => {
	const buffer = Buffer.from(serializer.serialize(message))
	pubChannel.publish(messageType, '', buffer, config.publishOptions)
}

const send = async (request, queueOptions, message) => {
	const buffer = Buffer.from(serializer.serialize(message))

	// Make sure the queue is ready before we send
	await pubChannel.assertQueue(request.queueName, { durable: true, ...queueOptions })

	await pubChannel.sendToQueue(request.queueName, buffer)
}

const get = async (request, queueOptions) => {
	// Make sure the queue is ready before we send
	await channel.assertQueue(request.queueName, { durable: true, ...queueOptions })

	const message = await channel.get(request.queueName, request.options)

	if (message) {
		emitter.emit(request.queueName + '.message', request.queueName, serializer.deserialize(message.content.toString()))
	}
}

emitter.bind = bind
emitter.close = close
emitter.init = init
emitter.publish = publish
emitter.send = send
emitter.get = get

module.exports = emitter
