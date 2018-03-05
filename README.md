# ComFreek's async generator/Promises playground

Inspired by
[Exploring ES2018 and ES2019](http://exploringjs.com/es2018-es2019/index.html) by [Dr. Axel Rauschmayer](http://dr-axel.de/), especially the part on asynchronous generators, I wrote some TypeScript classes of well-known concepts.

It's fun to (re-)explore these concepts, but with Promises and ECMAScript's execution model in mind:

  - `Semaphore`: typical counting semaphore implementation
    ```typescript
    const sem = new Semaphore();
    doSomeIO().then(() => sem.free());
    await sem.take();
    ```

  - `AsyncQueue`: a queue with asynchronous dequeue operation
    ```typescript
    const queue = new AsyncQueue<string>();

    getFile('test.txt').on('line', (line) => queue.queue(line));

    // Process the lines
    await queue.dequeue();
    ```

  - `AsyncLimitedQueue`: a queue where the queue operation is asynchronous as well
    since it enforces a user-specified limit on the number of entries.

    ```typescript
    // Only store up to 30 lines at the same time
    const queue = new AsyncLimitedQueue<string>(30);

    // queue now returns a promise, which resolves
    // when the line has been inserted
    // Assumption: the interface behind getFile() waits for this promise as well to resolve
    getFile('test.txt').on('line', async (line) => queue.queue(line));

    // Process the lines
    await queue.dequeue();
    ```

## Fully self-contained example

Cf. `examples/queue-stdio-lines.ts` and `examples/README.md` on how to run.

```typescript
import { IAsyncQueue, AsyncQueue } from '../queue/index';

const readline = require('readline');

async function* readInput() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});

	// null signals the end of input
	const queue: IAsyncQueue<string|null> = new AsyncQueue();

	rl.on('line', (line: string) => queue.queue(line));
	rl.on('close', () => queue.queue(null));

	yield* queue;
};

(async function() {
	for await (const line of readInput()) {
		if (line === null) {
			break;
		}
		console.log(line);
	}
})();
```

## Tests

- `npm test`
- Note that a recent version of Node.js is required and it must be run with the `--harmony` flag: `node --harmony your-script.js`. (The flag must also appear before the script name!)

## Documentation

`npm run build-docs`

## Contributions & licensing

Ideas and code contributions are welcome! Feel free to copy and redistribute code under the terms of the ISC license, see `LICENSE`.