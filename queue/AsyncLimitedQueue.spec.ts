import { AsyncLimitedQueue, IAsyncLimitedQueue } from './AsyncLimitedQueue';
import { NoElementError } from './AsyncQueue';
import * as chai from 'chai';
import 'mocha';

import { TIME_STEP, wait, expectInstantly, expectTimelyIn, expectNever } from '../timing.common-spec';

import chaiAsPromised = require('chai-as-promised');
import { runCommonQueueTests } from './Queue.common-spec';
chai.use(chaiAsPromised);
const expect = chai.expect;

function *range(min: number, exclusiveMax: number) {
	if (!Number.isInteger(min) || !Number.isInteger(exclusiveMax)) {
		throw new Error('range: arguments must be whole integers');
	}
	if (min > exclusiveMax) {
		throw new Error('range: min <= max must hold.');
	}
	for (let i = min; i < exclusiveMax; i++) {
		yield i;
	}
}

async function *syncToAsyncIterable<T>(iterable: Iterable<T>): AsyncIterable<T> {
	for (const element of iterable) {
		yield element;
	}
}

describe('AsyncLimitedQueue', () => {
	/**
	 * Number of test entries which some unit tests insert and then dequeue
	 * into and out of the queue.
	 *
	 * Must be >= 1 and <= {@link LIMIT}
	 */
	const COUNT = 10;

	/**
	 * Must be >= 1.
	 */
	const LIMIT = 10;
	let queue: IAsyncLimitedQueue<number> = new AsyncLimitedQueue(LIMIT);

	beforeEach(() => {
		queue = new AsyncLimitedQueue(LIMIT);
	});

	runCommonQueueTests(() => new AsyncLimitedQueue(LIMIT), COUNT);

	it('reject invalid limits on number of elements', async () => {
		const invalidLimits = [
			NaN, -Infinity, -2, -1.5, -1, -0, +0, 1.5, Infinity, 1.5
		];

		for (const invalidLimit of invalidLimits) {
			expect(() => new AsyncLimitedQueue(invalidLimit)).to.throw();
		}
	});

	it('x queues (x >= limit), x dequeues', async () => {
		// Non-blocking queues
		for (let i = 0; i < LIMIT; i++) {
			await queue.queue(i);
		}

		wait(TIME_STEP).then(async () => {
			for (let i = 0; i < LIMIT + COUNT; i++) {
				await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
			}
		});


		// COUNT-many queues
		// Only the first queue has to wait for the above timeout to occur
		await expectTimelyIn(queue.queue(LIMIT), TIME_STEP);

		for (let i = 1; i < COUNT; i++) {
			await expectInstantly(queue.queue(i + LIMIT));
		}
	});

	it('x = limit queues, 1 offer', async () => {
		// Non-blocking queues
		for (let i = 0; i < LIMIT; i++) {
			await queue.queue(i);
		}

		expect(queue.offer(LIMIT + 1)).to.be.false;

		for (let i = 0; i < LIMIT; i++) {
			await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
		}

		await expectNever(queue.dequeue());
	});

	it('alternating polls/offers', async () => {
		for (let i = 0; i < LIMIT; i++) {
			expect(() => queue.poll()).to.throw(NoElementError);
			queue.offer(i);
			expect(queue.poll()).to.equal(i);
		}

		// Must ideally throw for an infinite amount of calls, we just
		// test 50 times.
		for (let i = 0; i < 50; i++) {
			expect(() => queue.poll()).to.throw(NoElementError);
		}
	});

	it('offerAll: less than LIMIT elements', async () => {
		let numbers = range(0, LIMIT - 1);
		expect(queue.offerAll(numbers)).to.equal(LIMIT - 1);

		for (let i = 0; i < LIMIT - 1; i++) {
			await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
		}
		expect(queue.size()).to.equal(0);
	});

	it('offerAll: more than LIMIT elements', async () => {
		let numbers = range(0, LIMIT + COUNT);
		expect(queue.offerAll(numbers)).to.equal(LIMIT);

		for (let i = 0; i < LIMIT; i++) {
			await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
		}
		expect(queue.size()).to.equal(0);
	});

	it('offerAllAsync: exactly LIMIT elements', async() => {
		let numbers = syncToAsyncIterable(range(0, LIMIT));
		await expect(queue.offerAllAsync(numbers)).to.eventually.equal(LIMIT);

		for (let i = 0; i < LIMIT; i++) {
			await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
		}
		expect(queue.size()).to.equal(0);
	});

	it('offerAllAsync: more than LIMIT elements', async () => {
		let numbers = syncToAsyncIterable(range(0, LIMIT + COUNT));
		await expect(queue.offerAllAsync(numbers)).to.eventually.equal(LIMIT);

		for (let i = 0; i < LIMIT; i++) {
			await expectInstantly(expect(queue.dequeue()).to.eventually.equal(i));
		}
		expect(queue.size()).to.equal(0);
	});

	it('queueAll correctly resolves after queueing all elements', async () => {
		// No await
		const queueAllPromise = queue.queueAll(range(0, LIMIT)).then(() => {
			expect(queue.size()).to.equal(LIMIT);
		});
		expect(queue.size()).to.equal(0);

		await queueAllPromise;
	});
});
