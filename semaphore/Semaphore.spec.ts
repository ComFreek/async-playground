import { Semaphore } from './Semaphore';
import { expect } from 'chai';
import 'mocha';

import { TIME_STEP, wait, expectTimelyIn, expectNever } from '../timing.common-spec';

describe('Semaphore', () => {
	it('Take/free', async () => {
		const sem = new Semaphore();
		wait(TIME_STEP).then(() => sem.free());
		await sem.take();
	});

	it('x blocking takes, then x frees upon x timeouts', async () => {
		const COUNT = 5;
		const sem = new Semaphore();
		let timeoutCounter = 0;

		for (let i = 0; i < COUNT; i++) {
			wait(TIME_STEP).then(() => {
				timeoutCounter++;
				sem.free();
			});
		}

		const timelyPromises = [];
		for (let i = 0; i < COUNT; i++) {
			timelyPromises.push(expectTimelyIn(sem.take(), TIME_STEP));
		}

		await Promise.all(timelyPromises);

		expect(timeoutCounter).to.equal(COUNT);
	});

	it('x frees, then x immediately resolved takes', async () => {
		const COUNT = 5;
		const sem = new Semaphore();

		for (let i = 0; i < COUNT; i++) {
			sem.free();
		}

		const timelyPromises = [];
		for (let i = 0; i < COUNT; i++) {
			timelyPromises.push(expectTimelyIn(sem.take(), 0));
		}

		await Promise.all(timelyPromises);
	});

	it('x pre-initialized, then x immediately resolved takes', async () => {
		const COUNT = 5;
		const sem = new Semaphore(COUNT);

		const timelyPromises = [];
		for (let i = 0; i < COUNT; i++) {
			timelyPromises.push(expectTimelyIn(sem.take(), 0));
		}

		await Promise.all(timelyPromises);
	});

	it('x pre-initialized, one free, then (x + 1) immediately resolved takes', async () => {
		const COUNT = 5;
		const sem = new Semaphore(COUNT);
		sem.free();

		const timelyPromises = [];
		for (let i = 0; i < COUNT + 1; i++) {
			timelyPromises.push(expectTimelyIn(sem.take(), 0));
		}

		await Promise.all(timelyPromises);
	});

	it('tryTake on 0-initialized semaphore', async () => {
		const sem = new Semaphore(0);
		expect(sem.tryTake()).to.be.false;
	});

	it('x frees, x + 1 tryTakes', async () => {
		const COUNT = 10;
		const sem = new Semaphore(0);

		for (let i = 0; i < COUNT; i++) {
			sem.free();
		}

		for (let i = 0; i < COUNT; i++) {
			expect(sem.tryTake()).to.be.true;
		}

		expect(sem.tryTake()).to.be.false;

		wait(TIME_STEP).then(() => sem.free());

		// The last falsy tryTake() should not have acquired a resource.
		// => This take() must terminate.
		await expectTimelyIn(sem.take(), TIME_STEP);
	});

	it('tryTakeWithin timely returns false on 0-initialized semaphore with no frees', async () => {
		const sem = new Semaphore(0);

		await expectTimelyIn(expect(sem.tryTakeWithin(TIME_STEP)).to.eventually.be.false, TIME_STEP);

		// The semaphore's counter must be 0 => any take must block
		await expectNever(sem.take());
	});

	it('tryTakeWithin timely returns false on 0-initialized semaphore with one free out of time', async () => {
		const sem = new Semaphore(0);

		wait(2 * TIME_STEP).then(() => sem.free());

		await expectTimelyIn(expect(sem.tryTakeWithin(TIME_STEP)).to.eventually.be.false, TIME_STEP);

		// The semaphore's counter must be 1 now => only one take may resolve
		await expectTimelyIn(sem.take(), TIME_STEP, 10, 30);
		await expectNever(sem.take());
	});

	it('successful tryTakeWithin must decrement the counter', async () => {
		const sem = new Semaphore(1);

		await expectTimelyIn(expect(sem.tryTakeWithin(TIME_STEP)).to.eventually.be.true, 0);

		// take must block
		await expectNever(sem.take());
	});

	it('successful tryTakeWithin must resolve "immediately" with 1-initialized semaphore', async () => {
		const sem = new Semaphore(1);

		wait(2 * TIME_STEP).then(() => sem.free());

		// tryTakeWithin must resolve in time despite of the second free() issued
		// after 2 * TIME_STEP
		await expectTimelyIn(expect(sem.tryTakeWithin(TIME_STEP)).to.eventually.be.true, 0);

		await expectNever(sem.take());
	});

	it('successful tryTakeWithin must resolve immediately after the first free', async () => {
		const sem = new Semaphore(0);

		wait(TIME_STEP).then(() => sem.free());

		// tryTakeWithin must resolve in time despite of the second free() issues
		// after 20ms.
		await expectTimelyIn(expect(sem.tryTakeWithin(2 * TIME_STEP)).to.eventually.be.true, TIME_STEP);

		await expectNever(sem.take());
	});

	it('x + y tryTakeWithin with x frees in time', async () => {
		const sem = new Semaphore(0);

		const SUCCESSFULL_TAKES = 10;
		const REMAINING_UNSUCCESSFUL_TAKES = 5;

		const takeWithinPromises: Promise<boolean>[] = [];
		for (let i = 0; i < SUCCESSFULL_TAKES + REMAINING_UNSUCCESSFUL_TAKES; i++) {
			takeWithinPromises.push(sem.tryTakeWithin(3 * TIME_STEP));
		}

		wait(TIME_STEP).then(() => {
			for (let i = 0; i < Math.floor(SUCCESSFULL_TAKES / 2); i++) {
				sem.free();
			}
		});

		wait(2 * TIME_STEP).then(() => {
			for (let i = Math.floor(SUCCESSFULL_TAKES / 2); i < SUCCESSFULL_TAKES; i++) {
				sem.free();
			}
		});

		const successfulTakes = (await Promise.all(takeWithinPromises)).filter(x => x).length;
		expect(successfulTakes).to.equal(SUCCESSFULL_TAKES);
	});
});
