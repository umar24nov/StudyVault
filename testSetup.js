// Test helper — mocks Firebase and Cloudinary for unit tests.
// Uses Node.js built-in test runner (node:test) — zero test dependencies.

function createStub() {
  const calls = [];
  const fn = function (...args) { calls.push(args); return fn._returnValue || fn; };
  fn.calls = calls;
  fn._returnValue = fn;
  fn.mockReturnValue = (val) => { fn._returnValue = val; return fn; };
  fn.mockResolvedValue = (val) => { fn._returnValue = Promise.resolve(val); return fn; };
  fn.mockImplementation = (impl) => { fn._impl = impl; fn._callImpl = impl; return fn; };
  fn.mockClear = () => { calls.length = 0; };
  return fn;
}

function createMockDoc(id = 'mock-id') {
  return {
    exists: true, id,
    data: () => ({ id, title: 'Test', course: 'engineering', status: 'approved', downloads: 0 }),
    update: createStub().mockResolvedValue(undefined),
    delete: createStub().mockResolvedValue(undefined),
    set: createStub().mockResolvedValue(undefined),
  };
}

function createMockCollection() {
  const col = {
    doc: createStub().mockImplementation((id) => createMockDoc(id)),
    add: createStub().mockImplementation((data) => Promise.resolve({ id: 'mock-' + Date.now() })),
    get: createStub().mockImplementation(() => Promise.resolve({ docs: [], size: 0, empty: true })),
    where: createStub().mockImplementation(() => col),
    orderBy: createStub().mockImplementation(() => col),
    limit: createStub().mockImplementation(() => col),
    offset: createStub().mockImplementation(() => col),
  };
  return col;
}

const mockFirestore = {
  collection: createStub().mockImplementation(() => createMockCollection()),
  FieldValue: {
    serverTimestamp: createStub().mockReturnValue('mock-ts'),
    increment: createStub().mockImplementation((n) => n),
  },
};

module.exports = { createStub, createMockDoc, createMockCollection, mockFirestore };
