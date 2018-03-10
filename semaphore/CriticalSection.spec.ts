import 'mocha';
import { expect } from 'chai';

import { expectInstantly, expectNever, expectTimelyIn } from '../timing.common-spec';
import { ICriticalSection, CriticalSection } from './CriticalSection';

describe('CriticalSection', () => {
	const INTENTIONAL_EXCEPTION_MESSAGE = 'Intentional exception';

	let criticalSection: ICriticalSection = new CriticalSection();

	beforeEach(() => {
		criticalSection = new CriticalSection();
	});

	it('Contention', async () => {
		const COUNT = 20;

		const actions: Promise<void>[] = [];
		for (let i = 0; i < COUNT; i++) {
			actions.push(criticalSection.do(() => {}));
		}

		await expectInstantly(Promise.all(actions));
	});

	it('do() must await returned Promise', async () => {
		await expectInstantly(expect(criticalSection.do(() => {
			return Promise.resolve(42);
		})).to.eventually.equal(42));

		await expectInstantly(expect(criticalSection.do(async () => {
			return 42;
		})).to.eventually.equal(42));

		await expectInstantly(expect(criticalSection.do(async () => {
			return Promise.resolve(42);
		})).to.eventually.equal(42));
	});

	it('Endless contention => nobody else may enter', async () => {
		// No await
		criticalSection.do(async () => {
			return new Promise(() => {
				// Never resolve
			});
		});

		await expectNever(criticalSection.do(() => {
			// Just implictly return and do nothing
		}));
	});

	it('Exceptions lead to rejection of do() promise', async () => {
		const COUNT = 20;

		for (let i = 0; i < COUNT; i++) {
			await expect(criticalSection.do(() => {
				throw new Error(INTENTIONAL_EXCEPTION_MESSAGE);
			})).to.eventually.be.rejectedWith(INTENTIONAL_EXCEPTION_MESSAGE);
		}
	});

	it('Rejecting promises lead to rejection of do() promise', async () => {
		const COUNT = 20;

		for (let i = 0; i < COUNT; i++) {
			await expect(criticalSection.do(async () => {
				return Promise.reject(INTENTIONAL_EXCEPTION_MESSAGE);
			})).to.eventually.be.rejectedWith(INTENTIONAL_EXCEPTION_MESSAGE);
		}
	});

	it('Exception in critical section must free it again', async () => {
		await expect(criticalSection.do(() => {
			throw new Error(INTENTIONAL_EXCEPTION_MESSAGE);
		})).to.eventually.be.rejectedWith(INTENTIONAL_EXCEPTION_MESSAGE);

		await expectInstantly(criticalSection.do(() => {}));
	});

	it('Rejecting promise in critical section must free it again', async () => {
		await expect(criticalSection.do(async () => {
			return Promise.reject(INTENTIONAL_EXCEPTION_MESSAGE);
		})).to.eventually.be.rejectedWith(INTENTIONAL_EXCEPTION_MESSAGE);

		await expectInstantly(criticalSection.do(() => {}));
	});

	it('Must not be reentrant', async () => {
		const NEVER_TIMEOUT = 100;

		await expectTimelyIn(expect(criticalSection.do(async () => {
			await expectNever(criticalSection.do(() => {
				// Do nothing
			}), NEVER_TIMEOUT);

			return 42;
		})).to.eventually.equal(42), NEVER_TIMEOUT);
	});

	it('CriticalSection.for returns a valid CriticalSection for objects and\
 keeps returning the same on the same objects', async () => {
		const dummyObjects: Object[] = [
			// "Classical" Objects
			{}, [], Number, String,

			// More advanced prototypes
			Object.prototype, Number.prototype, String.prototype,

			// Functions
			() => {}, setTimeout,

			// Property descriptors (shall be equivalent to "normal" objects)
			Object.getOwnPropertyDescriptor(
				Object.defineProperty({}, 'testProp', {
					configurable: false,
					enumerable: false,
					writable: false,
					value: 42
				}),
				'testProp'
			) as PropertyDescriptor,

			// The class, its prototype and the sections for them themselves
			CriticalSection, CriticalSection.prototype,
			CriticalSection.for(CriticalSection), CriticalSection.for(CriticalSection.prototype)
		];

		const initialCriticalSections: ICriticalSection[] = [];

		for (const dummyObject of dummyObjects) {
			const section = CriticalSection.for(dummyObject);

			initialCriticalSections.push(section);
			await expectNever(section.do(async () => {
				return new Promise(() => {
					// Do not resolve
				});
			}));
		}

		for (let i = 0; i < dummyObjects.length; i++) {
			expect(CriticalSection.for(dummyObjects[i])).to.equal(initialCriticalSections[i]);
		}
	});

	it('CriticalSection.for throws on primitive types', async () => {
		const primitiveValues: any[] = [
			// Primitive values as per
			// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures
			true, false,
			null,
			undefined,
			1, 2, 3, 42.5, NaN, Infinity, -Infinity,
			'Hello World!',
			Symbol('a symbol')
		];

		for (const primitiveValue of primitiveValues) {
			expect(() => CriticalSection.for(primitiveValue)).to.throw(TypeError);
		}
	});

	it('CriticalSection.for returns distinct CriticalSections for multiple {}, []', () => {
		expect(CriticalSection.for({})).to.not.equal(CriticalSection.for({}));
		expect(CriticalSection.for([])).to.not.equal(CriticalSection.for([]));
	});

	it('CriticalSection.for returns identical CriticalSections for the same object', () => {
		expect(CriticalSection.for(Object.prototype)).to.not.equal(CriticalSection.for([]));
	});

	it('CriticalSection.for returns distinct CriticalSections on the prototype chain', () => {
		const prototypeObj = {};
		expect(CriticalSection.for(prototypeObj)).to.be.instanceof(CriticalSection);

		const obj = Object.create(prototypeObj);
		expect(CriticalSection.for(obj)).to.not.equal(CriticalSection.for(prototypeObj));
	});
});
