const Engine = require("../engine"),
  grammar = require("./output.json");

const engine = new Engine(grammar, "expr");

engine.loadFuncs({
  returns_1(list) {
    return list[1];
  },
  range(list) {
    return { start: list[0], end: list[2] };
  },
});
console.log(engine.execute('"a"-"z"'));
