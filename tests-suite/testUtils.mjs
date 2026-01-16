// --- Test utilities ---
const str_contains = (str, pattern) => 
  typeof str === 'string' && str.toLowerCase().includes(pattern.toLowerCase());

const err_contains = (err, pattern) => 
  str_contains(err?.message, pattern);

// --- Test runner ---
function test(name, fn) {
  test.cases.push({ name, fn });
}
test.cases = [];

// Expectation helpers - throw on failure
const expect = {
  toThrow: async (fn, pattern) => {
    try { 
      await fn(); 
    } catch (err) {
      if (err_contains(err, pattern)) return;
      throw new Error(`Expected error containing "${pattern}", got: ${err.message}`);
    }
    throw new Error(`Expected error containing "${pattern}", but no error thrown`);
  },
  
  toContain: (str, pattern) => {
    if (!str_contains(str, pattern)) {
      throw new Error(`Expected "${str?.slice(0,250)}..." to contain "${pattern}"`);
    }
  },

  toNotContain: (str, pattern) => {
    if (str_contains(str, pattern)) {
      throw new Error(`Expected "${str?.slice(0,250)}..." to not contain "${pattern}"`);
    }
  },  

  toContain2: (str, pattern1, pattern2) => {
    if (!str_contains(str, pattern1)) {
      throw new Error(`Expected "${str?.slice(0,250)}..." to contain "${pattern1}"`);
    }
    if (!str_contains(str, pattern2)) {
      throw new Error(`Expected "${str?.slice(0,250)}..." to contain "${pattern2}"`);
    }

  },

  toEqual: (actual, expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  }
};


export { test, expect };