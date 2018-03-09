import { expect } from 'chai';
import { wait } from '../timing.common-spec';

import { IAsyncQueue, NoElementError } from './AsyncQueue';
import { IAsyncLimitedQueue } from './AsyncLimitedQueue';

/**
* An element used by some unit tests to signal the end of
* data insertion.
*/
export const DEADPILL = 0xDEADBEEF;

/**
* Time interval in milliseconds which some unit tests use
* to continuously insert elements into the queue.
*/
export const QUEUE_DELTA_TIME = 5;

/**
 * Run common queue tests, i.e. this function calls it() for each of its
 * unit tests.
 * @param queueCreator A "factory function" for queue objects, which is run
 *                     before each test.
 *
 * @param COUNT Each test guarantees that it only holds up to COUNT many
 *              elements in the queue at the same time.
 *              In case of IAsyncQueue, the caller must provide a value of
 *              COUNT <= LIMIT of the respective queue. Otherwise, some tests
 *              might run into deadlocks.
 */
export function runCommonQueueTests(queueCreator: (() => IAsyncQueue<number>) | (() => IAsyncLimitedQueue<number>), COUNT: number) {
	let queue: IAsyncQueue<number> | IAsyncLimitedQueue<number>;

	beforeEach(() => {
		queue = queueCreator();
	});

	it('allow data to contain special values (null/undefined/false/...)', async () => {
		const specialValues: any[] = [
			null, undefined, false, 0, NaN, [], {}
		];

		for (const specialValue of specialValues) {
			const myQueue: IAsyncQueue<any> | IAsyncLimitedQueue<any> = queueCreator();

			// Test dequeue()
			await myQueue.queue(specialValue);

			expect(myQueue.size()).to.equal(1);

			const dequeuedValue = myQueue.dequeue();
			// Special-case NaN due to the fact NaN !== NaN.
			if (Number.isNaN(specialValue)) {
				await expect(dequeuedValue).to.eventually.be.NaN;
			}
			else {
				await expect(dequeuedValue).to.eventually.equal(specialValue);
			}

			// Test poll()
			await myQueue.queue(specialValue);

			expect(myQueue.size()).to.equal(1);

			const polledValue = myQueue.poll();
			if (Number.isNaN(specialValue)) {
				expect(polledValue).to.be.NaN;
			}
			else {
				expect(polledValue).to.equal(specialValue);
			}
		}
	});

	/**
	 * Regression test: previously, the queue internally checked
	 * the result of buffer.shift() with `if (!result) { throw ... }`
	 * leading to exceptions even if the result was valid, namely if it
	 * was 0.
	 */
	it('queue the number 0, dequeue it', async () => {
		await queue.queue(0);
		await expect(queue.dequeue()).to.eventually.equal(0);
	});

	it('x queues, x immediately resolving dequeues', async () => {
		for (let i = 0; i < COUNT; i++) {
			await queue.queue(i);
		}

		for (let i = 0; i < COUNT; i++) {
			await expect(queue.dequeue()).to.eventually.equal(i);
		}
	});

	it('x blocking dequeues, x freeing queues', async () => {
		// Milliseconds to wait between consecutive queues
		const QUEUE_DELTA_TIME = 5;

		// Insert the numbers [0, COUNT - 1] in-order (!) into the queue.
		for (let i = 0; i < COUNT; i++) {
			(function(curNumber) {
				wait(curNumber * QUEUE_DELTA_TIME).then(() => {
					return queue.queue(curNumber);
				});
			})(i);
		}

		// Extract the numbers in-order (!) out of the queue.
		for (let i = 0; i < COUNT; i++) {
			await expect(queue.dequeue()).to.eventually.equal(i);
		}
	});

	it('poll on empty queue throws', async () => {
		expect(queue.size()).to.equal(0);
		expect(() => queue.poll()).to.throw(NoElementError);
	});

	it('polls on non-empty queue succeed until it is empty', async () => {
		for (let i = 0; i < COUNT; i++) {
			await queue.queue(i);
		}

		for (let i = 0; i < COUNT; i++) {
			expect(queue.poll()).to.equal(i);
			expect(queue.size()).to.equal(COUNT - i - 1);
		}

		// Must ideally throw for an infinite amount of calls
		for (let i = 0; i < COUNT; i++) {
			expect(() => queue.poll()).to.throw;
			expect(queue.size()).to.equal(0);
		}
	});

	it('Queue x elements, retrieve them via AsyncIterable', async () => {
		for (let i = 0; i < COUNT - 1; i++) {
			await queue.queue(i);
		}
		await queue.queue(DEADPILL);

		let retrievedElementCount = 0;
		for await (const element of queue) {
			if (element === DEADPILL) {
				break;
			}

			expect(element).to.equal(retrievedElementCount);
			retrievedElementCount++;
		}
	});

	it('Queue x elements after timeout, retrieve them via AsyncIterable', async () => {
		wait(50).then(async () => {
			for (let i = 0; i < COUNT - 1; i++) {
				await queue.queue(i);
			}
		});

		wait(100).then(async () => {
			await queue.queue(DEADPILL);
		});

		let retrievedElementCount = 0;
		for await (const element of queue) {
			if (element === DEADPILL) {
				break;
			}

			expect(element).to.equal(retrievedElementCount);
			retrievedElementCount++;
		}
	});

	it('queueAll', async () => {
		const numberArray: number[] = [];

		for (let i = 0; i < COUNT; i++) {
			numberArray.push(i);
		}

		await queue.queueAll(numberArray);

		for (let i = 0; i < COUNT; i++) {
			await expect(queue.dequeue()).to.eventually.equal(i);
		}

		expect(queue.size()).to.equal(0);
	});

	it('queueAllAsync', async () => {
		async function *asyncGenerator(): AsyncIterable<number> {
			for (let i = 0; i < COUNT; i++) {
				const curNumber = i;
				yield wait(QUEUE_DELTA_TIME * i).then(() => curNumber);
			}
		}

		// We do not await queueAllAsync => no element will be queued
		// while until the next 'await' in this unit test.
		queue.queueAllAsync(asyncGenerator());

		// This is guaranteed by JS' execution model, see the documentation
		// of {@link queueAllAsync}.
		expect(queue.size()).to.equal(0);

		for (let i = 0; i < COUNT; i++) {
			await expect(queue.dequeue()).to.eventually.equal(i);
		}

		expect(queue.size()).to.equal(0);

		// The same test, but with awaiting the async queueing
		await queue.queueAllAsync(asyncGenerator());
		expect(queue.size()).to.equal(COUNT);

		for (let i = 0; i < COUNT; i++) {
			await expect(queue.dequeue()).to.eventually.equal(i);
		}

		expect(queue.size()).to.equal(0);
	});
}
