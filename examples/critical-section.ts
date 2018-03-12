import { AsyncQueue } from '../queue/index';
import { CriticalSection } from '../semaphore/CriticalSection';

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false
});

const queue = new AsyncQueue<number>();

// Sum consecutive (!) lines every 10s or when the user enters the 'sum' command
setTimeout(sumConsecutiveNumbers.bind(null, 'From timeout'), 10000);

// Read either the 'sum' command from stdin or numbers to add to the queue
rl.on('line', (line: string) => {
	if (line === 'sum') {
		sumConsecutiveNumbers('From user command sum');
	}
	else {
		let number = parseInt(line, 10);
		if (number != NaN) {
			queue.queue(number);
		}
	}
});

async function sumConsecutiveNumbers(comment: string) {
	// Must wrap it in a section, otherwise two "sumConsecutiveNumbers"
	// calls from timeout/IO or timeout/timeout or IO/IO may overlap
	// due to the 'await' below!
	await CriticalSection.for(sumConsecutiveNumbers).do(async () => {
		const numberOfElementsToSum = 10;
		let sum = 0;

		for (let i = 0; i < numberOfElementsToSum; i++) {
			sum += await queue.dequeue();
		}
		console.log(`${comment}: ${sum}`);
	});
}
