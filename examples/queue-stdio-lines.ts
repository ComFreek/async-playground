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