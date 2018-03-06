import { Semaphore } from './Semaphore';
import { expect } from 'chai';
import 'mocha';

import { wait, promiseFasterThan } from '../spec-utils';

describe('Semaphore', () => {

	async function expectTimely(promise: PromiseLike<any>, minMillis: number, maxMillis: number) {
		await expect(new Promise<boolean>((resolve, reject) => {
			let promiseResolved = false;
			let timedOut = false;

			wait(minMillis).then(() => {
				if (promiseResolved) {
					reject();
				}
			}),
			promise.then(() => {
				promiseResolved = true;
				if (!timedOut) {
					resolve();
				}
			}),
			wait(maxMillis).then(() => {
				timedOut = true;
				if (!promiseResolved) {
					reject();
				}
			})
		})).to.not.throw;
	}

	it('Take/free', async () => {
		const sem = new Semaphore();
		wait(50).then(() => sem.free());
		await sem.take();
	});

	it('x blocking takes, then x frees upon x timeouts', async () => {
		const sem = new Semaphore();
		let timeoutCounter = 0;

		for (let i = 0; i < 3; i++) {
			wait(50).then(() => {
				timeoutCounter++;
				sem.free();
			});
		}

		await sem.take();
		await sem.take();
		await sem.take();

		expect(timeoutCounter).to.equal(3);
	});

	it('x frees, then x immediately resolved takes', async () => {
		const sem = new Semaphore();

		sem.free();
		sem.free();
		sem.free();

		// The fulfilled promises must win the race.
		await Promise.race([
			Promise.all([sem.take(), sem.take(), sem.take()]),
			wait(50).then(() => "TIMEOUT")
		]).then((value: [void, void, void]|string) => {
			expect(value).to.not.equal("TIMEOUT");
		});
	});

	it('x pre-initialized, then x immediately resolved takes', async () => {
		const sem = new Semaphore(3);

		// The fulfilled promises must win the race.
		await Promise.race([
			Promise.all([sem.take(), sem.take(), sem.take()]),
			wait(50).then(() => "TIMEOUT")
		]).then((value: void[]|string) => {
			expect(value).to.not.equal("TIMEOUT");
		});
	});

	it('x pre-initialized, one free, then (x + 1) immediately resolved takes', async () => {
		const sem = new Semaphore(3);
		sem.free();

		// The fulfilled promises must win the race.
		await Promise.race([
			Promise.all([sem.take(), sem.take(), sem.take(), sem.take()]),
			wait(50).then(() => "TIMEOUT")
		]).then((value: void[]|string) => {
			expect(value).to.not.equal("TIMEOUT");
		});
	});

	it('tryTake on 0-initialized semaphore', async () => {
		const sem = new Semaphore(0);
		expect(sem.tryTake()).to.be.false;
	});

	it('x frees, x + 1 tryTakes', async () => {
		const sem = new Semaphore(0);

		const COUNT = 10;
		for (let i = 0; i < COUNT; i++) {
			sem.free();
		}

		for (let i = 0; i < COUNT; i++) {
			expect(sem.tryTake()).to.be.true;
		}

		expect(sem.tryTake()).to.be.false;

		wait(50).then(() => sem.free());

		// The last falsy tryTake() should not have acquired a resource.
		// => This take() must terminate.
		await sem.take();
	});

	it('tryTakeWithin timely returns false on 0-initialized semaphore with no frees', async () => {
		const sem = new Semaphore(0);

		await expectTimely(expect(sem.tryTakeWithin(10)).to.eventually.be.false, 10, 15);

		// The semaphore's counter must be 0 => any take must block
		await expect(promiseFasterThan(sem.take(), 10)).to.eventually.be.false;
	});

	it('tryTakeWithin timely returns false on 0-initialized semaphore with one free out of time', async () => {
		const sem = new Semaphore(0);

		wait(15).then(() => sem.free());

		await expectTimely(expect(sem.tryTakeWithin(10)).to.eventually.be.false, 10, 15);

		// The semaphore's counter must be 1 now => only one take may resolve
		await sem.take();
		await expect(promiseFasterThan(sem.take(), 10)).to.eventually.be.false;
	});

	it('successful tryTakeWithin must decrement the counter', async () => {
		const sem = new Semaphore(1);

		await expect(sem.tryTakeWithin(10)).to.eventually.be.true;

		// take must block
		await expect(promiseFasterThan(sem.take(), 10)).to.eventually.be.false;
	});

	it('successful tryTakeWithin must resolve "immediately" with 1-initialized semaphore', async () => {
		const sem = new Semaphore(1);

		wait(20).then(() => sem.free());

		// tryTakeWithin must resolve in time despite of the second free() issues
		// after 20ms.
		await expectTimely(expect(sem.tryTakeWithin(10)).to.eventually.be.true, 0, 5);

		// take must block
		await expect(promiseFasterThan(sem.take(), 10)).to.eventually.be.false;
	});

	it('successful tryTakeWithin must resolve immediately after the first free', async () => {
		const sem = new Semaphore(0);

		wait(10).then(() => sem.free());

		// tryTakeWithin must resolve in time despite of the second free() issues
		// after 20ms.
		await expectTimely(expect(sem.tryTakeWithin(20)).to.eventually.be.true, 10, 15);

		// take must block
		await expect(promiseFasterThan(sem.take(), 10)).to.eventually.be.false;
	});

	it('x + y tryTakeWithin with x frees in time', async () => {
		const sem = new Semaphore(0);

		const SUCCESSFULL_TAKES = 10;
		const REMAINING_UNSUCCESSFUL_TAKES = 5;

		const takeWithinPromises: Promise<boolean>[] = [];
		for (let i = 0; i < SUCCESSFULL_TAKES + REMAINING_UNSUCCESSFUL_TAKES; i++) {
			takeWithinPromises.push(sem.tryTakeWithin(20));
		}

		wait(5).then(() => {
			for (let i = 0; i < Math.floor(SUCCESSFULL_TAKES / 2); i++) {
				sem.free();
			}
		});

		wait(10).then(() => {
			for (let i = Math.floor(SUCCESSFULL_TAKES / 2); i < SUCCESSFULL_TAKES; i++) {
				sem.free();
			}
		});

		const successfulTakes = (await Promise.all(takeWithinPromises)).filter(x => x).length;
		expect(successfulTakes).to.equal(SUCCESSFULL_TAKES);
	});
});
