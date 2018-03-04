export async function wait(timeout: number) {
	return new Promise(resolve => setTimeout(resolve, timeout));
}

export async function promiseFasterThan(promise: Promise<any>, timeout: number) {
	return Promise.race([
		promise.then(() => true),
		wait(timeout).then(() => false)
	]);
}