const { rule, string, range, seq, choice, defineRule, parse, zeroOrMore, until } = require("./pargo");

// Define a simple grammar
defineRule('digit', range('0', '9'));
defineRule('letter', choice(range('a', 'z'), range('A', 'Z')));
defineRule('identifier', seq(
  choice(rule('letter'), string('_')),
  zeroOrMore(choice(rule('letter'), rule('digit'), string('_')))
), (val) => [val[0], ...val[1]].join(''));
defineRule('stringLiteral', seq(
  string("'"), until("'")
), (val) => val[1].join(''));

// Parse some input
const result = parse(rule('stringLiteral'), "'hey'");
console.log(result.success); // true
console.log(result.value);   // parsed result
