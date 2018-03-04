import { Semaphore } from './Semaphore';
import { expect } from 'chai';
import 'mocha';

import { wait } from '../spec-utils';

describe('Semaphore', () => {
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
});
