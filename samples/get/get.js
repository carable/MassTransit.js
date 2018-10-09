const bus = require('../../lib').create()

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection', error.message)
})

bus.ready(() => {
  bus.send({
    name: 'Carable.Index.Events:RebuildBackofficeBooking',
    options: {
      arguments: {
        'x-max-length': 1
      }
    }
  }, {
    SomeString: 'yo',
    SomeInteger: 123,
    SomeDecimal: 1.23,
    SomeDate: new Date().toISOString(),
    PingField: 'PING'
  });

  setTimeout(() => {
    bus.get({
      name: 'Carable.Index.Events:RebuildBackofficeBooking',
      options: {
        arguments: {
          'x-max-length': 1
        }
      }
    }, '', (message, context, queueName) => {
      console.log('message destined for [' + context.destinationAddress + '] received on queue [' + queueName + ']');
    })
  }, 2000)
})

bus.error(err => {
  console.log(err)
})

bus.init({
  host: 'rabbitmq-test',
  queueNames: ['Carable.Index.Events:RebuildBackofficeBooking', 'send-test-2'],
	publishMessageTypes: {}
});
