/* example: export function parseMinimalTOML(tomlString) {  */


function validateRules(retryFastRules, aiResponse) {
    for (let i = 0; i < retryFastRules.length; i++) {
      let rule = retryFastRules[i];
      let pattern = rule.pattern;
      if (aiResponse.includes(pattern)) {
        console.log("Rule matched: ", rule.pattern);
        console.log("Fail response: ", rule.failResponse);
        var err = new Error("Fastfail rule matched: " + rule.pattern);
        err.rule = rule;
        throw err;
      }
    }
  }

function getTiming() {
  return {
    startTime: Date.now(),
    elapsed: function() {
      return Date.now() - this.startTime;
    }
  }
}

export { getTiming, validateRules };