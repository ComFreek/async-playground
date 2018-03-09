/**
 * General counting semaphore with Promises.
 *
 * It allows arbitrary {@link take} (also referred to as "P") and {@link free}
 * ("V") calls.
 *
 * To use implementations with the normal JS execution model
 * (single-threaded + queue), {@link take} and {@link free} are supposed
 * to be called on different 'fibers'. For example, {@link take}
 * can be awaited in the business logic processing data
 * while {@link free} is called inside a filesystem API callback
 * putting the data into an array.
 *
 * @example All of the following examples assume a semaphore initialized with a count of 0.
 *
 *  - {@link take} is called 10 times. {@link free} is then called once.
 *    Exactly one of the previous 10 promises is fulfilled. It is
 *    implementation-defined which of them is chosen.
 *  - {@link free} is called 5 times. {@link take} is then called 6 times.
 *    Exactly 5 of the returned promises get fulfilled "immediately" (for some
 *    informal value of immediately).
 */
export interface ISemaphore {
	/**
	 * Take or 'P' operation.
	 *
	 * @returns A promise which is fulfilled when >= 1 of the resource
	 *          represented by the internal counter is available. This might be
	 *          the case either if {@link free} is called or if the semaphore is
	 *          initialized with a value > 0.
	 */
	take(): Promise<void>;

	/**
	 * Take ('P') if a resource is still available (<=> counter >= 1).
	 * Otherwise, do *not* block (as {@link take} does) and return false.
	 *
	 * @returns True if a resource could be taken, False otherwise.
	 */
	tryTake(): boolean;

	/**
	 * Try taking ('P') a resource within the next `millis` milliseconds.
	 *
	 * @example Contrary to {@link tryTake}, you have to await the promise returned
	 * by this method.
	 * ```
	 * tryTakeWithin(500).then((hasTaken) => ...);
	 *
	 * // inside an async function
	 * const hasTaken = await tryTakeWithin(500);
	 * ```
	 *
	 * @example Instead of simply waiting with {@link take}, you can also use
	 * this method to regularly give up some computation time, so that other
	 * parts of the code can {@link free} a resource, while still doing some
	 * useful work in case of an unsuccessful attempt.<br>
	 * Note that this were impossible with {@link take} since it does not give
	 * up computation time (it is a synchronous method) and the JS VM is
	 * single-threaded. Conversely, the other "fibers" must give up their
	 * computation power as well (e.g. by `yield`ing or `await`ing), this
	 * is known as cooperative multitasking.
	 * ```
	 * // Regularly check for 500ms if we are able to take a resource
	 * while (!await tryTakeWithin(500)) {
	 *   // If not, do some other work...
	 * }
	 * // We finally acquired the resource
	 * ```
	 *
	 * @return A promise fulfilling with `true` if a resource could be taken or
	 *         `false` otherwise.
	 */
	tryTakeWithin(millis: number): Promise<boolean>;

	/**
	 * Free or 'V' operation.
	 *
	 * If there are any promises returned by {@link take()} still awaiting
	 * their fulfillment, exactly of them is fulfilled. The order of
	 * fulfillment is implementation-defined.
	 */
	free(): void;
}

/**
 * General counting semaphore implementation.
 *
 * Not thread-safe! Not safe with regard to pre-emptive multitasking (e.g.
 * possible with some native code Node.js extensions).
 */
export class Semaphore implements ISemaphore {
	private resolvers: (() => void)[] = [];

	/**
	 * Initialize.
	 *
	 * @param counter Initial value for the counter. E.g. if you provide 10, the
	 *                first 10 {@link take takes} will fulfill "immediately"
	 *                (for some informal value of immediately).
	 */
	public constructor(private counter = 0) {
	}

	public async take(): Promise<void> {
		// Instead of the code below, we could also have done it this way:
		// ```
		// this.counter--;
		// if (this.counter < 0) {
		// 	await new Promise<void>(resolve => {
		// 		this.resolvers.push(resolve);
		// 	});
		// }
		// ```
		// That would have been equivalent in all semantic aspects.
		//
		// One would think that if the executor (the first argument passed to
		// the Promise constructor) were executed asychronously in the Promise
		// constructor somehow, then it would be possible that the following
		// code results in a deadlock:
		// ```
		// setTimeout(() => sem.free(), 0);
		// sem.take();
		// ```
		// Namely if the call to take() pushes the resolver after the free()
		// call.
		// This is impossible, though, the spec (cf. [1]) guarantees that the
		// executor is immediately called inside the Promise constructor
		//
		// [1]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

		return new Promise<void>(resolve => {
			this.counter--;
			if (this.counter < 0) {
				this.resolvers.push(resolve);
			}
			else {
				// Resolve immediately
				resolve();
			}
		});
	}

	public tryTake(): boolean {
		if (this.counter <= 0) {
			return false;
		}

		this.counter--;
		return true;
	}

	private static async wait(millis: number): Promise<void> {
		return new Promise<void>(resolve => {
			setTimeout(resolve, millis);
		});
	}

	async tryTakeWithin(millis: number): Promise<boolean> {
		let alreadyTimedout = false;
		return Promise.race([
			this.take().then(() => {
				// Promises offer no 'cancel' feature, therefore the take()
				// must be undone in case of a timeout.
				if (alreadyTimedout) {
					this.free();

					// Since the other promise won anyway, this return value
					// will actually be ignored by Promise.race.
					return false;
				}
				else {
					return true;
				}
			}),
			Semaphore.wait(millis).then(() => {
				alreadyTimedout = true;
				return false;
			})
		]);
	}

	public free(): void {
		this.counter++;

		if (this.resolvers.length >= 1) {
			// Resolve exactly one waiting take() promise!
			const resolver = this.resolvers.shift();

			/* istanbul ignore if */
			if (resolver === undefined) {
				throw new Error('Semaphore free: internal data structure \
 corrupted. Internal buffer of unfulfilled promises \
 either empty or contains an "undefined" value.');
			}

			resolver();
		}
	}
}