Message queue
=============

*This API is available since Fedify 0.5.0.*

The `MessageQueue` interface in Fedify provides an abstraction for handling
asynchronous message processing. This document will help you understand
how to choose a `MessageQueue` implementation and how to create your own custom
implementation if needed.


Choosing a `MessageQueue` implementation
----------------------------------------

When choosing an implementation, consider the following factors:

 1. *Runtime environment*: Are you using [Deno], [Node.js], [Bun],
    or another JavaScript runtime?
 2. *Scalability need*: Do you need to support multiple workers or servers?
 3. *Persistence requirements*: Do messages need to survive server restarts?
 4. *Development vs. production*: Are you in a development/testing phase or
    deploying to production?

Fedify provides several built-in `MessageQueue` implementations,
each suited for different use cases:

[Deno]: https://deno.com/
[Node.js]: https://nodejs.org/
[Bun]: https://bun.sh/

### `InProcessMessageQueue`

`InProcessMessageQueue` is a simple in-memory message queue that doesn't persist
messages between restarts. It's best suited for development and testing
environments.

Best for
:   Development and testing.

Pros
:   Simple, no external dependencies.

Cons
:   Not suitable for production, doesn't persist messages between restarts.

~~~~ typescript twoslash
import type { KvStore } from "@fedify/fedify";
// ---cut-before---
import { createFederation, InProcessMessageQueue } from "@fedify/fedify";

const federation = createFederation<void>({
// ---cut-start---
  kv: null as unknown as KvStore,
// ---cut-end---
  queue: new InProcessMessageQueue(),
  // ... other options
});
~~~~

### `DenoKvMessageQueue` (Deno only)

`DenoKvMessageQueue` is a message queue implementation for [Deno] runtime that
uses Deno's built-in [`Deno.openKv()`] API. It provides persistent storage and
good performance for Deno environments.  It's suitable for production use in
Deno applications.

Best for
:   Production use in Deno environments.

Pros
:   Persistent, scalable, easy to set up.

Cons
:   Only available in Deno runtime.

~~~~ typescript
import { createFederation } from "@fedify/fedify";
import { DenoKvMessageQueue } from "@fedify/fedify/x/deno";

const kv = await Deno.openKv();
const federation = createFederation<void>({
  queue: new DenoKvMessageQueue(kv),
  // ... other options
});
~~~~

[`Deno.openKv()`]: https://docs.deno.com/api/deno/~/Deno.openKv

### [`RedisMessageQueue`]

> [!NOTE]
> The [`RedisMessageQueue`] class is available in the [@fedify/redis] package.

[`RedisMessageQueue`] is a message queue implementation that uses Redis as
the backend. It provides scalability and high performance, making it
suitable for production use across various runtimes.  It requires a Redis
server setup and management.

Best for
:   Production use across various runtimes.

Pros
:   Persistent, scalable, supports multiple workers.

Cons
:   Requires Redis setup and management.

~~~~ typescript twoslash
import type { KvStore } from "@fedify/fedify";
// ---cut-before---
import { createFederation } from "@fedify/fedify";
import { RedisMessageQueue } from "@fedify/redis";
import Redis from "ioredis";

const federation = createFederation<void>({
// ---cut-start---
  kv: null as unknown as KvStore,
// ---cut-end---
  queue: new RedisMessageQueue(() => new Redis()),
  // ... other options
});
~~~~

[`RedisMessageQueue`]: https://jsr.io/@fedify/redis/doc/mq/~/RedisMessageQueue
[@fedify/redis]: https://github.com/dahlia/fedify-redis


Implementing a custom `MessageQueue`
------------------------------------

If the built-in implementations don't meet your needs, you can create a custom
`MessageQueue`.  Here's a guide to implementing your own:

### Implement the `MessageQueue` interface

Create a class that implements the `MessageQueue` interface, which includes
the `~MessageQueue.enqueue()` and `~MessageQueue.listen()` methods:

~~~~ typescript twoslash
import type { MessageQueue, MessageQueueEnqueueOptions } from "@fedify/fedify";

class CustomMessageQueue implements MessageQueue {
  async enqueue(
    message: any,
    options?: MessageQueueEnqueueOptions,
  ): Promise<void> {
    // Implementation here
  }

  listen(handler: (message: any) => Promise<void> | void): void {
    // Implementation here
  }
}
~~~~

### Implement `~MessageQueue.enqueue()` method

This method should add the message to your queue system.
Handle the `~MessageQueueEnqueueOptions.delay` option if provided in
`MessageQueueEnqueueOptions`.  Ensure the method is non-blocking
(use async operations where necessary).

### Implement `~MessageQueue.listen()` method

This method should start a process that listens for new messages.
When a message is received, it should call the provided `handler` function.
Ensure proper error handling to prevent the listener from crashing.

### Consider additional features

Here's a list of additional features you might want to implement in your
custom `MessageQueue`:

 -  *Message persistence*: Store messages in a database or file system
    if your backend doesn't provide persistence.
 -  *Multiple workers*: Guarantee a queue can be consumed by multiple workers.
 -  *Message acknowledgment*: Implement message acknowledgment to ensure
    messages are processed only once.  

However, you don't need to implement retry logic yourself, as Fedify handles
retrying failed messages automatically.
