import * as chai from 'chai';

import chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;

export const TIME_STEP = 50;

export async function wait(timeout: number) {
	return new Promise(resolve => setTimeout(resolve, timeout));
}

export async function promiseFasterThan(promise: Promise<any>, timeout: number) {
	return Promise.race([
		promise.then(() => true),
		wait(timeout).then(() => false)
	]);
}

/**
  * Expect a promise to be fulfilled within a time frame starting withe the
  * call to this function.
  *
  * Beware that due to JS' execution model, it cannot be guaranteed that
  * timeouts can be exactly met. Users are therefore encouraged to provide
  * some time buffer (e.g. 10 - 15 ms) to accomodate this effect.
  *
  * @see expectTimelyIn
  *
  * @param promise The PromiseLike object. Being only a {@link PromiseLike},
  *                rejections cannot be handled as the interface is lacking
  *                a `.catch` method.
  * @param minMillis The minimum number of milliseconds (an integer >= 0)
  *                  the promise is expected to remain unresolved.
  *                  Specifying 0 means that no lower limit will be imposed.
  *
  * @param maxMillis The maximum number of milliseconds (an integer >= 0),
  *                  the promise is expected to remain unresolved.
  *                  Users can make reasonably sure (depending on the use
  *                  case) that a promise never resolves if they specify a
  *                  value high enough.
  *
  * @return A void promise, which is
  *           - fulfilled iff. the given promise resolved in the time frame.
  *             In this case, the fulfillment occurs right after the given
  *             promise is resolved.
  *           - rejected iff. the given promise did not resolve in the time
  *             frame. In this case, the rejection occurs either right after
  *             the given promise is resolved before the `minMillis` timeout
  *             or right after the `maxMillis` timeout.
  */
 export async function expectTimelyWithin(promise: PromiseLike<any>, minMillis: number, maxMillis: number): Promise<void> {
	const expectTimelyCallTimestamp = Date.now();

	if (!(minMillis >= 0 && Number.isInteger(minMillis))) {
		throw new Error('expectTimely: min time constraint must be >= 0 and a (finite) integer.')
	}

	if (!(maxMillis >= 0 && Number.isInteger(maxMillis))) {
		throw new Error('expectTimely: max time constraint must be >= 0 and a (finite) integer.')
	}

	if (!(minMillis <= maxMillis)) {
		throw new Error('expectTimely: min time constraint must be <= max time constraint.');
	}

	await expect(new Promise<boolean>((resolve, reject) => {
		let minOccurred = false;
		let maxOccurred = false;
		let promiseResolved = false;

		if (minMillis === 0) {
			minOccurred = true;
		}
		else {
			wait(minMillis).then(() => {
				minOccurred = true;
				if (maxOccurred) {
					throw new Error("expectTimely: max timer occurred before min timer.\
 Did you perhaps specify the min time constraint to be too close to max time constraint?");
				}
			}).catch(reject);
		}
		promise.then(() => {
			promiseResolved = true;
			if (!minOccurred) {
				reject(`Promise resolved before "min" timeout of ${minMillis}\
 ms occurred, namely already after ${Date.now() - expectTimelyCallTimestamp} ms\
 (measured after the call to expectTimelyWithin).`);
			}
			else if (!maxOccurred) {
				resolve();
			}
		});
		wait(maxMillis).then(() => {
			maxOccurred = true;
			if (!promiseResolved) {
				reject('Promise has not resolved within the "max" time constraint.');
			}
		}).catch(reject);
	})).to.eventually.be.fulfilled;
}

/**
 * Expect a promise to be resolved in about `millis` milliseconds.
 *
 * Tiny time buffers are required to accommodate various effects
 * (inexact timeouts in general, GC, the cost of this very function call etc.).
 *
 * The promise is expected using {@link expectTimelyWithin} to resolve
 * in the time frame [max(millis - lowerBuffer, 0), millis + upperBuffer].
 *
 * @param promise
 * @param millis
 * @param upperBuffer
 * @param lowerBuffer
 *
 * @returns A void promise which is
 *            - resolved iff. the given promise is resolved in the time frame
 *              explained above. In this case, the fulfillment occurs right
 *              after the given promise is resolved.
 *            - rejected iff. the given promise is not resolved in the time
 *              frame. In this case, the rejection occurs after
 *              `(millis + upperBuffer)` ms.
 */
export async function expectTimelyIn(promise: PromiseLike<any>, millis: number, upperBuffer = 5, lowerBuffer = 5): Promise<void> {
	await expectTimelyWithin(promise, Math.max(millis - lowerBuffer, 0), millis + upperBuffer);
}

/**
 * Expect a promise to be "never" resolved by waiting at least
 * `timeoutMillis` ms.
 * @param promise
 * @param timeoutMillis
 *
 * @return A void promise which is
 *           - resolved after `timeoutMillis` ms iff. the given promise
 *             was not resolved during that time period.
 *           - rejected iff. the given promise was resolved within
 *             `timeoutMillis` ms. In this case, rejection occurs right
 *             after the given promise is resolved.
 *
 */
export async function expectNever(promise: PromiseLike<any>, timeoutMillis: number = TIME_STEP): Promise<void> {
	const realPromise = new Promise(resolve => promise.then(resolve));
	await expect(promiseFasterThan(realPromise, timeoutMillis)).to.eventually.be.false;
}
