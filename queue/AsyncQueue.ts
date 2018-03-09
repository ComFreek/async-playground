import { ISemaphore, Semaphore } from '../semaphore/index';

/**
 * Asynchronous FIFO queue with a Promise-driven dequeue operation.
 *
 * All element values are allowed, especially falsy ones, e.g.
 * false, 0, undefined, null, [], {} are all valid elements which
 * can be queued and dequeued.
 *
 * The {@link AsyncIterable} interface iterates the queue's (future) contents
 * ad infinitum. Users are advised to signal the end by manual insertion of a
 * special value (a so-called poison pill):
 *
 * ```
 * const queue = new AsyncQueue<string|null>();
 * file.on('data', (data) => queue.queue(data));
 * file.on('close', () => queue.queue(null));
 *
 * for await (const data of queue) {
 *   if (data === null) {
 *     break;
 *   }
 *   // Otherwise, process data
 * }
 * ```
 */
export interface IAsyncQueue<T> extends AsyncIterable<T> {
	/**
	 * Queue an element immediately.
	 */
	queue(data: T): void;

	/**
	 * Queue all elements of an iterable, e.g. an array or a generator function.
	 *
	 * @example `queue.queueAll(['myArray', 'of', 'strings'])`
	 *
	 * @example If one has a generator function f:
	 *          `function *f(): Iterable<string> { ... }`
	 *          then you can call `queue.queueAll(f())`.
	 */
	queueAll(iterable: Iterable<T>): void;

	/**
	 * Queue all elements of an asynchronous iterable, e.g. an asynchronous
	 * generator functions.
	 *
	 * @example Using an asynchronous generator function:
	 * ```
	 * async function *f(): AsyncIterable<string> {
	 *   yield* ['Array', 'of', 'strings'];
	 * }
	 *
	 * const previousSize = queue.size();
	 * queue.queueAllAsync(f());
	 * // ^ We do not await the queueing!
	 * // Therefore: queue.size() === previousSize here!
	 * // This is indeed guaranteed by JS' execution model. There is
	 * // no way queueAllAsync could have queried an element from f()
	 * // asynchronously using a promise before this code gives up
	 * // the "CPU power" by await or yield.
	 *
	 * await queue.dequeue(); // 'Array'
	 * await queue.dequeue(); // 'of'
	 * await queue.dequeue(); // 'strings'
	 *
	 * // queue.size() === 0 and queue.dequeue() would block
	 * // ad infinitum
	 *
	 * await queue.queueAllAsync(f());
	 * // We now await the queueing!
	 * // Therefore: queue.size() === 3 here!
	 * ```
	 *
	 * @example AsyncQueue instances are also asynchronous iterables,
	 *          meaning that you can stack multiple queues together:
	 * ```
	 * const backgroundQueue: IAsyncQueue<string> = new AsyncQueue();
	 * const foregroundQueue: IAsyncQueue<string> = new AsyncQueue();
	 *
	 * setTimeout(() => backgroundQueue.queue('Hello World!'), 100);
	 *
	 * foregroundQueue.queueAllAsync(backgroundQueue);
	 * const retrievedString = await foregroundQueue.dequeue();
	 *
	 * // retrievedString === 'Hello World!'
	 * ```
	 */
	queueAllAsync(iterable: AsyncIterable<T>): Promise<void>;

	/**
	 * Dequeue an element, waiting for data to be available if necessary.
	 *
	 * @returns A promise which is fulfilled when an element (as queued by
	 *          queue()) becomes available.
	 *          If multiple dequeus() are issued sequentially, it is
	 *          implementation-defined whether they are fulfilled in the same
	 *          order or not. However, the data is still retrieved in FIFO
	 *          fashion, meaning the first fulfilled promise gets the first
	 *          element, the second fulfilled the second one and so forth.
	 */
	dequeue(): Promise<T>;

	/**
	 * Dequeue an element if available or throw an exception otherwise.
	 *
	 * @returns The first element of the queue.
	 * @throws A {@link NoElementError} exception if the queue is empty at the time of the call.
	 */
	poll(): T;

	/**
	 * Return the current size at the moment of the call.
	 *
	 * Even though code like
	 * ```
	 * if (queue.size() >= 1) {
	 *   const element = queue.poll();
	 * }
	 * ```
	 * is technically not wrong (due to JS' execution model), users are
	 * advised to avoid this pattern. Instead, users are encouraged to
	 *
	 *  - in cases where waiting for a promise is impossible, to use
	 *    {@link poll} and catch the exception,
	 *  - or to use {@link dequeue} with JS' `await` or
	 *    `queue.dequeue().then(...)`.
	 */
	size(): number;
}

/**
 * A NoElementError indicating the lack of at least one element required for
 * an operation.
 *
 * Requires a TypeScript target >= ES6. Otherwise, the specs, which effectively
 * test for `err instanceof NoElementError`, fail.
 */
export class NoElementError extends Error {
}

export class AsyncQueue<T> implements IAsyncQueue<T> {
	private buffer: T[] = [];
	private elementSem: ISemaphore = new Semaphore(0);

	public queue(data: T): void {
		this.buffer.push(data);
		this.elementSem.free();
	}

	public queueAll(iterable: Iterable<T>): void {
		for (const element of iterable) {
			this.queue(element);
		}
	}

	public async queueAllAsync(iterable: AsyncIterable<T>): Promise<void> {
		for await (const element of iterable) {
			this.queue(element);
		}
	}

	public async dequeue(): Promise<T> {
		await this.elementSem.take();

		try {
			return this.poll();
		}
		catch (err) {
			if (err instanceof NoElementError) {
				throw new Error('AsyncQueue dequeue: poll() threw an exception \
 even though dequeue() waited for its element semaphore to be available via take().');
			}
			else {
				throw err;
			}
		}
	}

	public poll(): T {
		if (this.buffer.length >= 1) {
			const dequeuedElement = this.buffer.shift();

			// Force-cast the element since we know that the buffer contains
			// at least one element and JS' execution model prohibits other
			// interleaving fibers to modify the buffer (=> no race condition).
			//
			// Also, we cannot check for shift() returning undefined as the queue
			// might well contain "undefined" as such.
			return (dequeuedElement as T);
		}
		else {
			throw new NoElementError('AsyncQueue poll() called on an empty AsyncQueue.\
 Users of this function must generally expect this exception (being more of a return value in disguise).\
 Did you forget to surround your code with a try-catch?');
		}
	}

	public size(): number {
		return this.buffer.length;
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			yield this.dequeue();
		}
	}
}
