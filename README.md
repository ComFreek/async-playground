# ComFreek's async generator/Promises playground

[![Build Status](https://img.shields.io/travis/ComFreek/async-playground.svg)](https://travis-ci.org/ComFreek/async-playground)
[![Coverage Status](https://img.shields.io/coveralls/ComFreek/async-playground.svg)](https://coveralls.io/github/ComFreek/async-playground?branch=master)

&nbsp; &nbsp; [GitHub Repo](https://github.com/ComFreek/async-playground) | [Documentation](https://comfreek.github.io/async-playground) | [Coverage results](https://comfreek.github.io/async-playground/coverage)

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

  - `CriticalSection`: a non-reentrant critical section.

    ```typescript
    // see examples/critical-section.ts
    const queue = new AsyncQueue<number>();

    // Sum consecutive (!) lines every 50ms or when an IO event occurred
    setTimeout(sumConsecutiveNumbers, 50);
    IO.on('sum', sumConsecutiveNumbers);
    IO.on('data', (x: number) => queue.queue(x));

    async function sumConsecutiveNumbers() {
    	// Must wrap it in a section, otherwise two "sumConsecutiveNumbers"
    	// calls from timeout/IO or timeout/timeout or IO/IO may overlap
    	// due to the 'await' below!
    	await CriticalSection.for(sumConsecutiveNumbers).do(async () => {
    		const numberOfElementsToSum = 10;
    		let sum = 0;

    		for (let i = 0; i < numberOfElementsToSum; i++) {
    			sum += await queue.dequeue();
    		}
    		console.log(sum);
    	});
    }
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

## Documentation

- Live on https://comfreek.github.io/async-playground.
- Built by `npm run build-docs` and automatically pushed to the `gh-pages` branch by Travis CI, see `.travis.yml`.

## Tests

- Run by `npm test` and automatically performed by Travis CI, see `.travis.yml`.
- If you would like test scripts on your own, do note that a recent version of Node.js is required and it must be run with the `--harmony` flag: `node --harmony your-script.js`. The flag must also appear before the script name.

## Contributions & licensing

Ideas and code contributions are welcome! Feel free to copy and redistribute code under the terms of the ISC license, see `LICENSE`.