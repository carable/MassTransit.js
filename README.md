# Carable - Masstransit.js fork

Masstransit javascript messaging using [AMQPLib](https://www.squaremobius.net/amqp.node/channel_api.html) over Websockets.

## Introduction
MassTransit JS is a javascript implementation of the Masstransit messaging framework. It provides a way to communicate with other MassTransit instances in your network via Stomp message brokering. You can run the code both from nodeJs as well as a webbrowser that supports websockets.

Please check out the sample setup below for more stuff.

## Installation
Simply import the lib in a js file, see Configuration for how to initialise the lib.
```
import * as masstransit from "@carable/masstransit";
```

## Configuration

The following snippet is a js example of how to initialise Masstransit.js

init.js
```
import * as masstransit from "@carable/masstransit";

const busConfig = {
      host: 'Masstransit:host',
      login: 'Masstransit:vhost',
      password: 'Masstransit:password',
      port: 0001,
      vhost: 'Masstransit:vhost',
      queueName: 'Masstransit:QueueName'
    }

    const urlString = 'amqps://' + busConfig.login + ':' + busConfig.password + '@' + busConfig.host + ':' + busConfig.port + '/' + busConfig.vhost

    const ssl = {
      enabled: true,
      rejectUnauthorized: false
    }

    const bus = masstransit.create();

    bus.init({
      url: urlString,
      ssl: ssl,
      queueNames: [busConfig.queueName]
    });

```

## Usage

For working exmaples check out the `samples` folder.

### Methods

`get(request = {}, queueOptions = {}, callback)`

Ask a queue for a message, as an RPC. This will be resolved with either false, if there is no message to be had (the queue has no messages ready), or a message in the same shape as detailed in.

`send(request = {}, queueOptions, message)`

send a message to either a queue or just a messageType with the default Queue.

`request(requestExchange, messageType, message, callback, timeout)`

bind bus to either a Queue or a MessageType to listen to and retreive messages.

`publish(messageType, message)`

send a message with no queue attached.
