import { ISemaphore, Semaphore } from './Semaphore';

/**
 * A non-reentrant critical section offering execution of (async) functions therein.
 *
 * Effectively, it is a wrapper around {@link ISemaphore}, also accommodating
 * easy-to-miss edge cases when errors are thrown or Promises rejected.
 *
 * @example Simple usage:
 * ```
 * await criticalSection.do(() => {
 *   // We acquired the (internal) lock
 *   // Do something exclusively
 * });
 * ```
 *
 * @example Exceptions in a synchronous exclusive function:
 * ```
 * try {
 *   await criticalSection.do(() => {
 *     // Errors thrown within the critical section *do* release it again
 *     throw new Error('oops');
 *   });
 * }
 * catch (err) {
 *   // Here we will receive the error
 *   console.log(err);
 * }
 * ```
 *
 * @example Rejections in an asynchronous exclusive function:
 * ```
 * try {
 *   await criticalSection.do(async () => {
 *     // A returned rejected promise returned within the critical section
 *     // *does* release it again
 *     return Promise.reject('oops');
 *
 *     // `await Promise.reject('oops');` would have the same effect
 *   });
 * }
 * catch (err) {
 *   // Here we will receive the error
 *   console.log(err);
 * }
 * ```
 */
export interface ICriticalSection {

	/**
	 * Wait for the critical section to become available and execute a function.
	 *
	 * @param func A function which will be executed exclusively in the critical
	 *             section.
	 *
	 * @returns A promise which is resolved with the (eventually) returned
	 *          value by `func`. Effectively, once the critical section has
	 *          been entered, `Promise.resolve(func())` is returned.
	 *          Especially if `func` returns a Thenable, by the semantics of
	 *          `Promise.resolve`, this Thenable is adopted as the new Promise.
	 *          <br>
	 *          In other words, it is impossible to make
	 *          `criticalSection.do(...)` resolve to a Promise, i.e.
	 *          `await criticalSection.do(...)` be a Promise.
	 *
	 * @throws The returned promise will be rejected iff. the executed function
	 *         has thrown an error or has returned a rejecting promise itself.
	 */
	do<T>(func: () => T | Promise<T>): Promise<T>;
}

export class CriticalSection implements ICriticalSection {
	private lock: ISemaphore = new Semaphore(1);

	private static objectAccessor = Symbol('CriticalSection associated with the object');

	public async do<T>(func: () => (T | Promise<T>)): Promise<T> {
		await this.lock.take();
		try {
			// The await is actually redundant, but serves clarity
			return await func();
		}
		finally {
			this.lock.free();
		}
	}

	/**
	 * Create or get the object-bound critical section.
	 *
	 * If no critical section is yet bound to the object, a new one is created
	 * and bound to that specific object. Critical sections bound to objects
	 * higher up in the prototype chain do *not* get inherited.
	 *
	 * @example Multiple calls on the same object return the same
	 *          {@link CriticalSection}:
	 * ```
	 * // The object can also be a function
	 * const myObj = function () {
	 *   // ...
	 * };
	 * const firstSection = CriticalSection.for(myObj);
	 * const secondSection = CriticalSection.for(myObj);
	 *
	 * // true
	 * console.log(firstSection === secondSection);
	 * ```
	 *
	 * @example No inheritance with respect to the prototype chain:
	 * ```
	 * const myPrototype = {};
	 * const firstSection = CriticalSection.for(myPrototype);
	 *
	 * const object = Object.create(myPrototype);
	 *
	 * // true
	 * console.log(CriticalSection.for(object) !== firstSection);
	 * ```
	 * @example Beware of iframes and inter-website communicating code, e.g.
	 *          the `Array` constructors differ and are therefore considered
	 *          distinct objects by this method.
	 * ```
	 * const iframe = document.createElement('iframe');
	 * document.body.appendChild(iframe);
	 * const xArray = window.frames[window.frames.length-1].Array;
	 *
	 * const iframeArr = new xArray(1,2,3);
	 * const thisSiteArr = [4, 5, 6];
	 *
	 * // true in both cases
	 * console.log(iframeArr.constructor !== thisSiteArr.constructor);
	 * console.log(CriticalSection.for(iframeArr.constructor) !==
	 *             CriticalSection.for(thisSiteArr.constructor));
	 * ```
	 *
	 * @param object The object with which a new critical section bond should
	 *               be created if it does not exists yet.
	 *               `object` must be a real object and not a primitive as per
	 *               the ECMAScript standard specification. Especially, the
	 *               following values are primitives (see also [MDN][1]):
	 * - numbers (e.g. 1, 2, 3)
	 * - strings (e.g. 'Hello World')
	 * - booleans (true, false)
	 * - null
	 * - undefined
	 * - Symbols
	 *
	 * A {@link TypeError} will be thrown if such a value is passed.
	 * (Note that there is no method to check for primitive values in
	 * ECMAScript, therefore, this method might *not* throw a
	 * {@link TypeError} or other errors for new primitive values
	 * introduced in yet-to-come ECMAScript versions.)
	 *
	 * @throws A {@link TypeError} is raised when `object` is a [primitive value][1].
	 *
	 * [1]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures
	 */
	public static for(object: Object): ICriticalSection {
		if (object === null || object === undefined) {
			throw new TypeError('Cannot call CriticalSection.for on null or undefined.');
		}

		if (typeof object === 'symbol') {
			throw new TypeError('Cannot call CriticalSection.for on a symbol.');
		}

		if (!object.hasOwnProperty(this.objectAccessor)) {
			Object.defineProperty(object, this.objectAccessor, {
				configurable: false,
				enumerable: false,
				writable: false,
				value: new CriticalSection()
			});
		}

		return (object as any)[this.objectAccessor];
	}
}
