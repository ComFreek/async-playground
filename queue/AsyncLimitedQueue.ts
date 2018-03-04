import { IAsyncQueue, AsyncQueue } from './AsyncQueue';
import { ISemaphore, Semaphore } from '../semaphore/index';

/**
 * Asynchronous entrance-limited FIFO queue with a Promise-driven dequeue operation.
 *
 * Contrary to {@link IAsyncQueue}, the queue operation is Promise-driven as well,
 * e.g. implementations might delay entrance into the queue, e.g. to enforce a
 * limit on the number of elements stored in the queue at the same time, cf.
 * {@link AsyncLimitedQueue}.
 * Other types of entrance limitations are conceivable as well, such as a
 * restriction on the sum of contained elements in case of a number queue.
 *
 * All element values are allowed, especially falsy ones, e.g.
 * false, 0, undefined, null, [], {} are all valid elements which
 * can be queued and dequeued.
 *
 * {@link IAsyncLimitedQueue#queue} operations are possibly delayed and executed in
 * implementation-dependenent order.
 *
 * @example
 *   ```
 *   queue.queue(1);
 *   queue.queue(2);
 *
 *   await queue.dequeue(); // can be 1 or 2
 *   await queue.dequeue(); // can be 1 or 2 as well (the remaining number)
 *   ```
 *
 * @example If you would like to retain the order, await the queue operations,
 *          use {@link IAsyncLimitedQueue#queueAll} or
 *          {@link IAsyncLimitedQueue#queueAllAsync}.
 *  ```
 *  await queue.queue(1);
 *  await queue.queue(2);
 *  ```
 *
 *  ```
 *  queue.queueAll([1, 2]);
 *  ```
 *
 * The {@link AsyncIterable} interface iterates the queue's (future) contents
 * ad infinitum. Users are advised to signal the end by manual insertion of a
 * special value (a so-called deadpill), see {@link IAsyncQueue}.
 */
export interface IAsyncLimitedQueue<T> extends AsyncIterable<T> {
	/**
	 * Queue an element, waiting for entrance if necessary.
	 *
	 * @example
	 *   ```
	 *   queue.queue(42).then(() => {
	 *     // 42 is now stored within the queue
	 *   });
	 *   ```
	 */
	queue(data: T): Promise<void>;

	queueAll(iterable: Iterable<T>): void;
	queueAllAsync(iterable: AsyncIterable<T>): Promise<void>;

	/**
	 * Offer an element, only queueing it if entrance is available at the time
	 * of the call.
	 *
	 * @returns True if the element could be inserted right away. False
	 *          otherwise.
	 */
	offer(data: T): boolean;

	offerAll(iterable: Iterable<T>): number;
	offerAllAsync(iterable: AsyncIterable<T>): Promise<number>;

	/**
	 * Dequeue an element if available or throw an exception otherwise.
	 *
	 * @returns The first element of the queue.
	 * @throws An exception if the queue is empty at the time of the call.
	 */
	poll(): T;

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

	size(): number;
}

/**
 * Asynchronous element-limited FIFO queue with a Promise-driven dequeue operation.
 *
 * {@link AsyncLimitedQueue#queue} operations are delayed (in unspecified order)
 * until space becomes available through dequeue operations.
 */
export class AsyncLimitedQueue<T> implements IAsyncLimitedQueue<T> {
	private limitSem: ISemaphore;

	/**
	 * Initialize the queue.
	 * @param limit A integer >= 1 specifying the number of elements after which
	 *              queue() effectively blocks (i.e. the promise returned by it
	 *              does not get "immediately" fulfilled for some informal value
	 *              of immediately).
	 * @param storageQueue An asynchronous (non-limiting) queue backing the data.
	 *                     It defaults to a AsyncQueue.
	 *
	 * @throws An exception in case the limit is not an integer or is <= 0.
	 */
	public constructor(limit: number, private storageQueue: IAsyncQueue<T> = new AsyncQueue()) {
		if (!Number.isInteger(limit) || limit <= 0) {
			throw new Error('AsyncLimitedQueue: Illegal limit (non-integer or\
 <= 0) on queued elements. It must be an integer >= 1.');
		}
		this.limitSem = new Semaphore(limit);
	}

	public async queue(data: T): Promise<void> {
		await this.limitSem.take();
		this.storageQueue.queue(data);
	}

	public async queueAll(iterable: Iterable<T>): Promise<void> {
		for (const element of iterable) {
			await this.queue(element);
		}
	}

	public async queueAllAsync(iterable: AsyncIterable<T>): Promise<void> {
		for await (const element of iterable) {
			await this.queue(element);
		}
	}

	public offer(data: T): boolean {
		if (this.limitSem.tryTake()) {
			this.storageQueue.queue(data);
			return true;
		}
		else {
			return false;
		}
	}

	public offerAll(iterable: Iterable<T>): number {
		let insertedElements = 0;

		for (const element of iterable) {
			if (!this.offer(element)) {
				return insertedElements;
			}

			insertedElements++;
		}

		return insertedElements;
	}

	public async offerAllAsync(iterable: AsyncIterable<T>): Promise<number> {
		let insertedElements = 0;

		for await (const element of iterable) {
			if (!this.offer(element)) {
				return insertedElements;
			}

			insertedElements++;
		}

		return insertedElements;
	}

	public async dequeue(): Promise<T> {
		return this.storageQueue.dequeue().then(element => {
			this.limitSem.free();
			return element;
		});
	}

	public poll(): T {
		return this.storageQueue.poll();
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			yield this.dequeue();
		}
	}

	public size(): number {
		return this.storageQueue.size();
	}
}
