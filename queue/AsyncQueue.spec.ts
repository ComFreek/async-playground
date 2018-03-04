import { AsyncQueue } from './AsyncQueue';
import * as chai from 'chai';
import 'mocha';

import chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

import { runCommonQueueTests } from './Queue.common-spec';

describe('AsyncQueue', () => {
	/**
     * Number of test entries which some unit tests insert and then dequeue
     * into and out of the queue.
     */
    const COUNT = 10;

	runCommonQueueTests(() => new AsyncQueue<number>(), COUNT);
});
