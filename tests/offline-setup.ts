// Tests must explicitly inject/mock provider responses. Never inherit a live fetch.
globalThis.fetch = async () => { throw new Error("Live fetch is disabled in automated tests; mock the provider."); };
